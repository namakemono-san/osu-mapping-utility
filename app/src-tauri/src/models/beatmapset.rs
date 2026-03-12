use serde::{Deserialize, Serialize};

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct Beatmapset {
    pub folder_name: String,
    pub title: String,
    pub artist: String,
    pub creator: String,
    pub background_path: Option<String>,
    #[serde(rename = "beatmapID")]
    pub beatmap_id: String,
    #[serde(rename = "beatmapSetID")]
    pub beatmap_set_id: String,
    /// Pre-computed lowercase search string. Not serialized to frontend.
    #[serde(skip)]
    pub search_text: String,
}

#[derive(Deserialize, Debug)]
pub struct BeatmapMetadata {
    pub title: String,
    pub title_unicode: String,
    pub artist: String,
    pub artist_unicode: String,
    pub source: String,
    pub tags: String,
}
