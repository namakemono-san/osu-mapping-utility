use crate::models::beatmapset::BeatmapMetadata;
use crate::utils::parser::scrape;
use std::collections::HashMap;
use std::fs;
use std::path::Path;

fn get_next_beatmap_number(songs_path: &Path) -> Result<i32, String> {
    let entries =
        fs::read_dir(songs_path).map_err(|e| format!("Failed to read songs directory: {}", e))?;

    let mut max_num = 0;
    for entry in entries.filter_map(|e| e.ok()) {
        let folder_name = entry.file_name().to_string_lossy().to_string();
        if folder_name.starts_with("beatmap-") {
            if let Some(num_str) = folder_name.strip_prefix("beatmap-") {
                if let Some(num_part) = num_str.split('-').next() {
                    if let Ok(num) = num_part.parse::<i32>() {
                        max_num = max_num.max(num);
                    }
                }
            }
        }
    }

    Ok(max_num + 1)
}

fn get_background_from_osu(content: &str) -> Option<String> {
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("0,0,") || trimmed.starts_with("Background,") {
            if let Some(start) = trimmed.find('"') {
                if let Some(end) = trimmed[start + 1..].find('"') {
                    return Some(trimmed[start + 1..start + 1 + end].to_string());
                }
            }
        }
    }
    None
}

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

fn process_timing_points(lines: &[&str]) -> Vec<String> {
    let mut result = Vec::new();
    let mut in_kiai = false;
    let mut last_bpm_line: Option<String> = None;

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
        let effects = parts[7].trim().parse::<i32>().unwrap_or(0);
        let has_kiai = (effects & 1) == 1;

        if uninherited == "1" {
            let new_line = format!(
                "{},{},{},1,0,100,1,{}",
                time,
                beat_length,
                meter,
                if has_kiai { "1" } else { "0" }
            );
            last_bpm_line = Some(new_line.clone());
            result.push(new_line);
            in_kiai = has_kiai;
            continue;
        }

        if has_kiai != in_kiai {
            if let Some(ref bpm_line) = last_bpm_line {
                let bpm_parts: Vec<&str> = bpm_line.split(',').collect();
                let bpm_beat_length = bpm_parts[1];
                let bpm_meter = bpm_parts[2];

                let new_line = format!(
                    "{},{},{},1,0,100,0,{}",
                    time,
                    bpm_beat_length,
                    bpm_meter,
                    if has_kiai { "1" } else { "0" }
                );
                result.push(new_line);
            }

            in_kiai = has_kiai;
        }
    }

    result
}

fn process_osu_content(
    content: &str,
    metadata: &BeatmapMetadata,
    game_mode: u8,
    difficulty: &str,
    keep_timing_points: bool,
    reset_sample_set: bool,
    reset_difficulty: bool,
    remove_colours: bool,
    background_file: Option<&str>,
) -> String {
    let eol = if content.contains("\r\n") {
        "\r\n"
    } else {
        "\n"
    };

    let lines: Vec<&str> = content.split(eol).collect();
    let mut output = Vec::new();
    let mut current_section = String::new();
    let mut timing_lines = Vec::new();
    let mut in_timing_section = false;
    let mut skip_section = false;

    for line in lines {
        let trimmed = line.trim();

        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            if current_section == "[TimingPoints]" && in_timing_section {
                if keep_timing_points {
                    let processed = process_timing_points(&timing_lines);
                    for tp_line in processed {
                        output.push(tp_line);
                    }
                }
                timing_lines.clear();
                in_timing_section = false;
            }

            current_section = trimmed.to_string();

            if current_section == "[Editor]"
                || current_section == "[HitObjects]"
                || (current_section == "[Colours]" && remove_colours)
            {
                skip_section = true;
                continue;
            }

            skip_section = false;
            output.push(line.to_string());

            if current_section == "[TimingPoints]" {
                in_timing_section = true;
            }

            continue;
        }

        if skip_section {
            continue;
        }

        if in_timing_section && keep_timing_points {
            timing_lines.push(line);
            continue;
        }

        if in_timing_section && !keep_timing_points {
            continue;
        }

        if current_section == "[Events]" {
            if trimmed.starts_with("//") || trimmed.is_empty() {
                output.push(line.to_string());
                continue;
            }

            if trimmed.starts_with("0,0,") || trimmed.starts_with("Background,") {
                if let Some(bg) = background_file {
                    output.push(format!("0,0,\"{}\",0,0", bg));
                } else {
                    output.push(line.to_string());
                }
                continue;
            }

            continue;
        }

        if current_section == "[General]" {
            if trimmed.starts_with("Mode:") {
                output.push(format!("Mode: {}", game_mode));
                continue;
            }
            if reset_sample_set && trimmed.starts_with("SampleSet:") {
                output.push("SampleSet: Normal".to_string());
                continue;
            }
        }

        if current_section == "[Metadata]" {
            if trimmed.starts_with("Title:") {
                output.push(format!("Title:{}", metadata.title));
                continue;
            }
            if trimmed.starts_with("TitleUnicode:") {
                output.push(format!("TitleUnicode:{}", metadata.title_unicode));
                continue;
            }
            if trimmed.starts_with("Artist:") {
                output.push(format!("Artist:{}", metadata.artist));
                continue;
            }
            if trimmed.starts_with("ArtistUnicode:") {
                output.push(format!("ArtistUnicode:{}", metadata.artist_unicode));
                continue;
            }
            if trimmed.starts_with("Creator:") {
                output.push(format!("Creator:{}", metadata.creator));
                continue;
            }
            if trimmed.starts_with("Version:") {
                output.push(format!("Version:{}", difficulty));
                continue;
            }
            if trimmed.starts_with("Source:") {
                output.push(format!("Source:{}", metadata.source));
                continue;
            }
            if trimmed.starts_with("Tags:") {
                output.push(format!("Tags:{}", metadata.tags));
                continue;
            }
            if trimmed.starts_with("BeatmapID:") {
                output.push("BeatmapID:-1".to_string());
                continue;
            }
            if trimmed.starts_with("BeatmapSetID:") {
                output.push("BeatmapSetID:-1".to_string());
                continue;
            }
        }

        if current_section == "[Difficulty]" && reset_difficulty {
            if trimmed.starts_with("HPDrainRate:") {
                output.push("HPDrainRate:5".to_string());
                continue;
            }
            if trimmed.starts_with("CircleSize:") {
                output.push("CircleSize:2".to_string());
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

    if in_timing_section && keep_timing_points && !timing_lines.is_empty() {
        let processed = process_timing_points(&timing_lines);
        for tp_line in processed {
            output.push(tp_line);
        }
    }

    output.join(eol)
}

#[tauri::command]
pub fn clone_beatmap(
    source_beatmap: String,
    game_mode: u8,
    difficulties: Vec<String>,
    metadata: BeatmapMetadata,
    keep_timing_points: bool,
    remove_skin_files: bool,
    reset_sample_set: bool,
    reset_difficulty: bool,
    remove_colours: bool,
    songs_folder: String,
) -> Result<String, String> {
    let songs_path = Path::new(&songs_folder);
    let source_path = songs_path.join(&source_beatmap);

    if !source_path.exists() {
        return Err(format!("Source beatmap not found: {}", source_beatmap));
    }

    let beatmap_num = get_next_beatmap_number(songs_path)?;

    let safe_title = metadata
        .title
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == ' ' {
                c
            } else {
                '_'
            }
        })
        .collect::<String>()
        .replace(' ', "_");

    let new_folder_name = format!("beatmap-{}-{}", beatmap_num, safe_title);
    let new_folder_path = songs_path.join(&new_folder_name);

    fs::create_dir_all(&new_folder_path).map_err(|e| format!("Failed to create folder: {}", e))?;

    let osu_files: Vec<_> = fs::read_dir(&source_path)
        .map_err(|e| format!("Failed to read source: {}", e))?
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path()
                .extension()
                .and_then(|s| s.to_str())
                .map(|s| s == "osu")
                .unwrap_or(false)
        })
        .collect();

    if osu_files.is_empty() {
        return Err("No .osu files found in source beatmap".to_string());
    }

    let mut diff_backgrounds: HashMap<String, String> = HashMap::new();
    for osu_file in &osu_files {
        let content = fs::read_to_string(osu_file.path())
            .map_err(|e| format!("Failed to read .osu file: {}", e))?;

        let version = scrape(&content, "Version:", "\n");
        if let Some(bg) = get_background_from_osu(&content) {
            diff_backgrounds.insert(version, bg);
        }
    }

    let audio_extensions = ["mp3", "ogg", "wav"];
    let image_extensions = ["jpg", "jpeg", "png"];

    for entry in fs::read_dir(&source_path).map_err(|e| format!("Failed to read source: {}", e))? {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();

        if let Some(ext) = path.extension() {
            let ext_str = ext.to_str().unwrap_or("").to_lowercase();
            let file_name = path.file_name().unwrap().to_str().unwrap_or("");

            if remove_skin_files && is_skin_file(file_name) {
                continue;
            }

            if audio_extensions.contains(&ext_str.as_str())
                || image_extensions.contains(&ext_str.as_str())
            {
                let dest = new_folder_path.join(path.file_name().unwrap());
                fs::copy(&path, &dest).map_err(|e| format!("Failed to copy file: {}", e))?;
            }
        }
    }

    let template_path = osu_files[0].path();
    let template_content = fs::read_to_string(&template_path)
        .map_err(|e| format!("Failed to read template: {}", e))?;

    for diff in &difficulties {
        let background = diff_backgrounds.get(diff.as_str()).map(|s| s.as_str());

        let new_content = process_osu_content(
            &template_content,
            &metadata,
            game_mode,
            diff,
            keep_timing_points,
            reset_sample_set,
            reset_difficulty,
            remove_colours,
            background,
        );

        let new_filename = format!(
            "{} - {} ({}) [{}].osu",
            metadata.artist, metadata.title, metadata.creator, diff
        );

        let new_file_path = new_folder_path.join(new_filename);
        fs::write(&new_file_path, new_content)
            .map_err(|e| format!("Failed to write .osu file: {}", e))?;
    }

    Ok(format!("Successfully created beatmap: {}", new_folder_name))
}
