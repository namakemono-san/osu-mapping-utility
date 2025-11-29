export const STORAGE_KEYS = {
    SONGS_FOLDER: "songsFolder",
    DOWNLOAD_FOLDER: "downloadFolder",

    PREVIEW_MUSIC_VOLUME: "preview.musicVolume",
    PREVIEW_HITSOUND_VOLUME: "preview.hitsoundVolume",
    PREVIEW_GAMEPLAY_MODE: "preview.gameplayMode",
    PREVIEW_VIEW_SV_LINE: "preview.viewSVLine",
    PREVIEW_DEBUG_MODE: "preview.debugMode",

    CALIBRATOR_PLAY_VOLUME: "calibrator.playVolume",
    CALIBRATOR_METRO_VOLUME: "calibrator.metroVolume",
    CALIBRATOR_METRO_ON: "calibrator.metroOn",

    DOWNLOADER_AUDIO_FORMAT: "downloader.audioFormat",
    DOWNLOADER_INCLUDE_VIDEO: "downloader.includeVideo",
} as const;

type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

const DEFAULTS: Partial<Record<StorageKey, unknown>> = {
    [STORAGE_KEYS.PREVIEW_MUSIC_VOLUME]: 0.2,
    [STORAGE_KEYS.PREVIEW_HITSOUND_VOLUME]: 0.15,
    [STORAGE_KEYS.PREVIEW_GAMEPLAY_MODE]: true,
    [STORAGE_KEYS.PREVIEW_VIEW_SV_LINE]: true,
    [STORAGE_KEYS.PREVIEW_DEBUG_MODE]: false,

    [STORAGE_KEYS.CALIBRATOR_PLAY_VOLUME]: 0.35,
    [STORAGE_KEYS.CALIBRATOR_METRO_VOLUME]: 0.25,
    [STORAGE_KEYS.CALIBRATOR_METRO_ON]: true,

    [STORAGE_KEYS.DOWNLOADER_AUDIO_FORMAT]: "mp3",
    [STORAGE_KEYS.DOWNLOADER_INCLUDE_VIDEO]: false,
};

export function getStorage<T>(key: StorageKey, defaultValue?: T): T | null {
    try {
        const item = localStorage.getItem(key);
        if (item === null) {
            const def = defaultValue ?? (DEFAULTS[key] as T | undefined);
            return def ?? null;
        }
        return JSON.parse(item) as T;
    } catch {
        return defaultValue ?? (DEFAULTS[key] as T | undefined) ?? null;
    }
}

export function setStorage<T>(key: StorageKey, value: T): void {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        console.error(`Failed to save to localStorage: ${key}`, e);
    }
}

export function removeStorage(key: StorageKey): void {
    try {
        localStorage.removeItem(key);
    } catch (e) {
        console.error(`Failed to remove from localStorage: ${key}`, e);
    }
}

export function getStorageString(key: StorageKey, defaultValue?: string): string | null {
    try {
        const item = localStorage.getItem(key);
        if (item === null) {
            return defaultValue ?? (DEFAULTS[key] as string | undefined) ?? null;
        }
        return item;
    } catch {
        return defaultValue ?? null;
    }
}

export function setStorageString(key: StorageKey, value: string): void {
    try {
        localStorage.setItem(key, value);
    } catch (e) {
        console.error(`Failed to save to localStorage: ${key}`, e);
    }
}