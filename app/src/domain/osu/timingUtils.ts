import type { TimingLine } from "../../types/osu";

export function getCurrentBPM(time: number, timingPoints: TimingLine[]): number {
    let currentBeatLength = 500;

    for (const tp of timingPoints) {
        if (tp.offset > time) break;

        if (tp.uninherited) {
            currentBeatLength = tp.beatLength;
        }
    }

    return Math.round(60000 / currentBeatLength);
}

export function getCurrentSV(
    time: number,
    timingPoints: TimingLine[],
    hrMultiplier: number,
): number {
    let svMultiplier = 1.0;

    for (const tp of timingPoints) {
        if (tp.offset > time) break;

        if (tp.uninherited) {
            svMultiplier = 1.0;
        } else {
            svMultiplier = tp.svMult;
        }
    }

    return svMultiplier * hrMultiplier;
}

export function calculateGameplayStart(
    objectTime: number,
    timingPoints: TimingLine[],
    isGameplayMode: boolean,
    fixedApproachTime: number,
    arMultiplier: number,
    hrSVMultiplier: number,
    noSV: boolean = false,
): number {
    if (isGameplayMode) {
        let currentBeatLength = 500;
        let baseSvMultiplier = 1.0;

        for (const tp of timingPoints) {
            if (tp.offset > objectTime) break;

            if (tp.uninherited) {
                currentBeatLength = tp.beatLength;
                baseSvMultiplier = 1.0;
            } else if (!noSV) {
                baseSvMultiplier = tp.svMult;
            }
        }

        const finalSV = noSV ? 1.0 : baseSvMultiplier * hrSVMultiplier;
        const approachTime = (4 * currentBeatLength) / (finalSV * arMultiplier);
        return objectTime - approachTime;
    } else {
        return objectTime - fixedApproachTime;
    }
}
