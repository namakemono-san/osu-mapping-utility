use reqwest::Client;
use std::path::PathBuf;
use tauri::Manager;
use tauri_plugin_shell::ShellExt;
use tokio::{fs::File, io::AsyncWriteExt};

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

fn strip_unc(path: &PathBuf) -> String {
    path.to_str()
        .unwrap()
        .strip_prefix(r"\\?\")
        .unwrap_or(path.to_str().unwrap())
        .to_string()
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

    let result = shell
        .command("waifu2x-ncnn-vulkan")
        .args([
            "-i",
            input.to_str().unwrap(),
            "-o",
            output.to_str().unwrap(),
            "-s",
            "2",
            "-n",
            "2",
            "-m",
            &strip_unc(&model_path),
        ])
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

async fn resize_fhd(
    app: &tauri::AppHandle,
    input: &PathBuf,
    output: &PathBuf,
) -> Result<(), String> {
    let shell = app.shell();

    let result = shell
        .command("ffmpeg")
        .args([
            "-y",
            "-i",
            input.to_str().unwrap(),
            "-vf",
            "scale=1920:1080",
            output.to_str().unwrap(),
        ])
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

#[tauri::command]
pub async fn process_thumbnail(app: tauri::AppHandle, video_id: String) -> Result<String, String> {
    println!("process_thumbnail called: {}", video_id);

    let base_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("thumbnails");

    std::fs::create_dir_all(&base_dir).map_err(|e| e.to_string())?;

    let raw = base_dir.join(format!("{}_raw.jpg", video_id));
    let upscaled = base_dir.join(format!("{}_upscaled.png", video_id));
    let fhd = base_dir.join(format!("{}_fhd.png", video_id));

    if fhd.exists() {
        return Ok(fhd.to_string_lossy().to_string());
    }

    let maxres = format!("https://img.youtube.com/vi/{}/maxresdefault.jpg", video_id);
    let hqdefault = format!("https://img.youtube.com/vi/{}/hqdefault.jpg", video_id);

    if download(&maxres, &raw).await.is_err() {
        download(&hqdefault, &raw).await?;
    }

    run_waifu2x(&app, &raw, &upscaled).await?;
    resize_fhd(&app, &upscaled, &fhd).await?;

    Ok(fhd.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn save_thumbnail(src: String, dest: String) -> Result<(), String> {
    tokio::fs::copy(&src, &dest)
        .await
        .map_err(|e| format!("Failed to copy: {}", e))?;
    Ok(())
}
