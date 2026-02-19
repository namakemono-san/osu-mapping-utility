use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OsuGeneral {
    pub audio_filename: String,
    pub audio_lead_in: i32,
    pub preview_time: i32,
    pub mode: u8,
    pub stack_leniency: f64,
    pub epilepsy_warning: bool,
    pub sample_set: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OsuMetadata {
    pub title: String,
    pub title_unicode: String,
    pub artist: String,
    pub artist_unicode: String,
    pub creator: String,
    pub version: String,
    pub source: String,
    pub tags: String,
    pub beatmap_id: i64,
    pub beatmap_set_id: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OsuDifficultySettings {
    pub hp_drain_rate: f64,
    pub circle_size: f64,
    pub overall_difficulty: f64,
    pub approach_rate: f64,
    pub slider_multiplier: f64,
    pub slider_tick_rate: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OsuBackground {
    pub filename: String,
    pub x_offset: i32,
    pub y_offset: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OsuBreak {
    pub start_time: i32,
    pub end_time: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OsuTimingPoint {
    pub time: f64,
    pub beat_length: f64,
    pub meter: i32,
    pub sample_set: i32,
    pub sample_index: i32,
    pub volume: i32,
    pub uninherited: bool,
    pub kiai: bool,
    pub sv_multiplier: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OsuHitObject {
    pub time: i32,
    pub type_flags: i32,
    pub hit_sound: i32,
    pub end_time: i32,
    pub slider_type: Option<String>,
    pub slides: Option<i32>,
    pub length: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OsuBeatmap {
    pub file_name: String,
    pub format_version: i32,
    pub general: OsuGeneral,
    pub metadata: OsuMetadata,
    pub difficulty: OsuDifficultySettings,
    pub background: Option<OsuBackground>,
    pub video_filename: Option<String>,
    pub timing_points: Vec<OsuTimingPoint>,
    pub hit_objects: Vec<OsuHitObject>,
    pub breaks: Vec<OsuBreak>,
    pub bpm: f64,
    pub drain_time_ms: i64,
    pub total_length_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OsuBeatmapHeader {
    pub audio_filename: String,
    pub title: String,
    pub artist: String,
    pub creator: String,
    pub beatmap_id: String,
    pub beatmap_set_id: String,
    pub background_filename: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OsuBeatmapset {
    pub folder_path: String,
    pub difficulties: Vec<OsuBeatmap>,
    pub has_background: bool,
    pub background_filename: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataWriteInput {
    pub title: String,
    pub title_unicode: String,
    pub artist: String,
    pub artist_unicode: String,
    pub creator: String,
    pub source: String,
    pub tags: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundWriteInput {
    pub filename: String,
    pub x_offset: i32,
    pub y_offset: i32,
}
