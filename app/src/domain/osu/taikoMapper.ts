import type { Beatmap, HitObject, TimingLine } from "../../types/osu";

export type TaikoHitType = "don" | "kat" | "don-big" | "kat-big" | "drumroll" | "spinner";

interface TaikoHitObject {
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
    timingLines: TimingLine[];
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

function mapToTaikoHitObject(ho: HitObject): TaikoHitObject | null {
    const isCircle = (ho.typeFlags & 1) !== 0;
    const isSlider = (ho.typeFlags & 2) !== 0;
    const isSpinner = (ho.typeFlags & 8) !== 0;

    if (!isCircle && !isSlider && !isSpinner) return null;

    const hasWhistle = (ho.hitSoundFlags & 2) !== 0;
    const hasFinish = (ho.hitSoundFlags & 4) !== 0;
    const hasClap = (ho.hitSoundFlags & 8) !== 0;

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

export function adaptOsuBeatmapToTaiko(beatmap: Beatmap): TaikoDifficulty {
    const hitObjects: TaikoHitObject[] = beatmap.hitObjects
        .map(mapToTaikoHitObject)
        .filter((h): h is TaikoHitObject => h !== null);

    return {
        fileName: beatmap.fileName,
        version: beatmap.metadata.version,
        hitObjects,
        timingLines: beatmap.timingLines,
        bpm: beatmap.bpm,
        hpDrainRate: beatmap.difficulty.hpDrainRate,
        overallDifficulty: beatmap.difficulty.overallDifficulty,
        sliderMultiplier: beatmap.difficulty.sliderMultiplier,
    };
}
