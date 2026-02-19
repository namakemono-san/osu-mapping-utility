use super::types::{BackgroundWriteInput, MetadataWriteInput};

pub fn apply_metadata(
    content: &str,
    metadata: &MetadataWriteInput,
    background: Option<&BackgroundWriteInput>,
) -> String {
    let eol = if content.contains("\r\n") { "\r\n" } else { "\n" };
    let lines: Vec<&str> = content.split(eol).collect();

    let mut in_metadata = false;
    let mut in_events = false;
    let mut out: Vec<String> = Vec::with_capacity(lines.len());

    for line in &lines {
        let trimmed = line.trim();

        if trimmed.eq_ignore_ascii_case("[Metadata]") {
            in_metadata = true;
            in_events = false;
            out.push(line.to_string());
            continue;
        }

        if trimmed.eq_ignore_ascii_case("[Events]") {
            in_events = true;
            in_metadata = false;
            out.push(line.to_string());
            continue;
        }

        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            in_metadata = false;
            in_events = false;
            out.push(line.to_string());
            continue;
        }

        if in_metadata && !trimmed.is_empty() && !trimmed.starts_with("//") {
            if let Some(colon) = trimmed.find(':') {
                let key = trimmed[..colon].trim();
                let replacement = match key {
                    "Title" => Some(format!("Title:{}", metadata.title)),
                    "TitleUnicode" => Some(format!("TitleUnicode:{}", metadata.title_unicode)),
                    "Artist" => Some(format!("Artist:{}", metadata.artist)),
                    "ArtistUnicode" => Some(format!("ArtistUnicode:{}", metadata.artist_unicode)),
                    "Creator" => Some(format!("Creator:{}", metadata.creator)),
                    "Source" => Some(format!("Source:{}", metadata.source)),
                    "Tags" => Some(format!("Tags:{}", metadata.tags)),
                    _ => None,
                };
                if let Some(replaced) = replacement {
                    out.push(replaced);
                    continue;
                }
            }
        }

        if in_events {
            if let Some(bg) = background {
                let is_bg_line = trimmed.starts_with("0,0,")
                    || trimmed.to_ascii_lowercase().starts_with("background,");
                if is_bg_line {
                    out.push(format!(
                        "0,0,\"{}\",{},{}",
                        bg.filename, bg.x_offset, bg.y_offset
                    ));
                    continue;
                }
            }
        }

        out.push(line.to_string());
    }

    out.join(eol)
}

pub fn reset_timing_points(lines: &[&str], keep_kiai: bool) -> Vec<String> {
    let mut result: Vec<String> = Vec::new();
    let mut in_kiai = false;
    let mut last_bpm_beat_length: Option<String> = None;
    let mut last_bpm_meter: Option<String> = None;

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
            last_bpm_beat_length = Some(beat_length.to_string());
            last_bpm_meter = Some(meter.to_string());
            result.push(format!(
                "{},{},{},1,0,100,1,{}",
                time, beat_length, meter, effects_out
            ));
            in_kiai = has_kiai;
            continue;
        }

        if keep_kiai && has_kiai != in_kiai {
            if let (Some(bpm_bl), Some(bpm_meter)) =
                (last_bpm_beat_length.as_deref(), last_bpm_meter.as_deref())
            {
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
