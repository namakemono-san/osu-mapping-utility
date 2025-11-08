use crate::models::beatmapset::Beatmapset;
use crate::utils::parser::scrape;
use rayon::prelude::*;
use std::fs;
use std::path::Path;
use std::process::Command;

#[tauri::command]
pub fn detect_osu_path() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        let output = Command::new("reg")
            .args(&["query", "HKCR\\osu\\DefaultIcon", "/ve"])
            .output();

        if let Ok(result) = output {
            let stdout = String::from_utf8_lossy(&result.stdout);
            eprintln!("[detect] Registry output: {}", stdout);

            for line in stdout.lines() {
                if line.contains("REG_SZ") || line.contains("(既定)") || line.contains("(Default)")
                {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if let Some(path_part) = parts.last() {
                        let cleaned = path_part
                            .trim_matches('"')
                            .split(',')
                            .next()
                            .unwrap_or("")
                            .trim_matches('"');

                        if cleaned.ends_with("osu!.exe") {
                            if let Some(parent) = std::path::Path::new(cleaned).parent() {
                                let songs_path = parent.join("Songs");
                                if songs_path.exists() {
                                    let songs_str = songs_path.to_string_lossy().to_string();
                                    eprintln!("[detect] Found osu! Songs folder: {}", songs_str);
                                    return Ok(songs_str);
                                }
                            }
                        }
                    }
                }
            }
        }

        Err("osu! installation not found".to_string())
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("osu! detection only supported on Windows".to_string())
    }
}

#[tauri::command]
pub fn scan_songs_step(
    base_path: String,
    start_index: usize,
    step_size: usize,
    search_query: String,
) -> Result<(Vec<Beatmapset>, usize, bool), String> {
    let base = Path::new(&base_path);

    if !base.exists() {
        return Err(format!("Folder not found: {}", base_path));
    }

    let entries = fs::read_dir(base).map_err(|e| format!("Failed to read directory: {}", e))?;

    let mut folders_with_time: Vec<_> = entries
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().map(|ft| ft.is_dir()).unwrap_or(false))
        .filter_map(|entry| {
            let modified = fs::metadata(entry.path()).and_then(|m| m.modified()).ok()?;
            Some((entry, modified))
        })
        .collect();

    folders_with_time.par_sort_by(|a, b| b.1.cmp(&a.1));

    let total = folders_with_time.len();
    let mut results = Vec::new();
    let mut found = 0;
    let mut current_index = start_index;

    for (idx, (entry, _modified)) in folders_with_time.iter().enumerate().skip(start_index) {
        if found >= step_size {
            current_index = idx;
            break;
        }

        current_index = idx + 1;

        let folder_path = entry.path();
        let folder_name = entry.file_name().to_string_lossy().to_string();

        if let Ok(files) = fs::read_dir(&folder_path) {
            for file in files.filter_map(|f| f.ok()) {
                let path = file.path();
                if let Some(ext) = path.extension() {
                    if ext == "osu" {
                        if let Ok(data) = fs::read_to_string(&path) {
                            let title = scrape(&data, "Title:", "\n");
                            let artist = scrape(&data, "Artist:", "\n");
                            let creator = scrape(&data, "Creator:", "\n");
                            let beatmap_id = scrape(&data, "BeatmapID:", "\n");
                            let beatmapset_id = scrape(&data, "BeatmapSetID:", "\n");
                            let bg_file = scrape(&data, "0,0,\"", "\"");

                            let searchable = format!(
                                "{} - {} | {} ({} {})",
                                title, artist, creator, beatmap_id, beatmapset_id
                            );

                            if search_query.is_empty()
                                || searchable
                                    .to_lowercase()
                                    .contains(&search_query.to_lowercase())
                            {
                                let display_title = if !title.is_empty() && !artist.is_empty() {
                                    format!("{} - {}", artist, title)
                                } else {
                                    folder_name
                                        .split_once(' ')
                                        .map(|(_, rest)| rest.to_string())
                                        .unwrap_or(folder_name.clone())
                                };

                                let beatmap = Beatmapset {
                                    folder_name: folder_name.clone(),
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
                                    background_path: if !bg_file.is_empty() {
                                        Some(format!("{}/{}", folder_path.display(), bg_file))
                                    } else {
                                        None
                                    },
                                    beatmap_id,
                                    beatmap_set_id: beatmapset_id,
                                };

                                results.push(beatmap);
                                found += 1;
                            }
                        }
                        break;
                    }
                }
            }
        }
    }

    let has_more = current_index < total;
    Ok((results, current_index, has_more))
}

#[tauri::command]
pub fn list_osu_files(beatmap_folder: String) -> Result<Vec<String>, String> {
    let path = Path::new(&beatmap_folder);

    if !path.exists() {
        return Err(format!("Folder not found: {}", beatmap_folder));
    }

    let entries = fs::read_dir(path).map_err(|e| format!("Failed to read directory: {}", e))?;

    let osu_files: Vec<String> = entries
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
