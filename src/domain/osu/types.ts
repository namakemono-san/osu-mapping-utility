export type GameMode = 0 | 1 | 2 | 3;

export interface OsuTimingPoint {
    time: number;
    beatLength: number;
    meter: number;
    sampleSet: number;
    sampleIndex: number;
    volume: number;
    uninherited: boolean;
    kiai: boolean;
    svMultiplier?: number | null;
}

export interface OsuHitObject {
    time: number;
    typeFlags: number;
    hitSound: number;
    endTime: number;
    sliderType?: string | null;
    slides?: number | null;
    length?: number | null;
}

export interface OsuBackground {
    filename: string;
    xOffset: number;
    yOffset: number;
}

export interface OsuBreak {
    startTime: number;
    endTime: number;
}

export interface OsuGeneral {
    audioFilename: string;
    audioLeadIn: number;
    previewTime: number;
    mode: GameMode;
    stackLeniency: number;
    epilepsyWarning: boolean;
    sampleSet: string;
}

export interface OsuMetadata {
    title: string;
    titleUnicode: string;
    artist: string;
    artistUnicode: string;
    creator: string;
    version: string;
    source: string;
    tags: string;
    beatmapId: number;
    beatmapSetId: number;
}

export interface OsuDifficultySettings {
    hpDrainRate: number;
    circleSize: number;
    overallDifficulty: number;
    approachRate: number;
    sliderMultiplier: number;
    sliderTickRate: number;
}

export interface OsuBeatmap {
    fileName: string;
    formatVersion: number;
    general: OsuGeneral;
    metadata: OsuMetadata;
    difficulty: OsuDifficultySettings;
    background: OsuBackground | null;
    videoFilename: string | null;
    timingPoints: OsuTimingPoint[];
    hitObjects: OsuHitObject[];
    breaks: OsuBreak[];
    bpm: number;
    drainTimeMs: number;
    totalLengthMs: number;
}

export interface OsuBeatmapset {
    folderPath: string;
    difficulties: OsuBeatmap[];
    hasBackground: boolean;
    backgroundFilename: string;
}

export interface MetadataWriteInput {
    title: string;
    titleUnicode: string;
    artist: string;
    artistUnicode: string;
    creator: string;
    source: string;
    tags: string;
}

export interface BackgroundWriteInput {
    filename: string;
    xOffset: number;
    yOffset: number;
}
