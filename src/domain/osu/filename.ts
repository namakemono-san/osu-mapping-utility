const INVALID_WIN_CHARS_RE = /[<>:"/\\|?*\x00-\x1F]/g;

function stripTrailingDotsAndSpaces(s: string): string {
    return s.replace(/[. ]+$/, "");
}

function isReservedWindowsName(stem: string): boolean {
    const t = stem.trim().replace(/[. ]+$/, "");
    return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(t);
}

export function sanitizeWindowsFilenamePart(input: string): string {
    let s = input.normalize("NFKC");
    s = s.replace(INVALID_WIN_CHARS_RE, "");
    s = s.replace(/\s+/g, " ").trim();
    s = stripTrailingDotsAndSpaces(s);
    if (!s) return "Untitled";

    if (isReservedWindowsName(s)) {
        s = `_${s}`;
    }

    s = stripTrailingDotsAndSpaces(s);
    return s || "Untitled";
}

function withNumericSuffix(filename: string, n: number): string {
    const m = filename.match(/^(.*?)(\.osu)$/i);
    if (!m) return `${filename} (${n})`;
    return `${m[1]} (${n})${m[2]}`;
}

export function buildOsuFilename(params: {
    artist: string;
    title: string;
    creator: string;
    difficulty: string;
    maxLength?: number;
}): string {
    const maxLength = params.maxLength ?? 180;
    const base = `${params.artist} - ${params.title} (${params.creator}) [${params.difficulty}]`;
    let name = sanitizeWindowsFilenamePart(base);
    if (!name.toLowerCase().endsWith(".osu")) {
        name = `${name}.osu`;
    }
    if (name.length > maxLength) {
        const m = name.match(/^(.*?)(\.osu)$/i);
        const stem = (m?.[1] ?? name).slice(0, Math.max(1, maxLength - 4)).trim();
        name = `${stripTrailingDotsAndSpaces(stem)}.osu`;
    }
    return name;
}

export function makeUniqueOsuFilename(desired: string, used: Set<string>): string {
    const norm = (s: string) => s.toLowerCase();
    let candidate = desired;
    let i = 1;
    while (used.has(norm(candidate))) {
        candidate = withNumericSuffix(desired, i++);
        candidate = sanitizeWindowsFilenamePart(candidate);
        if (!candidate.toLowerCase().endsWith(".osu")) candidate += ".osu";
    }
    used.add(norm(candidate));
    return candidate;
}
