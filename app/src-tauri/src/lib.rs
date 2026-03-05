mod audio;
mod commands;
mod models;
mod osu;
mod utils;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
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
            commands::run_download,
            commands::convert_taiko_video,
            commands::detect_osu_path,
            commands::scan_beatmapsets,
            commands::search_beatmapsets,
            commands::clear_beatmap_cache,
            commands::invalidate_songs_cache,
            commands::reload_songs,
            commands::list_osu_files,
            commands::write_osu_file,
            commands::read_osu_file,
            commands::read_audio_file,
            commands::rename_osu_files,
            commands::clone_beatmap,
            commands::parse_osu_file,
            commands::parse_osu_files_batch,
            commands::write_osu_metadata,
            commands::process_thumbnail,
            commands::save_thumbnail,
            commands::process_image_to_thumbnail,
            commands::process_url_to_thumbnail,
            audio::commands::analyze_audio,
            audio::commands::export_spectrogram,
            audio::commands::check_audio_info,
            commands::list_folder_files,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
