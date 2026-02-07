import type { TimingPoint } from "./osuFileParser";

/**
 * Returns the BPM at the given time based on the uninherited timing points.
 */
export function getCurrentBPM(time: number, timingPoints: TimingPoint[]): number {
    let currentBeatLength = 500;

    for (const tp of timingPoints) {
        if (tp.time > time) break;

        if (tp.uninherited) {
            currentBeatLength = tp.beatLength;
        }
    }

    return Math.round(60000 / currentBeatLength);
}

/**
 * Returns the effective SV multiplier at the given time, factoring in HR mod.
 */
export function getCurrentSV(
    time: number,
    timingPoints: TimingPoint[],
    hrMultiplier: number,
): number {
    let svMultiplier = 1.0;

    for (const tp of timingPoints) {
        if (tp.time > time) break;

        if (tp.uninherited) {
            svMultiplier = 1.0;
        } else if (tp.svMultiplier !== undefined) {
            svMultiplier = tp.svMultiplier;
        }
    }

    return svMultiplier * hrMultiplier;
}

/**
 * Calculates when a hit object should first become visible (start scrolling in).
 *
 * In gameplay mode, approach time depends on BPM, SV, AR and HR multipliers.
 * In edit mode, a fixed approach time is used.
 */
export function calculateGameplayStart(
    objectTime: number,
    timingPoints: TimingPoint[],
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
            } else if (tp.svMultiplier !== undefined) {
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
