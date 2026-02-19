import type { CheckDefinition, CheckResult } from "../types";
import type { OsuBeatmapset, OsuBeatmap, GameMode } from "../../osu/types";
import { classifyDifficulty } from "../../osu/rcDifficultyNames";

interface Range {
    min?: number;
    max?: number;
}

interface DiffSettingsGuideline {
    ar?: Range;
    od?: Range;
    hp?: Range;
    cs?: Range;
}

const STD_GUIDELINES: Record<string, DiffSettingsGuideline> = {
    Easy:   { ar: { max: 5 },           od: { min: 1, max: 3 }, hp: { min: 1, max: 3 }, cs: { max: 4 } },
    Normal: { ar: { min: 4, max: 6 },   od: { min: 3, max: 5 }, hp: { min: 3, max: 5 }, cs: { max: 5 } },
    Hard:   { ar: { min: 6, max: 8 },   od: { min: 5, max: 7 }, hp: { min: 4, max: 6 }, cs: { max: 6 } },
    Insane: { ar: { min: 7, max: 9.3 }, od: { min: 7, max: 9 }, hp: { min: 5, max: 8 }, cs: { max: 7 } },
    Expert: { ar: { min: 8 },           od: { min: 8 },         hp: { min: 5 },         cs: { max: 7 } },
};

const TAIKO_GUIDELINES: Record<string, DiffSettingsGuideline> = {
    Kantan:      { od: { max: 3 }, hp: { min: 8 } },
    Futsuu:      { od: { max: 4 }, hp: { min: 7 } },
    Muzukashii:  { od: { max: 5 }, hp: { min: 6 } },
    Oni:         { od: { min: 5 }, hp: { min: 5 } },
    "Inner Oni": { od: { min: 6 }, hp: { min: 5 } },
};

const CATCH_GUIDELINES: Record<string, DiffSettingsGuideline> = {
    Cup:      { ar: { max: 6 },   hp: { min: 2, max: 3 }, cs: { max: 2.5 } },
    Salad:    { ar: { max: 7 },   hp: { min: 3, max: 4 }, cs: { max: 3 } },
    Platter:  { ar: { max: 8 },   hp: { min: 4, max: 5 }, cs: { max: 3.5 } },
    Rain:     { ar: { max: 9 },   hp: { min: 5, max: 6 }, cs: { max: 4 } },
    Overdose: { ar: { min: 9 },   hp: { min: 5 },         cs: { min: 4 } },
};

const MANIA_GUIDELINES: Record<string, DiffSettingsGuideline> = {
    Easy:   { od: { max: 7 },   hp: { max: 7 } },
    Normal: { od: { max: 7.5 }, hp: { max: 7.5 } },
    Hard:   { od: { max: 8 },   hp: { max: 8 } },
};

function getGuidelinesForMode(mode: GameMode): Record<string, DiffSettingsGuideline> {
    switch (mode) {
        case 0: return STD_GUIDELINES;
        case 1: return TAIKO_GUIDELINES;
        case 2: return CATCH_GUIDELINES;
        case 3: return MANIA_GUIDELINES;
    }
}

function checkRange(value: number, range: Range | undefined): boolean {
    if (!range) return true;
    if (range.min !== undefined && value < range.min) return false;
    if (range.max !== undefined && value > range.max) return false;
    return true;
}

function formatRange(range: Range): string {
    if (range.min !== undefined && range.max !== undefined) return `${range.min}-${range.max}`;
    if (range.min !== undefined) return `≥${range.min}`;
    if (range.max !== undefined) return `≤${range.max}`;
    return "";
}

function checkDiffGuidelines(
    d: OsuBeatmap,
    category: string,
    guidelines: DiffSettingsGuideline,
): CheckResult[] {
    const results: CheckResult[] = [];
    const mode = d.general.mode;

    const settings: { key: string; label: string; value: number; range: Range | undefined }[] = [];

    if (mode === 0 || mode === 2) {
        settings.push({ key: "ar", label: "AR", value: d.difficulty.approachRate, range: guidelines.ar });
    }
    settings.push({ key: "od", label: "OD", value: d.difficulty.overallDifficulty, range: guidelines.od });
    settings.push({ key: "hp", label: "HP", value: d.difficulty.hpDrainRate, range: guidelines.hp });
    if (mode === 0 || mode === 2) {
        settings.push({ key: "cs", label: "CS", value: d.difficulty.circleSize, range: guidelines.cs });
    }

    for (const s of settings) {
        if (!s.range) continue;
        const passed = checkRange(s.value, s.range);
        results.push({
            checkId: `difficulty_settings.${s.key}`,
            messageKey: passed
                ? "rc.difficultySettings.guideline.pass"
                : "rc.difficultySettings.guideline.fail",
            messageParams: {
                setting: s.label,
                value: s.value,
                range: formatRange(s.range),
                category,
            },
            severity: "guideline",
            category: "difficulty_settings",
            difficultyName: d.metadata.version,
            passed,
        });
    }

    return results;
}

const difficultySettingsCheck: CheckDefinition = {
    id: "difficulty_settings",
    severity: "guideline",
    category: "difficulty_settings",
    run: (data: OsuBeatmapset): CheckResult[] => {
        const results: CheckResult[] = [];

        for (const d of data.difficulties) {
            const mode = d.general.mode;
            const category = classifyDifficulty(d.metadata.version, mode);

            if (category === "Custom") {
                results.push({
                    checkId: "difficulty_settings.custom_skip",
                    messageKey: "rc.difficultySettings.customSkip",
                    severity: "warning",
                    category: "difficulty_settings",
                    difficultyName: d.metadata.version,
                    passed: true,
                });
                continue;
            }

            const guidelines = getGuidelinesForMode(mode);
            if (guidelines[category]) {
                results.push(...checkDiffGuidelines(d, category, guidelines[category]));
            }
        }

        return results;
    },
};

export const difficultySettingsChecks: CheckDefinition[] = [
    difficultySettingsCheck,
];
