export interface HitObject {
    time: number;
    type: "don" | "kat" | "don-big" | "kat-big" | "drumroll" | "spinner";
    endTime?: number;
}

export interface HitObjectWithStart extends HitObject {
    gameplayStart: number;
}

export interface TimingPoint {
    time: number;
    beatLength: number;
    meter: number;
    uninherited: boolean;
    svMultiplier?: number;
}

export interface Difficulty {
    fileName: string;
    version: string;
    hitObjects: HitObject[];
    timingPoints: TimingPoint[];
    bpm: number;
    hpDrainRate: number;
    overallDifficulty: number;
    sliderMultiplier: number;
}

export interface BeatmapData {
    audioFilename: string;
    title: string;
    artist: string;
    creator: string;
    difficulties: Difficulty[];
}

export interface Tick {
    time: number;
    type: "measure" | "beat" | "half" | "quarter";
    gameplayStart: number;
}

export interface HitAnimation {
    id: number;
    x: number;
    y: number;
    color: string;
    timestamp: number;
}

export interface ModState {
    isDT: boolean;
    isHR: boolean;
}

export interface ParseOsuFileResult {
    difficulty: Difficulty;
    leadIn: number;
}

function getCurrentTimingPointForParser(
    time: number,
    timingPoints: TimingPoint[],
): TimingPoint | null {
    let currentTP: TimingPoint | null = null;

    for (const tp of timingPoints) {
        if (tp.time > time) break;
        if (tp.uninherited) {
            currentTP = tp;
        }
    }

    return currentTP;
}

function calculateSliderDurationForParser(
    sliderLength: number,
    repeatCount: number,
    sliderMultiplier: number,
    beatLength: number,
): number {
    return (sliderLength * beatLength * repeatCount) / (sliderMultiplier * 100);
}

export function parseOsuFile(
    content: string,
    fileName: string,
): ParseOsuFileResult | null {
    const lines = content.split(/\r?\n/);

    let mode = 0;
    let version = "";
    let bpm = 120;
    let hpDrainRate = 5;
    let overallDifficulty = 5;
    let sliderMultiplier = 1.4;
    let leadIn = 0;

    let section = "";
    const hitObjects: HitObject[] = [];
    const timingPoints: TimingPoint[] = [];

    for (const line of lines) {
        const trimmed = line.trim();

        if (/^\[([A-Za-z]+)\]$/.test(trimmed)) {
            section = trimmed.toLowerCase();
            continue;
        }

        if (!trimmed || trimmed.startsWith("//")) continue;

        if (section === "[general]") {
            const [key, value] = trimmed.split(":").map(s => s.trim());
            if (key === "Mode") mode = parseInt(value);
            if (key === "AudioLeadIn") leadIn = parseInt(value);
        }

        if (section === "[metadata]") {
            const colonIndex = trimmed.indexOf(":");
            if (colonIndex === -1) continue;
            const key = trimmed.substring(0, colonIndex).trim();
            const value = trimmed.substring(colonIndex + 1).trim();
            if (key === "Version") version = value;
        }

        if (section === "[difficulty]") {
            const [key, value] = trimmed.split(":").map(s => s.trim());
            if (key === "HPDrainRate") hpDrainRate = parseFloat(value);
            if (key === "OverallDifficulty") overallDifficulty = parseFloat(value);
            if (key === "SliderMultiplier") sliderMultiplier = parseFloat(value);
        }

        if (section === "[timingpoints]") {
            const parts = trimmed.split(",");
            if (parts.length >= 2) {
                const time = parseInt(parts[0]);
                const beatLength = parseFloat(parts[1]);
                const meter = parts.length >= 3 ? parseInt(parts[2]) : 4;
                const uninherited = parts.length >= 7 ? parseInt(parts[6]) === 1 : beatLength > 0;

                if (uninherited && beatLength > 0) {
                    timingPoints.push({ time, beatLength, meter, uninherited });
                } else if (!uninherited && beatLength < 0) {
                    const svMultiplier = -100 / beatLength;
                    timingPoints.push({
                        time,
                        beatLength: 0,
                        meter,
                        uninherited: false,
                        svMultiplier
                    });
                }
            }
        }

        if (section === "[hitobjects]") {
            const parts = trimmed.split(",");
            if (parts.length >= 5) {
                const time = parseInt(parts[2]);
                const type = parseInt(parts[3]);
                const hitSound = parseInt(parts[4]);

                const isCircle = (type & 1) !== 0;
                const isSlider = (type & 2) !== 0;
                const isSpinner = (type & 8) !== 0;

                const hasWhistle = (hitSound & 2) !== 0;
                const hasFinish = (hitSound & 4) !== 0;
                const hasClap = (hitSound & 8) !== 0;

                if (isCircle) {
                    const isKat = hasWhistle || hasClap;
                    const isBig = hasFinish;

                    let objType: HitObject["type"];
                    if (isKat && isBig) objType = "kat-big";
                    else if (isKat) objType = "kat";
                    else if (isBig) objType = "don-big";
                    else objType = "don";

                    hitObjects.push({ time, type: objType });
                } else if (isSlider) {
                    const repeatCount = parts.length >= 7 ? parseInt(parts[6]) : 1;
                    const sliderLength = parts.length >= 8 ? parseFloat(parts[7]) : 100;

                    const currentTP = getCurrentTimingPointForParser(time, timingPoints);
                    const beatLength = currentTP ? currentTP.beatLength : 500;

                    const duration = calculateSliderDurationForParser(sliderLength, repeatCount, sliderMultiplier, beatLength);
                    const endTime = time + Math.round(duration);

                    hitObjects.push({ time, type: "drumroll", endTime });
                } else if (isSpinner) {
                    const endTime = parts.length >= 6 ? parseInt(parts[5]) : time + 1000;
                    hitObjects.push({ time, type: "spinner", endTime });
                }
            }
        }
    }

    if (mode !== 1) return null;

    if (timingPoints.length > 0) {
        const firstUninherited = timingPoints.find(tp => tp.uninherited);
        if (firstUninherited) {
            bpm = Math.round(60000 / firstUninherited.beatLength);
        }
    }

    return {
        difficulty: {
            fileName,
            version,
            hitObjects: hitObjects.sort((a, b) => a.time - b.time),
            timingPoints: timingPoints.sort((a, b) => a.time - b.time),
            bpm,
            hpDrainRate,
            overallDifficulty,
            sliderMultiplier,
        },
        leadIn,
    };
}
