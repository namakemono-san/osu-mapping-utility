use reqwest::Client;
use std::path::PathBuf;
use tauri::Manager;
use tauri_plugin_shell::ShellExt;
use tokio::{fs::File, io::AsyncWriteExt};

const MAX_THUMBNAIL_BYTES: u64 = 2_500_000;

async fn download(url: &str, path: &PathBuf) -> Result<(), String> {
    let client = Client::new();
    let resp = client.get(url).send().await.map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("HTTP error: {}", resp.status()));
    }

    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    let mut file = File::create(path).await.map_err(|e| e.to_string())?;
    file.write_all(&bytes).await.map_err(|e| e.to_string())?;

    Ok(())
}

const MAX_IMAGE_DOWNLOAD_BYTES: u64 = 50 * 1024 * 1024;

async fn download_image_to_bytes(url: &str) -> Result<Vec<u8>, String> {
    let client = Client::new();
    let resp = client.get(url).send().await.map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("HTTP error: {}", resp.status()));
    }

    if let Some(content_length) = resp.content_length() {
        if content_length > MAX_IMAGE_DOWNLOAD_BYTES {
            return Err(format!(
                "Image too large: {} bytes (max {} bytes)",
                content_length, MAX_IMAGE_DOWNLOAD_BYTES
            ));
        }
    }

    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    Ok(bytes.to_vec())
}

fn detect_image_ext_from_url(url: &str) -> &'static str {
    let lowered = url.to_ascii_lowercase();
    if lowered.contains(".png") {
        return "png";
    }
    if lowered.contains(".webp") {
        return "webp";
    }
    if lowered.contains(".bmp") {
        return "bmp";
    }
    if lowered.contains(".jpeg") {
        return "jpeg";
    }
    "jpg"
}

fn strip_unc(path: &PathBuf) -> String {
    let s = path.to_string_lossy();
    s.strip_prefix(r"\\?\").unwrap_or(&s).to_string()
}

async fn run_waifu2x(
    app: &tauri::AppHandle,
    input: &PathBuf,
    output: &PathBuf,
) -> Result<(), String> {
    let shell = app.shell();

    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("resource_dir error: {}", e))?;

    let model_path = resource_dir.join("binaries/models-cunet");

    let args: Vec<String> = vec![
        "-i".into(),
        input.to_string_lossy().to_string(),
        "-o".into(),
        output.to_string_lossy().to_string(),
        "-s".into(),
        "2".into(),
        "-n".into(),
        "2".into(),
        "-m".into(),
        strip_unc(&model_path),
    ];

    let result = shell
        .sidecar("waifu2x-ncnn-vulkan")
        .map_err(|e| format!("waifu2x sidecar init error: {}", e))?
        .args(args)
        .output()
        .await
        .map_err(|e| format!("waifu2x spawn error: {}", e))?;

    if result.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&result.stderr);
        let stdout = String::from_utf8_lossy(&result.stdout);
        Err(format!(
            "waifu2x failed (code {:?})\nstdout: {}\nstderr: {}",
            result.status.code(),
            stdout,
            stderr
        ))
    }
}

async fn render_jpeg(
    app: &tauri::AppHandle,
    input: &PathBuf,
    output: &PathBuf,
    width: u32,
    height: u32,
    q: u8,
) -> Result<(), String> {
    let shell = app.shell();

    let vf = format!("scale={}:{}:force_original_aspect_ratio=decrease", width, height);
    let q_str = q.to_string();

    let args: Vec<String> = vec![
        "-y".into(),
        "-i".into(),
        input.to_string_lossy().to_string(),
        "-vf".into(),
        vf,
        "-q:v".into(),
        q_str,
        output.to_string_lossy().to_string(),
    ];

    let result = shell
        .sidecar("ffmpeg")
        .map_err(|e| format!("ffmpeg sidecar init error: {}", e))?
        .args(args)
        .output()
        .await
        .map_err(|e| format!("ffmpeg spawn error: {}", e))?;

    if result.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&result.stderr);
        let stdout = String::from_utf8_lossy(&result.stdout);
        Err(format!(
            "ffmpeg failed (code {:?})\nstdout: {}\nstderr: {}",
            result.status.code(),
            stdout,
            stderr
        ))
    }
}

async fn ensure_under_size(app: &tauri::AppHandle, input: &PathBuf, output: &PathBuf) -> Result<(), String> {
    let sizes = [(1920, 1080), (1600, 900), (1280, 720), (960, 540), (854, 480)];
    let qualities: [u8; 15] = [3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31];

    for (w, h) in sizes {
        for q in qualities {
            render_jpeg(app, input, output, w, h, q).await?;
            let size = std::fs::metadata(output).map_err(|e| e.to_string())?.len();
            if size <= MAX_THUMBNAIL_BYTES {
                return Ok(());
            }
        }
    }

    let final_size = std::fs::metadata(output).map_err(|e| e.to_string())?.len();
    Err(format!(
        "Thumbnail exceeds limit: {} bytes (max {} bytes)",
        final_size, MAX_THUMBNAIL_BYTES
    ))
}

async fn resize_to_thumbnail_pipeline(
    app: &tauri::AppHandle,
    input_path: &PathBuf,
    out_path: &PathBuf,
    use_waifu2x: bool,
    work_dir: &PathBuf,
    work_stem: &str,
) -> Result<(), String> {
    if use_waifu2x {
        let upscaled = work_dir.join(format!("{}_upscaled.png", work_stem));
        run_waifu2x(app, input_path, &upscaled).await?;
        ensure_under_size(app, &upscaled, out_path).await?;
    } else {
        ensure_under_size(app, input_path, out_path).await?;
    }
    Ok(())
}

#[tauri::command]
pub async fn process_thumbnail_from_video_id(app: tauri::AppHandle, video_id: String, out_dir: String) -> Result<String, String> {
    if out_dir.trim().is_empty() {
        return Err("out_dir is empty".into());
    }

    let out_dir_buf = PathBuf::from(&out_dir);
    std::fs::create_dir_all(&out_dir_buf).map_err(|e| e.to_string())?;

    let work_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("thumbnails");
    std::fs::create_dir_all(&work_dir).map_err(|e| e.to_string())?;

    let raw = work_dir.join(format!("{}_raw.jpg", video_id));
    let upscaled = work_dir.join(format!("{}_upscaled.png", video_id));
    let fhd = out_dir_buf.join(format!("{}-thumbnail.jpg", video_id));

    if fhd.exists() {
        let size = std::fs::metadata(&fhd).map_err(|e| e.to_string())?.len();
        if size <= MAX_THUMBNAIL_BYTES {
            return Ok(fhd.to_string_lossy().to_string());
        }
    }

    let maxres = format!("https://img.youtube.com/vi/{}/maxresdefault.jpg", video_id);
    let hqdefault = format!("https://img.youtube.com/vi/{}/hqdefault.jpg", video_id);

    if download(&maxres, &raw).await.is_err() {
        download(&hqdefault, &raw).await?;
    }

    run_waifu2x(&app, &raw, &upscaled).await?;
    ensure_under_size(&app, &upscaled, &fhd).await?;

    Ok(fhd.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn process_thumbnail_from_image(
    app: tauri::AppHandle,
    src_path: String,
    out_dir: String,
    use_waifu2x: bool,
) -> Result<String, String> {
    if src_path.trim().is_empty() {
        return Err("src_path is empty".into());
    }
    if out_dir.trim().is_empty() {
        return Err("out_dir is empty".into());
    }

    let src = PathBuf::from(&src_path);
    if !src.exists() {
        return Err(format!("source not found: {}", src_path));
    }

    let out_dir_buf = PathBuf::from(&out_dir);
    std::fs::create_dir_all(&out_dir_buf).map_err(|e| e.to_string())?;

    let stem = src
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("image");
    let out_path = out_dir_buf.join(format!("{}-thumbnail.jpg", stem));

    let work_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("thumbnails");
    std::fs::create_dir_all(&work_dir).map_err(|e| e.to_string())?;

    resize_to_thumbnail_pipeline(
        &app,
        &src,
        &out_path,
        use_waifu2x,
        &work_dir,
        "local",
    )
    .await?;

    Ok(out_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn process_thumbnail_from_url(
    app: tauri::AppHandle,
    image_url: String,
    out_dir: String,
    use_waifu2x: bool,
) -> Result<String, String> {
    let image_url = image_url.trim();
    if image_url.is_empty() {
        return Err("image_url is empty".into());
    }
    if out_dir.trim().is_empty() {
        return Err("out_dir is empty".into());
    }
    if !(image_url.starts_with("http://") || image_url.starts_with("https://")) {
        return Err("image_url must start with http:// or https://".into());
    }

    let out_dir_buf = PathBuf::from(&out_dir);
    std::fs::create_dir_all(&out_dir_buf).map_err(|e| e.to_string())?;

    let work_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("thumbnails");
    std::fs::create_dir_all(&work_dir).map_err(|e| e.to_string())?;

    let ext = detect_image_ext_from_url(image_url);
    let raw = work_dir.join(format!("url_raw.{}", ext));
    let fhd = out_dir_buf.join("url-thumbnail.jpg");

    let bytes = download_image_to_bytes(image_url).await?;
    tokio::fs::write(&raw, bytes)
        .await
        .map_err(|e| format!("failed to write downloaded image: {e}"))?;

    resize_to_thumbnail_pipeline(&app, &raw, &fhd, use_waifu2x, &work_dir, "url").await?;
    Ok(fhd.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn save_thumbnail(src: String, dest: String) -> Result<(), String> {
    tokio::fs::copy(&src, &dest)
        .await
        .map_err(|e| format!("Failed to copy: {}", e))?;
    Ok(())
}
