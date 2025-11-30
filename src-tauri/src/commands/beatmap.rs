use crate::models::beatmapset::Beatmapset;
use crate::utils::parser::scrape;
use once_cell::sync::Lazy;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::Path;
use std::path::PathBuf;
use std::process::Command;
use std::sync::{Arc, RwLock};
use std::time::SystemTime;

#[derive(Serialize, Deserialize)]
struct DiskCache {
    base_path: String,
    beatmaps: Vec<Beatmapset>,
    cached_at: u64,
}

struct BeatmapCache {
    data: HashMap<String, Arc<Vec<Beatmapset>>>,
    last_modified: HashMap<String, SystemTime>,
}

impl BeatmapCache {
    fn new() -> Self {
        Self {
            data: HashMap::new(),
            last_modified: HashMap::new(),
        }
    }
}

static BEATMAP_CACHE: Lazy<RwLock<BeatmapCache>> = Lazy::new(|| RwLock::new(BeatmapCache::new()));

#[tauri::command]
pub fn detect_osu_path() -> Result<String, String> {
    if let Some(path) = try_detect_from_registry_hkcr() {
        return Ok(path);
    }

    if let Some(path) = try_detect_from_registry_hkcu() {
        return Ok(path);
    }

    if let Some(path) = try_common_locations() {
        return Ok(path);
    }

    Err("osu! installation not found. Please select the Songs folder manually.".to_string())
}

fn try_detect_from_registry_hkcr() -> Option<String> {
    let output = Command::new("reg")
        .args(["query", r"HKCR\osustable.Uri.osu\DefaultIcon", "/ve"])
        .output()
        .ok()?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    eprintln!("[detect] HKCR output: {}", stdout);

    for line in stdout.lines() {
        if !line.contains("REG_SZ") {
            continue;
        }

        let after_regsz = line.split("REG_SZ").nth(1)?;
        let trimmed = after_regsz.trim();

        let exe_path = trimmed
            .trim_start_matches('"')
            .split(',')
            .next()?
            .trim_end_matches('"')
            .trim();

        if exe_path.to_lowercase().ends_with("osu!.exe") {
            let parent = Path::new(exe_path).parent()?;
            let songs_path = parent.join("Songs");

            if songs_path.exists() {
                return Some(songs_path.to_string_lossy().to_string());
            }
        }
    }

    None
}

fn try_detect_from_registry_hkcu() -> Option<String> {
    let output = Command::new("reg")
        .args(["query", r"HKCU\Software\osu!", "/v", "InstallPath"])
        .output()
        .ok()?;

    let stdout = String::from_utf8_lossy(&output.stdout);

    for line in stdout.lines() {
        if line.contains("REG_SZ") {
            let after_regsz = line.split("REG_SZ").nth(1)?;
            let install_path = after_regsz.trim();
            let songs_path = Path::new(install_path).join("Songs");

            if songs_path.exists() {
                return Some(songs_path.to_string_lossy().to_string());
            }
        }
    }

    None
}

fn try_common_locations() -> Option<String> {
    let local_app_data = std::env::var("LOCALAPPDATA").ok()?;
    let candidates = vec![
        format!("{}/osu!/Songs", local_app_data),
        format!("{}/../Local/osu!/Songs", local_app_data),
    ];

    for path in candidates {
        let p = Path::new(&path);
        if p.exists() {
            return Some(p.to_string_lossy().to_string());
        }
    }

    None
}

fn load_all_beatmaps(base_path: &str) -> Result<Vec<Beatmapset>, String> {
    let base = Path::new(base_path);

    if !base.exists() {
        return Err(format!("Folder not found: {}", base_path));
    }

    let entries: Vec<_> = fs::read_dir(base)
        .map_err(|e| format!("Failed to read directory: {}", e))?
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().map(|ft| ft.is_dir()).unwrap_or(false))
        .collect();

    let mut folders_with_time: Vec<_> = entries
        .par_iter()
        .filter_map(|entry| {
            let modified = fs::metadata(entry.path()).and_then(|m| m.modified()).ok()?;
            Some((
                entry.path(),
                entry.file_name().to_string_lossy().to_string(),
                modified,
            ))
        })
        .collect();

    folders_with_time.sort_by(|a, b| b.2.cmp(&a.2));

    let results: Vec<Beatmapset> = folders_with_time
        .par_iter()
        .filter_map(|(folder_path, folder_name, _)| parse_beatmap_folder(folder_path, folder_name))
        .collect();

    eprintln!(
        "[load] Loaded {} beatmaps from {}",
        results.len(),
        base_path
    );
    Ok(results)
}

fn parse_beatmap_folder(folder_path: &Path, folder_name: &str) -> Option<Beatmapset> {
    let files = fs::read_dir(folder_path).ok()?;

    for file in files.filter_map(|f| f.ok()) {
        let path = file.path();

        if path.extension().and_then(|e| e.to_str()) != Some("osu") {
            continue;
        }

        let data = match fs::read_to_string(&path) {
            Ok(d) => d,
            Err(_) => continue,
        };

        let title = scrape(&data, "Title:", "\n");
        let artist = scrape(&data, "Artist:", "\n");
        let creator = scrape(&data, "Creator:", "\n");
        let beatmap_id = scrape(&data, "BeatmapID:", "\n");
        let beatmapset_id = scrape(&data, "BeatmapSetID:", "\n");
        let bg_file = scrape(&data, "0,0,\"", "\"");

        let display_title = if !title.is_empty() && !artist.is_empty() {
            format!("{} - {}", artist, title)
        } else {
            folder_name
                .split_once(' ')
                .map(|(_, rest)| rest.to_string())
                .unwrap_or_else(|| folder_name.to_string())
        };

        let background_path = if !bg_file.is_empty() {
            Some(format!("{}/{}", folder_path.display(), bg_file))
        } else {
            None
        };

        return Some(Beatmapset {
            folder_name: folder_name.to_string(),
            title: display_title,
            artist: if artist.is_empty() {
                "Unknown".to_string()
            } else {
                artist
            },
            creator: if creator.is_empty() {
                "Unknown".to_string()
            } else {
                creator
            },
            background_path,
            beatmap_id,
            beatmap_set_id: beatmapset_id,
        });
    }

    None
}

fn get_cache_path(base_path: &str) -> PathBuf {
    let hash = base_path
        .bytes()
        .fold(0u64, |acc, b| acc.wrapping_mul(31).wrapping_add(b as u64));
    dirs::cache_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(format!("osu-mapping-util/beatmaps_{}.json", hash))
}

fn load_disk_cache(base_path: &str) -> Option<Vec<Beatmapset>> {
    let path = get_cache_path(base_path);
    let data = fs::read_to_string(&path).ok()?;
    let cache: DiskCache = serde_json::from_str(&data).ok()?;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .ok()?
        .as_secs();

    if now - cache.cached_at < 86400 && cache.base_path == base_path {
        Some(cache.beatmaps)
    } else {
        None
    }
}

fn save_disk_cache(base_path: &str, beatmaps: &[Beatmapset]) {
    let path = get_cache_path(base_path);
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    let cache = DiskCache {
        base_path: base_path.to_string(),
        beatmaps: beatmaps.to_vec(),
        cached_at: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs(),
    };

    if let Ok(json) = serde_json::to_string(&cache) {
        let _ = fs::write(&path, json);
    }
}

#[tauri::command]
pub fn scan_songs_step(
    base_path: String,
    start_index: usize,
    step_size: usize,
    search_query: String,
) -> Result<(Vec<Beatmapset>, usize, bool), String> {
    let all_beatmaps = {
        let cache = BEATMAP_CACHE.read().unwrap();
        cache.data.get(&base_path).cloned()
    };

    let all_beatmaps = match all_beatmaps {
        Some(cached) => cached,
        None => {
            if let Some(disk_cached) = load_disk_cache(&base_path) {
                eprintln!(
                    "[scan] Loaded {} beatmaps from disk cache",
                    disk_cached.len()
                );
                let arc_loaded = Arc::new(disk_cached);

                let mut cache = BEATMAP_CACHE.write().unwrap();
                cache.data.insert(base_path.clone(), arc_loaded.clone());
                cache
                    .last_modified
                    .insert(base_path.clone(), SystemTime::now());

                arc_loaded
            } else {
                eprintln!("[scan] Cache miss, loading beatmaps...");
                let loaded = load_all_beatmaps(&base_path)?;

                save_disk_cache(&base_path, &loaded);

                let arc_loaded = Arc::new(loaded);
                let mut cache = BEATMAP_CACHE.write().unwrap();
                cache.data.insert(base_path.clone(), arc_loaded.clone());
                cache
                    .last_modified
                    .insert(base_path.clone(), SystemTime::now());

                arc_loaded
            }
        }
    };

    let filtered: Vec<&Beatmapset> = if search_query.is_empty() {
        all_beatmaps.iter().collect()
    } else {
        let query_lower = search_query.to_lowercase();
        all_beatmaps
            .par_iter()
            .filter(|b| {
                let searchable = format!(
                    "{} {} {} {} {}",
                    b.title.to_lowercase(),
                    b.artist.to_lowercase(),
                    b.creator.to_lowercase(),
                    b.beatmap_id,
                    b.beatmap_set_id
                );
                searchable.contains(&query_lower)
            })
            .collect()
    };

    let total = filtered.len();
    let end_index = (start_index + step_size).min(total);
    let results: Vec<Beatmapset> = filtered[start_index..end_index]
        .iter()
        .map(|b| (*b).clone())
        .collect();
    let has_more = end_index < total;

    Ok((results, end_index, has_more))
}

#[tauri::command]
pub fn clear_beatmap_cache() {
    let mut cache = BEATMAP_CACHE.write().unwrap();
    cache.data.clear();
    cache.last_modified.clear();
    eprintln!("[cache] Cleared beatmap cache");
}

#[tauri::command]
pub fn invalidate_cache_for_path(base_path: String) {
    let mut cache = BEATMAP_CACHE.write().unwrap();
    cache.data.remove(&base_path);
    cache.last_modified.remove(&base_path);
    eprintln!("[cache] Invalidated cache for: {}", base_path);
}

#[tauri::command]
pub fn reload_beatmaps(base_path: String) -> Result<usize, String> {
    {
        let mut cache = BEATMAP_CACHE.write().unwrap();
        cache.data.remove(&base_path);
    }

    let loaded = load_all_beatmaps(&base_path)?;
    let count = loaded.len();

    let mut cache = BEATMAP_CACHE.write().unwrap();
    cache.data.insert(base_path.clone(), Arc::new(loaded));
    cache.last_modified.insert(base_path, SystemTime::now());

    Ok(count)
}

#[tauri::command]
pub fn list_osu_files(beatmap_folder: String) -> Result<Vec<String>, String> {
    let path = Path::new(&beatmap_folder);

    if !path.exists() {
        return Err(format!("Folder not found: {}", beatmap_folder));
    }

    let osu_files: Vec<String> = fs::read_dir(path)
        .map_err(|e| format!("Failed to read directory: {}", e))?
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path()
                .extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| ext == "osu")
                .unwrap_or(false)
        })
        .filter_map(|e| e.file_name().to_str().map(|s| s.to_string()))
        .collect();

    Ok(osu_files)
}

#[tauri::command]
pub fn read_osu_file(file_path: String) -> Result<String, String> {
    fs::read_to_string(&file_path).map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
pub fn read_audio_file(file_path: String) -> Result<Vec<u8>, String> {
    fs::read(&file_path).map_err(|e| format!("Failed to read audio file: {}", e))
}

#[tauri::command]
pub fn write_osu_file(file_path: String, content: String) -> Result<(), String> {
    let mut file =
        fs::File::create(&file_path).map_err(|e| format!("Failed to create file: {}", e))?;

    file.write_all(content.as_bytes())
        .map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(())
}
