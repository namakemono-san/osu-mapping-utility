import { useState, useCallback } from "react";
import { getStorage, setStorage, getStorageString, setStorageString, STORAGE_KEYS } from "../utils/storage";

type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

export function useStorage<T>(key: StorageKey, defaultValue: T): [T, (value: T | ((prev: T) => T)) => void] {
    const [state, setState] = useState<T>(() => {
        const stored = getStorage<T>(key);
        return stored !== null ? stored : defaultValue;
    });

    const setValue = useCallback((value: T | ((prev: T) => T)) => {
        setState((prev) => {
            const newValue = typeof value === "function" ? (value as (prev: T) => T)(prev) : value;
            setStorage(key, newValue);
            return newValue;
        });
    }, [key]);

    return [state, setValue];
}

export function useStorageString(key: StorageKey, defaultValue: string = ""): [string, (value: string) => void] {
    const [state, setState] = useState<string>(() => {
        return getStorageString(key) ?? defaultValue;
    });

    const setValue = useCallback((value: string) => {
        setState(value);
        setStorageString(key, value);
    }, [key]);

    return [state, setValue];
}

export function useSongsFolder(): [string | null, (value: string) => void] {
    const [folder, setFolder] = useState<string | null>(() => {
        return getStorageString(STORAGE_KEYS.SONGS_FOLDER) ?? null;
    });

    const setFolderAndSave = useCallback((value: string) => {
        setFolder(value);
        setStorageString(STORAGE_KEYS.SONGS_FOLDER, value);
    }, []);

    return [folder, setFolderAndSave];
}

export function usePreviewSettings() {
    const [musicVolume, setMusicVolume] = useStorage<number>(
        STORAGE_KEYS.PREVIEW_MUSIC_VOLUME,
        0.2
    );
    const [hitsoundVolume, setHitsoundVolume] = useStorage<number>(
        STORAGE_KEYS.PREVIEW_HITSOUND_VOLUME,
        0.15
    );
    const [isGameplayMode, setIsGameplayMode] = useStorage<boolean>(
        STORAGE_KEYS.PREVIEW_GAMEPLAY_MODE,
        true
    );
    const [isViewSVLine, setViewSVLine] = useStorage<boolean>(
        STORAGE_KEYS.PREVIEW_VIEW_SV_LINE,
        true
    );
    const [debugMode, setDebugMode] = useStorage<boolean>(
        STORAGE_KEYS.PREVIEW_DEBUG_MODE,
        false
    );

    return {
        musicVolume,
        setMusicVolume,
        hitsoundVolume,
        setHitsoundVolume,
        isGameplayMode,
        setIsGameplayMode,
        isViewSVLine,
        setViewSVLine,
        debugMode,
        setDebugMode,
    };
}

export function useCalibratorSettings() {
    const [playVolume, setPlayVolume] = useStorage<number>(
        STORAGE_KEYS.CALIBRATOR_PLAY_VOLUME,
        0.35
    );
    const [metroVolume, setMetroVolume] = useStorage<number>(
        STORAGE_KEYS.CALIBRATOR_METRO_VOLUME,
        0.25
    );
    const [metroOn, setMetroOn] = useStorage<boolean>(
        STORAGE_KEYS.CALIBRATOR_METRO_ON,
        true
    );

    return {
        playVolume,
        setPlayVolume,
        metroVolume,
        setMetroVolume,
        metroOn,
        setMetroOn,
    };
}

export function useDownloaderSettings() {
    const [audioFormat, setAudioFormat] = useStorage<"mp3" | "ogg">(
        STORAGE_KEYS.DOWNLOADER_AUDIO_FORMAT,
        "mp3"
    );
    const [includeVideo, setIncludeVideo] = useStorage<boolean>(
        STORAGE_KEYS.DOWNLOADER_INCLUDE_VIDEO,
        false
    );
    const [outDir, setOutDir] = useStorageString(
        STORAGE_KEYS.DOWNLOAD_FOLDER,
        ""
    );

    return {
        audioFormat,
        setAudioFormat,
        includeVideo,
        setIncludeVideo,
        outDir,
        setOutDir,
    };
}