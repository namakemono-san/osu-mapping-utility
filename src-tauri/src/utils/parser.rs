pub fn scrape(data: &str, start: &str, end: &str) -> String {
    if let Some(start_idx) = data.find(start) {
        let value_start = start_idx + start.len();
        if let Some(end_idx) = data[value_start..].find(end) {
            return data[value_start..value_start + end_idx].trim().to_string();
        }
    }
    String::new()
}

pub fn quote(s: &str) -> String {
    if s.chars()
        .any(|c| c.is_whitespace() || ['"', '\'', '\\'].contains(&c))
    {
        format!("\"{}\"", s.replace('"', "\\\""))
    } else {
        s.to_string()
    }
}
