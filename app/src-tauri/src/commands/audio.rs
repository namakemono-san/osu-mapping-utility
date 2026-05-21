use crate::utils::parser::quote;
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
        .join("caches");

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

async fn convert_taiko_video_impl(
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

async fn convert_audio(
    app: &tauri::AppHandle,
    window: &tauri::WebviewWindow,
    src_path: &str,
    out_dir: &str,
    audio_format: &str,
) -> Result<(), String> {
    let _ = window.emit(
        "download-progress",
        "[audio][probe] analyzing source (duration, sample_rate, avg bitrate, cutoff)...",
    );

    let duration_seconds = ffprobe_duration_seconds(app, window, src_path).await?;
    if duration_seconds <= 0.0 {
        let _ = window.emit(
            "download-progress",
            format!("[audio][fail] invalid duration: {}", duration_seconds),
        );
        return Err("invalid duration".into());
    }

    let sample_rate_hz = ffprobe_sample_rate_hz(app, window, src_path)
        .await?
        .ok_or_else(|| {
            let _ = window.emit(
                "download-progress",
                "[audio][fail] could not detect sample rate (cannot guarantee no upsampling)",
            );
            "could not detect sample rate".to_string()
        })?;

    let file_size_bytes = std::fs::metadata(src_path)
        .map_err(|e| format!("failed to stat source file: {e}"))?
        .len();

    let source_avg_kbps = average_kbps_from_size_and_duration(file_size_bytes, duration_seconds);
    let target_sample_rate_hz = std::cmp::min(sample_rate_hz, 44_100);

    let max_bitrate_kbps = match audio_format.to_lowercase().as_str() {
        "ogg" => 208,
        _ => 192,
    };

    let cutoff_hz = estimate_cutoff_hz(app, window, src_path, target_sample_rate_hz).await;
    let classified_target = cutoff_hz
        .map(classify_target_bitrate_kbps)
        .unwrap_or(u32::MAX);
    let target_bitrate = if classified_target == u32::MAX {
        max_bitrate_kbps
    } else {
        std::cmp::min(classified_target, max_bitrate_kbps)
    };

    let _ = window.emit(
        "download-progress",
        format!(
            "[audio][probe] source_avg={:.2}k, sr={}Hz, target_sr={}Hz",
            source_avg_kbps, sample_rate_hz, target_sample_rate_hz
        ),
    );

    if let Some(cutoff_hz) = cutoff_hz {
        let _ = window.emit(
            "download-progress",
            format!(
                "[audio][probe] cutoff≈{:.1}kHz => target={}k (format_max={}k)",
                cutoff_hz as f64 / 1000.0,
                target_bitrate,
                max_bitrate_kbps
            ),
        );
    } else {
        let _ = window.emit(
            "download-progress",
            format!(
                "[audio][probe] cutoff=unknown => target={}k (format_max={}k)",
                target_bitrate, max_bitrate_kbps
            ),
        );
    }

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
        "-vn".into(),
        "-ar".into(),
        target_sample_rate_hz.to_string(),
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
                    if let Err(e) = std::fs::remove_file(src_path) {
                        eprintln!("[download] Failed to remove temp file: {}", e);
                    }
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

fn average_kbps_from_size_and_duration(file_size_bytes: u64, duration_seconds: f64) -> f64 {
    if duration_seconds <= 0.0 {
        return 0.0;
    }
    (file_size_bytes as f64 * 8.0) / duration_seconds / 1000.0
}

fn classify_target_bitrate_kbps(cutoff_hz: f64) -> u32 {
    if cutoff_hz <= 16_500.0 {
        128
    } else if cutoff_hz <= 18_000.0 {
        160
    } else {
        u32::MAX
    }
}

async fn estimate_cutoff_hz(
    app: &tauri::AppHandle,
    window: &tauri::WebviewWindow,
    src_path: &str,
    analysis_sample_rate_hz: u32,
) -> Option<f64> {
    let _ = window.emit("download-progress", "[audio][probe] estimating cutoff (fft)...");

    let max_seconds: u32 = 30;
    let out = extract_pcm_preview_f32le(app, window, src_path, analysis_sample_rate_hz, max_seconds)
        .await
        .ok()?;

    if out.len() < 2048 {
        let _ = window.emit("download-progress", "[audio][probe] cutoff estimate skipped (too few samples)");
        return None;
    }

    estimate_cutoff_hz_from_pcm(&out, analysis_sample_rate_hz)
}

async fn extract_pcm_preview_f32le(
    app: &tauri::AppHandle,
    window: &tauri::WebviewWindow,
    src_path: &str,
    sample_rate_hz: u32,
    max_seconds: u32,
) -> Result<Vec<f32>, String> {
    let args: Vec<String> = vec![
        "-v".into(),
        "error".into(),
        "-t".into(),
        max_seconds.to_string(),
        "-i".into(),
        src_path.to_string(),
        "-vn".into(),
        "-ac".into(),
        "1".into(),
        "-ar".into(),
        sample_rate_hz.to_string(),
        "-f".into(),
        "f32le".into(),
        "pipe:1".into(),
    ];

    {
        let mut parts = vec![String::from("[audio][probe] sidecar:ffmpeg")];
        parts.extend(args.iter().map(|a| quote(a)));
        let _ = window.emit("download-progress", parts.join(" "));
    }

    let cmd = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| format!("sidecar init error (ffmpeg): {e}"))?
        .args(args);

    let output = cmd.output().await.map_err(|e| format!("ffmpeg probe output error: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffmpeg probe failed: {}", stderr.trim()));
    }

    let bytes = output.stdout;
    if bytes.len() % 4 != 0 {
        return Err("ffmpeg probe returned misaligned f32 data".into());
    }

    let mut samples = Vec::with_capacity(bytes.len() / 4);
    for chunk in bytes.chunks_exact(4) {
        samples.push(f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]));
    }
    Ok(samples)
}

fn estimate_cutoff_hz_from_pcm(samples: &[f32], sample_rate_hz: u32) -> Option<f64> {
    const WINDOW: usize = 2048;
    const HOP: usize = 512;
    if samples.len() < WINDOW || sample_rate_hz == 0 {
        return None;
    }

    let mut planner = rustfft::FftPlanner::<f32>::new();
    let fft = planner.plan_fft_forward(WINDOW);
    let window = (0..WINDOW)
        .map(|i| {
            let denom = (WINDOW as f32 - 1.0).max(1.0);
            let ratio = i as f32 / denom;
            0.5 - 0.5 * (2.0 * std::f32::consts::PI * ratio).cos()
        })
        .collect::<Vec<f32>>();

    let freq_bins = WINDOW / 2 + 1;
    let mut acc = vec![0.0f64; freq_bins];
    let mut frames = 0u64;

    let mut pos = 0usize;
    while pos + WINDOW <= samples.len() {
        let mut buf: Vec<rustfft::num_complex::Complex<f32>> = (0..WINDOW)
            .map(|i| rustfft::num_complex::Complex::new(samples[pos + i] * window[i], 0.0))
            .collect();
        fft.process(&mut buf);
        for (i, c) in buf.iter().take(freq_bins).enumerate() {
            let mag = c.norm() as f64;
            acc[i] += mag * mag;
        }
        frames += 1;
        pos += HOP;
    }
    if frames == 0 {
        return None;
    }
    for v in acc.iter_mut() {
        *v /= frames as f64;
    }

    let max_p = acc.iter().cloned().fold(0.0f64, f64::max);
    if max_p <= 0.0 {
        return None;
    }

    let db = acc
        .iter()
        .map(|p| 10.0 * ((p / max_p).max(1e-12)).log10())
        .collect::<Vec<f64>>();

    let threshold_db = -45.0;
    let run = 3usize;
    for i in (0..freq_bins).rev() {
        if i < run {
            break;
        }
        let mut ok = true;
        for j in 0..run {
            if db[i - j] < threshold_db {
                ok = false;
                break;
            }
        }
        if ok {
            let hz = (i as f64) * (sample_rate_hz as f64) / (WINDOW as f64);
            return Some(hz);
        }
    }
    None
}

async fn ffprobe_duration_seconds(
    app: &tauri::AppHandle,
    window: &tauri::WebviewWindow,
    src_path: &str,
) -> Result<f64, String> {
    async fn run(
        app: &tauri::AppHandle,
        name: &str,
        args: Vec<String>,
    ) -> Result<(i32, String, String), String> {
        let cmd = app
            .shell()
            .sidecar(name)
            .map_err(|e| format!("sidecar init error ({name}): {e}"))?
            .args(args);
        let out = cmd
            .output()
            .await
            .map_err(|e| format!("{name} output error: {e}"))?;
        let code = out.status.code().unwrap_or(-1);
        Ok((
            code,
            String::from_utf8_lossy(&out.stdout).to_string(),
            String::from_utf8_lossy(&out.stderr).to_string(),
        ))
    }

    let args = vec![
        "-v".into(),
        "error".into(),
        "-show_entries".into(),
        "format=duration".into(),
        "-of".into(),
        "default=nk=1:nw=1".into(),
        src_path.to_string(),
    ];

    let (code, stdout, stderr) = run(app, "ffprobe", args).await?;
    if code != 0 {
        let _ = window.emit(
            "download-progress",
            format!("[audio][probe-error] ffprobe(duration) failed: code={}, err={}", code, stderr.trim()),
        );
        return Err(format!("ffprobe failed: code={}", code));
    }

    let t = stdout.trim();
    let dur = t
        .parse::<f64>()
        .map_err(|e| format!("failed to parse duration '{t}': {e}"))?;
    Ok(dur)
}

async fn ffprobe_sample_rate_hz(
    app: &tauri::AppHandle,
    window: &tauri::WebviewWindow,
    src_path: &str,
) -> Result<Option<u32>, String> {
    async fn run(
        app: &tauri::AppHandle,
        name: &str,
        args: Vec<String>,
    ) -> Result<(i32, String, String), String> {
        let cmd = app
            .shell()
            .sidecar(name)
            .map_err(|e| format!("sidecar init error ({name}): {e}"))?
            .args(args);
        let out = cmd
            .output()
            .await
            .map_err(|e| format!("{name} output error: {e}"))?;
        let code = out.status.code().unwrap_or(-1);
        Ok((
            code,
            String::from_utf8_lossy(&out.stdout).to_string(),
            String::from_utf8_lossy(&out.stderr).to_string(),
        ))
    }

    let args = vec![
        "-v".into(),
        "error".into(),
        "-select_streams".into(),
        "a:0".into(),
        "-show_entries".into(),
        "stream=sample_rate".into(),
        "-of".into(),
        "default=nk=1:nw=1".into(),
        src_path.to_string(),
    ];

    let (code, stdout, stderr) = run(app, "ffprobe", args).await?;
    if code != 0 {
        let _ = window.emit(
            "download-progress",
            format!("[audio][probe-error] ffprobe(sample_rate) failed: code={}, err={}", code, stderr.trim()),
        );
        return Err(format!("ffprobe failed: code={}", code));
    }

    let t = stdout.trim();
    if t.is_empty() || t.eq_ignore_ascii_case("n/a") {
        return Ok(None);
    }
    let sr = t
        .parse::<u32>()
        .map_err(|e| format!("failed to parse sample_rate '{t}': {e}"))?;
    Ok(Some(sr))
}

#[tauri::command]
pub async fn download_video(
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
        .join("caches")
        .join("downloads");

    std::fs::create_dir_all(&cache_dir).map_err(|e| format!("failed to create cache dir: {e}"))?;

    let cache_dir_str = cache_dir.to_string_lossy().replace('\\', "/");

    let audio_args: Vec<String> = vec![
        "--js-runtimes".into(),
        "deno".into(),
        "--newline".into(),
        "--no-color".into(),
        "--encoding".into(),
        "utf-8".into(),
        "-f".into(),
        "bestaudio[video=none]/bestaudio".into(),
        "-S".into(),
        "acodec:opus,abr".into(),
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
            "--js-runtimes".into(),
            "deno".into(),
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

#[tauri::command]
pub async fn convert_video(
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
