use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use serde::Serialize;
use std::path::Path;
use std::time::Instant;

use crate::audio::analyzer;
use crate::audio::decoder;
use crate::audio::spectrogram;

const OUTPUT_WIDTH: u32 = 800;
const OUTPUT_HEIGHT: u32 = 450;
const TARGET_TIME_BINS: usize = 800;

#[derive(Serialize)]
pub struct AudioAnalysisResult {
    pub image_base64: String,
    pub sample_rate: u32,
    pub channels: u16,
    pub bits_per_sample: u16,
    pub original_sample_rate: u32,
    pub frequency_cutoff_hz: u32,
    pub duration_seconds: f64,
    pub file_size_bytes: u64,
    pub original_size_bytes: u64,
    pub average_bitrate_kbps: u32,
    pub image_width: u32,
    pub image_height: u32,
    pub max_frequency_hz: u32,
    pub decode_ms: u64,
    pub analyze_ms: u64,
    pub render_ms: u64,
    pub total_ms: u64,
}

#[tauri::command]
pub async fn analyze_audio(file_path: String) -> Result<AudioAnalysisResult, String> {
    let total_start = Instant::now();

    let decode_start = Instant::now();
    let decoded = decoder::decode_audio(&file_path)?;
    let decode_ms = decode_start.elapsed().as_millis() as u64;

    let analyze_start = Instant::now();
    let spectrum = analyzer::compute_spectrogram(
        &decoded.samples,
        decoded.sample_rate,
        TARGET_TIME_BINS,
    );
    let analyze_ms = analyze_start.elapsed().as_millis() as u64;

    let frequency_cutoff_hz = estimate_frequency_cutoff_hz(&spectrum, decoded.sample_rate);
    let source_display = build_source_display(&file_path);

    let render_start = Instant::now();
    let image_width = OUTPUT_WIDTH;
    let image_height = OUTPUT_HEIGHT;
    let png_bytes = spectrogram::generate_image(
        &spectrum,
        image_width,
        image_height,
        decoded.sample_rate,
        decoded.duration_seconds,
        &source_display,
        frequency_cutoff_hz,
    );
    let render_ms = render_start.elapsed().as_millis() as u64;

    if png_bytes.is_empty() {
        return Err("ファイルの読み込みに失敗しました".to_string());
    }

    let image_base64 = STANDARD.encode(&png_bytes);
    let max_frequency_hz = (decoded.sample_rate / 2).min(24_000);
    let average_bitrate_kbps = average_bitrate_kbps_from_data(decoded.file_size_bytes, decoded.duration_seconds);
    let original_size_bytes = estimate_original_size_bytes(
        decoded.sample_rate,
        decoded.channels,
        decoded.bits_per_sample,
        decoded.duration_seconds,
    );
    let total_ms = total_start.elapsed().as_millis() as u64;

    Ok(AudioAnalysisResult {
        image_base64,
        sample_rate: decoded.sample_rate,
        channels: decoded.channels,
        bits_per_sample: decoded.bits_per_sample,
        original_sample_rate: decoded.sample_rate,
        frequency_cutoff_hz,
        duration_seconds: decoded.duration_seconds,
        file_size_bytes: decoded.file_size_bytes,
        original_size_bytes,
        average_bitrate_kbps,
        image_width,
        image_height,
        max_frequency_hz,
        decode_ms,
        analyze_ms,
        render_ms,
        total_ms,
    })
}

#[tauri::command]
pub async fn export_spectrogram(file_path: String, output_path: String) -> Result<(), String> {
    let decoded = decoder::decode_audio(&file_path)?;
    let spectrum = analyzer::compute_spectrogram(
        &decoded.samples,
        decoded.sample_rate,
        TARGET_TIME_BINS,
    );
    let png_bytes = spectrogram::generate_image(
        &spectrum,
        OUTPUT_WIDTH,
        OUTPUT_HEIGHT,
        decoded.sample_rate,
        decoded.duration_seconds,
        &build_source_display(&file_path),
        estimate_frequency_cutoff_hz(&spectrum, decoded.sample_rate),
    );

    if png_bytes.is_empty() {
        return Err("ファイルの読み込みに失敗しました".to_string());
    }

    std::fs::write(output_path, png_bytes).map_err(|_| "ファイルの読み込みに失敗しました".to_string())
}

fn build_source_display(file_path: &str) -> String {
    let path = Path::new(file_path);
    let file = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(file_path);
    let parent = path
        .parent()
        .and_then(|p| p.file_name())
        .and_then(|name| name.to_str())
        .unwrap_or("");

    if parent.is_empty() {
        file.to_string()
    } else {
        format!("{parent}/{file}")
    }
}

fn estimate_original_size_bytes(
    sample_rate: u32,
    channels: u16,
    bits_per_sample: u16,
    duration_seconds: f64,
) -> u64 {
    let bytes_per_second = sample_rate as f64 * channels as f64 * (bits_per_sample as f64 / 8.0);
    (bytes_per_second * duration_seconds).round().max(0.0) as u64
}

fn estimate_frequency_cutoff_hz(spectrogram: &analyzer::SpectrogramData, sample_rate: u32) -> u32 {
    if spectrogram.width == 0 || spectrogram.height == 0 {
        return 0;
    }

    let bins = spectrogram.height;
    let frames = spectrogram.width;
    let start_bin = ((1000.0 / (sample_rate as f32 / 2.0)) * (bins - 1) as f32)
        .round()
        .clamp(0.0, (bins - 1) as f32) as usize;

    let mut occupancy = vec![0.0f32; bins];
    let threshold_db = -82.0f32;

    for (bin, occ) in occupancy.iter_mut().enumerate() {
        let hits = spectrogram
            .data
            .iter()
            .filter(|frame| frame.get(bin).copied().unwrap_or(-120.0) > threshold_db)
            .count();
        *occ = hits as f32 / frames as f32;
    }

    let mut smooth = vec![0.0f32; bins];
    for (bin, s) in smooth.iter_mut().enumerate() {
        let b0 = bin.saturating_sub(3);
        let b1 = (bin + 3).min(bins - 1);
        let mut sum = 0.0;
        let mut count = 0;
        for value in occupancy.iter().take(b1 + 1).skip(b0) {
            sum += *value;
            count += 1;
        }
        *s = if count > 0 { sum / count as f32 } else { 0.0 };
    }

    let mut cutoff_bin = start_bin;
    let min_occ = 0.18f32;
    for bin in start_bin..bins {
        if smooth[bin] >= min_occ {
            cutoff_bin = bin;
        }
    }

    let mut refined_bin = cutoff_bin;
    for bin in (start_bin..=cutoff_bin).rev() {
        let next = (bin + 1).min(bins - 1);
        if smooth[bin] - smooth[next] > 0.08 {
            refined_bin = bin;
            break;
        }
    }

    let hz = (refined_bin as f32 / (bins - 1).max(1) as f32) * (sample_rate as f32 / 2.0);
    hz.round() as u32
}

fn average_bitrate_kbps_from_data(file_size_bytes: u64, duration_seconds: f64) -> u32 {
    if duration_seconds > 0.0 {
        ((file_size_bytes as f64 * 8.0) / duration_seconds / 1000.0).round() as u32
    } else {
        0
    }
}
