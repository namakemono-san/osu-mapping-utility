import { detectEol } from "./eol";

export interface OsuMetadata {
    Title: string;
    TitleUnicode: string;
    Artist: string;
    ArtistUnicode: string;
    Creator: string;
    Version: string;
    Source: string;
    Tags: string;
}

export interface OsuBackgroundData {
    filename: string;
    xOffset: number;
    yOffset: number;
}

export function parseMetadataAndBackground(content: string): {
    metadata: OsuMetadata;
    background: OsuBackgroundData;
} {
    const lines = content.split(/\r?\n/);
    const metadata: OsuMetadata = {
        Title: "",
        TitleUnicode: "",
        Artist: "",
        ArtistUnicode: "",
        Creator: "",
        Version: "",
        Source: "",
        Tags: "",
    };
    const background: OsuBackgroundData = { filename: "", xOffset: 0, yOffset: 0 };

    let inMetadata = false;
    let inEvents = false;

    for (const line of lines) {
        const trimmed = line.trim();

        if (/^\[Metadata\]$/i.test(trimmed)) {
            inMetadata = true;
            inEvents = false;
            continue;
        }

        if (/^\[Events\]$/i.test(trimmed)) {
            inEvents = true;
            inMetadata = false;
            continue;
        }

        if (/^\[[A-Za-z]+\]$/.test(trimmed)) {
            inMetadata = false;
            inEvents = false;
            continue;
        }

        if (inMetadata && trimmed && !trimmed.startsWith("//")) {
            const colonIndex = trimmed.indexOf(":");
            if (colonIndex !== -1) {
                const key = trimmed.substring(0, colonIndex).trim() as keyof OsuMetadata;
                const value = trimmed.substring(colonIndex + 1).trim();
                if (key in metadata) metadata[key] = value;
            }
        }

        if (inEvents && trimmed && !trimmed.startsWith("//")) {
            if (trimmed.startsWith("0,0,")) {
                const match = trimmed.match(/0,0,"([^"]+)",(-?\d+),(-?\d+)/);
                if (match) {
                    background.filename = match[1];
                    background.xOffset = parseInt(match[2], 10);
                    background.yOffset = parseInt(match[3], 10);
                }
            }
        }
    }

    return { metadata, background };
}

export function parseGeneralField(content: string, field: string): string {
    const lines = content.split(/\r?\n/);
    let inGeneral = false;
    for (const line of lines) {
        const trimmed = line.trim();
        if (/^\[General\]$/i.test(trimmed)) {
            inGeneral = true;
            continue;
        }
        if (/^\[[A-Za-z]+\]$/i.test(trimmed)) {
            inGeneral = false;
            continue;
        }
        if (!inGeneral || !trimmed || trimmed.startsWith("//")) continue;
        if (trimmed.toLowerCase().startsWith(field.toLowerCase() + ":")) {
            return trimmed.substring(trimmed.indexOf(":") + 1).trim();
        }
    }
    return "";
}

export function parseBasicBeatmapFields(content: string): {
    audioFilename: string;
    title: string;
    artist: string;
    creator: string;
} {
    const audioFilename = parseGeneralField(content, "AudioFilename");
    const { metadata } = parseMetadataAndBackground(content);
    return {
        audioFilename,
        title: metadata.Title,
        artist: metadata.Artist,
        creator: metadata.Creator,
    };
}

export function applyMetadataAndBackground(
    content: string,
    mergedMetadata: Omit<OsuMetadata, "Version">,
    background: OsuBackgroundData
): string {
    const lines = content.split(/\r?\n/);
    const eol = detectEol(content);

    let inMetadata = false;
    let inEvents = false;
    const out: string[] = [];

    for (const line of lines) {
        const trimmed = line.trim();

        if (/^\[Metadata\]$/i.test(trimmed)) {
            inMetadata = true;
            inEvents = false;
            out.push(line);
            continue;
        }

        if (/^\[Events\]$/i.test(trimmed)) {
            inEvents = true;
            inMetadata = false;
            out.push(line);
            continue;
        }

        if (/^\[[A-Za-z]+\]$/.test(trimmed)) {
            inMetadata = false;
            inEvents = false;
            out.push(line);
            continue;
        }

        if (inMetadata && trimmed && !trimmed.startsWith("//")) {
            const colonIndex = trimmed.indexOf(":");
            if (colonIndex !== -1) {
                const key = trimmed.substring(0, colonIndex).trim() as keyof typeof mergedMetadata;
                if (key in mergedMetadata) {
                    out.push(`${key}:${mergedMetadata[key]}`);
                    continue;
                }
            }
        }

        if (inEvents && trimmed.startsWith("0,0,")) {
            out.push(`0,0,"${background.filename}",${background.xOffset},${background.yOffset}`);
            continue;
        }

        out.push(line);
    }

    return out.join(eol);
}
