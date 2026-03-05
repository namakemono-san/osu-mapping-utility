import type { OsuBeatmap, OsuHitObject, OsuTimingPoint } from "./types";

export type TaikoHitType = "don" | "kat" | "don-big" | "kat-big" | "drumroll" | "spinner";

export interface TaikoHitObject {
    time: number;
    type: TaikoHitType;
    endTime?: number;
}

export interface TaikoHitObjectWithStart extends TaikoHitObject {
    gameplayStart: number;
}

export interface TaikoDifficulty {
    fileName: string;
    version: string;
    hitObjects: TaikoHitObject[];
    timingPoints: OsuTimingPoint[];
    bpm: number;
    hpDrainRate: number;
    overallDifficulty: number;
    sliderMultiplier: number;
}

export interface TaikoBeatmapData {
    audioFilename: string;
    title: string;
    artist: string;
    creator: string;
    difficulties: TaikoDifficulty[];
}

export function mapToTaikoHitObject(ho: OsuHitObject): TaikoHitObject | null {
    const isCircle = (ho.typeFlags & 1) !== 0;
    const isSlider = (ho.typeFlags & 2) !== 0;
    const isSpinner = (ho.typeFlags & 8) !== 0;

    if (!isCircle && !isSlider && !isSpinner) return null;

    const hasWhistle = (ho.hitSound & 2) !== 0;
    const hasFinish = (ho.hitSound & 4) !== 0;
    const hasClap = (ho.hitSound & 8) !== 0;

    if (isCircle) {
        const isKat = hasWhistle || hasClap;
        const isBig = hasFinish;
        let type: TaikoHitType;
        if (isKat && isBig) type = "kat-big";
        else if (isKat) type = "kat";
        else if (isBig) type = "don-big";
        else type = "don";
        return { time: ho.time, type };
    } else if (isSlider) {
        return { time: ho.time, type: "drumroll", endTime: ho.endTime };
    } else {
        return { time: ho.time, type: "spinner", endTime: ho.endTime };
    }
}

export function adaptOsuBeatmapToTaiko(beatmap: OsuBeatmap): TaikoDifficulty {
    const hitObjects: TaikoHitObject[] = beatmap.hitObjects
        .map(mapToTaikoHitObject)
        .filter((h): h is TaikoHitObject => h !== null);

    return {
        fileName: beatmap.fileName,
        version: beatmap.metadata.version,
        hitObjects,
        timingPoints: beatmap.timingPoints,
        bpm: beatmap.bpm,
        hpDrainRate: beatmap.difficulty.hpDrainRate,
        overallDifficulty: beatmap.difficulty.overallDifficulty,
        sliderMultiplier: beatmap.difficulty.sliderMultiplier,
    };
}
