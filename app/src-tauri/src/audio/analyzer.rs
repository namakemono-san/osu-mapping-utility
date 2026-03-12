use rustfft::num_complex::Complex;
use rustfft::FftPlanner;

const WINDOW_SIZE: usize = 4096;
const HOP_SIZE: usize = 1024;
const MIN_DB: f32 = -120.0;

pub struct SpectrogramData {
    pub data: Vec<Vec<f32>>,
    pub width: usize,
    pub height: usize,
}

pub fn compute_spectrogram(
    samples: &[f32],
    _sample_rate: u32,
    target_time_bins: usize,
) -> SpectrogramData {
    if samples.is_empty() {
        return SpectrogramData {
            data: vec![vec![MIN_DB; WINDOW_SIZE / 2 + 1]],
            width: 1,
            height: WINDOW_SIZE / 2 + 1,
        };
    }

    let mut planner = FftPlanner::<f32>::new();
    let fft = planner.plan_fft_forward(WINDOW_SIZE);

    let window = hann_window(WINDOW_SIZE);
    let desired_bins = target_time_bins.max(120);
    let adaptive_hop = if samples.len() <= WINDOW_SIZE || desired_bins <= 1 {
        HOP_SIZE
    } else {
        ((samples.len() - WINDOW_SIZE) / (desired_bins - 1)).max(HOP_SIZE)
    };

    let frame_count = if samples.len() <= WINDOW_SIZE {
        1
    } else {
        (samples.len() - WINDOW_SIZE).div_ceil(adaptive_hop) + 1
    };

    let freq_bins = WINDOW_SIZE / 2 + 1;
    let mut rows: Vec<Vec<f32>> = Vec::with_capacity(frame_count);
    let reference = WINDOW_SIZE as f32 / 2.0;

    for frame_idx in 0..frame_count {
        let frame_start = frame_idx * adaptive_hop;

        let mut fft_input: Vec<Complex<f32>> = (0..WINDOW_SIZE)
            .map(|i| {
                let sample = samples.get(frame_start + i).copied().unwrap_or(0.0);
                Complex::new(sample * window[i], 0.0)
            })
            .collect();

        fft.process(&mut fft_input);

        let mut row = Vec::with_capacity(freq_bins);
        for bin in fft_input.iter().take(freq_bins) {
            let magnitude = bin.norm();

            let normalized = (magnitude / reference).max(1.0e-12);
            let db = 20.0 * normalized.log10();
            row.push(db.clamp(MIN_DB, 0.0));
        }

        rows.push(row);
    }

    SpectrogramData {
        width: rows.len(),
        height: freq_bins,
        data: rows,
    }
}

fn hann_window(size: usize) -> Vec<f32> {
    let denominator = (size as f32 - 1.0).max(1.0);
    (0..size)
        .map(|i| {
            let ratio = i as f32 / denominator;
            0.5 - 0.5 * (2.0 * std::f32::consts::PI * ratio).cos()
        })
        .collect()
}
