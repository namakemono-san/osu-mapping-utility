pub fn quote(s: &str) -> String {
    if s.chars()
        .any(|c| c.is_whitespace() || ['"', '\'', '\\'].contains(&c))
    {
        format!("\"{}\"", s.replace('"', "\\\""))
    } else {
        s.to_string()
    }
}
