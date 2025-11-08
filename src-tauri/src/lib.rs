mod commands;
mod models;
mod utils;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .register_uri_scheme_protocol("asset", move |_app, request| {
            use percent_encoding::percent_decode_str;
            use std::{fs, path::PathBuf};
            use tauri::http::Response;

            let uri = request.uri().to_string();

            let cleaned = uri
                .trim_start_matches("asset://localhost/")
                .trim_start_matches("asset://");

            let decoded = percent_decode_str(cleaned).decode_utf8_lossy().to_string();

            #[cfg(target_os = "windows")]
            let decoded = decoded.replace('/', "\\");

            let path = PathBuf::from(&decoded);

            match fs::read(&path) {
                Ok(data) => {
                    let mime = match path.extension().and_then(|e| e.to_str()) {
                        Some("png") => "image/png",
                        Some("jpg") | Some("jpeg") => "image/jpeg",
                        Some("mp3") => "audio/mpeg",
                        Some("ogg") => "audio/ogg",
                        Some("osu") => "text/plain",
                        _ => "application/octet-stream",
                    };

                    Response::builder()
                        .header("Content-Type", mime)
                        .body(data)
                        .expect("failed to build response")
                }
                Err(err) => {
                    eprintln!("[ASSET ERROR] {:?} ({})", err, path.display());
                    Response::builder()
                        .status(404)
                        .body(Vec::new())
                        .expect("failed to build 404 response")
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::run_download,
            commands::detect_osu_path,
            commands::scan_songs_step,
            commands::list_osu_files,
            commands::read_osu_file,
            commands::clone_beatmap,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
