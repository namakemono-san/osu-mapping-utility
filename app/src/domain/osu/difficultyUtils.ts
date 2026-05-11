import type { Beatmap } from "../../types/osu";

const DIFFICULTY_ORDER = [
    "Kantan",
    "Futsuu",
    "Muzukashii",
    "Oni",
    "Inner Oni",
    "Ura Oni",
    "Hell Oni",
    "Custom"
] as const;

const DIFFICULTY_PATTERNS: Record<string, RegExp> = {
    "Kantan": /kantan/i,
    "Futsuu": /futsuu/i,
    "Muzukashii": /muzukashii/i,
    "Oni": /^(?!.*(inner|ura|hell)).*oni/i,
    "Inner Oni": /inner.*oni/i,
    "Ura Oni": /ura.*oni/i,
    "Hell Oni": /hell.*oni/i,
};

export function categorizeDifficulty(version: string): string {
    for (const [category, pattern] of Object.entries(DIFFICULTY_PATTERNS)) {
        if (pattern.test(version)) {
            return category;
        }
    }
    return "Custom";
}

export function sortDifficulties(difficulties: Beatmap[]): { sorted: Beatmap[], error?: string } {
    const categorized = difficulties.map(diff => ({
        difficulty: diff,
        category: categorizeDifficulty(diff.metadata.version)
    }));

    const sorted = categorized.sort((a, b) => {
        const indexA = DIFFICULTY_ORDER.indexOf(a.category as typeof DIFFICULTY_ORDER[number]);
        const indexB = DIFFICULTY_ORDER.indexOf(b.category as typeof DIFFICULTY_ORDER[number]);
        return indexA - indexB;
    });

    return { sorted: sorted.map(c => c.difficulty) };
}
