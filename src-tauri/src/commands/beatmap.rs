use crate::models::beatmapset::Beatmapset;
use crate::utils::parser::scrape;
use once_cell::sync::Lazy;
use rayon::prelude::*;
use serde::Deserialize;
use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::Path;
use std::process::Command;
use std::sync::{Arc, RwLock};
use std::time::SystemTime;

fn normalize_base_path(base_path: &str) -> String {
    let trimmed = base_path.trim();
    let replaced = trimmed.replace('\\', "/");
    replaced.trim_end_matches('/').to_string()
}

#[derive(Clone)]
struct FolderEntry {
    name: String,
    path: std::path::PathBuf,
    modified: SystemTime,
}

struct FolderListCache {
    folders: HashMap<String, Arc<Vec<FolderEntry>>>,
    last_updated: HashMap<String, SystemTime>,
}

impl FolderListCache {
    fn new() -> Self {
        Self {
            folders: HashMap::new(),
            last_updated: HashMap::new(),
        }
    }
}

static FOLDER_CACHE: Lazy<RwLock<FolderListCache>> =
    Lazy::new(|| RwLock::new(FolderListCache::new()));

struct ParsedBeatmapCache {
    data: HashMap<String, Beatmapset>,
}

impl ParsedBeatmapCache {
    fn new() -> Self {
        Self {
            data: HashMap::new(),
        }
    }
}

static PARSED_CACHE: Lazy<RwLock<HashMap<String, ParsedBeatmapCache>>> =
    Lazy::new(|| RwLock::new(HashMap::new()));

#[tauri::command]
pub fn detect_osu_path() -> Result<String, String> {
    if let Some(path) = try_detect_from_registry_hkcr() {
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

fn get_folder_list(base_path: &str) -> Result<Arc<Vec<FolderEntry>>, String> {
    let base_path = normalize_base_path(base_path);
    {
        let cache = FOLDER_CACHE.read().unwrap();
        if let Some(folders) = cache.folders.get(&base_path) {
            return Ok(folders.clone());
        }
    }

    let base = Path::new(&base_path);
    if !base.exists() {
        return Err(format!("Folder not found: {}", base_path));
    }

    let entries: Vec<_> = fs::read_dir(base)
        .map_err(|e| format!("Failed to read directory: {}", e))?
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().map(|ft| ft.is_dir()).unwrap_or(false))
        .collect();

    let mut folders: Vec<FolderEntry> = entries
        .par_iter()
        .filter_map(|entry| {
            let modified = fs::metadata(entry.path()).and_then(|m| m.modified()).ok()?;
            Some(FolderEntry {
                name: entry.file_name().to_string_lossy().to_string(),
                path: entry.path(),
                modified,
            })
        })
        .collect();

    folders.sort_by(|a, b| b.modified.cmp(&a.modified));

    let arc_folders = Arc::new(folders);

    {
        let mut cache = FOLDER_CACHE.write().unwrap();
        cache
            .folders
            .insert(base_path.to_string(), arc_folders.clone());
        cache
            .last_updated
            .insert(base_path.to_string(), SystemTime::now());
    }

    Ok(arc_folders)
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

fn get_or_parse_beatmap(base_path: &str, folder: &FolderEntry) -> Option<Beatmapset> {
    let effective_folder_path = Path::new(base_path).join(&folder.name);

    {
        let cache = PARSED_CACHE.read().unwrap();
        if let Some(path_cache) = cache.get(base_path) {
            if let Some(beatmap) = path_cache.data.get(&folder.name) {
                return Some(beatmap.clone());
            }
        }
    }

    let beatmap = parse_beatmap_folder(&effective_folder_path, &folder.name)?;

    {
        let mut cache = PARSED_CACHE.write().unwrap();
        let path_cache = cache
            .entry(base_path.to_string())
            .or_insert_with(ParsedBeatmapCache::new);
        path_cache.data.insert(folder.name.clone(), beatmap.clone());
    }

    Some(beatmap)
}

#[tauri::command]
pub fn scan_songs_step(
    base_path: String,
    start_index: usize,
    step_size: usize,
    search_query: String,
) -> Result<(Vec<Beatmapset>, usize, bool), String> {
    let base_path = normalize_base_path(&base_path);
    let folders = get_folder_list(&base_path)?;

    if search_query.is_empty() {
        let total = folders.len();
        let end_index = (start_index + step_size).min(total);

        let results: Vec<Beatmapset> = folders[start_index..end_index]
            .par_iter()
            .filter_map(|folder| get_or_parse_beatmap(&base_path, folder))
            .collect();

        let has_more = end_index < total;
        Ok((results, end_index, has_more))
    } else {
        let query_lower = search_query.to_lowercase();

        let matching_folders: Vec<&FolderEntry> = folders
            .iter()
            .filter(|f| f.name.to_lowercase().contains(&query_lower))
            .collect();

        let total = matching_folders.len();
        let end_index = (start_index + step_size).min(total);

        let results: Vec<Beatmapset> = matching_folders[start_index..end_index]
            .par_iter()
            .filter_map(|folder| get_or_parse_beatmap(&base_path, folder))
            .collect();

        let has_more = end_index < total;
        Ok((results, end_index, has_more))
    }
}

#[tauri::command]
pub fn search_beatmaps_full(
    base_path: String,
    search_query: String,
    start_index: usize,
    step_size: usize,
) -> Result<(Vec<Beatmapset>, usize, bool), String> {
    let base_path = normalize_base_path(&base_path);
    let folders = get_folder_list(&base_path)?;
    let query_lower = search_query.to_lowercase();

    let batch_size = 500;
    let mut matched: Vec<Beatmapset> = Vec::new();
    let mut scanned = 0;

    for chunk in folders.chunks(batch_size) {
        let parsed: Vec<Beatmapset> = chunk
            .par_iter()
            .filter_map(|folder| get_or_parse_beatmap(&base_path, folder))
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
            .collect();

        matched.extend(parsed);
        scanned += chunk.len();

        if matched.len() >= start_index + step_size {
            break;
        }
    }

    let total = matched.len();
    let end_index = (start_index + step_size).min(total);
    let results = matched[start_index..end_index].to_vec();
    let has_more = scanned < folders.len() || end_index < total;

    Ok((results, end_index, has_more))
}

#[tauri::command]
pub fn clear_beatmap_cache() {
    {
        let mut cache = FOLDER_CACHE.write().unwrap();
        cache.folders.clear();
        cache.last_updated.clear();
    }
    {
        let mut cache = PARSED_CACHE.write().unwrap();
        cache.clear();
    }
}

#[tauri::command]
pub fn invalidate_cache_for_path(base_path: String) {
    let base_path = normalize_base_path(&base_path);
    {
        let mut cache = FOLDER_CACHE.write().unwrap();
        cache.folders.remove(&base_path);
        cache.last_updated.remove(&base_path);
    }
    {
        let mut cache = PARSED_CACHE.write().unwrap();
        cache.remove(&base_path);
    }
}

#[tauri::command]
pub fn reload_beatmaps(base_path: String) -> Result<usize, String> {
    let base_path = normalize_base_path(&base_path);
    invalidate_cache_for_path(base_path.clone());
    let folders = get_folder_list(&base_path)?;
    Ok(folders.len())
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

#[derive(Deserialize)]
pub struct RenameOp {
    pub from: String,
    pub to: String,
}

#[tauri::command]
pub fn rename_osu_files(beatmap_folder: String, renames: Vec<RenameOp>) -> Result<(), String> {
    let base = Path::new(&beatmap_folder);
    if !base.exists() {
        return Err(format!("Folder not found: {}", beatmap_folder));
    }

    let ops: Vec<RenameOp> = renames.into_iter().filter(|op| op.from != op.to).collect();

    if ops.is_empty() {
        return Ok(());
    }

    for op in &ops {
        if op.from.trim().is_empty() || op.to.trim().is_empty() {
            return Err("Invalid rename op".to_string());
        }
        let from_path = base.join(&op.from);
        if !from_path.exists() {
            return Err(format!("File not found: {}", from_path.display()));
        }
    }

    let pid = std::process::id();
    let mut temp_paths: Vec<(std::path::PathBuf, std::path::PathBuf)> =
        Vec::with_capacity(ops.len());

    for (i, op) in ops.iter().enumerate() {
        let from_path = base.join(&op.from);

        let mut tmp_name = format!(".__omu_tmp__{}_{}__.osu", pid, i);
        let mut tmp_path = base.join(&tmp_name);
        let mut j = 0;
        while tmp_path.exists() {
            j += 1;
            tmp_name = format!(".__omu_tmp__{}_{}_{}__.osu", pid, i, j);
            tmp_path = base.join(&tmp_name);
        }

        fs::rename(&from_path, &tmp_path).map_err(|e| {
            format!(
                "Failed to rename {} -> {}: {}",
                from_path.display(),
                tmp_path.display(),
                e
            )
        })?;
        temp_paths.push((tmp_path, base.join(&op.to)));
    }

    for (_tmp_path, final_path) in &temp_paths {
        if final_path.exists() {
            return Err(format!("Target already exists: {}", final_path.display()));
        }
    }

    for (tmp_path, final_path) in temp_paths {
        fs::rename(&tmp_path, &final_path).map_err(|e| {
            format!(
                "Failed to rename {} -> {}: {}",
                tmp_path.display(),
                final_path.display(),
                e
            )
        })?;
    }

    Ok(())
}
