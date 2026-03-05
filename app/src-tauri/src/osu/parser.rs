use super::types::*;

pub fn strip_bom(s: &str) -> &str {
    s.strip_prefix('\u{FEFF}').unwrap_or(s)
}

fn parse_kv(line: &str) -> Option<(&str, &str)> {
    let idx = line.find(':')?;
    let key = line[..idx].trim();
    let val = line[idx + 1..].trim();
    if key.is_empty() {
        None
    } else {
        Some((key, val))
    }
}

fn parse_format_version(line: &str) -> i32 {
    if let Some(idx) = line.rfind('v') {
        line[idx + 1..].trim().parse::<i32>().unwrap_or(14)
    } else {
        14
    }
}

fn first_quoted_or_field(trimmed: &str, field_index: usize) -> Option<String> {
    if let Some(start) = trimmed.find('"') {
        let rest = &trimmed[start + 1..];
        if let Some(end) = rest.find('"') {
            let v = rest[..end].trim();
            return if v.is_empty() { None } else { Some(v.to_string()) };
        }
    }
    let parts: Vec<&str> = trimmed.splitn(field_index + 2, ',').collect();
    let raw = parts.get(field_index)?.trim();
    let raw = raw.split("//").next().unwrap_or(raw).trim();
    let raw = raw.trim_matches('"').trim();
    if raw.is_empty() { None } else { Some(raw.to_string()) }
}

fn get_active_timing(
    time: i32,
    timing_points: &[OsuTimingPoint],
) -> (f64, f64) {
    let mut beat_length = 500.0_f64;
    let mut sv_multiplier = 1.0_f64;
    for tp in timing_points {
        if tp.time > time as f64 {
            break;
        }
        if tp.uninherited {
            beat_length = tp.beat_length;
            sv_multiplier = 1.0;
        } else if tp.beat_length < 0.0 {
            sv_multiplier = -100.0 / tp.beat_length;
        }
    }
    (beat_length, sv_multiplier)
}

pub fn parse(content: &str, file_name: &str) -> OsuBeatmap {
    let content = strip_bom(content);
    let lines: Vec<&str> = content.lines().collect();

    let mut format_version = 14_i32;
    let mut section = "";

    let mut audio_filename = String::new();
    let mut audio_lead_in = 0_i32;
    let mut preview_time = -1_i32;
    let mut mode = 0_u8;
    let mut stack_leniency = 0.7_f64;
    let mut epilepsy_warning = false;
    let mut sample_set = "Normal".to_string();

    let mut title = String::new();
    let mut title_unicode = String::new();
    let mut artist = String::new();
    let mut artist_unicode = String::new();
    let mut creator = String::new();
    let mut version = String::new();
    let mut source = String::new();
    let mut tags = String::new();
    let mut beatmap_id = 0_i64;
    let mut beatmap_set_id = -1_i64;

    let mut hp_drain_rate = 5.0_f64;
    let mut circle_size = 5.0_f64;
    let mut overall_difficulty = 5.0_f64;
    let mut approach_rate: Option<f64> = None;
    let mut slider_multiplier = 1.4_f64;
    let mut slider_tick_rate = 1.0_f64;

    let mut background: Option<OsuBackground> = None;
    let mut video_filename: Option<String> = None;
    let mut breaks: Vec<OsuBreak> = Vec::new();

    let mut timing_points: Vec<OsuTimingPoint> = Vec::new();
    let mut hit_objects: Vec<OsuHitObject> = Vec::new();

    for (i, line) in lines.iter().enumerate() {
        let trimmed = line.trim();

        if i == 0 && trimmed.starts_with("osu file format") {
            format_version = parse_format_version(trimmed);
            continue;
        }

        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            section = trimmed;
            continue;
        }

        if trimmed.is_empty() || trimmed.starts_with("//") {
            continue;
        }

        match section {
            "[General]" => {
                if let Some((k, v)) = parse_kv(trimmed) {
                    match k {
                        "AudioFilename" => audio_filename = v.to_string(),
                        "AudioLeadIn" => audio_lead_in = v.parse().unwrap_or(0),
                        "PreviewTime" => preview_time = v.parse().unwrap_or(-1),
                        "Mode" => mode = v.parse().unwrap_or(0),
                        "StackLeniency" => stack_leniency = v.parse().unwrap_or(0.7),
                        "EpilepsyWarning" => epilepsy_warning = v == "1",
                        "SampleSet" => sample_set = v.to_string(),
                        _ => {}
                    }
                }
            }
            "[Metadata]" => {
                if let Some((k, v)) = parse_kv(trimmed) {
                    match k {
                        "Title" => title = v.to_string(),
                        "TitleUnicode" => title_unicode = v.to_string(),
                        "Artist" => artist = v.to_string(),
                        "ArtistUnicode" => artist_unicode = v.to_string(),
                        "Creator" => creator = v.to_string(),
                        "Version" => version = v.to_string(),
                        "Source" => source = v.to_string(),
                        "Tags" => tags = v.to_string(),
                        "BeatmapID" => beatmap_id = v.parse().unwrap_or(0),
                        "BeatmapSetID" => beatmap_set_id = v.parse().unwrap_or(-1),
                        _ => {}
                    }
                }
            }
            "[Difficulty]" => {
                if let Some((k, v)) = parse_kv(trimmed) {
                    match k {
                        "HPDrainRate" => hp_drain_rate = v.parse().unwrap_or(5.0),
                        "CircleSize" => circle_size = v.parse().unwrap_or(5.0),
                        "OverallDifficulty" => overall_difficulty = v.parse().unwrap_or(5.0),
                        "ApproachRate" => approach_rate = v.parse().ok(),
                        "SliderMultiplier" => slider_multiplier = v.parse().unwrap_or(1.4),
                        "SliderTickRate" => slider_tick_rate = v.parse().unwrap_or(1.0),
                        _ => {}
                    }
                }
            }
            "[Events]" => {
                let is_bg = trimmed.starts_with("0,0,") || trimmed.starts_with("Background,");
                let is_video = trimmed.starts_with("1,") || trimmed.starts_with("Video,");
                let is_break = trimmed.starts_with("2,") || trimmed.to_lowercase().starts_with("break,");

                if background.is_none() && is_bg {
                    let field_idx = if trimmed.starts_with("Background,") { 3 } else { 2 };
                    if let Some(fname) = first_quoted_or_field(trimmed, field_idx) {
                        let parts: Vec<&str> = trimmed.split(',').collect();
                        let xoff = parts.get(field_idx + 1).and_then(|s| s.trim().parse::<i32>().ok()).unwrap_or(0);
                        let yoff = parts.get(field_idx + 2).and_then(|s| s.trim().parse::<i32>().ok()).unwrap_or(0);
                        background = Some(OsuBackground { filename: fname, x_offset: xoff, y_offset: yoff });
                    }
                } else if video_filename.is_none() && is_video {
                    video_filename = first_quoted_or_field(trimmed, 2);
                } else if is_break {
                    let parts: Vec<&str> = trimmed.split(',').collect();
                    if parts.len() >= 3 {
                        let st = parts[1].trim().parse::<i32>().unwrap_or(0);
                        let et = parts[2].trim().parse::<i32>().unwrap_or(0);
                        breaks.push(OsuBreak { start_time: st, end_time: et });
                    }
                }
            }
            "[TimingPoints]" => {
                let parts: Vec<&str> = trimmed.split(',').collect();
                if parts.len() < 2 {
                    continue;
                }
                let time: f64 = parts[0].trim().parse().unwrap_or(0.0);
                let beat_length: f64 = parts[1].trim().parse().unwrap_or(500.0);
                let meter: i32 = parts.get(2).and_then(|s| s.trim().parse().ok()).unwrap_or(4);
                let sample_set_tp: i32 = parts.get(3).and_then(|s| s.trim().parse().ok()).unwrap_or(0);
                let sample_index: i32 = parts.get(4).and_then(|s| s.trim().parse().ok()).unwrap_or(0);
                let volume: i32 = parts.get(5).and_then(|s| s.trim().parse().ok()).unwrap_or(100);
                let uninherited = if parts.len() >= 7 {
                    parts[6].trim() == "1"
                } else {
                    beat_length > 0.0
                };
                let effects: i32 = parts.get(7).and_then(|s| s.trim().parse().ok()).unwrap_or(0);
                let kiai = (effects & 1) != 0;
                let sv_multiplier = if !uninherited && beat_length < 0.0 {
                    Some(-100.0 / beat_length)
                } else {
                    None
                };
                timing_points.push(OsuTimingPoint {
                    time,
                    beat_length,
                    meter,
                    sample_set: sample_set_tp,
                    sample_index,
                    volume,
                    uninherited,
                    kiai,
                    sv_multiplier,
                });
            }
            "[HitObjects]" => {
                let parts: Vec<&str> = trimmed.split(',').collect();
                if parts.len() < 5 {
                    continue;
                }
                let time: i32 = parts[2].trim().parse().unwrap_or(0);
                let type_flags: i32 = parts[3].trim().parse().unwrap_or(0);
                let hit_sound: i32 = parts[4].trim().parse().unwrap_or(0);

                let is_circle = (type_flags & 1) != 0;
                let is_slider = (type_flags & 2) != 0;
                let is_spinner = (type_flags & 8) != 0;
                let is_mania_hold = (type_flags & 128) != 0;

                let end_time;
                let mut slider_type_out: Option<String> = None;
                let mut slides_out: Option<i32> = None;
                let mut length_out: Option<f64> = None;

                if is_circle {
                    end_time = time;
                } else if is_slider {
                    let curve_data = parts.get(5).map(|s| s.trim()).unwrap_or("");
                    let slider_type_char = curve_data.split('|').next().unwrap_or("").to_string();
                    slider_type_out = if slider_type_char.is_empty() { None } else { Some(slider_type_char) };

                    let slides: i32 = parts.get(6).and_then(|s| s.trim().parse().ok()).unwrap_or(1);
                    let pixel_length: f64 = parts.get(7).and_then(|s| s.trim().parse().ok()).unwrap_or(100.0);
                    slides_out = Some(slides);
                    length_out = Some(pixel_length);

                    let (beat_len, sv) = get_active_timing(time, &timing_points);
                    let duration = (pixel_length / (slider_multiplier * 100.0 * sv)) * beat_len * slides as f64;
                    end_time = time + duration.round() as i32;
                } else if is_spinner {
                    end_time = parts.get(5).and_then(|s| s.trim().parse().ok()).unwrap_or(time + 1000);
                } else if is_mania_hold {
                    end_time = parts
                        .get(5)
                        .and_then(|s| s.split(':').next())
                        .and_then(|s| s.trim().parse().ok())
                        .unwrap_or(time);
                } else {
                    end_time = time;
                }

                hit_objects.push(OsuHitObject {
                    time,
                    type_flags,
                    hit_sound,
                    end_time,
                    slider_type: slider_type_out,
                    slides: slides_out,
                    length: length_out,
                });
            }
            _ => {}
        }
    }

    let ar = approach_rate.unwrap_or(overall_difficulty);

    let bpm = if let Some(first_uninherited) = timing_points.iter().find(|tp| tp.uninherited) {
        if first_uninherited.beat_length > 0.0 {
            (60000.0 / first_uninherited.beat_length * 100.0).round() / 100.0
        } else {
            120.0
        }
    } else {
        120.0
    };

    let (total_length_ms, drain_time_ms) = if hit_objects.is_empty() {
        (0_i64, 0_i64)
    } else {
        let first_time = hit_objects[0].time as i64;
        let last_end = hit_objects
            .iter()
            .map(|ho| ho.time.max(ho.end_time) as i64)
            .max()
            .unwrap_or(first_time);
        let total = last_end - first_time;
        let total_break: i64 = breaks.iter().map(|b| (b.end_time - b.start_time) as i64).sum();
        let drain = (total - total_break).max(0);
        (total, drain)
    };

    OsuBeatmap {
        file_name: file_name.to_string(),
        format_version,
        general: OsuGeneral {
            audio_filename,
            audio_lead_in,
            preview_time,
            mode,
            stack_leniency,
            epilepsy_warning,
            sample_set,
        },
        metadata: OsuMetadata {
            title,
            title_unicode,
            artist,
            artist_unicode,
            creator,
            version,
            source,
            tags,
            beatmap_id,
            beatmap_set_id,
        },
        difficulty: OsuDifficultySettings {
            hp_drain_rate,
            circle_size,
            overall_difficulty,
            approach_rate: ar,
            slider_multiplier,
            slider_tick_rate,
        },
        background,
        video_filename,
        timing_points,
        hit_objects,
        breaks,
        bpm,
        drain_time_ms,
        total_length_ms,
    }
}

pub fn parse_header(content: &str, file_name: &str) -> OsuBeatmapHeader {
    let content = strip_bom(content);
    let mut section = "";

    let mut audio_filename = String::new();
    let mut title = String::new();
    let mut artist = String::new();
    let mut creator = String::new();
    let mut beatmap_id = String::new();
    let mut beatmap_set_id = String::new();
    let mut background_filename: Option<String> = None;

    for line in content.lines() {
        let trimmed = line.trim();

        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            section = trimmed;
            if section == "[TimingPoints]" || section == "[HitObjects]" {
                break;
            }
            continue;
        }

        if trimmed.is_empty() || trimmed.starts_with("//") {
            continue;
        }

        match section {
            "[General]" => {
                if let Some(rest) = trimmed.strip_prefix("AudioFilename:") {
                    audio_filename = rest.trim().to_string();
                }
            }
            "[Metadata]" => {
                if let Some((k, v)) = parse_kv(trimmed) {
                    match k {
                        "Title" => title = v.to_string(),
                        "Artist" => artist = v.to_string(),
                        "Creator" => creator = v.to_string(),
                        "BeatmapID" => beatmap_id = v.to_string(),
                        "BeatmapSetID" => beatmap_set_id = v.to_string(),
                        _ => {}
                    }
                }
            }
            "[Events]" => {
                if background_filename.is_none() {
                    let is_bg = trimmed.starts_with("0,0,") || trimmed.starts_with("Background,");
                    if is_bg {
                        let field_idx = if trimmed.starts_with("Background,") { 3 } else { 2 };
                        background_filename = first_quoted_or_field(trimmed, field_idx);
                    }
                }
            }
            _ => {}
        }
    }

    let _ = file_name;
    OsuBeatmapHeader {
        audio_filename,
        title,
        artist,
        creator,
        beatmap_id,
        beatmap_set_id,
        background_filename,
    }
}
