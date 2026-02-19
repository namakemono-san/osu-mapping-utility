use crate::models::beatmapset::BeatmapMetadata;
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

fn first_quoted(s: &str) -> Option<String> {
    let start = s.find('"')?;
    let rest = &s[start + 1..];
    let end = rest.find('"')?;
    Some(rest[..end].to_string())
}

fn parse_event_filename(trimmed: &str, unquoted_index: usize) -> Option<String> {
    if let Some(q) = first_quoted(trimmed) {
        let v = q.trim();
        return if v.is_empty() {
            None
        } else {
            Some(v.to_string())
        };
    }

    let parts: Vec<&str> = trimmed.split(',').collect();
    let raw = parts.get(unquoted_index)?.trim();
    let raw = raw.split_once("//").map(|(a, _)| a).unwrap_or(raw).trim();
    let raw = raw.trim_matches('"').trim();
    if raw.is_empty() {
        None
    } else {
        Some(raw.to_string())
    }
}

fn parse_audio_filename(content: &str) -> Option<String> {
    let mut in_general = false;
    for line in content.lines() {
        let trimmed = line.trim();

        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            in_general = trimmed.eq_ignore_ascii_case("[General]");
            continue;
        }

        if !in_general {
            continue;
        }

        if let Some(rest) = trimmed.strip_prefix("AudioFilename:") {
            let v = rest.trim();
            if !v.is_empty() {
                return Some(v.to_string());
            }
        }
    }

    None
}

fn is_background_event_line(trimmed: &str) -> bool {
    trimmed.starts_with("0,0,") || trimmed.starts_with("Background,")
}

fn is_video_event_line(trimmed: &str) -> bool {
    trimmed.starts_with("Video,") || trimmed.starts_with("1,")
}

fn parse_events_background_and_video(content: &str) -> (Option<String>, Option<String>) {
    let mut in_events = false;
    let mut bg: Option<String> = None;
    let mut video: Option<String> = None;

    for line in content.lines() {
        let trimmed = line.trim();

        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            in_events = trimmed.eq_ignore_ascii_case("[Events]");
            continue;
        }

        if !in_events || trimmed.is_empty() || trimmed.starts_with("//") {
            continue;
        }

        if bg.is_none() && is_background_event_line(trimmed) {
            let idx = if trimmed.starts_with("Background,") {
                3
            } else {
                2
            };
            bg = parse_event_filename(trimmed, idx);
            continue;
        }

        if video.is_none() && is_video_event_line(trimmed) {
            video = parse_event_filename(trimmed, 2);
            continue;
        }

        if bg.is_some() && video.is_some() {
            break;
        }
    }

    (bg, video)
}

fn process_timing_points_reset(lines: &[&str], keep_kiai: bool) -> Vec<String> {
    let mut result: Vec<String> = Vec::new();
    let mut in_kiai = false;
    let mut last_bpm_beat_length: Option<&str> = None;
    let mut last_bpm_meter: Option<&str> = None;

    for line in lines {
        let trimmed = line.trim();

        if trimmed.is_empty() || trimmed.starts_with("//") {
            continue;
        }

        let parts: Vec<&str> = trimmed.split(',').collect();
        if parts.len() < 8 {
            continue;
        }

        let time = parts[0].trim();
        let beat_length = parts[1].trim();
        let meter = parts[2].trim();
        let uninherited = parts[6].trim();
        let looks_like_uninherited = uninherited == "1" || !beat_length.starts_with('-');

        let effects_raw = parts[7].trim().parse::<i32>().unwrap_or(0);
        let has_kiai = (effects_raw & 1) == 1;
        let effects_out = if keep_kiai && has_kiai { 1 } else { 0 };

        if looks_like_uninherited {
            last_bpm_beat_length = Some(beat_length);
            last_bpm_meter = Some(meter);
            result.push(format!(
                "{},{},{},1,0,100,1,{}",
                time, beat_length, meter, effects_out
            ));
            in_kiai = has_kiai;
            continue;
        }

        if keep_kiai && has_kiai != in_kiai {
            if let (Some(bpm_bl), Some(bpm_meter)) = (last_bpm_beat_length, last_bpm_meter) {
                result.push(format!(
                    "{},{},{},1,0,100,0,{}",
                    time, bpm_bl, bpm_meter, effects_out
                ));
            }
            in_kiai = has_kiai;
        }
    }

    result
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

#[allow(dead_code)]
fn is_skin_file(filename: &str) -> bool {
    let lower = filename.to_lowercase();
    let name_without_ext = lower.rsplit_once('.').map(|(n, _)| n).unwrap_or(&lower);

    if name_without_ext.starts_with("comboburst") {
        return true;
    }

    if name_without_ext.starts_with("default-") {
        return true;
    }

    let hitcircle_elements = [
        "approachcircle",
        "hit",
        "hitcircle",
        "hitcircleoverlay",
        "hitcircleselect",
        "followpoint",
        "lighting",
    ];
    for elem in &hitcircle_elements {
        if name_without_ext.starts_with(elem) {
            return true;
        }
    }

    let slider_elements = [
        "sliderstartcircle",
        "sliderstartcircleoverlay",
        "sliderendcircle",
        "sliderendcircleoverlay",
        "reversearrow",
        "sliderfollowcircle",
        "sliderb",
        "sliderb-nd",
        "sliderb-spec",
        "sliderpoint10",
        "sliderpoint30",
        "sliderscorepoint",
    ];
    for elem in &slider_elements {
        if name_without_ext.starts_with(elem) {
            return true;
        }
    }

    let spinner_elements = [
        "spinner-background",
        "spinner-circle",
        "spinner-metre",
        "spinner-osu",
        "spinner-glow",
        "spinner-bottom",
        "spinner-top",
        "spinner-middle",
        "spinner-middle2",
        "spinner-approachcircle",
        "spinner-rpm",
        "spinner-clear",
        "spinner-spin",
    ];
    for elem in &spinner_elements {
        if name_without_ext.starts_with(elem) {
            return true;
        }
    }

    if name_without_ext.starts_with("particle") {
        return true;
    }

    if name_without_ext == "sliderendmiss" || name_without_ext == "slidertickmiss" {
        return true;
    }

    let taiko_elements = [
        "taiko-bar-left",
        "taiko-bar-right",
        "taiko-bar-right-glow",
        "taiko-drum-inner",
        "taiko-drum-outer",
        "taiko-barline",
        "taiko-hit0",
        "taiko-hit100",
        "taiko-hit100k",
        "taiko-hit300",
        "taiko-hit300k",
        "taiko-hit300g",
        "taiko-flower-group",
        "taikobigcircle",
        "taikohitcircle",
        "taikohitcircleoverlay",
        "taiko-glow",
        "taiko-slider",
        "taiko-slider-fail",
        "pippidon",
        "taiko-roll-middle",
        "taiko-roll-end",
    ];
    for elem in &taiko_elements {
        if name_without_ext.starts_with(elem) {
            return true;
        }
    }

    let catch_elements = [
        "fruit-apple",
        "fruit-bananas",
        "fruit-grapes",
        "fruit-orange",
        "fruit-pear",
        "fruit-apple-overlay",
        "fruit-bananas-overlay",
        "fruit-grapes-overlay",
        "fruit-orange-overlay",
        "fruit-pear-overlay",
        "fruit-drop",
        "fruit-drop-overlay",
        "fruit-catcher-idle",
        "fruit-catcher-kiai",
        "fruit-catcher-fail",
        "fruit-ryuuta",
        "lighting",
    ];
    for elem in &catch_elements {
        if name_without_ext.starts_with(elem) {
            return true;
        }
    }

    let mania_elements = [
        "mania-stage-left",
        "mania-stage-right",
        "mania-stage-bottom",
        "mania-stage-light",
        "mania-stage-hint",
        "mania-note1",
        "mania-note2",
        "mania-note3",
        "mania-key1",
        "mania-key2",
        "mania-key3",
        "mania-hit0",
        "mania-hit50",
        "mania-hit100",
        "mania-hit200",
        "mania-hit300",
        "mania-hit300g",
        "lightingn",
        "lightingl",
    ];
    for elem in &mania_elements {
        if name_without_ext.starts_with(elem) {
            return true;
        }
    }

    let interface_elements = [
        "menu-back",
        "menu-button",
        "selection-",
        "button-",
        "mode-",
        "mode-osu",
        "mode-taiko",
        "mode-catch",
        "mode-mania",
        "cursor",
        "cursortrail",
        "cursormiddle",
        "star",
        "star2",
        "scorebar-",
        "score-",
        "ranking-",
        "pause-",
        "fail-",
        "ready",
        "section-",
        "multi-",
        "play-",
        "count",
        "go",
        "ready",
        "inputoverlay-",
        "arrow-",
        "hitcircle-",
        "reversearrow",
        "selection-mode",
        "selection-mods",
        "selection-random",
        "selection-options",
        "options-offset-tick",
    ];
    for elem in &interface_elements {
        if name_without_ext.starts_with(elem) {
            return true;
        }
    }

    let hitsound_prefixes = ["normal-", "soft-", "drum-", "taiko-"];
    for prefix in &hitsound_prefixes {
        if name_without_ext.starts_with(prefix) {
            let remainder = &name_without_ext[prefix.len()..];
            if remainder.starts_with("hit")
                || remainder.starts_with("slider")
                || remainder == "hitnormal"
                || remainder == "hitclap"
                || remainder == "hitfinish"
                || remainder == "hitwhistle"
                || remainder == "slidertick"
                || remainder == "sliderslide"
                || remainder == "sliderwhistle"
            {
                return true;
            }
        }
    }

    if name_without_ext.starts_with("spinner") {
        return true;
    }

    let gameplay_sounds = [
        "comboburst",
        "combobreak",
        "failsound",
        "sectionpass",
        "sectionfail",
        "applause",
        "pause-loop",
        "metronomelow",
        "nightcore-kick",
        "nightcore-clap",
        "nightcore-hat",
        "nightcore-finish",
    ];
    for sound in &gameplay_sounds {
        if name_without_ext.starts_with(sound) {
            return true;
        }
    }

    let interface_sounds = [
        "heartbeat",
        "seeya",
        "welcome",
        "key-",
        "back-button-",
        "check-",
        "click-",
        "menuback",
        "menuhit",
        "menu-",
        "pause-",
        "select-",
        "shutter",
        "sliderbar",
        "whoosh",
        "match-",
    ];
    for sound in &interface_sounds {
        if name_without_ext.starts_with(sound) {
            return true;
        }
    }

    false
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
                if output.last().map(|s| !s.is_empty()).unwrap_or(true) {
                    output.push(String::new());
                }
            }

            if leaving_timing_points && config.reset_timing_points {
                let processed = process_timing_points_reset(&timing_lines, config.keep_kiai);
                output.extend(processed);
                timing_lines.clear();
            }

            if leaving_timing_points {
                if output.last().map(|s| !s.is_empty()).unwrap_or(true) {
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
        let processed = process_timing_points_reset(&timing_lines, config.keep_kiai);
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

    let audio_filename = parse_audio_filename(&template_content)
        .ok_or_else(|| "AudioFilename not found in .osu".to_string())?;

    let (bg_from_events, video_from_events) = parse_events_background_and_video(&template_content);

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
