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
