import type { OsuBeatmapset } from "../osu/types";

export type CheckSeverity = "rule" | "guideline" | "warning";
export type CheckCategory = "general" | "metadata" | "timing" | "difficulty_settings" | "spread" | "audio" | "files";

export interface CheckResult {
    checkId: string;
    messageKey: string;
    messageParams?: Record<string, string | number>;
    severity: CheckSeverity;
    category: CheckCategory;
    difficultyName?: string;
    difficultyNames?: string[];
    passed: boolean;
}

export interface CheckDefinition {
    id: string;
    severity: CheckSeverity;
    category: CheckCategory;
    run: (data: OsuBeatmapset) => CheckResult[];
}
