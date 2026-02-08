import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { invoke } from "@tauri-apps/api/core";

import type { Beatmapset } from "../types/beatmap";
import { parseOsuHeaderFields, sortDifficulties, type BeatmapData, type Difficulty, parseOsuFile } from "../domain/osu";

export interface UseBeatmapPreviewLoaderResult {
    loading: boolean;
    loadingStep: string;
    error: string | null;
    beatmapData: BeatmapData | null;
    selectedDifficulties: Set<string>;
    setSelectedDifficulties: Dispatch<SetStateAction<Set<string>>>;
    audioLeadIn: number;
}

export function useBeatmapPreviewLoader(params: {
    selectedBeatmap?: Beatmapset | null;
    songsFolder?: string | null;
    loadAudio: (audioData: number[]) => Promise<void>;
}): UseBeatmapPreviewLoaderResult {
    const { selectedBeatmap, songsFolder, loadAudio } = params;

    const [loading, setLoading] = useState(false);
    const [loadingStep, setLoadingStep] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [beatmapData, setBeatmapData] = useState<BeatmapData | null>(null);
    const [selectedDifficulties, setSelectedDifficulties] = useState<Set<string>>(new Set());
    const [audioLeadIn, setAudioLeadIn] = useState(0);

    useEffect(() => {
        let mounted = true;

        if (!selectedBeatmap) {
            setLoading(false);
            setLoadingStep("");
            setError(null);
            setBeatmapData(null);
            setSelectedDifficulties(new Set());
            setAudioLeadIn(0);
            return () => {
                mounted = false;
            };
        }

        (async () => {
            setLoading(true);
            setLoadingStep("Scanning beatmap folder...");
            setError(null);
            setBeatmapData(null);
            setSelectedDifficulties(new Set());
            setAudioLeadIn(0);

            try {
                if (!songsFolder) {
                    throw new Error("Songs folder not found");
                }

                const beatmapPath = `${songsFolder}\${selectedBeatmap.folder_name}`;

                setLoadingStep("Finding .osu files...");
                const osuFiles = await invoke<string[]>("list_osu_files", {
                    beatmapFolder: beatmapPath,
                });

                if (osuFiles.length === 0) {
                    throw new Error("No .osu files found");
                }

                setLoadingStep(`Parsing ${osuFiles.length} difficulties...`);

                const difficulties: Difficulty[] = [];
                let audioFilename = "";
                let title = "";
                let artist = "";
                let creator = "";
                let leadIn = 0;

                let didParseHeader = false;

                for (const file of osuFiles) {
                    const filePath = `${beatmapPath}\${file}`;
                    const content = await invoke<string>("read_osu_file", { filePath });

                    const result = parseOsuFile(content, file);
                    if (!result) continue;

                    difficulties.push(result.difficulty);
                    setLoadingStep(`Parsed ${difficulties.length}/${osuFiles.length} difficulties...`);

                    if (leadIn === 0 && result.leadIn > 0) {
                        leadIn = result.leadIn;
                    }

                    if (!didParseHeader) {
                        const header = parseOsuHeaderFields(content);
                        if (header.audioFilename) audioFilename = header.audioFilename;
                        if (header.title) title = header.title;
                        if (header.artist) artist = header.artist;
                        if (header.creator) creator = header.creator;
                        didParseHeader = true;
                    }
                }

                if (difficulties.length === 0) {
                    throw new Error("No taiko difficulties found");
                }

                setLoadingStep("Sorting difficulties...");
                const { sorted, error: sortError } = sortDifficulties(difficulties);

                if (sortError) {
                    throw new Error(sortError);
                }

                if (!mounted) return;

                setAudioLeadIn(leadIn);

                const data: BeatmapData = {
                    audioFilename,
                    title: title || selectedBeatmap.title,
                    artist: artist || selectedBeatmap.artist,
                    creator: creator || selectedBeatmap.creator,
                    difficulties: sorted,
                };

                setBeatmapData(data);
                setSelectedDifficulties(new Set(sorted.map((d) => d.version)));

                setLoadingStep("Loading audio file...");
                const audioPath = `${beatmapPath}\${audioFilename}`;
                const audioData = await invoke<number[]>("read_audio_file", {
                    filePath: audioPath,
                });

                setLoadingStep("Decoding audio...");
                await loadAudio(audioData);

                setLoadingStep("Ready!");
            } catch (err) {
                console.error("[Preview] Failed to load beatmap:", err);
                if (mounted) {
                    setError(String(err));
                }
            } finally {
                if (!mounted) return;
                setLoading(false);
                setTimeout(() => {
                    if (mounted) setLoadingStep("");
                }, 500);
            }
        })();

        return () => {
            mounted = false;
        };
    }, [selectedBeatmap, songsFolder, loadAudio]);

    return {
        loading,
        loadingStep,
        error,
        beatmapData,
        selectedDifficulties,
        setSelectedDifficulties,
        audioLeadIn,
    };
}
