import type { CheckDefinition, CheckResult } from "../types";
import type { OsuBeatmapset } from "../../osu/types";

function isAsciiOnly(str: string): boolean {
    return /^[\x20-\x7E]*$/.test(str);
}

const romanisedAscii: CheckDefinition = {
    id: "metadata.romanised_ascii",
    severity: "rule",
    category: "metadata",
    run: (data: OsuBeatmapset): CheckResult[] => {
        const results: CheckResult[] = [];
        for (const d of data.difficulties) {
            const titleOk = isAsciiOnly(d.metadata.title);
            const artistOk = isAsciiOnly(d.metadata.artist);
            const passed = titleOk && artistOk;
            results.push({
                checkId: "metadata.romanised_ascii",
                messageKey: passed ? "rc.metadata.romanisedAscii.pass" : "rc.metadata.romanisedAscii.fail",
                messageParams: {
                    fields: [
                        !titleOk ? "Title" : "",
                        !artistOk ? "Artist" : "",
                    ].filter(Boolean).join(", "),
                },
                severity: "rule",
                category: "metadata",
                difficultyName: d.metadata.version,
                passed,
            });
        }
        return results;
    },
};

const unicodeFilled: CheckDefinition = {
    id: "metadata.unicode_filled",
    severity: "guideline",
    category: "metadata",
    run: (data: OsuBeatmapset): CheckResult[] => {
        const results: CheckResult[] = [];
        for (const d of data.difficulties) {
            const passed = d.metadata.titleUnicode !== "" && d.metadata.artistUnicode !== "";
            results.push({
                checkId: "metadata.unicode_filled",
                messageKey: passed ? "rc.metadata.unicodeFilled.pass" : "rc.metadata.unicodeFilled.fail",
                severity: "guideline",
                category: "metadata",
                difficultyName: d.metadata.version,
                passed,
            });
        }
        return results;
    },
};

const consistency: CheckDefinition = {
    id: "metadata.consistency",
    severity: "rule",
    category: "metadata",
    run: (data: OsuBeatmapset): CheckResult[] => {
        if (data.difficulties.length <= 1) {
            return [{
                checkId: "metadata.consistency",
                messageKey: "rc.metadata.consistency.pass",
                severity: "rule",
                category: "metadata",
                passed: true,
            }];
        }

        const ref = data.difficulties[0].metadata;
        const fields = ["title", "artist", "creator", "source", "titleUnicode", "artistUnicode", "tags"] as const;
        const mismatched: string[] = [];

        for (const field of fields) {
            const refVal = ref[field];
            for (let i = 1; i < data.difficulties.length; i++) {
                if (data.difficulties[i].metadata[field] !== refVal) {
                    mismatched.push(field);
                    break;
                }
            }
        }

        const passed = mismatched.length === 0;
        return [{
            checkId: "metadata.consistency",
            messageKey: passed ? "rc.metadata.consistency.pass" : "rc.metadata.consistency.fail",
            messageParams: { fields: mismatched.join(", ") },
            severity: "rule",
            category: "metadata",
            passed,
        }];
    },
};

const creatorFilled: CheckDefinition = {
    id: "metadata.creator_filled",
    severity: "rule",
    category: "metadata",
    run: (data: OsuBeatmapset): CheckResult[] => {
        return data.difficulties.map(d => ({
            checkId: "metadata.creator_filled",
            messageKey: d.metadata.creator !== "" ? "rc.metadata.creatorFilled.pass" : "rc.metadata.creatorFilled.fail",
            severity: "rule" as const,
            category: "metadata" as const,
            difficultyName: d.metadata.version,
            passed: d.metadata.creator !== "",
        }));
    },
};

const LANGUAGE_TAGS = [
    "english", "japanese", "chinese", "korean", "french", "german",
    "italian", "spanish", "portuguese", "russian", "polish",
    "indonesian", "swedish", "instrumental", "other",
];

const GENRE_TAGS = [
    "video game", "anime", "rock", "pop", "novelty", "hip hop",
    "electronic", "metal", "classical", "folk", "jazz",
];

const languageTag: CheckDefinition = {
    id: "metadata.language_tag",
    severity: "rule",
    category: "metadata",
    run: (data: OsuBeatmapset): CheckResult[] => {
        const ref = data.difficulties[0];
        if (!ref) return [];
        const tags = ref.metadata.tags.toLowerCase();
        const hasLanguage = LANGUAGE_TAGS.some(lang => {
            const regex = new RegExp(`(?:^|\\s)${lang.replace(/ /g, " ")}(?:\\s|$)`);
            return regex.test(tags);
        });
        return [{
            checkId: "metadata.language_tag",
            messageKey: hasLanguage ? "rc.metadata.languageTag.pass" : "rc.metadata.languageTag.fail",
            severity: "rule",
            category: "metadata",
            passed: hasLanguage,
        }];
    },
};

const genreTag: CheckDefinition = {
    id: "metadata.genre_tag",
    severity: "rule",
    category: "metadata",
    run: (data: OsuBeatmapset): CheckResult[] => {
        const ref = data.difficulties[0];
        if (!ref) return [];
        const tags = ref.metadata.tags.toLowerCase();
        const hasGenre = GENRE_TAGS.some(genre => {
            const regex = new RegExp(`(?:^|\\s)${genre.replace(/ /g, " ")}(?:\\s|$)`);
            return regex.test(tags);
        });
        return [{
            checkId: "metadata.genre_tag",
            messageKey: hasGenre ? "rc.metadata.genreTag.pass" : "rc.metadata.genreTag.fail",
            severity: "rule",
            category: "metadata",
            passed: hasGenre,
        }];
    },
};

const gdTag: CheckDefinition = {
    id: "metadata.gd_tag",
    severity: "rule",
    category: "metadata",
    run: (data: OsuBeatmapset): CheckResult[] => {
        const ref = data.difficulties[0];
        if (!ref) return [];
        const creator = ref.metadata.creator.toLowerCase();
        const tags = ref.metadata.tags.toLowerCase();

        const gdMappers = new Set<string>();
        for (const d of data.difficulties) {
            const match = d.metadata.version.match(/^(.+)'s\s+/i);
            if (match) {
                const namesPart = match[1];
                const names = namesPart.split(/\s*&\s*/);
                for (const name of names) {
                    const trimmed = name.trim().toLowerCase();
                    if (trimmed && trimmed !== creator) {
                        gdMappers.add(trimmed);
                    }
                }
            }
        }

        if (gdMappers.size === 0) {
            return [{
                checkId: "metadata.gd_tag",
                messageKey: "rc.metadata.gdTag.pass",
                severity: "rule",
                category: "metadata",
                passed: true,
            }];
        }

        const missingMappers: string[] = [];
        for (const mapper of gdMappers) {
            if (!tags.includes(mapper)) {
                missingMappers.push(mapper);
            }
        }

        const passed = missingMappers.length === 0;
        return [{
            checkId: "metadata.gd_tag",
            messageKey: passed ? "rc.metadata.gdTag.pass" : "rc.metadata.gdTag.fail",
            messageParams: { mappers: missingMappers.join(", ") },
            severity: "rule",
            category: "metadata",
            passed,
        }];
    },
};

export const metadataChecks: CheckDefinition[] = [
    romanisedAscii,
    unicodeFilled,
    consistency,
    creatorFilled,
    languageTag,
    genreTag,
    gdTag,
];
