import { useCallback, useEffect, useRef, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
    FiRefreshCw,
    FiMusic,
    FiAlertCircle,
} from "react-icons/fi";

import { Card } from "../../components/Card";
import { PlayfieldSVG } from "./PlayfieldSVG";
import { PreviewControls } from "./PreviewControls";

import { Beatmapset } from "../../types/beatmap";
import { useSongsFolder, usePreviewSettings } from "../../hooks/useStorage";
import { useI18n } from "../../hooks/i18nContext";
import { useAudioPlayer } from "../../hooks/useAudioPlayer";
import { useHitSounds } from "../../hooks/useHitSounds";
import {
    adaptOsuBeatmapToTaiko,
    type TaikoHitObjectWithStart,
    type TaikoDifficulty,
    type TaikoBeatmapData,
} from "../../domain/osu/taikoMapper";
import type { TimingLine } from "../../types/osu";
import { requestParseBatch } from "../../utils/signalr";
import {
    getCurrentBPM as getBPM,
    getCurrentSV as getSV,
    calculateGameplayStart as calcGameplayStart,
} from "../../domain/osu/timingUtils";
import { generateTicks as genTicks, type Tick } from "../../domain/osu/tickGenerator";
import { sortDifficulties } from "../../domain/osu/difficultyUtils";

interface HitAnimation {
    id: number;
    x: number;
    y: number;
    color: string;
    timestamp: number;
}

interface ModState {
    isDT: boolean;
    isHR: boolean;
}

interface BeatmapPreviewProps {
    selectedBeatmap?: Beatmapset | null;
}

const APPROACH_TIME = 2000;
const JUDGMENT_LINE_X = 100;
const HIT_WINDOW = 50;
const HIT_ANIMATION_DURATION_MS = 300;

const DT_SPEED_RATE = 1.5;
const HR_MULTIPLIER = 1.4;

export function BeatmapPreview({ selectedBeatmap }: BeatmapPreviewProps) {
    const { t } = useI18n();
    const [songsFolder] = useSongsFolder();

    const [loading, setLoading] = useState(false);
    const [loadingStep, setLoadingStep] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [beatmapData, setBeatmapData] = useState<TaikoBeatmapData | null>(null);
    const [selectedDifficulties, setSelectedDifficulties] = useState<Set<string>>(new Set());

    const {
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
    } = usePreviewSettings();

    const [mods, setMods] = useState<ModState>({
        isDT: false,
        isHR: false
    });

    const [isNoSV, setIsNoSV] = useState(false);
    const toggleNoSV = useCallback(() => setIsNoSV(prev => !prev), []);

    const [hitAnimations, setHitAnimations] = useState<HitAnimation[]>([]);
    const [audioLeadIn, setAudioLeadIn] = useState(0);
    const [debugInfo, setDebugInfo] = useState<string[]>([]);

    const getModMultipliers = useCallback(() => {
        const speedRate = mods.isDT ? DT_SPEED_RATE : 1.0;
        const arMultiplier = mods.isHR ? HR_MULTIPLIER : 1.0;
        const odMultiplier = mods.isHR ? HR_MULTIPLIER : 1.0;
        const svMultiplier = mods.isHR ? HR_MULTIPLIER : 1.0;

        return { speedRate, arMultiplier, odMultiplier, svMultiplier };
    }, [mods]);

    const {
        isPlaying,
        currentTime,
        duration,
        audioContext,
        togglePlayPause,
        seekTo: seekToRaw,
        getCurrentTimeMs,
        loadAudio,
        reset: resetAudioPlayer,
        setCurrentTime,
    } = useAudioPlayer({
        musicVolume,
        speedRate: mods.isDT ? DT_SPEED_RATE : 1.0,
        isDT: mods.isDT,
    });

    const { playHitSound } = useHitSounds(audioContext, hitsoundVolume);

    const lastHitTimeRef = useRef<Map<string, number>>(new Map());
    const animationFrameRef = useRef<number | null>(null);
    const animationIdCounterRef = useRef<number>(0);

    const processedDifficultiesRef = useRef<Map<string, { hitObjects: TaikoHitObjectWithStart[], ticks: Tick[] }>>(new Map());

    const seekTo = useCallback((timeMs: number) => {
        seekToRaw(timeMs);
        lastHitTimeRef.current.clear();
    }, [seekToRaw]);

    const toggleDT = useCallback(() => {
        setMods(prev => ({
            ...prev,
            isDT: !prev.isDT
        }));
    }, []);

    const toggleHR = useCallback(() => {
        setMods(prev => ({
            ...prev,
            isHR: !prev.isHR
        }));
    }, []);

    const addHitAnimation = useCallback((x: number, y: number, color: string) => {
        const id = animationIdCounterRef.current++;
        setHitAnimations(prev => [...prev, { id, x, y, color, timestamp: Date.now() }]);
    }, []);

    useEffect(() => {
        if (hitAnimations.length === 0) return;

        const cleanup = () => {
            const now = Date.now();
            setHitAnimations(prev => {
                const filtered = prev.filter(a => now - a.timestamp < HIT_ANIMATION_DURATION_MS);
                return filtered.length === prev.length ? prev : filtered;
            });
        };

        const id = requestAnimationFrame(cleanup);
        return () => cancelAnimationFrame(id);
    }, [hitAnimations]);

    const getCurrentBPM = useCallback((time: number, timingLines: TimingLine[]): number => {
        return getBPM(time, timingLines);
    }, []);

    const getCurrentSV = useCallback((time: number, timingLines: TimingLine[]): number => {
        if (isNoSV) return 1.0;
        const { svMultiplier: hrMultiplier } = getModMultipliers();
        return getSV(time, timingLines, hrMultiplier);
    }, [getModMultipliers, isNoSV]);

    const calculateGameplayStart = useCallback((objectTime: number, timingLines: TimingLine[]): number => {
        const { arMultiplier, svMultiplier: hrSVMultiplier } = getModMultipliers();
        return calcGameplayStart(objectTime, timingLines, isGameplayMode, APPROACH_TIME, arMultiplier, hrSVMultiplier, isNoSV);
    }, [isGameplayMode, getModMultipliers, isNoSV]);

    const generateTicks = useCallback((timingPoint: TimingLine, nextTime: number, timingLines: TimingLine[]): Tick[] => {
        return genTicks(timingPoint, nextTime, timingLines, isGameplayMode, calculateGameplayStart);
    }, [calculateGameplayStart, isGameplayMode]);

    const processDifficulty = useCallback((difficulty: TaikoDifficulty) => {
        const hitObjectsWithStart: TaikoHitObjectWithStart[] = difficulty.hitObjects.map(obj => ({
            ...obj,
            gameplayStart: calculateGameplayStart(obj.time, difficulty.timingLines)
        }));

        const allTicks: Tick[] = [];

        if (!duration || duration === 0) {
            return {
                hitObjects: hitObjectsWithStart,
                ticks: []
            };
        }

        const uninheritedPoints = difficulty.timingLines.filter(tp => tp.uninherited);

        if (uninheritedPoints.length === 0) {
            return {
                hitObjects: hitObjectsWithStart,
                ticks: []
            };
        }

        for (let i = 0; i < uninheritedPoints.length; i++) {
            const tp = uninheritedPoints[i];

            if (tp.offset >= duration) continue;

            const nextTime = i < uninheritedPoints.length - 1
                ? Math.min(uninheritedPoints[i + 1].offset, duration)
                : duration;

            const sectionTicks = generateTicks(tp, nextTime, difficulty.timingLines);
            allTicks.push(...sectionTicks);
        }

        return {
            hitObjects: hitObjectsWithStart,
            ticks: allTicks.sort((a, b) => a.time - b.time)
        };
    }, [calculateGameplayStart, generateTicks, duration]);

    useEffect(() => {
        if (!beatmapData) {
            processedDifficultiesRef.current.clear();
            return;
        }

        const newProcessed = new Map<string, { hitObjects: TaikoHitObjectWithStart[], ticks: Tick[] }>();

        beatmapData.difficulties.forEach(diff => {
            newProcessed.set(diff.version, processDifficulty(diff));
        });

        processedDifficultiesRef.current = newProcessed;
    }, [beatmapData, processDifficulty, isGameplayMode, mods]);

    const cleanupAudio = useCallback(() => {
        resetAudioPlayer();
        setIsGameplayMode(true);
        setViewSVLine(true);
        lastHitTimeRef.current.clear();
        setDebugInfo([]);
        setHitAnimations([]);
    }, [resetAudioPlayer]);

    useEffect(() => {
        if (!selectedBeatmap) return;

        cleanupAudio();
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }

        (async () => {
            setLoading(true);
            setLoadingStep("Scanning beatmap folder...");
            setError(null);
            setBeatmapData(null);
            setAudioLeadIn(0);

            try {
                if (!songsFolder) {
                    throw new Error("Songs folder not found");
                }

                const beatmapPath = `${songsFolder}\\${selectedBeatmap.folder_name}`;

                setLoadingStep("Parsing beatmap difficulties...");
                const rawBeatmaps = await requestParseBatch(beatmapPath, []);

                if (rawBeatmaps.length === 0) {
                    throw new Error("No .osu files found");
                }

                const firstBeatmap = rawBeatmaps[0];
                const audioFilename = firstBeatmap.general.audioFilename;
                const title = firstBeatmap.metadata.title;
                const artist = firstBeatmap.metadata.artist;
                const creator = firstBeatmap.metadata.creator;
                const leadIn = firstBeatmap.general.audioLeadIn;

                setLoadingStep("Sorting difficulties...");
                const { sorted: sortedBeatmaps } = sortDifficulties(rawBeatmaps);
                const taikoBeatmaps = sortedBeatmaps.filter(b => b.general.mode === 1);

                if (taikoBeatmaps.length === 0) {
                    throw new Error("No taiko difficulties found");
                }

                const sorted = taikoBeatmaps.map(adaptOsuBeatmapToTaiko);

                if (leadIn > 0) {
                    setAudioLeadIn(leadIn);
                }

                setBeatmapData({
                    audioFilename,
                    title: title || selectedBeatmap.title,
                    artist: artist || selectedBeatmap.artist,
                    creator: creator || selectedBeatmap.creator,
                    difficulties: sorted,
                });

                setSelectedDifficulties(new Set(sorted.map(d => d.version)));

                setLoadingStep("Loading audio file...");
                const audioPath = `${beatmapPath}\\${audioFilename}`;
                const audioData = await invoke<number[]>("read_audio_file", {
                    filePath: audioPath
                });

                setLoadingStep("Decoding audio...");
                await loadAudio(audioData);

                setLoadingStep("Ready!");

            } catch (err) {
                console.error("[Preview] Failed to load beatmap:", err);
                setError(String(err));
            } finally {
                setLoading(false);
                setTimeout(() => setLoadingStep(""), 500);
            }
        })();

        return () => {
            cleanupAudio();
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, [selectedBeatmap, cleanupAudio, loadAudio]);

    useEffect(() => {
        lastHitTimeRef.current.clear();
    }, [selectedDifficulties]);

    const processLongObjectSound = useCallback((
        obj: TaikoHitObjectWithStart,
        key: string,
        diff: TaikoDifficulty,
        adjustedTimeMs: number,
        yOffset: number,
    ) => {
        const lastHit = lastHitTimeRef.current.get(key) || -1000;
        let currentTP = diff.timingLines.find(tp => tp.uninherited);
        if (!currentTP) return;
        for (const tp of diff.timingLines) {
            if (tp.offset <= obj.time && tp.uninherited) currentTP = tp;
            else if (tp.offset > obj.time) break;
        }
        const interval = currentTP.beatLength / 4;
        if (adjustedTimeMs < obj.time || adjustedTimeMs > obj.endTime!) return;
        if (adjustedTimeMs - lastHit < interval) return;

        lastHitTimeRef.current.set(key, adjustedTimeMs);
        if (obj.type === "spinner") {
            const hitType = Math.floor((adjustedTimeMs - obj.time) / interval) % 2 === 0 ? "don" : "kat";
            playHitSound(hitType);
            addHitAnimation(JUDGMENT_LINE_X, yOffset, hitType === "don" ? "#ff5555" : "#5599ff");
        } else {
            playHitSound("don");
            addHitAnimation(JUDGMENT_LINE_X, yOffset, "#ff5555");
        }
        if (debugMode)
            setDebugInfo(prev => [...prev.slice(-9), `${obj.type} hit at ${adjustedTimeMs.toFixed(0)}ms (interval: ${interval.toFixed(1)}ms)`]);
    }, [playHitSound, addHitAnimation, debugMode]);

    const processCircleSound = useCallback((
        obj: TaikoHitObjectWithStart,
        key: string,
        adjustedTimeMs: number,
        yOffset: number,
    ) => {
        const lastHit = lastHitTimeRef.current.get(key) || -1000;
        const timeDiff = obj.time - adjustedTimeMs;
        if (timeDiff > 0 || timeDiff <= -HIT_WINDOW || lastHit >= obj.time) return;

        lastHitTimeRef.current.set(key, obj.time);
        playHitSound(obj.type);
        addHitAnimation(JUDGMENT_LINE_X, yOffset, obj.type.includes("don") ? "#ff5555" : "#5599ff");
        if (debugMode)
            setDebugInfo(prev => [...prev.slice(-9), `Hit: ${obj.type} at ${obj.time.toFixed(0)}ms, actual: ${adjustedTimeMs.toFixed(0)}ms, diff: ${timeDiff.toFixed(1)}ms`]);
    }, [playHitSound, addHitAnimation, debugMode]);

    const processHitObjectSound = useCallback((
        obj: TaikoHitObjectWithStart,
        key: string,
        diff: TaikoDifficulty,
        adjustedTimeMs: number,
        yOffset: number,
    ) => {
        if ((obj.type === "drumroll" || obj.type === "spinner") && obj.endTime)
            processLongObjectSound(obj, key, diff, adjustedTimeMs, yOffset);
        else
            processCircleSound(obj, key, adjustedTimeMs, yOffset);
    }, [processLongObjectSound, processCircleSound]);

    const updateTime = useCallback(() => {
        if (!isPlaying) return;

        const rawTimeMs = getCurrentTimeMs();
        const adjustedTimeMs = rawTimeMs - audioLeadIn;

        if (adjustedTimeMs >= duration) {
            cleanupAudio();
            return;
        }

        setCurrentTime(adjustedTimeMs);

        const now = Date.now();
        setHitAnimations(prev => prev.filter(anim => now - anim.timestamp < HIT_ANIMATION_DURATION_MS));

        if (beatmapData && hitsoundVolume > 0) {
            const activeDiffs = beatmapData.difficulties.filter(d => selectedDifficulties.has(d.version));
            activeDiffs.forEach(diff => {
                const processedData = processedDifficultiesRef.current.get(diff.version);
                if (!processedData) return;
                const diffIndex = activeDiffs.findIndex(d => d.version === diff.version);
                const yOffset = diffIndex * 100 + 50;
                processedData.hitObjects.forEach(obj => {
                    const key = `${diff.version}-${obj.time}`;
                    processHitObjectSound(obj, key, diff, adjustedTimeMs, yOffset);
                });
            });
        }

        animationFrameRef.current = requestAnimationFrame(updateTime);
    }, [isPlaying, beatmapData, selectedDifficulties, hitsoundVolume, processHitObjectSound, audioLeadIn, getCurrentTimeMs, duration, cleanupAudio]);

    useEffect(() => {
        if (isPlaying) {
            animationFrameRef.current = requestAnimationFrame(updateTime);
        } else {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        }
        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, [isPlaying, updateTime]);

    const togglePlayMode = useCallback(() => {
        setIsGameplayMode(prev => !prev);
    }, [])

    const toggleViewSVLine = useCallback(() => {
        setViewSVLine(prev => !prev);
    }, [])

    const restartFromBeginning = useCallback(() => {
        seekTo(0);
        setDebugInfo([]);
        if (isPlaying) {
            togglePlayPause();
        }
    }, [seekTo, isPlaying, togglePlayPause]);

    const toggleDifficulty = useCallback((version: string) => {
        setSelectedDifficulties(prev => {
            const newSet = new Set(prev);
            if (newSet.has(version)) {
                newSet.delete(version);
            } else {
                newSet.add(version);
            }
            return newSet;
        });
    }, []);

    const filteredDifficulties = useMemo(() => {
        if (!beatmapData) return [];
        return beatmapData.difficulties.filter(d => selectedDifficulties.has(d.version));
    }, [beatmapData, selectedDifficulties]);

    const currentSVBPMMap = useMemo(() => {
        if (!isGameplayMode || !beatmapData) return new Map<string, { sv: number; bpm: number }>();

        const map = new Map<string, { sv: number; bpm: number }>();
        for (const diff of filteredDifficulties) {
            map.set(diff.version, {
                sv: getCurrentSV(currentTime, diff.timingLines),
                bpm: getCurrentBPM(currentTime, diff.timingLines),
            });
        }
        return map;
    }, [isGameplayMode, beatmapData, filteredDifficulties, currentTime, getCurrentSV, getCurrentBPM]);

    if (!selectedBeatmap) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-center text-text-muted">
                    <div className="text-4xl mb-3 opacity-30">🥁</div>
                    <p>{t("preview.empty.selectBeatmap")}</p>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-center text-text-muted">
                    <FiRefreshCw className="w-8 h-8 animate-spin mx-auto mb-3" />
                    <p className="font-semibold mb-1">{t("preview.loading")}</p>
                    {loadingStep && <p className="text-sm opacity-70">{loadingStep}</p>}
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center h-full">
                <Card className="p-6 bg-red-500/10 border-red-500/30">
                    <div className="flex items-center gap-3 text-red-400">
                        <FiAlertCircle className="w-6 h-6" />
                        <div>
                            <div className="font-semibold mb-1">{t("preview.error.title")}</div>
                            <div className="text-sm opacity-80">{error}</div>
                        </div>
                    </div>
                </Card>
            </div>
        );
    }

    if (!beatmapData) {
        return null;
    }

    return (
        <div className="h-full flex flex-col">
            <div className="flex-1 overflow-y-auto p-4">
                <div className="max-w-7xl mx-auto space-y-4">
                    <Card className="p-4">
                        <div className="flex items-center gap-3 mb-3">
                            <FiMusic className="w-5 h-5 text-accent-primary" />
                            <div className="flex-1">
                                <h2 className="text-lg font-bold">{beatmapData.title}</h2>
                                <div className="text-sm text-text-muted">
                                    {t("preview.header.artistMapper", {
                                        artist: beatmapData.artist,
                                        creator: beatmapData.creator,
                                    })}
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            {beatmapData.difficulties.map((diff) => {
                                const isSelected = selectedDifficulties.has(diff.version);
                                return (
                                    <button
                                        key={diff.version}
                                        onClick={() => toggleDifficulty(diff.version)}
                                        className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${isSelected
                                            ? "bg-accent-primary/20 border-accent-primary text-white"
                                            : "bg-surface-panel border-border-muted text-text-muted"
                                            }`}
                                    >
                                        {diff.version}
                                        <span className="ml-2 text-xs opacity-70">
                                            ({diff.hitObjects.length})
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </Card>

                    <Card className="p-4">
                        <PlayfieldSVG
                            filteredDifficulties={filteredDifficulties}
                            processedDifficulties={processedDifficultiesRef.current}
                            currentSVBPMMap={currentSVBPMMap}
                            currentTime={currentTime}
                            isGameplayMode={isGameplayMode}
                            isViewSVLine={isViewSVLine}
                            hitAnimations={hitAnimations}
                            calculateGameplayStart={calculateGameplayStart}
                            isPlaying={isPlaying}
                            seekTo={seekTo}
                            duration={duration}
                        />

                        <PreviewControls
                            t={t}
                            isPlaying={isPlaying}
                            togglePlayPause={togglePlayPause}
                            restartFromBeginning={restartFromBeginning}
                            currentTime={currentTime}
                            duration={duration}
                            seekTo={seekTo}
                            isGameplayMode={isGameplayMode}
                            togglePlayMode={togglePlayMode}
                            isViewSVLine={isViewSVLine}
                            toggleViewSVLine={toggleViewSVLine}
                            mods={mods}
                            toggleDT={toggleDT}
                            toggleHR={toggleHR}
                            isNoSV={isNoSV}
                            toggleNoSV={toggleNoSV}
                            debugMode={debugMode}
                            setDebugMode={setDebugMode}
                            musicVolume={musicVolume}
                            setMusicVolume={setMusicVolume}
                            hitsoundVolume={hitsoundVolume}
                            setHitsoundVolume={setHitsoundVolume}
                            getCurrentTimeMs={getCurrentTimeMs}
                            audioLeadIn={audioLeadIn}
                            hitWindow={HIT_WINDOW}
                            filteredDifficulties={filteredDifficulties}
                            getCurrentBPM={getCurrentBPM}
                            getCurrentSV={getCurrentSV}
                            debugInfo={debugInfo}
                            beatmapData={beatmapData}
                        />
                    </Card>
                </div>
            </div>
        </div>
    );
}
