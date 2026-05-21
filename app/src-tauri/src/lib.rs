mod audio;
mod commands;
mod models;
mod osu;
mod utils;

use std::sync::Mutex;

struct ServerProcess(Option<tauri_plugin_shell::process::CommandChild>);

impl Drop for ServerProcess {
    fn drop(&mut self) {
        if let Some(child) = self.0.take() {
            let _ = child.kill();
        }
    }
}

struct AppState {
    #[allow(dead_code)]
    server: Mutex<Option<ServerProcess>>,
}

#[tauri::command]
fn stop_server(state: tauri::State<'_, AppState>) {
    if let Ok(mut guard) = state.server.lock() {
        guard.take();
    }
}

fn migrate_dir(from: &std::path::Path, to: &std::path::Path) {
    if !from.exists() {
        return;
    }
    let _ = std::fs::create_dir_all(to);
    if let Ok(entries) = std::fs::read_dir(from) {
        for entry in entries.flatten() {
            let dest = to.join(entry.file_name());
            if !dest.exists() {
                let _ = std::fs::rename(entry.path(), &dest);
            }
        }
    }
    let _ = std::fs::remove_dir(from);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            use tauri::Manager;
            use tauri_plugin_shell::ShellExt;

            let pid = std::process::id().to_string();
            let server_state = match app
                .shell()
                .sidecar("MappingUtility.Server")
                .and_then(|cmd| cmd.args(["--parent-pid", &pid]).spawn())
            {
                Ok((_, child)) => Some(ServerProcess(Some(child))),
                Err(e) => {
                    eprintln!("[ERROR] Failed to start MappingUtility.Server: {e}");
                    None
                }
            };

            app.manage(AppState {
                server: Mutex::new(server_state),
            });

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_background_color(Some(tauri::window::Color(31, 31, 31, 255)));
                let _ = window.show();
            }

            if let Ok(data_dir) = app.path().app_data_dir() {
                let _ = std::fs::create_dir_all(data_dir.join("caches").join("downloads"));
                let _ = std::fs::create_dir_all(data_dir.join("caches").join("thumbnails"));
                let _ = std::fs::create_dir_all(data_dir.join("logs"));

                migrate_dir(&data_dir.join("assets"), &data_dir.join("caches"));
                migrate_dir(&data_dir.join("downloads"), &data_dir.join("caches").join("downloads"));
                migrate_dir(&data_dir.join("thumbnails"), &data_dir.join("caches").join("thumbnails"));
            }

            Ok(())
        })
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

            for component in path.components() {
                if matches!(component, std::path::Component::ParentDir) {
                    return Response::builder()
                        .status(404)
                        .body(Vec::new())
                        .unwrap_or_else(|_| Response::new(Vec::new()));
                }
            }

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
                        .unwrap_or_else(|_| Response::new(Vec::new()))
                }
                Err(err) => {
                    eprintln!("[ASSET ERROR] {:?} ({})", err, path.display());
                    Response::builder()
                        .status(404)
                        .body(Vec::new())
                        .unwrap_or_else(|_| Response::new(Vec::new()))
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            stop_server,
            commands::detect_osu_path,
            commands::scan_beatmapsets,
            commands::search_beatmapsets,
            commands::warmup_search_cache,
            commands::warmup_search_cache_chunked,
            commands::reload_beatmapsets,
            commands::clone_beatmap,
            commands::read_audio_file,
            commands::download_video,
            commands::convert_video,
            commands::process_thumbnail_from_video_id,
            commands::process_thumbnail_from_image,
            commands::process_thumbnail_from_url,
            commands::save_thumbnail,
            audio::commands::analyze_audio,
            audio::commands::export_spectrogram,
            audio::commands::check_audio_info,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                use tauri::Manager;
                if let Some(state) = window.app_handle().try_state::<AppState>() {
                    if let Ok(mut guard) = state.server.lock() {
                        guard.take();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
