use std::io::Cursor;
use std::path::Path;

use ab_glyph::{Font, FontArc, PxScale, ScaleFont};
use font8x8::legacy::BASIC_LEGACY;
use image::{DynamicImage, ImageFormat, Rgb, RgbImage};
use imageproc::drawing::draw_text_mut;
use once_cell::sync::Lazy;

use crate::audio::analyzer::SpectrogramData;

const MIN_DB: f32 = -120.0;
const MAX_DB: f32 = -20.0;

static UI_FONTS: Lazy<Vec<FontArc>> = Lazy::new(|| {
    let mut fonts = Vec::new();

    if let Ok(font) = FontArc::try_from_slice(include_bytes!(
        "../../assets/fonts/roboto/Roboto-Variable.ttf"
    )) {
        fonts.push(font);
    }

    #[cfg(target_os = "windows")]
    {
        let fallback_paths = [
            "C:/Windows/Fonts/NotoSansJP-Regular.otf",
            "C:/Windows/Fonts/NotoSansCJK-Regular.ttc",
            "C:/Windows/Fonts/meiryo.ttc",
            "C:/Windows/Fonts/YuGothR.ttc",
        ];

        for path in fallback_paths {
            if Path::new(path).exists() {
                if let Ok(bytes) = std::fs::read(path) {
                    if let Ok(font) = FontArc::try_from_vec(bytes) {
                        fonts.push(font);
                    }
                }
            }
        }
    }

    fonts
});

pub fn generate_image(
    spectrogram: &SpectrogramData,
    width: u32,
    height: u32,
    sample_rate: u32,
    duration_seconds: f64,
    source_display: &str,
    frequency_cutoff_hz: u32,
) -> Vec<u8> {
    let mut image = RgbImage::new(width, height);

    let margin_left = 76;
    let margin_top = 44;
    let margin_bottom = 38;
    let bar_width = 18;
    let bar_label_gap = 8;
    let right_padding = 92;

    let color_bar_x = width as i32 - right_padding;
    let plot_left = margin_left;
    let plot_top = margin_top;
    let plot_right = color_bar_x - 14;
    let plot_bottom = height as i32 - margin_bottom;
    let plot_width = (plot_right - plot_left).max(1);
    let plot_height = (plot_bottom - plot_top).max(1);

    fill_rect(
        &mut image,
        plot_left,
        plot_top,
        plot_width,
        plot_height,
        [0, 0, 0],
    );

    let max_frequency_hz = (sample_rate / 2).min(24_000).max(1);

    let y_ticks = build_frequency_ticks(max_frequency_hz);
    for freq in y_ticks {
        let y = frequency_to_plot_y(freq, plot_top, plot_bottom, max_frequency_hz);
        draw_hline(&mut image, plot_left, plot_right, y, [40, 40, 40]);

        let label = format_frequency_label(freq);
        let label_width = text_width(&label, 1);
        draw_text(
            &mut image,
            plot_left - label_width - 8,
            y - 4,
            &label,
            [220, 220, 220],
            1,
        );
    }

    let x_ticks = build_time_ticks(duration_seconds);
    for tick in x_ticks {
        let x = time_to_plot_x(tick, duration_seconds, plot_left, plot_right);
        draw_vline(&mut image, x, plot_top, plot_bottom, [40, 40, 40]);

        let label = format_time_label(tick);
        draw_text(
            &mut image,
            x - 9,
            plot_bottom + 8,
            &label,
            [220, 220, 220],
            1,
        );
    }

    draw_ui_text(&mut image, 12, 10, source_display, [255, 255, 255], 16.0);

    let app_label = format!("osu! mapping utility v{}", env!("CARGO_PKG_VERSION"));
    let app_label_x = (width as i32 - estimate_ui_text_width(&app_label, 14.0) - 4).max(12);
    draw_ui_text(
        &mut image,
        app_label_x,
        9,
        &app_label,
        [255, 255, 255],
        14.0,
    );

    if spectrogram.width > 0 && spectrogram.height > 0 {
        let src_w = spectrogram.width;
        let src_h = spectrogram.height;
        let nyquist = (sample_rate as f32 / 2.0).max(1.0);
        let max_freq = max_frequency_hz as f32;
        let mut x_to_bin = vec![0usize; plot_width as usize];
        for ix in 0..plot_width {
            let tx = if plot_width <= 1 {
                0.0
            } else {
                ix as f32 * (src_w - 1) as f32 / (plot_width - 1) as f32
            };
            x_to_bin[ix as usize] = tx.round().clamp(0.0, (src_w - 1) as f32) as usize;
        }

        let mut y_to_bin = vec![0usize; plot_height as usize];
        for iy in 0..plot_height {
            let y_norm = 1.0 - iy as f32 / (plot_height - 1).max(1) as f32;
            let freq = y_norm * max_freq;
            let freq_bin = ((freq / nyquist) * (src_h - 1) as f32).clamp(0.0, (src_h - 1) as f32);
            y_to_bin[iy as usize] = freq_bin.round() as usize;
        }

        for iy in 0..plot_height {
            let py = plot_top + iy;
            let fy = y_to_bin[iy as usize];

            for ix in 0..plot_width {
                let px = plot_left + ix;
                let tx = x_to_bin[ix as usize];
                let db = spectrogram.data[tx][fy];
                image.put_pixel(px as u32, py as u32, Rgb(db_to_color(db)));
            }
        }
    }

    if frequency_cutoff_hz > 0 {
        let cutoff_y = frequency_to_plot_y(
            frequency_cutoff_hz.min(max_frequency_hz),
            plot_top,
            plot_bottom,
            max_frequency_hz,
        );
        draw_dashed_hline(
            &mut image,
            plot_left + 1,
            plot_right - 1,
            cutoff_y,
            [255, 64, 64],
            9,
            5,
        );
        if cutoff_y + 1 < plot_bottom {
            draw_dashed_hline(
                &mut image,
                plot_left + 1,
                plot_right - 1,
                cutoff_y + 1,
                [255, 32, 32],
                9,
                5,
            );
        }

        let cutoff_label = format!("{:.1}kHz", frequency_cutoff_hz as f32 / 1000.0);
        let label_y = (cutoff_y - 10).max(plot_top + 2);
        draw_text(
            &mut image,
            plot_left + 4,
            label_y,
            &cutoff_label,
            [255, 64, 64],
            1,
        );
    }

    draw_rect(
        &mut image,
        plot_left,
        plot_top,
        plot_width,
        plot_height,
        [185, 185, 185],
    );

    let bar_x = color_bar_x;
    let bar_y = plot_top;
    let bar_h = plot_height;
    for y in 0..bar_h {
        let t = 1.0 - y as f32 / (bar_h - 1).max(1) as f32;
        let db = MIN_DB + t * (MAX_DB - MIN_DB);
        let color = db_to_color(db);
        for x in 0..bar_width {
            image.put_pixel((bar_x + x) as u32, (bar_y + y) as u32, Rgb(color));
        }
    }
    draw_rect(&mut image, bar_x, bar_y, bar_width, bar_h, [185, 185, 185]);

    for db in [-20, -40, -60, -80, -100, -120] {
        let y = db_to_bar_y(db as f32, plot_top, plot_bottom);
        let label = format!("{db} dB");
        draw_text(
            &mut image,
            bar_x + bar_width + bar_label_gap,
            y - 4,
            &label,
            [220, 220, 220],
            1,
        );
    }

    let dynamic = DynamicImage::ImageRgb8(image);
    let mut output = Vec::new();
    let mut cursor = Cursor::new(&mut output);
    if dynamic.write_to(&mut cursor, ImageFormat::Png).is_err() {
        return Vec::new();
    }

    output
}

fn build_frequency_ticks(max_frequency_hz: u32) -> Vec<u32> {
    let step = if max_frequency_hz >= 20_000 {
        4_000
    } else {
        2_000
    };
    let mut ticks: Vec<u32> = (0..=max_frequency_hz).step_by(step as usize).collect();
    if ticks.last().copied() != Some(max_frequency_hz) {
        ticks.push(max_frequency_hz);
    }
    ticks
}

fn build_time_ticks(duration_seconds: f64) -> Vec<f64> {
    if duration_seconds <= 0.0 {
        return vec![0.0];
    }

    let target_ticks = 8.0;
    let rough = duration_seconds / target_ticks;
    let steps = [5.0, 10.0, 15.0, 20.0, 30.0, 45.0, 60.0, 90.0, 120.0];
    let step = steps.into_iter().find(|s| *s >= rough).unwrap_or(120.0);

    let mut ticks = vec![0.0];
    let mut t = step;
    while t < duration_seconds {
        ticks.push(t);
        t += step;
    }
    ticks.push(duration_seconds);

    if ticks.len() >= 3 {
        let len = ticks.len();
        if ticks[len - 1] - ticks[len - 2] < step * 0.55 {
            ticks.remove(len - 2);
        }
    }

    ticks
}

fn frequency_to_plot_y(freq: u32, plot_top: i32, plot_bottom: i32, max_freq: u32) -> i32 {
    let max_freq = max_freq.max(1) as f32;
    let f = (freq as f32).clamp(0.0, max_freq);
    let p = 1.0 - (f / max_freq);
    (plot_top as f32 + p * (plot_bottom - plot_top) as f32) as i32
}

fn time_to_plot_x(time_sec: f64, duration_seconds: f64, plot_left: i32, plot_right: i32) -> i32 {
    if duration_seconds <= 0.0 {
        return plot_left;
    }
    let ratio = (time_sec / duration_seconds).clamp(0.0, 1.0);
    (plot_left as f64 + ratio * (plot_right - plot_left) as f64) as i32
}

fn db_to_bar_y(db: f32, plot_top: i32, plot_bottom: i32) -> i32 {
    let t = ((db - MIN_DB) / (MAX_DB - MIN_DB)).clamp(0.0, 1.0);
    let p = 1.0 - t;
    (plot_top as f32 + p * (plot_bottom - plot_top) as f32) as i32
}

fn format_frequency_label(freq: u32) -> String {
    if freq == 0 {
        return "0 kHz".to_string();
    }
    if freq % 1000 == 0 {
        return format!("{} kHz", freq / 1000);
    }
    format!("{:.1} kHz", freq as f32 / 1000.0)
}

fn format_time_label(seconds: f64) -> String {
    let total = seconds.round().max(0.0) as u64;
    let mins = total / 60;
    let secs = total % 60;
    format!("{}:{:02}", mins, secs)
}

fn db_to_color(db: f32) -> [u8; 3] {
    let normalized = ((db - MIN_DB) / (MAX_DB - MIN_DB)).clamp(0.0, 1.0);

    let stops: &[(f32, [u8; 3])] = &[
        (0.00, [18, 0, 30]),
        (0.14, [40, 0, 120]),
        (0.30, [0, 0, 255]),
        (0.46, [0, 180, 255]),
        (0.65, [0, 255, 0]),
        (0.83, [255, 255, 0]),
        (1.00, [255, 0, 0]),
    ];

    for i in 0..stops.len() - 1 {
        let (start_pos, start_color) = stops[i];
        let (end_pos, end_color) = stops[i + 1];

        if normalized >= start_pos && normalized <= end_pos {
            let span = (end_pos - start_pos).max(1.0e-6);
            let t = (normalized - start_pos) / span;
            return [
                lerp_u8(start_color[0], end_color[0], t),
                lerp_u8(start_color[1], end_color[1], t),
                lerp_u8(start_color[2], end_color[2], t),
            ];
        }
    }

    stops[stops.len() - 1].1
}

fn lerp_u8(a: u8, b: u8, t: f32) -> u8 {
    (a as f32 + (b as f32 - a as f32) * t).round() as u8
}

fn fill_rect(image: &mut RgbImage, x: i32, y: i32, w: i32, h: i32, color: [u8; 3]) {
    for py in y.max(0)..(y + h).min(image.height() as i32) {
        for px in x.max(0)..(x + w).min(image.width() as i32) {
            image.put_pixel(px as u32, py as u32, Rgb(color));
        }
    }
}

fn draw_rect(image: &mut RgbImage, x: i32, y: i32, w: i32, h: i32, color: [u8; 3]) {
    draw_hline(image, x, x + w, y, color);
    draw_hline(image, x, x + w, y + h, color);
    draw_vline(image, x, y, y + h, color);
    draw_vline(image, x + w, y, y + h, color);
}

fn draw_hline(image: &mut RgbImage, x0: i32, x1: i32, y: i32, color: [u8; 3]) {
    if y < 0 || y >= image.height() as i32 {
        return;
    }
    for x in x0.max(0)..x1.min(image.width() as i32) {
        image.put_pixel(x as u32, y as u32, Rgb(color));
    }
}

fn draw_dashed_hline(
    image: &mut RgbImage,
    x0: i32,
    x1: i32,
    y: i32,
    color: [u8; 3],
    dash: i32,
    gap: i32,
) {
    if y < 0 || y >= image.height() as i32 {
        return;
    }

    let mut x = x0.max(0);
    let end = x1.min(image.width() as i32);
    while x < end {
        let segment_end = (x + dash).min(end);
        for px in x..segment_end {
            image.put_pixel(px as u32, y as u32, Rgb(color));
        }
        x = segment_end + gap;
    }
}

fn draw_vline(image: &mut RgbImage, x: i32, y0: i32, y1: i32, color: [u8; 3]) {
    if x < 0 || x >= image.width() as i32 {
        return;
    }
    for y in y0.max(0)..y1.min(image.height() as i32) {
        image.put_pixel(x as u32, y as u32, Rgb(color));
    }
}

fn draw_text(image: &mut RgbImage, x: i32, y: i32, text: &str, color: [u8; 3], scale: i32) {
    let mut cursor_x = x;
    for ch in text.chars() {
        if ch == ' ' {
            cursor_x += 3 * scale;
            continue;
        }

        let index = ch as usize;
        if index < 128 {
            let glyph = BASIC_LEGACY[index];
            for (row, bits) in glyph.iter().enumerate() {
                for col in 0..8 {
                    if bits & (1 << col) != 0 {
                        for sy in 0..scale {
                            for sx in 0..scale {
                                let px = cursor_x + col * scale + sx;
                                let py = y + row as i32 * scale + sy;
                                if px >= 0
                                    && py >= 0
                                    && px < image.width() as i32
                                    && py < image.height() as i32
                                {
                                    image.put_pixel(px as u32, py as u32, Rgb(color));
                                }
                            }
                        }
                    }
                }
            }
        }

        cursor_x += 8 * scale;
    }
}

fn draw_ui_text(image: &mut RgbImage, x: i32, y: i32, text: &str, color: [u8; 3], size: f32) {
    if let Some(font) = pick_font_for_text(text) {
        draw_text_mut(image, Rgb(color), x, y, PxScale::from(size), font, text);
    } else {
        draw_text(image, x, y, text, color, 1);
    }
}

fn estimate_ui_text_width(text: &str, size: f32) -> i32 {
    if let Some(font) = pick_font_for_text(text) {
        let scaled = font.as_scaled(PxScale::from(size));
        let mut width = 0.0f32;
        for ch in text.chars() {
            let glyph = font.glyph_id(ch);
            width += scaled.h_advance(glyph);
        }
        return width.round() as i32;
    }

    let avg_glyph = (size * 0.58) as i32;
    (text.chars().count() as i32 * avg_glyph).max(1)
}

fn pick_font_for_text(text: &str) -> Option<&'static FontArc> {
    if UI_FONTS.is_empty() {
        return None;
    }

    let chars: Vec<char> = text.chars().filter(|c| !c.is_control()).collect();
    if chars.is_empty() {
        return UI_FONTS.first();
    }

    for font in UI_FONTS.iter() {
        let mut ok = true;
        for ch in &chars {
            if *ch == ' ' {
                continue;
            }
            if font.glyph_id(*ch).0 == 0 {
                ok = false;
                break;
            }
        }
        if ok {
            return Some(font);
        }
    }

    UI_FONTS.first()
}

fn text_width(text: &str, scale: i32) -> i32 {
    let mut width = 0;
    for ch in text.chars() {
        width += if ch == ' ' { 4 * scale } else { 8 * scale };
    }
    width
}
