use crate::utils::parser::quote;
use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

#[tauri::command]
pub async fn run_download(
    app: tauri::AppHandle,
    url: String,
    out_dir: String,
    audio_format: String,
    include_video: bool,
) -> Result<String, String> {
    let url = url.trim();
    if url.is_empty() {
        return Err("URL is empty".into());
    }
    if out_dir.trim().is_empty() {
        return Err("Output directory is empty".into());
    }

    let out_dir_norm = out_dir.replace('\\', "/");
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;

    let (fmt_flag, qual_flag) = match audio_format.to_lowercase().as_str() {
        "ogg" => ("vorbis", "6"),
        _ => ("mp3", "192K"),
    };

    let audio_args: Vec<String> = vec![
        "--newline".into(),
        "--no-color".into(),
        "--encoding".into(),
        "utf-8".into(),
        "-x".into(),
        "--audio-format".into(),
        fmt_flag.into(),
        "--audio-quality".into(),
        qual_flag.into(),
        "--no-playlist".into(),
        "--windows-filenames".into(),
        "--trim-filenames".into(),
        "200".into(),
        "--path".into(),
        out_dir_norm.clone(),
        "--output".into(),
        "%(title)s-audio.%(ext)s".into(),
        url.to_string(),
    ];

    {
        let mut parts = vec![String::from("[audio][spawn] sidecar:yt-dlp")];
        parts.extend(audio_args.iter().map(|a| quote(a)));
        let _ = window.emit("download-progress", parts.join(" "));
    }

    let a_cmd = app
        .shell()
        .sidecar("yt-dlp")
        .map_err(|e| format!("sidecar init error (yt-dlp): {e}"))?
        .args(audio_args.clone());

    let (mut a_rx, _a_child) = a_cmd.spawn().map_err(|e| {
        let _ = window.emit("download-progress", format!("[audio][spawn-error] {e}"));
        format!("spawn error (yt-dlp): {e}")
    })?;

    {
        let window = window.clone();
        tauri::async_runtime::spawn(async move {
            while let Some(ev) = a_rx.recv().await {
                match ev {
                    CommandEvent::Stdout(b) => {
                        let s = String::from_utf8_lossy(&b).to_string();
                        let _ = window.emit("download-progress", format!("[audio][out] {}", s));
                    }
                    CommandEvent::Stderr(b) => {
                        let s = String::from_utf8_lossy(&b).to_string();
                        let _ = window.emit("download-progress", format!("[audio][err] {}", s));
                    }
                    CommandEvent::Terminated(code) => {
                        let _ = window.emit(
                            "download-progress",
                            format!("[audio][done] code={:?}", code),
                        );
                    }
                    _ => {}
                }
            }
        });
    }

    if include_video {
        let video_args: Vec<String> = vec![
            "--newline".into(),
            "--no-color".into(),
            "--encoding".into(),
            "utf-8".into(),
            "--no-playlist".into(),
            "--windows-filenames".into(),
            "--trim-filenames".into(),
            "200".into(),
            "-f".into(),
            "bestvideo[ext=mp4]/bestvideo".into(),
            "--path".into(),
            out_dir_norm.clone(),
            "--output".into(),
            "%(title)s-background.%(ext)s".into(),
            url.to_string(),
        ];

        {
            let mut parts = vec![String::from("[video][spawn] sidecar:yt-dlp")];
            parts.extend(video_args.iter().map(|a| quote(a)));
            let _ = window.emit("download-progress", parts.join(" "));
        }

        let v_cmd = app
            .shell()
            .sidecar("yt-dlp")
            .map_err(|e| format!("sidecar init error (yt-dlp): {e}"))?
            .args(video_args.clone());

        let (mut v_rx, _v_child) = v_cmd.spawn().map_err(|e| {
            let _ = window.emit("download-progress", format!("[video][spawn-error] {e}"));
            format!("spawn error (yt-dlp video): {e}")
        })?;

        {
            let window = window.clone();
            tauri::async_runtime::spawn(async move {
                while let Some(ev) = v_rx.recv().await {
                    match ev {
                        CommandEvent::Stdout(b) => {
                            let s = String::from_utf8_lossy(&b).to_string();
                            let _ = window.emit("download-progress", format!("[video][out] {}", s));
                        }
                        CommandEvent::Stderr(b) => {
                            let s = String::from_utf8_lossy(&b).to_string();
                            let _ = window.emit("download-progress", format!("[video][err] {}", s));
                        }
                        CommandEvent::Terminated(code) => {
                            let _ = window.emit(
                                "download-progress",
                                format!("[video][done] code={:?}", code),
                            );
                        }
                        _ => {}
                    }
                }
            });
        }
    }

    Ok("started".into())
}
