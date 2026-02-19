import type { CheckDefinition, CheckResult } from "../types";
import type { OsuBeatmapset } from "../../osu/types";

function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
}

const previewPoint: CheckDefinition = {
    id: "general.preview_point",
    severity: "rule",
    category: "general",
    run: (data: OsuBeatmapset): CheckResult[] => {
        return data.difficulties.map(d => ({
            checkId: "general.preview_point",
            messageKey: d.general.previewTime > 0 ? "rc.general.previewPoint.pass" : "rc.general.previewPoint.fail",
            severity: "rule" as const,
            category: "general" as const,
            difficultyName: d.metadata.version,
            passed: d.general.previewTime > 0,
        }));
    },
};

const background: CheckDefinition = {
    id: "general.background",
    severity: "rule",
    category: "general",
    run: (data: OsuBeatmapset): CheckResult[] => {
        return [{
            checkId: "general.background",
            messageKey: data.hasBackground ? "rc.general.background.pass" : "rc.general.background.fail",
            severity: "rule",
            category: "general",
            passed: data.hasBackground,
        }];
    },
};

const drainTime: CheckDefinition = {
    id: "general.drain_time",
    severity: "rule",
    category: "general",
    run: (data: OsuBeatmapset): CheckResult[] => {
        return data.difficulties.map(d => {
            const drainSec = d.drainTimeMs / 1000;
            const passed = drainSec >= 30;
            return {
                checkId: "general.drain_time",
                messageKey: passed ? "rc.general.drainTime.pass" : "rc.general.drainTime.fail",
                messageParams: { time: formatDuration(drainSec) },
                severity: "rule",
                category: "general",
                difficultyName: d.metadata.version,
                passed,
            };
        });
    },
};

const concurrentUninherited: CheckDefinition = {
    id: "general.concurrent_uninherited",
    severity: "rule",
    category: "general",
    run: (data: OsuBeatmapset): CheckResult[] => {
        return data.difficulties.map(d => {
            const uninheritedTimes = d.timingPoints
                .filter(tp => tp.uninherited)
                .map(tp => tp.time);
            const uniqueTimes = new Set(uninheritedTimes);
            const passed = uninheritedTimes.length === uniqueTimes.size;
            return {
                checkId: "general.concurrent_uninherited",
                messageKey: passed ? "rc.general.concurrentUninherited.pass" : "rc.general.concurrentUninherited.fail",
                severity: "rule",
                category: "general",
                difficultyName: d.metadata.version,
                passed,
            };
        });
    },
};

const timingPointExists: CheckDefinition = {
    id: "general.timing_point_exists",
    severity: "rule",
    category: "general",
    run: (data: OsuBeatmapset): CheckResult[] => {
        return data.difficulties.map(d => {
            const hasUninherited = d.timingPoints.some(tp => tp.uninherited);
            return {
                checkId: "general.timing_point_exists",
                messageKey: hasUninherited ? "rc.general.timingPointExists.pass" : "rc.general.timingPointExists.fail",
                severity: "rule",
                category: "general",
                difficultyName: d.metadata.version,
                passed: hasUninherited,
            };
        });
    },
};

export const generalChecks: CheckDefinition[] = [
    previewPoint,
    background,
    drainTime,
    concurrentUninherited,
    timingPointExists,
];
