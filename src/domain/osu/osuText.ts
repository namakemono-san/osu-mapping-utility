import type { OsuMetadata } from "./metadata_events";

function normalizeSectionName(name: string): string {
    return name.trim().replace(/^\[|\]$/g, "").toLowerCase();
}

function tryParseKeyValueLine(trimmedLine: string): { key: string; value: string } | null {
    const colonIndex = trimmedLine.indexOf(":");
    if (colonIndex === -1) return null;
    const key = trimmedLine.substring(0, colonIndex).trim();
    const value = trimmedLine.substring(colonIndex + 1).trim();
    if (!key) return null;
    return { key, value };
}

export function parseOsuSectionKeyValues(content: string, sectionName: string): Record<string, string> {
    const lines = content.split(/\r?\n/);
    const target = normalizeSectionName(sectionName);

    let inTarget = false;
    const out: Record<string, string> = {};

    for (const line of lines) {
        const trimmed = line.trim();

        const sectionMatch = trimmed.match(/^\[([A-Za-z]+)\]$/);
        if (sectionMatch) {
            inTarget = normalizeSectionName(sectionMatch[1]) === target;
            continue;
        }

        if (!inTarget) continue;
        if (!trimmed || trimmed.startsWith("//")) continue;

        const kv = tryParseKeyValueLine(trimmed);
        if (!kv) continue;
        out[kv.key] = kv.value;
    }

    return out;
}

export function parseOsuMetadataPartial(content: string): Partial<OsuMetadata> {
    const kv = parseOsuSectionKeyValues(content, "Metadata");

    const out: Partial<OsuMetadata> = {};
    const keys: (keyof OsuMetadata)[] = [
        "Title",
        "TitleUnicode",
        "Artist",
        "ArtistUnicode",
        "Creator",
        "Version",
        "Source",
        "Tags",
    ];

    for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(kv, key)) {
            out[key] = kv[key];
        }
    }

    return out;
}

export function parseOsuAudioFilename(content: string): string | undefined {
    const kv = parseOsuSectionKeyValues(content, "General");
    return Object.prototype.hasOwnProperty.call(kv, "AudioFilename") ? kv.AudioFilename : undefined;
}

export function parseOsuHeaderFields(content: string): {
    audioFilename?: string;
    title?: string;
    artist?: string;
    creator?: string;
} {
    const general = parseOsuSectionKeyValues(content, "General");
    const metadata = parseOsuSectionKeyValues(content, "Metadata");

    const audioFilename = Object.prototype.hasOwnProperty.call(general, "AudioFilename") ? general.AudioFilename : undefined;
    const title = Object.prototype.hasOwnProperty.call(metadata, "Title") ? metadata.Title : undefined;
    const artist = Object.prototype.hasOwnProperty.call(metadata, "Artist") ? metadata.Artist : undefined;
    const creator = Object.prototype.hasOwnProperty.call(metadata, "Creator") ? metadata.Creator : undefined;

    if (audioFilename || title || artist || creator) {
        return { audioFilename, title, artist, creator };
    }

    const lines = content.split(/\r?\n/);
    const fallback: { audioFilename?: string; title?: string; artist?: string; creator?: string } = {};
    for (const line of lines) {
        const trimmed = line.trim();
        if (!fallback.audioFilename && trimmed.startsWith("AudioFilename:")) {
            fallback.audioFilename = trimmed.substring(trimmed.indexOf(":") + 1).trim();
        }
        if (!fallback.title && trimmed.startsWith("Title:")) {
            fallback.title = trimmed.substring(trimmed.indexOf(":") + 1).trim();
        }
        if (!fallback.artist && trimmed.startsWith("Artist:")) {
            fallback.artist = trimmed.substring(trimmed.indexOf(":") + 1).trim();
        }
        if (!fallback.creator && trimmed.startsWith("Creator:")) {
            fallback.creator = trimmed.substring(trimmed.indexOf(":") + 1).trim();
        }
        if (fallback.audioFilename && fallback.title && fallback.artist && fallback.creator) break;
    }
    return fallback;
}
