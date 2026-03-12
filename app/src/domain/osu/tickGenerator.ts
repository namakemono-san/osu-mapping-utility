import type { TimingLine } from "../../types/osu";

export interface Tick {
    time: number;
    type: "measure" | "beat" | "half" | "quarter";
    gameplayStart: number;
}

export type CalculateGameplayStartFn = (
    objectTime: number,
    timingPoints: TimingLine[],
) => number;

export function generateTicks(
    timingPoint: TimingLine,
    nextTime: number,
    timingPoints: TimingLine[],
    isGameplayMode: boolean,
    calculateGameplayStartFn: CalculateGameplayStartFn,
): Tick[] {
    const ticks: Tick[] = [];
    const beatLength = timingPoint.beatLength;
    const meter = timingPoint.meter;

    let time = timingPoint.offset;
    let beatIndex = 0;

    while (time < nextTime) {
        const gameplayStart = calculateGameplayStartFn(time, timingPoints);

        if (beatIndex % meter === 0) {
            ticks.push({ time, type: "measure", gameplayStart });
        } else {
            ticks.push({ time, type: "beat", gameplayStart });
        }

        if (!isGameplayMode) {
            const halfTime = time + beatLength / 2;
            if (halfTime < nextTime) {
                const halfGameplayStart = calculateGameplayStartFn(halfTime, timingPoints);
                ticks.push({ time: halfTime, type: "half", gameplayStart: halfGameplayStart });
            }

            const quarter1 = time + beatLength / 4;
            const quarter3 = time + beatLength * 3 / 4;
            if (quarter1 < nextTime) {
                const q1GameplayStart = calculateGameplayStartFn(quarter1, timingPoints);
                ticks.push({ time: quarter1, type: "quarter", gameplayStart: q1GameplayStart });
            }
            if (quarter3 < nextTime) {
                const q3GameplayStart = calculateGameplayStartFn(quarter3, timingPoints);
                ticks.push({ time: quarter3, type: "quarter", gameplayStart: q3GameplayStart });
            }
        }

        time += beatLength;
        beatIndex++;
    }

    return ticks.sort((a, b) => a.time - b.time);
}
