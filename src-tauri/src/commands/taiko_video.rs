use std::path::{Path, PathBuf};

use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

const FILTER_TAIKO_720P: &str = "[0]split=3[blur][scale][output];[output]scale=1280:720[output];[scale]scale=-1:340[scale];[blur]scale=1280:-1,boxblur=10,crop=1280:340[blur];[output][1]overlay=0:0[output];[output][blur]overlay=0:387[output];[output][scale]overlay=(W-w)/2:387[output]";

fn ensure_blank(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("assets");

    std::fs::create_dir_all(&base_dir).map_err(|e| e.to_string())?;

    let out = base_dir.join("blank.png");
    if out.exists() {
        return Ok(out);
    }

    let bytes: &[u8] = include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/assets/blank.png"));
    std::fs::write(&out, bytes).map_err(|e| e.to_string())?;
    Ok(out)
}

fn derive_output_path(src_path: &Path, out_dir: &Path) -> PathBuf {
    let stem = src_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("video");

    let stem = if stem.ends_with("-background") {
        stem.trim_end_matches("-background").to_string() + "-taiko"
    } else {
        stem.to_string() + "-taiko"
    };

    out_dir.join(format!("{}.mp4", stem))
}

pub async fn convert_taiko_video_impl(
    app: &tauri::AppHandle,
    window: &tauri::WebviewWindow,
    src_path: &str,
    out_dir: &str,
) -> Result<String, String> {
    let blank = ensure_blank(app)?;

    let src_path_buf = PathBuf::from(src_path);
    let out_dir_buf = PathBuf::from(out_dir);
    let out_path = derive_output_path(&src_path_buf, &out_dir_buf);
    let out_path_str = out_path.to_string_lossy().to_string();

    let args: Vec<String> = vec![
        "-y".into(),
        "-i".into(),
        src_path.to_string(),
        "-i".into(),
        blank.to_string_lossy().to_string(),
        "-filter_complex".into(),
        FILTER_TAIKO_720P.into(),
        "-map".into(),
        "[output]".into(),
        "-aspect".into(),
        "1280:720".into(),
        "-b:v".into(),
        "800K".into(),
        out_path_str.clone(),
    ];

    let _ = window.emit(
        "download-progress",
        format!(
            "[taiko][spawn] sidecar:ffmpeg -i {} -> {}",
            src_path, out_path_str
        ),
    );

    let cmd = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| format!("sidecar init error (ffmpeg): {e}"))?
        .args(args);

    let (mut rx, _child) = match cmd.spawn() {
        Ok(v) => v,
        Err(e) => {
            let _ = window.emit("download-progress", format!("[taiko][spawn-error] {e}"));
            let _ = window.emit(
                "download-progress",
                format!("[taiko][done] code=spawn-error, output={}", out_path_str),
            );
            return Err(format!("spawn error (ffmpeg): {e}"));
        }
    };

    let mut exit_code: Option<i32> = None;

    while let Some(ev) = rx.recv().await {
        match ev {
            CommandEvent::Stdout(b) => {
                let s = String::from_utf8_lossy(&b).to_string();
                let _ = window.emit("download-progress", format!("[taiko][out] {}", s));
            }
            CommandEvent::Stderr(b) => {
                let s = String::from_utf8_lossy(&b).to_string();
                let _ = window.emit("download-progress", format!("[taiko][ffmpeg] {}", s));
            }
            CommandEvent::Terminated(payload) => {
                exit_code = payload.code;
                let _ = window.emit(
                    "download-progress",
                    format!("[taiko][done] code={:?}, output={}", payload, out_path_str),
                );
                break;
            }
            _ => {}
        }
    }

    if exit_code != Some(0) {
        return Err(format!(
            "ffmpeg failed (taiko video) code={:?}, output={}",
            exit_code, out_path_str
        ));
    }

    if !out_path.exists() {
        return Err(format!("taiko output not found: {}", out_path_str));
    }

    Ok(out_path_str)
}

#[tauri::command]
pub async fn convert_taiko_video(
    app: tauri::AppHandle,
    src_path: String,
    out_dir: String,
) -> Result<String, String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;

    if src_path.trim().is_empty() {
        return Err("src_path is empty".into());
    }
    if out_dir.trim().is_empty() {
        return Err("out_dir is empty".into());
    }

    convert_taiko_video_impl(&app, &window, &src_path, &out_dir).await
}
