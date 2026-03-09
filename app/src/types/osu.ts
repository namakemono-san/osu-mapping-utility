export type GameMode = 0 | 1 | 2 | 3;

export interface TimingLine {
    offset: number;
    beatLength: number;
    meter: number;
    sampleSet: number;
    sampleIndex: number;
    volume: number;
    uninherited: boolean;
    kiai: boolean;
    omitsBarLine: boolean;
    svMult: number;
    msPerBeat?: number;
    bpm?: number;
}

export interface HitObject {
    time: number;
    typeFlags: number;
    hitSoundFlags: number;
    endTime: number;
    sliderType?: string | null;
    slides?: number | null;
    length?: number | null;
}

export interface Background {
    filename: string;
    xOffset: number;
    yOffset: number;
}

export interface Video {
    filename: string;
    offset: number;
}

export interface Break {
    startTime: number;
    endTime: number;
}

export interface GeneralSettings {
    audioFilename: string;
    audioLeadIn: number;
    previewTime: number;
    mode: GameMode;
    stackLeniency: number;
    epilepsyWarning: boolean;
    sampleSet: string;
}

export interface MetadataSettings {
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

export interface DifficultySettings {
    hpDrainRate: number;
    circleSize: number;
    overallDifficulty: number;
    approachRate: number;
    sliderMultiplier: number;
    sliderTickRate: number;
}

export interface Beatmap {
    fileName: string;
    formatVersion: number;
    general: GeneralSettings;
    metadata: MetadataSettings;
    difficulty: DifficultySettings;
    background: Background | null;
    video: Video | null;
    breaks: Break[];
    timingLines: TimingLine[];
    hitObjects: HitObject[];
    bpm: number;
    drainTimeMs: number;
    totalLengthMs: number;
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
