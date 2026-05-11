import type { Beatmap } from "../../types/osu";
import { categorizeDifficulty } from "../../domain/osu/difficultyUtils";

export interface MeasureNoteCount {
    start: number;
    noteCount: number;
}

export interface DensityData {
    measures: MeasureNoteCount[];
}

export interface FinisherNote {
    time: number;
    kind: "D" | "K";
}

export interface ScrollSample {
    time: number;
    bpm: number;
    sv: number;
    pxPerSecond: number;
}

export interface RapidChange {
    time: number;
    fromSpeed: number;
    toSpeed: number;
    delta: number;
    ratio: number;
    gapMs: number;
}

export interface ScrollSpeedSummary {
    minSpeed: number;
    maxSpeed: number;
    deltaSpeed: number;
    ratio: number;
    minSv: number;
    maxSv: number;
}

export interface ScrollSpeedData {
    samples: ScrollSample[];
    summary: ScrollSpeedSummary | null;
    rapidChanges: RapidChange[];
}

export interface SpreadDiffResult {
    beatmap: Beatmap;
    version: string;
    category: string;
    od: number;
    hp: number;
    sliderMultiplier: number;
    noteCount: number;
    density: DensityData;
    finishers: FinisherNote[];
    scrollSpeed: ScrollSpeedData;
}

export interface DensityInversion {
    measureStart: number;
    noteCounts: number[];
}

export interface FinisherGroup {
    time: number;
    byDiff: (FinisherNote | null)[];
    status: "matched" | "mismatch" | "missing";
}

export interface ProgressionIssue {
    time: number;
    speeds: number[];
}

export interface ConsistencyIssue {
    time: number;
    versionA: string;
    versionB: string;
    deltaA: number;
    deltaB: number;
    reason: "opposite" | "excessive";
}

function isCircleNote(typeFlags: number): boolean {
    return (typeFlags & 1) !== 0 && (typeFlags & 2) === 0 && (typeFlags & 8) === 0;
}

function isFinish(hitSoundFlags: number): boolean {
    return (hitSoundFlags & 4) !== 0;
}

function isKat(hitSoundFlags: number): boolean {
    return (hitSoundFlags & (2 | 8)) !== 0;
}

function computeDensity(beatmap: Beatmap): DensityData {
    const redLines = beatmap.timingLines
        .filter(t => t.uninherited)
        .sort((a, b) => a.offset - b.offset);

    if (redLines.length === 0) return { measures: [] };

    const circles = beatmap.hitObjects
        .filter(ho => isCircleNote(ho.typeFlags))
        .sort((a, b) => a.time - b.time);

    const measures: MeasureNoteCount[] = [];
    const maxTime = beatmap.totalLengthMs + 1000;

    for (let i = 0; i < redLines.length; i++) {
        const line = redLines[i];
        const nextOffset = i + 1 < redLines.length ? redLines[i + 1].offset : maxTime;
        const measureLength = line.beatLength * line.meter;
        if (measureLength <= 0 || !isFinite(measureLength)) continue;

        let start = line.offset;
        while (start < nextOffset - 1 && start < maxTime) {
            const end = Math.min(start + measureLength, nextOffset);
            let count = 0;
            for (const ho of circles) {
                if (ho.time >= end) break;
                if (ho.time >= start) count++;
            }
            measures.push({ start, noteCount: count });
            start += measureLength;
        }
    }

    return { measures };
}

function computeFinishers(beatmap: Beatmap): FinisherNote[] {
    return beatmap.hitObjects
        .filter(ho => isCircleNote(ho.typeFlags) && isFinish(ho.hitSoundFlags))
        .map(ho => ({
            time: ho.time,
            kind: isKat(ho.hitSoundFlags) ? "K" as const : "D" as const,
        }));
}

function computeScrollSpeed(beatmap: Beatmap): ScrollSpeedData {
    const sm = beatmap.difficulty.sliderMultiplier;
    const sorted = [...beatmap.timingLines].sort((a, b) => a.offset - b.offset);
    const samples: ScrollSample[] = [];
    let currentBpm = 120;

    for (const line of sorted) {
        if (line.uninherited) {
            currentBpm = line.bpm ?? (60000 / Math.abs(line.beatLength));
        }
        const sv = line.svMult;
        const pxPerBeat = 175 * sm * sv;
        const pxPerSecond = pxPerBeat * currentBpm / 60;
        samples.push({ time: line.offset, bpm: currentBpm, sv, pxPerSecond });
    }

    if (samples.length === 0) return { samples: [], summary: null, rapidChanges: [] };

    const speeds = samples.map(s => s.pxPerSecond);
    const svs = samples.map(s => s.sv);
    const minSpeed = Math.min(...speeds);
    const maxSpeed = Math.max(...speeds);
    const minSv = Math.min(...svs);
    const maxSv = Math.max(...svs);

    const category = categorizeDifficulty(beatmap.metadata.version);
    const rapidChanges: RapidChange[] = [];

    if (category === "Kantan" || category === "Futsuu" || category === "Muzukashii") {
        const { dThresh, rThresh, gThresh } = category === "Muzukashii"
            ? { dThresh: 160, rThresh: 1.25, gThresh: 1000 }
            : { dThresh: 80, rThresh: 1.15, gThresh: 1500 };

        for (let i = 1; i < samples.length; i++) {
            const prev = samples[i - 1];
            const curr = samples[i];
            const delta = Math.abs(curr.pxPerSecond - prev.pxPerSecond);
            const lo = Math.min(curr.pxPerSecond, prev.pxPerSecond);
            const hi = Math.max(curr.pxPerSecond, prev.pxPerSecond);
            const r = lo > 0 ? hi / lo : Infinity;
            const gap = curr.time - prev.time;
            if (delta >= dThresh && r >= rThresh && gap <= gThresh) {
                rapidChanges.push({
                    time: curr.time,
                    fromSpeed: prev.pxPerSecond,
                    toSpeed: curr.pxPerSecond,
                    delta,
                    ratio: r,
                    gapMs: gap,
                });
            }
        }
    }

    return {
        samples,
        summary: {
            minSpeed,
            maxSpeed,
            deltaSpeed: maxSpeed - minSpeed,
            ratio: minSpeed > 0 ? maxSpeed / minSpeed : 0,
            minSv,
            maxSv,
        },
        rapidChanges,
    };
}

export function computeSpreadResults(beatmaps: Beatmap[]): SpreadDiffResult[] {
    return beatmaps.map(beatmap => ({
        beatmap,
        version: beatmap.metadata.version,
        category: categorizeDifficulty(beatmap.metadata.version),
        od: beatmap.difficulty.overallDifficulty,
        hp: beatmap.difficulty.hpDrainRate,
        sliderMultiplier: beatmap.difficulty.sliderMultiplier,
        noteCount: beatmap.hitObjects.filter(ho => isCircleNote(ho.typeFlags)).length,
        density: computeDensity(beatmap),
        finishers: computeFinishers(beatmap),
        scrollSpeed: computeScrollSpeed(beatmap),
    }));
}

export function computeDensityInversions(results: SpreadDiffResult[], minGap: number): DensityInversion[] {
    if (results.length < 2 || results.length <= minGap) return [];

    const allStarts = new Set<number>();
    for (const r of results) {
        for (const m of r.density.measures) allStarts.add(m.start);
    }

    const inversions: DensityInversion[] = [];

    for (const start of Array.from(allStarts).sort((a, b) => a - b)) {
        const noteCounts = results.map(r => {
            const m = r.density.measures.find(m => Math.abs(m.start - start) < 10);
            return m?.noteCount ?? 0;
        });

        let hasInversion = false;
        for (let i = 0; i + minGap < results.length; i++) {
            if (noteCounts[i] > noteCounts[i + minGap]) {
                hasInversion = true;
                break;
            }
        }

        if (hasInversion) inversions.push({ measureStart: start, noteCounts });
    }

    return inversions;
}

export function computeFinisherGroups(results: SpreadDiffResult[]): FinisherGroup[] {
    if (results.length === 0) return [];

    const allTimes: number[] = [];
    for (const r of results) {
        for (const f of r.finishers) allTimes.push(f.time);
    }

    const unique = Array.from(new Set(allTimes)).sort((a, b) => a - b);
    const groupTimes: number[] = [];
    let i = 0;
    while (i < unique.length) {
        let j = i;
        while (j + 1 < unique.length && unique[j + 1] - unique[j] <= 1) j++;
        const cluster = unique.slice(i, j + 1);
        groupTimes.push(Math.round(cluster.reduce((a, b) => a + b, 0) / cluster.length));
        i = j + 1;
    }

    return groupTimes.map(time => {
        const byDiff = results.map(r =>
            r.finishers.find(f => Math.abs(f.time - time) <= 1) ?? null
        );
        const present = byDiff.filter((n): n is FinisherNote => n !== null);
        let status: FinisherGroup["status"];
        if (byDiff.some(n => n === null)) {
            status = "missing";
        } else if (present.some(n => n.kind !== present[0].kind)) {
            status = "mismatch";
        } else {
            status = "matched";
        }
        return { time, byDiff, status };
    });
}

function getEffectiveSpeed(samples: ScrollSample[], time: number): number {
    let speed = samples[0]?.pxPerSecond ?? 0;
    for (const s of samples) {
        if (s.time <= time) speed = s.pxPerSecond;
        else break;
    }
    return speed;
}

export function computeProgressionIssues(results: SpreadDiffResult[]): ProgressionIssue[] {
    if (results.length < 2) return [];

    const offsetCounts = new Map<number, number>();
    for (const r of results) {
        for (const s of r.scrollSpeed.samples) {
            offsetCounts.set(s.time, (offsetCounts.get(s.time) ?? 0) + 1);
        }
    }

    const sharedOffsets = Array.from(offsetCounts.entries())
        .filter(([, count]) => count >= 2)
        .map(([offset]) => offset)
        .sort((a, b) => a - b);

    const issues: ProgressionIssue[] = [];
    let lastIssueTime = -Infinity;

    for (const offset of sharedOffsets) {
        const speeds = results.map(r => getEffectiveSpeed(r.scrollSpeed.samples, offset));
        let hasIssue = false;
        for (let i = 0; i + 1 < speeds.length; i++) {
            if (speeds[i] > speeds[i + 1] + 10) {
                hasIssue = true;
                break;
            }
        }
        if (hasIssue && offset - lastIssueTime > 500) {
            issues.push({ time: offset, speeds });
            lastIssueTime = offset;
        }
    }

    return issues;
}

export function computeConsistencyIssues(results: SpreadDiffResult[]): ConsistencyIssue[] {
    if (results.length < 2) return [];

    const issues: ConsistencyIssue[] = [];
    const seen = new Set<string>();

    for (let i = 0; i + 1 < results.length; i++) {
        const a = results[i];
        const b = results[i + 1];

        for (const sA of a.scrollSpeed.samples) {
            const sB = b.scrollSpeed.samples.find(s => Math.abs(s.time - sA.time) <= 5);
            if (!sB) continue;

            const prevSpeedA = getEffectiveSpeed(a.scrollSpeed.samples, sA.time - 1);
            const prevSpeedB = getEffectiveSpeed(b.scrollSpeed.samples, sB.time - 1);
            const deltaA = sA.pxPerSecond - prevSpeedA;
            const deltaB = sB.pxPerSecond - prevSpeedB;

            if (Math.abs(deltaA) < 20 && Math.abs(deltaB) < 20) continue;

            const key = `${sA.time}-${a.version}-${b.version}`;
            if (seen.has(key)) continue;
            seen.add(key);

            if (deltaA * deltaB < 0 && (Math.abs(deltaA) > 20 || Math.abs(deltaB) > 20)) {
                issues.push({ time: sA.time, versionA: a.version, versionB: b.version, deltaA, deltaB, reason: "opposite" });
                continue;
            }

            if (Math.abs(deltaB) > 0 && Math.abs(deltaA) >= 1.5 * Math.abs(deltaB) && Math.abs(deltaA) > 50) {
                issues.push({ time: sA.time, versionA: a.version, versionB: b.version, deltaA, deltaB, reason: "excessive" });
            }
        }
    }

    return issues;
}
