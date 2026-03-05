import type { OsuTimingPoint } from "./types";

export function getCurrentBPM(time: number, timingPoints: OsuTimingPoint[]): number {
    let currentBeatLength = 500;

    for (const tp of timingPoints) {
        if (tp.time > time) break;

        if (tp.uninherited) {
            currentBeatLength = tp.beatLength;
        }
    }

    return Math.round(60000 / currentBeatLength);
}

export function getCurrentSV(
    time: number,
    timingPoints: OsuTimingPoint[],
    hrMultiplier: number,
): number {
    let svMultiplier = 1.0;

    for (const tp of timingPoints) {
        if (tp.time > time) break;

        if (tp.uninherited) {
            svMultiplier = 1.0;
        } else if (tp.svMultiplier != null) {
            svMultiplier = tp.svMultiplier;
        }
    }

    return svMultiplier * hrMultiplier;
}

export function calculateGameplayStart(
    objectTime: number,
    timingPoints: OsuTimingPoint[],
    isGameplayMode: boolean,
    fixedApproachTime: number,
    arMultiplier: number,
    hrSVMultiplier: number,
): number {
    if (isGameplayMode) {
        let currentBeatLength = 500;
        let baseSvMultiplier = 1.0;

        for (const tp of timingPoints) {
            if (tp.time > objectTime) break;

            if (tp.uninherited) {
                currentBeatLength = tp.beatLength;
                baseSvMultiplier = 1.0;
            } else if (tp.svMultiplier != null) {
                baseSvMultiplier = tp.svMultiplier;
            }
        }

        const finalSV = baseSvMultiplier * hrSVMultiplier;
        const approachTime = (4 * currentBeatLength) / (finalSV * arMultiplier);
        return objectTime - approachTime;
    } else {
        return objectTime - fixedApproachTime;
    }
}
