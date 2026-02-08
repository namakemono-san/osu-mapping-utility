use std::fs::File;
use std::path::Path;

use symphonia::core::audio::{AudioBufferRef, Signal};
use symphonia::core::codecs::DecoderOptions;
use symphonia::core::conv::FromSample;
use symphonia::core::errors::Error as SymphoniaError;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
use symphonia::core::sample::Sample;

const MAX_FILE_SIZE_BYTES: u64 = 100 * 1024 * 1024;

pub struct AudioData {
    pub samples: Vec<f32>,
    pub sample_rate: u32,
    pub channels: u16,
    pub bits_per_sample: u16,
    pub duration_seconds: f64,
    pub file_size_bytes: u64,
}

pub fn decode_audio(file_path: &str) -> Result<AudioData, String> {
    let path = Path::new(file_path);

    if !path.exists() {
        return Err("ファイルが見つかりません".to_string());
    }

    let extension = path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
        .ok_or_else(|| "対応形式: MP3, OGG".to_string())?;

    if extension != "mp3" && extension != "ogg" {
        return Err("対応形式: MP3, OGG".to_string());
    }

    let metadata = path
        .metadata()
        .map_err(|_| "ファイルの読み込みに失敗しました".to_string())?;

    if metadata.len() > MAX_FILE_SIZE_BYTES {
        return Err("ファイルサイズが大きすぎます（100MB以下を推奨）".to_string());
    }

    let file = File::open(path).map_err(|_| "ファイルの読み込みに失敗しました".to_string())?;
    let mss = MediaSourceStream::new(Box::new(file), Default::default());

    let mut hint = Hint::new();
    hint.with_extension(&extension);

    let mut format = symphonia::default::get_probe()
        .format(
            &hint,
            mss,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .map_err(|_| "ファイルの読み込みに失敗しました".to_string())?
        .format;

    let track = format
        .default_track()
        .ok_or_else(|| "ファイルの読み込みに失敗しました".to_string())?;
    let track_id = track.id;

    let sample_rate = track
        .codec_params
        .sample_rate
        .ok_or_else(|| "ファイルの読み込みに失敗しました".to_string())?;

    let channel_count = track
        .codec_params
        .channels
        .map(|channels| channels.count())
        .unwrap_or(1);

    let bits_per_sample = track
        .codec_params
        .bits_per_sample
        .or(track.codec_params.bits_per_coded_sample)
        .unwrap_or(16) as u16;

    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|_| "ファイルの読み込みに失敗しました".to_string())?;

    let mut mono_samples: Vec<f32> = Vec::new();
    if let Some(n_frames) = track.codec_params.n_frames {
        let reserve_len = n_frames.min(20_000_000) as usize;
        mono_samples.reserve(reserve_len);
    }

    loop {
        let packet = match format.next_packet() {
            Ok(packet) => packet,
            Err(SymphoniaError::IoError(err))
                if err.kind() == std::io::ErrorKind::UnexpectedEof =>
            {
                break;
            }
            Err(_) => return Err("ファイルの読み込みに失敗しました".to_string()),
        };

        if packet.track_id() != track_id {
            continue;
        }

        let decoded = match decoder.decode(&packet) {
            Ok(decoded) => decoded,
            Err(SymphoniaError::IoError(err))
                if err.kind() == std::io::ErrorKind::UnexpectedEof =>
            {
                break;
            }
            Err(SymphoniaError::DecodeError(_)) => continue,
            Err(_) => return Err("ファイルの読み込みに失敗しました".to_string()),
        };

        match decoded {
            AudioBufferRef::U8(buf) => append_mono(&mut mono_samples, &buf),
            AudioBufferRef::U16(buf) => append_mono(&mut mono_samples, &buf),
            AudioBufferRef::U24(buf) => append_mono(&mut mono_samples, &buf),
            AudioBufferRef::U32(buf) => append_mono(&mut mono_samples, &buf),
            AudioBufferRef::S8(buf) => append_mono(&mut mono_samples, &buf),
            AudioBufferRef::S16(buf) => append_mono(&mut mono_samples, &buf),
            AudioBufferRef::S24(buf) => append_mono(&mut mono_samples, &buf),
            AudioBufferRef::S32(buf) => append_mono(&mut mono_samples, &buf),
            AudioBufferRef::F32(buf) => append_mono(&mut mono_samples, &buf),
            AudioBufferRef::F64(buf) => append_mono(&mut mono_samples, &buf),
        }
    }

    if mono_samples.is_empty() {
        return Err("ファイルの読み込みに失敗しました".to_string());
    }

    let duration_seconds = mono_samples.len() as f64 / sample_rate as f64;

    Ok(AudioData {
        samples: mono_samples,
        sample_rate,
        channels: channel_count as u16,
        bits_per_sample,
        duration_seconds,
        file_size_bytes: metadata.len(),
    })
}

fn append_mono<T>(output: &mut Vec<f32>, buf: &symphonia::core::audio::AudioBuffer<T>)
where
    T: Sample + Copy,
    f32: FromSample<T>,
{
    let channels = buf.spec().channels.count();
    let frames = buf.frames();

    if channels == 0 || frames == 0 {
        return;
    }

    if channels == 1 {
        let ch = buf.chan(0);
        for sample in ch.iter().take(frames) {
            output.push(f32::from_sample(*sample));
        }
        return;
    }

    if channels == 2 {
        let left = buf.chan(0);
        let right = buf.chan(1);
        let len = frames.min(left.len()).min(right.len());
        for frame_index in 0..len {
            let l = f32::from_sample(left[frame_index]);
            let r = f32::from_sample(right[frame_index]);
            output.push((l + r) * 0.5);
        }
        return;
    }

    for frame_index in 0..frames {
        let mut sum = 0.0f32;
        let mut count = 0usize;

        for channel_index in 0..channels {
            let channel = buf.chan(channel_index);
            if frame_index < channel.len() {
                sum += f32::from_sample(channel[frame_index]);
                count += 1;
            }
        }

        if count > 0 {
            output.push(sum / count as f32);
        }
    }
}
