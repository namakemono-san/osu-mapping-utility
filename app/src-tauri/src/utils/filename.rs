pub fn sanitize_windows_filename_component(input: &str) -> String {
    const FORBIDDEN: [char; 9] = ['<', '>', ':', '"', '/', '\\', '|', '?', '*'];

    fn strip_trailing_dots_spaces(mut s: String) -> String {
        while s.ends_with(' ') || s.ends_with('.') {
            s.pop();
        }
        s
    }

    fn is_reserved_windows_name(stem: &str) -> bool {
        let t = stem
            .trim()
            .trim_end_matches(['.', ' '])
            .to_ascii_lowercase();
        matches!(
            t.as_str(),
            "con"
                | "prn"
                | "aux"
                | "nul"
                | "com1"
                | "com2"
                | "com3"
                | "com4"
                | "com5"
                | "com6"
                | "com7"
                | "com8"
                | "com9"
                | "lpt1"
                | "lpt2"
                | "lpt3"
                | "lpt4"
                | "lpt5"
                | "lpt6"
                | "lpt7"
                | "lpt8"
                | "lpt9"
        )
    }

    let out: String = input
        .chars()
        .filter(|c| !c.is_control() && !FORBIDDEN.contains(c))
        .collect();

    let mut out = strip_trailing_dots_spaces(out);
    out = out.split_whitespace().collect::<Vec<_>>().join(" ");
    out = out.trim().to_string();

    if out.is_empty() {
        return "Untitled".to_string();
    }

    if is_reserved_windows_name(&out) {
        out = format!("_{}", out);
    }

    strip_trailing_dots_spaces(out)
}
