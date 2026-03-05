use std::fs;
use std::io::Write;
use std::path::Path;
use serde::Deserialize;
use crate::osu::parser::parse;
use crate::osu::types::{BackgroundWriteInput, MetadataWriteInput, OsuBeatmap, OsuBeatmapset};
use crate::osu::writer::apply_metadata;

#[tauri::command]
pub fn parse_osu_file(file_path: String) -> Result<OsuBeatmap, String> {
    let content = fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    let file_name = std::path::Path::new(&file_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(&file_path);
    Ok(parse(&content, file_name))
}

#[tauri::command]
pub fn parse_osu_files_batch(
    folder_path: String,
    file_names: Vec<String>,
) -> Result<OsuBeatmapset, String> {
    let folder = std::path::Path::new(&folder_path);

    let mut difficulties: Vec<OsuBeatmap> = Vec::new();

    for file_name in &file_names {
        let file_path = folder.join(file_name);
        let content = fs::read_to_string(&file_path)
            .map_err(|e| format!("Failed to read {}: {}", file_name, e))?;
        let beatmap = parse(&content, file_name);
        difficulties.push(beatmap);
    }

    let first_with_bg = difficulties.iter().find(|d| d.background.is_some());
    let has_background = first_with_bg.is_some();
    let background_filename = first_with_bg
        .and_then(|d| d.background.as_ref())
        .map(|bg| bg.filename.clone())
        .unwrap_or_default();

    Ok(OsuBeatmapset {
        folder_path,
        difficulties,
        has_background,
        background_filename,
    })
}

#[tauri::command]
pub fn write_osu_metadata(
    file_path: String,
    metadata: MetadataWriteInput,
    background: Option<BackgroundWriteInput>,
) -> Result<(), String> {
    let content = fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let new_content = apply_metadata(&content, &metadata, background.as_ref());

    fs::write(&file_path, new_content.as_bytes())
        .map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(())
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

    let mut completed: Vec<(std::path::PathBuf, std::path::PathBuf)> = Vec::new();
    for (tmp_path, final_path) in temp_paths {
        if let Err(e) = fs::rename(&tmp_path, &final_path) {
            for (done_final, done_tmp) in completed.iter().rev() {
                let _ = fs::rename(done_final, done_tmp);
            }
            return Err(format!(
                "Failed to rename {} -> {}: {}",
                tmp_path.display(),
                final_path.display(),
                e
            ));
        }
        completed.push((final_path, tmp_path));
    }

    Ok(())
}
