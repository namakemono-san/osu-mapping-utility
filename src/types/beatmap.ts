export interface Beatmapset {
    folder_name: string;
    title: string;
    artist: string;
    creator: string;
    background_path: string | null;
    beatmapID: string;
    beatmapSetID: string;
}

export type BeatmapsetPartial = Pick<Beatmapset, 'folder_name' | 'title' | 'artist' | 'creator'>;