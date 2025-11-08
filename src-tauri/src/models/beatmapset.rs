use serde::{Deserialize, Serialize};

#[derive(Serialize, Debug, Clone)]
pub struct Beatmapset {
    pub folder_name: String,
    pub title: String,
    pub artist: String,
    pub creator: String,
    pub background_path: Option<String>,
    pub beatmap_id: String,
    pub beatmap_set_id: String,
}

#[derive(Deserialize, Debug)]
pub struct BeatmapMetadata {
    pub title: String,
    pub title_unicode: String,
    pub artist: String,
    pub artist_unicode: String,
    pub creator: String,
    pub source: String,
    pub tags: String,
}
