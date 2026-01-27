use crate::utils::parser::quote;
use crate::commands::taiko_video::convert_taiko_video_impl;
use std::path::PathBuf;
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
    auto_taiko_video: bool,
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

    let cache_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("downloads");

    std::fs::create_dir_all(&cache_dir).map_err(|e| format!("failed to create cache dir: {e}"))?;

    let cache_dir_str = cache_dir.to_string_lossy().replace('\\', "/");

    let audio_args: Vec<String> = vec![
        "--newline".into(),
        "--no-color".into(),
        "--encoding".into(),
        "utf-8".into(),
        "-f".into(),
        "bestaudio".into(),
        "--no-playlist".into(),
        "--windows-filenames".into(),
        "--trim-filenames".into(),
        "200".into(),
        "--path".into(),
        cache_dir_str.clone(),
        "--output".into(),
        "%(title)s-audio-src.%(ext)s".into(),
        "--print".into(),
        "after_move:filepath".into(),
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

    let out_dir_clone = out_dir_norm.clone();
    let audio_format_clone = audio_format.clone();
    let app_clone = app.clone();

    {
        let window = window.clone();
        tauri::async_runtime::spawn(async move {
            let mut cached_filepath: Option<String> = None;

            while let Some(ev) = a_rx.recv().await {
                match ev {
                    CommandEvent::Stdout(b) => {
                        let s = String::from_utf8_lossy(&b).trim().to_string();
                        let _ = window.emit("download-progress", format!("[audio][out] {}", s));

                        if s.contains("-audio-src.") {
                            cached_filepath = Some(s);
                        }
                    }
                    CommandEvent::Stderr(b) => {
                        let s = String::from_utf8_lossy(&b).to_string();
                        let _ = window.emit("download-progress", format!("[audio][err] {}", s));
                    }
                    CommandEvent::Terminated(payload) => {
                        let exit_code = payload.code;
                        let _ = window.emit(
                            "download-progress",
                            format!("[audio][yt-dlp-done] code={:?}", payload),
                        );

                        if exit_code != Some(0) {
                            let _ = window.emit(
                                "download-progress",
                                format!("[audio][fail] yt-dlp failed: code={:?}", exit_code),
                            );
                            break;
                        }

                        if let Some(ref src_path) = cached_filepath {
                            let _ = convert_audio(
                                &app_clone,
                                &window,
                                src_path,
                                &out_dir_clone,
                                &audio_format_clone,
                            )
                            .await;
                        } else {
                            let _ = window.emit(
                                "download-progress",
                                "[audio][fail] could not detect downloaded audio path",
                            );
                        }
                        break;
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
            "--print".into(),
            "after_move:filepath".into(),
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
            let app_clone = app.clone();
            let out_dir_clone = out_dir_norm.clone();
            let auto_taiko_video = auto_taiko_video;

            tauri::async_runtime::spawn(async move {
                let mut cached_filepath: Option<String> = None;

                while let Some(ev) = v_rx.recv().await {
                    match ev {
                        CommandEvent::Stdout(b) => {
                            let s = String::from_utf8_lossy(&b).trim().to_string();
                            let _ = window.emit("download-progress", format!("[video][out] {}", s));

                            if s.contains("-background.") {
                                cached_filepath = Some(s);
                            }
                        }
                        CommandEvent::Stderr(b) => {
                            let s = String::from_utf8_lossy(&b).to_string();
                            let _ = window.emit("download-progress", format!("[video][err] {}", s));
                        }
                        CommandEvent::Terminated(payload) => {
                            let exit_code = payload.code;
                            let _ = window.emit(
                                "download-progress",
                                format!("[video][done] code={:?}", payload),
                            );

                            if exit_code != Some(0) {
                                let _ = window.emit(
                                    "download-progress",
                                    format!("[video][fail] yt-dlp failed: code={:?}", exit_code),
                                );
                                if auto_taiko_video {
                                    let _ = window.emit(
                                        "download-progress",
                                        "[taiko][skip] yt-dlp failed; skipping taiko processing",
                                    );
                                }
                                break;
                            }

                            if auto_taiko_video {
                                if let Some(ref src_path) = cached_filepath {
                                    let _ = convert_taiko_video_impl(
                                        &app_clone,
                                        &window,
                                        src_path,
                                        &out_dir_clone,
                                    )
                                    .await;
                                } else {
                                    let _ = window.emit(
                                        "download-progress",
                                        "[taiko][skip] could not detect downloaded video path",
                                    );
                                }
                            }

                            break;
                        }
                        _ => {}
                    }
                }
            });
        }
    }

    Ok("started".into())
}

async fn convert_audio(
    app: &tauri::AppHandle,
    window: &tauri::WebviewWindow,
    src_path: &str,
    out_dir: &str,
    audio_format: &str,
) -> Result<(), String> {
    let probe_args: Vec<String> = vec![
        "-i".into(),
        src_path.to_string(),
        "-f".into(),
        "null".into(),
        "-".into(),
    ];

    let _ = window.emit("download-progress", "[audio][probe] checking bitrate...");

    let probe_cmd = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| format!("sidecar init error (ffmpeg): {e}"))?
        .args(probe_args);

    let output = probe_cmd.output().await.map_err(|e| {
        let _ = window.emit("download-progress", format!("[audio][probe-error] {e}"));
        format!("ffmpeg probe error: {e}")
    })?;

    let stderr = String::from_utf8_lossy(&output.stderr);
    let bitrate = parse_bitrate(&stderr).unwrap_or(192);

    let _ = window.emit(
        "download-progress",
        format!("[audio][probe] detected bitrate: {}k", bitrate),
    );

    let target_bitrate = if bitrate >= 192 { 192 } else { bitrate };

    let _ = window.emit(
        "download-progress",
        format!("[audio][convert] target bitrate: {}k", target_bitrate),
    );

    let src_path_buf = PathBuf::from(src_path);
    let stem = src_path_buf
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("audio")
        .replace("-audio-src", "-audio");

    let ext = match audio_format.to_lowercase().as_str() {
        "ogg" => "ogg",
        _ => "mp3",
    };
    let out_path = format!("{}/{}.{}", out_dir, stem, ext);

    let codec = match audio_format.to_lowercase().as_str() {
        "ogg" => "libvorbis",
        _ => "libmp3lame",
    };

    let convert_args: Vec<String> = vec![
        "-y".into(),
        "-i".into(),
        src_path.to_string(),
        "-c:a".into(),
        codec.into(),
        "-b:a".into(),
        format!("{}k", target_bitrate),
        out_path.clone(),
    ];

    {
        let mut parts = vec![String::from("[audio][convert] sidecar:ffmpeg")];
        parts.extend(convert_args.iter().map(|a| quote(a)));
        let _ = window.emit("download-progress", parts.join(" "));
    }

    let convert_cmd = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| format!("sidecar init error (ffmpeg): {e}"))?
        .args(convert_args);

    let (mut c_rx, _c_child) = convert_cmd.spawn().map_err(|e| {
        let _ = window.emit("download-progress", format!("[audio][convert-error] {e}"));
        format!("ffmpeg convert spawn error: {e}")
    })?;

    while let Some(ev) = c_rx.recv().await {
        match ev {
            CommandEvent::Stderr(b) => {
                let s = String::from_utf8_lossy(&b).to_string();
                let _ = window.emit("download-progress", format!("[audio][ffmpeg] {}", s));
            }
            CommandEvent::Terminated(payload) => {
                let exit_code = payload.code;
                if exit_code == Some(0) {
                    let _ = window.emit(
                        "download-progress",
                        format!("[audio][done] code={:?}, output={}", payload, out_path),
                    );
                    let _ = std::fs::remove_file(src_path);
                } else {
                    let _ = window.emit(
                        "download-progress",
                        format!("[audio][fail] ffmpeg failed: code={:?}, output={}", exit_code, out_path),
                    );
                    return Err(format!("ffmpeg failed: code={:?}", exit_code));
                }
            }
            _ => {}
        }
    }

    Ok(())
}

fn parse_bitrate(ffmpeg_output: &str) -> Option<u32> {
    for line in ffmpeg_output.lines() {
        if line.contains("Audio:") || line.contains("bitrate:") {
            let parts: Vec<&str> = line.split_whitespace().collect();
            for (i, part) in parts.iter().enumerate() {
                if *part == "kb/s" && i > 0 {
                    if let Ok(br) = parts[i - 1].parse::<u32>() {
                        return Some(br);
                    }
                }
            }
        }
    }
    None
}
