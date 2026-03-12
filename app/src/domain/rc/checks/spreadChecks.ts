import type { CheckDefinition, CheckResult } from "../types";
import type { Beatmap, GameMode } from "../../../types/osu";
import { classifyDifficulty, getDifficultyOrder } from "../../osu/rcDifficultyNames";

interface SpreadRule {
    maxDrainSec: number;
    minDrainSec: number;
    lowestAllowed: string;
    altMinDiffCount?: number;
}

const STD_SPREAD: SpreadRule[] = [
    { minDrainSec: 255, maxDrainSec: 300, lowestAllowed: "Insane" },
    { minDrainSec: 210, maxDrainSec: 255, lowestAllowed: "Hard" },
    { minDrainSec: 30,  maxDrainSec: 210, lowestAllowed: "Normal" },
];

const TAIKO_SPREAD: SpreadRule[] = [
    { minDrainSec: 195, maxDrainSec: 240, lowestAllowed: "Oni" },
    { minDrainSec: 150, maxDrainSec: 195, lowestAllowed: "Muzukashii" },
    { minDrainSec: 30,  maxDrainSec: 150, lowestAllowed: "Futsuu" },
];

const CATCH_SPREAD: SpreadRule[] = [
    { minDrainSec: 195, maxDrainSec: 240, lowestAllowed: "Rain" },
    { minDrainSec: 150, maxDrainSec: 195, lowestAllowed: "Platter" },
    { minDrainSec: 30,  maxDrainSec: 150, lowestAllowed: "Salad" },
];

const MANIA_SPREAD: SpreadRule[] = [
    { minDrainSec: 165, maxDrainSec: 210, lowestAllowed: "Insane", altMinDiffCount: 2 },
    { minDrainSec: 120, maxDrainSec: 165, lowestAllowed: "Hard",   altMinDiffCount: 3 },
    { minDrainSec: 30,  maxDrainSec: 120, lowestAllowed: "Normal", altMinDiffCount: 4 },
];

function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
}

function getSpreadRules(mode: GameMode): SpreadRule[] {
    switch (mode) {
        case 0: return STD_SPREAD;
        case 1: return TAIKO_SPREAD;
        case 2: return CATCH_SPREAD;
        case 3: return MANIA_SPREAD;
    }
}

const requiredLevels: CheckDefinition = {
    id: "spread.required_levels",
    severity: "rule",
    category: "spread",
    run: (data: Beatmap[]): CheckResult[] => {
        if (data.length === 0) return [];

        const mode = data[0].general.mode;
        const order = getDifficultyOrder(mode);
        const spreadRules = getSpreadRules(mode);

        const maxDrainSec = Math.max(...data.map(d => d.drainTimeMs / 1000));

        const rule = spreadRules.find(r => maxDrainSec >= r.minDrainSec && maxDrainSec < r.maxDrainSec);
        if (!rule) {
            const fallback = spreadRules.find(r => maxDrainSec >= r.maxDrainSec);
            if (!fallback) {
                return [{
                    checkId: "spread.required_levels",
                    messageKey: "rc.spread.requiredLevels.pass",
                    severity: "rule",
                    category: "spread",
                    passed: true,
                }];
            }
            return checkSpreadRule(data, fallback, order, mode, maxDrainSec);
        }

        return checkSpreadRule(data, rule, order, mode, maxDrainSec);
    },
};

function checkSpreadRule(
    data: Beatmap[],
    rule: SpreadRule,
    order: readonly string[],
    mode: GameMode,
    drainSec: number,
): CheckResult[] {
    const classifications = data.map(d => classifyDifficulty(d.metadata.version, mode));
    const diffCount = data.length;

    if (rule.altMinDiffCount !== undefined && diffCount >= rule.altMinDiffCount) {
        return [{
            checkId: "spread.required_levels",
            messageKey: "rc.spread.requiredLevels.pass",
            severity: "rule",
            category: "spread",
            passed: true,
        }];
    }

    const lowestAllowedIdx = order.indexOf(rule.lowestAllowed);
    if (lowestAllowedIdx === -1) {
        return [{
            checkId: "spread.required_levels",
            messageKey: "rc.spread.requiredLevels.pass",
            severity: "rule",
            category: "spread",
            passed: true,
        }];
    }

    let lowestPresentIdx = order.length;
    for (const cat of classifications) {
        if (cat === "Custom") continue;
        const idx = order.indexOf(cat);
        if (idx !== -1 && idx < lowestPresentIdx) {
            lowestPresentIdx = idx;
        }
    }

    const passed = lowestPresentIdx <= lowestAllowedIdx;

    return [{
        checkId: "spread.required_levels",
        messageKey: passed ? "rc.spread.requiredLevels.pass" : "rc.spread.requiredLevels.fail",
        messageParams: {
            required: rule.lowestAllowed,
            drainTime: formatDuration(drainSec),
        },
        severity: "rule",
        category: "spread",
        passed,
    }];
}

export const spreadChecks: CheckDefinition[] = [
    requiredLevels,
];
