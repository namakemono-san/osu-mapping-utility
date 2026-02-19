import type { TimingPoint, Tick } from "./osuFileParser";

/**
 * Callback type for computing when a hit object starts becoming visible.
 */
export type CalculateGameplayStartFn = (
    objectTime: number,
    timingPoints: TimingPoint[],
) => number;

/**
 * Generates tick marks (measure, beat, half-beat, quarter-beat) for a given
 * uninherited timing point section.
 *
 * @param timingPoint  The uninherited timing point that starts this section
 * @param nextTime     End boundary of this section (next TP time or duration)
 * @param timingPoints Full list of timing points (passed through to calculateGameplayStartFn)
 * @param isGameplayMode When true, only measure ticks are generated
 * @param calculateGameplayStartFn Computes the gameplay-start time for a given object time
 */
export function generateTicks(
    timingPoint: TimingPoint,
    nextTime: number,
    timingPoints: TimingPoint[],
    isGameplayMode: boolean,
    calculateGameplayStartFn: CalculateGameplayStartFn,
): Tick[] {
    const ticks: Tick[] = [];
    const beatLength = timingPoint.beatLength;
    const meter = timingPoint.meter;

    let time = timingPoint.time;
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
