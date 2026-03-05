import type { GameMode } from "../../types/osu";

const STD_PATTERNS: [string, RegExp][] = [
    ["Easy", /easy|beginner/i],
    ["Normal", /normal|basic/i],
    ["Hard", /hard|hyper|advanced/i],
    ["Insane", /insane|another/i],
    ["Expert", /expert|extra|ultra|lunatic/i],
];

const TAIKO_PATTERNS: [string, RegExp][] = [
    ["Kantan", /kantan/i],
    ["Futsuu", /futsuu/i],
    ["Muzukashii", /muzukashii/i],
    ["Oni", /^(?!.*(inner|ura|hell)).*oni/i],
    ["Inner Oni", /inner.*oni/i],
    ["Ura Oni", /ura.*oni|hell.*oni/i],
];

const CATCH_PATTERNS: [string, RegExp][] = [
    ["Cup", /cup|easy|beginner/i],
    ["Salad", /salad|normal|basic/i],
    ["Platter", /platter|hard|hyper|advanced/i],
    ["Rain", /rain|insane|another/i],
    ["Overdose", /overdose|expert|extra|ultra|deluge/i],
];

const MANIA_PATTERNS: [string, RegExp][] = [
    ["Easy", /easy|beginner/i],
    ["Normal", /normal|basic/i],
    ["Hard", /hard|hyper|advanced/i],
    ["Insane", /insane|another/i],
    ["Expert", /expert|extra|ultra|lunatic/i],
];

const MODE_PATTERNS: Record<GameMode, [string, RegExp][]> = {
    0: STD_PATTERNS,
    1: TAIKO_PATTERNS,
    2: CATCH_PATTERNS,
    3: MANIA_PATTERNS,
};

export const STD_ORDER = ["Easy", "Normal", "Hard", "Insane", "Expert"] as const;
export const TAIKO_ORDER = ["Kantan", "Futsuu", "Muzukashii", "Oni", "Inner Oni", "Ura Oni"] as const;
export const CATCH_ORDER = ["Cup", "Salad", "Platter", "Rain", "Overdose"] as const;
export const MANIA_ORDER = ["Easy", "Normal", "Hard", "Insane", "Expert"] as const;

export function classifyDifficulty(version: string, mode: GameMode): string {
    const patterns = MODE_PATTERNS[mode];
    for (const [name, pattern] of patterns) {
        if (pattern.test(version)) {
            return name;
        }
    }
    return "Custom";
}

export function getDifficultyOrder(mode: GameMode): readonly string[] {
    switch (mode) {
        case 0: return STD_ORDER;
        case 1: return TAIKO_ORDER;
        case 2: return CATCH_ORDER;
        case 3: return MANIA_ORDER;
    }
}

export function getModeName(mode: GameMode): string {
    switch (mode) {
        case 0: return "osu!";
        case 1: return "osu!taiko";
        case 2: return "osu!catch";
        case 3: return "osu!mania";
    }
}
