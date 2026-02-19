use crate::models::beatmapset::BeatmapMetadata;
use crate::osu::parser::parse as parse_osu;
use crate::osu::writer::reset_timing_points;
use crate::utils::filename::sanitize_windows_filename_component;
use chrono::Local;
use std::collections::HashSet;
use std::fs;
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use tauri::Manager;
use zip::write::FileOptions;
use zip::ZipWriter;

fn sanitize_filename_component(input: &str) -> String {
    sanitize_windows_filename_component(input)
}

fn safe_rel_path(rel: &str) -> Result<PathBuf, String> {
    let rel = rel.trim();
    if rel.is_empty() {
        return Err("Empty path".to_string());
    }

    let p = Path::new(rel);
    for comp in p.components() {
        match comp {
            Component::Normal(_) => {}
            Component::CurDir => {}
            Component::ParentDir => return Err(format!("Invalid relative path: {}", rel)),
            Component::RootDir | Component::Prefix(_) => {
                return Err(format!("Invalid relative path: {}", rel))
            }
        }
    }

    Ok(p.to_path_buf())
}

fn zip_path(p: &Path) -> String {
    p.to_string_lossy().replace('\\', "/")
}

fn next_available_file_path(mut path: PathBuf) -> PathBuf {
    if !path.exists() {
        return path;
    }

    let parent = path.parent().map(|p| p.to_path_buf()).unwrap_or_default();
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("file")
        .to_string();
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");

    for i in 1..=9999 {
        let suffix = format!(" ({})", i);
        let candidate = if ext.is_empty() {
            parent.join(format!("{}{}", stem, suffix))
        } else {
            parent.join(format!("{}{}.{ext}", stem, suffix))
        };

        if !candidate.exists() {
            path = candidate;
            break;
        }
    }

    path
}

struct OsuContentConfig<'a> {
    metadata: &'a BeatmapMetadata,
    game_mode: u8,
    reset_timing_points: bool,
    keep_kiai: bool,
    copy_preview_time: bool,
    reset_difficulty: bool,
    background_file: Option<&'a str>,
    video_file: Option<&'a str>,
}

fn process_osu_content(content: &str, config: &OsuContentConfig) -> String {
    let eol = if content.contains("\r\n") {
        "\r\n"
    } else {
        "\n"
    };

    let lines: Vec<&str> = content.split(eol).collect();
    let mut output: Vec<String> = Vec::new();

    let mut current_section = String::new();
    let mut skip_section = false;
    let mut in_timing_section = false;
    let mut in_events_section = false;
    let mut in_hitobjects_section = false;
    let mut wrote_preview_time = false;

    let mut timing_lines: Vec<&str> = Vec::new();

    for line in lines {
        let trimmed = line.trim();

        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            let leaving_events = current_section == "[Events]" && in_events_section;
            let leaving_timing_points = current_section == "[TimingPoints]" && in_timing_section;

            if leaving_events {
                if output.last().map(|s: &String| !s.is_empty()).unwrap_or(true) {
                    output.push(String::new());
                }
            }

            if leaving_timing_points && config.reset_timing_points {
                let processed = reset_timing_points(&timing_lines, config.keep_kiai);
                output.extend(processed);
                timing_lines.clear();
            }

            if leaving_timing_points {
                if output.last().map(|s: &String| !s.is_empty()).unwrap_or(true) {
                    output.push(String::new());
                }
            }

            current_section = trimmed.to_string();
            skip_section = current_section == "[Editor]" || current_section == "[Colours]";
            in_timing_section = current_section == "[TimingPoints]";
            in_events_section = current_section == "[Events]";
            in_hitobjects_section = current_section == "[HitObjects]";

            if in_timing_section {
                timing_lines.clear();
            }

            if current_section == "[General]" {
                wrote_preview_time = false;
            }

            if skip_section {
                continue;
            }

            output.push(line.to_string());

            if in_events_section {
                output.push("//Background and Video events".to_string());
                if let Some(bg) = config.background_file {
                    output.push(format!("0,0,\"{}\",0,0", bg));
                }
                if let Some(v) = config.video_file {
                    output.push(format!("Video,0,\"{}\"", v));
                }
                output.push("//Break Periods".to_string());
                output.push("//Storyboard Layer 0 (Background)".to_string());
                output.push("//Storyboard Layer 1 (Fail)".to_string());
                output.push("//Storyboard Layer 2 (Pass)".to_string());
                output.push("//Storyboard Layer 3 (Foreground)".to_string());
                output.push("//Storyboard Layer 4 (Overlay)".to_string());
                output.push("//Storyboard Sound Samples".to_string());
            }

            continue;
        }

        if skip_section {
            continue;
        }

        if in_hitobjects_section {
            continue;
        }

        if in_events_section {
            continue;
        }

        if in_timing_section && config.reset_timing_points {
            timing_lines.push(line);
            continue;
        }

        if current_section == "[General]" {
            if trimmed.starts_with("Mode:") {
                output.push(format!("Mode: {}", config.game_mode));
                continue;
            }

            if trimmed.starts_with("PreviewTime:") {
                if config.copy_preview_time {
                    output.push(line.to_string());
                } else if !wrote_preview_time {
                    output.push("PreviewTime:-1".to_string());
                }
                wrote_preview_time = true;
                continue;
            }

            if !config.copy_preview_time && !wrote_preview_time {
                output.push("PreviewTime:-1".to_string());
                wrote_preview_time = true;
            }

            if config.reset_timing_points && trimmed.starts_with("SampleSet:") {
                output.push("SampleSet: Normal".to_string());
                continue;
            }
        }

        if current_section == "[Metadata]" {
            if trimmed.starts_with("Title:") {
                output.push(format!("Title:{}", config.metadata.title));
                continue;
            }
            if trimmed.starts_with("TitleUnicode:") {
                output.push(format!("TitleUnicode:{}", config.metadata.title_unicode));
                continue;
            }
            if trimmed.starts_with("Artist:") {
                output.push(format!("Artist:{}", config.metadata.artist));
                continue;
            }
            if trimmed.starts_with("ArtistUnicode:") {
                output.push(format!("ArtistUnicode:{}", config.metadata.artist_unicode));
                continue;
            }
            if trimmed.starts_with("Creator:") {
                output.push("Creator:".to_string());
                continue;
            }
            if trimmed.starts_with("Version:") {
                output.push("Version:".to_string());
                continue;
            }
            if trimmed.starts_with("Source:") {
                output.push(format!("Source:{}", config.metadata.source));
                continue;
            }
            if trimmed.starts_with("Tags:") {
                output.push(format!("Tags:{}", config.metadata.tags));
                continue;
            }
            if trimmed.starts_with("BeatmapID:") {
                output.push("BeatmapID:0".to_string());
                continue;
            }
            if trimmed.starts_with("BeatmapSetID:") {
                output.push("BeatmapSetID:-1".to_string());
                continue;
            }
        }

        if current_section == "[Difficulty]" && config.reset_difficulty {
            if trimmed.starts_with("HPDrainRate:") {
                output.push("HPDrainRate:5".to_string());
                continue;
            }
            if trimmed.starts_with("CircleSize:") {
                output.push("CircleSize:5".to_string());
                continue;
            }
            if trimmed.starts_with("OverallDifficulty:") {
                output.push("OverallDifficulty:5".to_string());
                continue;
            }
            if trimmed.starts_with("ApproachRate:") {
                output.push("ApproachRate:5".to_string());
                continue;
            }
            if trimmed.starts_with("SliderMultiplier:") {
                output.push("SliderMultiplier:1.4".to_string());
                continue;
            }
            if trimmed.starts_with("SliderTickRate:") {
                output.push("SliderTickRate:1".to_string());
                continue;
            }
        }

        output.push(line.to_string());
    }

    if current_section == "[TimingPoints]" && in_timing_section && config.reset_timing_points {
        let processed = reset_timing_points(&timing_lines, config.keep_kiai);
        output.extend(processed);
    }

    output.join(eol)
}

#[derive(serde::Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CloneConfig {
    pub source_beatmap: String,
    pub template_osu_file: String,
    pub game_mode: u8,
    pub metadata: BeatmapMetadata,
    pub reset_timing_points: bool,
    pub keep_kiai: bool,
    pub remove_skin_files: bool,
    pub copy_preview_time: bool,
    pub reset_difficulty: bool,
    pub songs_folder: String,
}

#[tauri::command]
pub fn clone_beatmap(app: tauri::AppHandle, config: CloneConfig) -> Result<String, String> {
    let songs_path = Path::new(&config.songs_folder);
    let source_path = songs_path.join(&config.source_beatmap);

    if !source_path.exists() {
        return Err(format!(
            "Source beatmap not found: {}",
            config.source_beatmap
        ));
    }

    if config.template_osu_file.contains('\\') || config.template_osu_file.contains('/') {
        return Err("Invalid .osu filename".to_string());
    }

    let template_path = source_path.join(&config.template_osu_file);
    if !template_path.exists() {
        return Err(format!(
            "Template .osu not found: {}",
            config.template_osu_file
        ));
    }

    let template_content = fs::read_to_string(&template_path)
        .map_err(|e| format!("Failed to read template .osu: {}", e))?;

    let parsed = parse_osu(&template_content, &config.template_osu_file);

    let audio_filename = if parsed.general.audio_filename.is_empty() {
        return Err("AudioFilename not found in .osu".to_string());
    } else {
        parsed.general.audio_filename.clone()
    };

    let bg_from_events = parsed.background.as_ref().map(|b| b.filename.clone());
    let video_from_events = parsed.video_filename.clone();

    let audio_rel = safe_rel_path(&audio_filename)?;
    let audio_abs = source_path.join(&audio_rel);
    if !audio_abs.exists() {
        return Err(format!("Audio file not found: {}", audio_abs.display()));
    }

    let bg_rel: Option<PathBuf> = match bg_from_events.as_deref() {
        Some(v) if !v.trim().is_empty() => {
            let rel = safe_rel_path(v)?;
            let abs = source_path.join(&rel);
            if !abs.exists() {
                return Err(format!("Background file not found: {}", abs.display()));
            }
            Some(rel)
        }
        _ => None,
    };

    let video_rel: Option<PathBuf> = match video_from_events.as_deref() {
        Some(v) if !v.trim().is_empty() => {
            let rel = safe_rel_path(v)?;
            let abs = source_path.join(&rel);
            if !abs.exists() {
                return Err(format!("Video file not found: {}", abs.display()));
            }
            Some(rel)
        }
        _ => None,
    };

    let new_content = process_osu_content(
        &template_content,
        &OsuContentConfig {
            metadata: &config.metadata,
            game_mode: config.game_mode,
            reset_timing_points: config.reset_timing_points,
            keep_kiai: config.keep_kiai,
            copy_preview_time: config.copy_preview_time,
            reset_difficulty: config.reset_difficulty,
            background_file: bg_from_events.as_deref(),
            video_file: video_from_events.as_deref(),
        },
    );

    let timestamp = Local::now().format("%Y%m%d%H%M%S").to_string();
    let mut artist = sanitize_filename_component(&config.metadata.artist);
    let mut title = sanitize_filename_component(&config.metadata.title);
    if artist.is_empty() {
        artist = "Unknown".to_string();
    }
    if title.is_empty() {
        title = "Untitled".to_string();
    }

    let osz_stem = format!("{} - {} - {}", timestamp, artist, title);

    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("Failed to resolve cache dir: {}", e))?;
    let out_dir = cache_dir.join("clone");
    fs::create_dir_all(&out_dir).map_err(|e| format!("Failed to create cache dir: {}", e))?;

    let osz_path = next_available_file_path(out_dir.join(format!("{}.osz", osz_stem)));

    let osu_filename = format!("{} - {}.osu", artist, title);

    let mut include_files: HashSet<PathBuf> = HashSet::new();
    include_files.insert(audio_rel);
    if let Some(rel) = bg_rel {
        include_files.insert(rel);
    }
    if let Some(rel) = video_rel {
        include_files.insert(rel);
    }

    if !config.remove_skin_files {
        let audio_extensions = ["mp3", "ogg", "wav"];
        let image_extensions = ["jpg", "jpeg", "png"];
        let video_extensions = ["mp4", "webm", "avi", "mkv"];

        for entry in
            fs::read_dir(&source_path).map_err(|e| format!("Failed to read source: {}", e))?
        {
            let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
            let path = entry.path();
            if !path.is_file() {
                continue;
            }

            let file_name = match path.file_name().and_then(|s| s.to_str()) {
                Some(v) => v,
                None => continue,
            };

            let ext = path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();

            if audio_extensions.contains(&ext.as_str())
                || image_extensions.contains(&ext.as_str())
                || video_extensions.contains(&ext.as_str())
            {
                include_files.insert(PathBuf::from(file_name));
            }
        }
    }

    let file = fs::File::create(&osz_path).map_err(|e| format!("Failed to create .osz: {}", e))?;
    let mut zip = ZipWriter::new(file);
    let options: FileOptions<'static, ()> =
        FileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    zip.start_file(&osu_filename, options)
        .map_err(|e| format!("Failed to write .osu entry: {}", e))?;
    zip.write_all(new_content.as_bytes())
        .map_err(|e| format!("Failed to write .osu entry: {}", e))?;

    for rel in include_files {
        let abs = source_path.join(&rel);
        if !abs.exists() {
            return Err(format!("Referenced file not found: {}", abs.display()));
        }

        zip.start_file(zip_path(&rel), options)
            .map_err(|e| format!("Failed to add zip entry: {}", e))?;

        let mut f = fs::File::open(&abs).map_err(|e| format!("Failed to open file: {}", e))?;
        std::io::copy(&mut f, &mut zip).map_err(|e| format!("Failed to write zip entry: {}", e))?;
    }

    zip.finish()
        .map_err(|e| format!("Failed to finalize .osz: {}", e))?;

    Ok(osz_path.to_string_lossy().to_string())
}
