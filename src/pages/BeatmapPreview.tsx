import { useCallback, useEffect, useRef, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
    FiRefreshCw,
    FiMusic,
    FiAlertCircle,
} from "react-icons/fi";

import { Card } from "../components/common/Card";
import { PlayfieldSVG } from "../components/preview/PlayfieldSVG";
import { PreviewControls } from "../components/preview/PreviewControls";

import { Beatmapset } from "../types/beatmap";
import { useSongsFolder, usePreviewSettings } from "../hooks/useStorage";
import { useI18n } from "../hooks/i18nContext";
import { useAudioPlayer } from "../hooks/useAudioPlayer";
import { useHitSounds } from "../hooks/useHitSounds";
import {
    parseOsuFile,
    type HitObjectWithStart,
    type TimingPoint,
    type Difficulty,
    type BeatmapData,
    type Tick,
    type HitAnimation,
    type ModState,
} from "../domain/osu/osuFileParser";
import {
    getCurrentBPM as getBPM,
    getCurrentSV as getSV,
    calculateGameplayStart as calcGameplayStart,
} from "../domain/osu/timingUtils";
import { generateTicks as genTicks } from "../domain/osu/tickGenerator";
import { sortDifficulties } from "../domain/osu/difficultyUtils";

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
    const [beatmapData, setBeatmapData] = useState<BeatmapData | null>(null);
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

    const processedDifficultiesRef = useRef<Map<string, { hitObjects: HitObjectWithStart[], ticks: Tick[] }>>(new Map());

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

    const getCurrentBPM = useCallback((time: number, timingPoints: TimingPoint[]): number => {
        return getBPM(time, timingPoints);
    }, []);

    const getCurrentSV = useCallback((time: number, timingPoints: TimingPoint[]): number => {
        const { svMultiplier: hrMultiplier } = getModMultipliers();
        return getSV(time, timingPoints, hrMultiplier);
    }, [getModMultipliers]);

    const calculateGameplayStart = useCallback((objectTime: number, timingPoints: TimingPoint[]): number => {
        const { arMultiplier, svMultiplier: hrSVMultiplier } = getModMultipliers();
        return calcGameplayStart(objectTime, timingPoints, isGameplayMode, APPROACH_TIME, arMultiplier, hrSVMultiplier);
    }, [isGameplayMode, APPROACH_TIME, getModMultipliers]);

    const generateTicks = useCallback((timingPoint: TimingPoint, nextTime: number, timingPoints: TimingPoint[]): Tick[] => {
        return genTicks(timingPoint, nextTime, timingPoints, isGameplayMode, calculateGameplayStart);
    }, [calculateGameplayStart, isGameplayMode]);

    const parseOsuFileAndSetLeadIn = useCallback((content: string, fileName: string): Difficulty | null => {
        const result = parseOsuFile(content, fileName);
        if (!result) return null;

        if (result.leadIn > 0 && audioLeadIn === 0) {
            setAudioLeadIn(result.leadIn);
        }

        return result.difficulty;
    }, [audioLeadIn]);

    const processDifficulty = useCallback((difficulty: Difficulty) => {
        const hitObjectsWithStart: HitObjectWithStart[] = difficulty.hitObjects.map(obj => ({
            ...obj,
            gameplayStart: calculateGameplayStart(obj.time, difficulty.timingPoints)
        }));

        const allTicks: Tick[] = [];

        if (!duration || duration === 0) {
            return {
                hitObjects: hitObjectsWithStart,
                ticks: []
            };
        }

        const uninheritedPoints = difficulty.timingPoints.filter(tp => tp.uninherited);

        if (uninheritedPoints.length === 0) {
            return {
                hitObjects: hitObjectsWithStart,
                ticks: []
            };
        }

        for (let i = 0; i < uninheritedPoints.length; i++) {
            const tp = uninheritedPoints[i];

            if (tp.time >= duration) continue;

            const nextTime = i < uninheritedPoints.length - 1
                ? Math.min(uninheritedPoints[i + 1].time, duration)
                : duration;

            const sectionTicks = generateTicks(tp, nextTime, difficulty.timingPoints);
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

        const newProcessed = new Map<string, { hitObjects: HitObjectWithStart[], ticks: Tick[] }>();

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

                setLoadingStep("Finding .osu files...");
                const osuFiles = await invoke<string[]>("list_osu_files", {
                    beatmapFolder: beatmapPath
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

                for (const file of osuFiles) {
                    const filePath = `${beatmapPath}\\${file}`;
                    const content = await invoke<string>("read_osu_file", { filePath });

                    const difficulty = parseOsuFileAndSetLeadIn(content, file);
                    if (difficulty) {
                        difficulties.push(difficulty);
                        setLoadingStep(`Parsed ${difficulties.length}/${osuFiles.length} difficulties...`);

                        if (!audioFilename) {
                            const lines = content.split(/\r?\n/);
                            for (const line of lines) {
                                const trimmed = line.trim();
                                if (trimmed.startsWith("AudioFilename:")) {
                                    audioFilename = trimmed.split(":")[1].trim();
                                }
                                if (trimmed.startsWith("Title:")) {
                                    title = trimmed.substring(trimmed.indexOf(":") + 1).trim();
                                }
                                if (trimmed.startsWith("Artist:")) {
                                    artist = trimmed.substring(trimmed.indexOf(":") + 1).trim();
                                }
                                if (trimmed.startsWith("Creator:")) {
                                    creator = trimmed.substring(trimmed.indexOf(":") + 1).trim();
                                }
                            }
                        }
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
    }, [selectedBeatmap, parseOsuFileAndSetLeadIn, cleanupAudio, loadAudio]);

    useEffect(() => {
        lastHitTimeRef.current.clear();
    }, [selectedDifficulties]);

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
        setHitAnimations(prev => prev.filter(anim => now - anim.timestamp < 300));

        if (beatmapData && hitsoundVolume > 0) {
            beatmapData.difficulties
                .filter(d => selectedDifficulties.has(d.version))
                .forEach(diff => {
                    const processedData = processedDifficultiesRef.current.get(diff.version);
                    if (!processedData) return;

                    processedData.hitObjects.forEach(obj => {
                        const key = `${diff.version}-${obj.time}`;
                        const lastHit = lastHitTimeRef.current.get(key) || -1000;

                        const diffIndex = beatmapData.difficulties
                            .filter(d => selectedDifficulties.has(d.version))
                            .findIndex(d => d.version === diff.version);
                        const yOffset = diffIndex * 100 + 50;

                        if ((obj.type === "drumroll" || obj.type === "spinner") && obj.endTime) {
                            let currentTP = diff.timingPoints.find(tp => tp.uninherited);
                            if (!currentTP) return;

                            for (const tp of diff.timingPoints) {
                                if (tp.time <= obj.time && tp.uninherited) {
                                    currentTP = tp;
                                } else if (tp.time > obj.time) {
                                    break;
                                }
                            }

                            const interval = currentTP.beatLength / 4;

                            if (adjustedTimeMs >= obj.time && adjustedTimeMs <= obj.endTime) {
                                if (adjustedTimeMs - lastHit >= interval) {
                                    lastHitTimeRef.current.set(key, adjustedTimeMs);

                                    if (obj.type === "spinner") {
                                        const hitCount = Math.floor((adjustedTimeMs - obj.time) / interval);
                                        const hitType = hitCount % 2 === 0 ? "don" : "kat";
                                        playHitSound(hitType);

                                        const color = hitType === "don" ? "#ff5555" : "#5599ff";
                                        addHitAnimation(JUDGMENT_LINE_X, yOffset, color);
                                    } else {
                                        playHitSound("don");
                                        addHitAnimation(JUDGMENT_LINE_X, yOffset, "#ff5555");
                                    }

                                    if (debugMode) {
                                        const info = `${obj.type} hit at ${adjustedTimeMs.toFixed(0)}ms (interval: ${interval.toFixed(1)}ms)`;
                                        setDebugInfo(prev => [...prev.slice(-9), info]);
                                    }
                                }
                            }
                        } else {
                            const timeDiff = obj.time - adjustedTimeMs;

                            if (timeDiff <= 0 && timeDiff > -HIT_WINDOW && lastHit < obj.time) {
                                lastHitTimeRef.current.set(key, obj.time);
                                playHitSound(obj.type);

                                if (debugMode) {
                                    const info = `Hit: ${obj.type} at ${obj.time.toFixed(0)}ms, actual: ${adjustedTimeMs.toFixed(0)}ms, diff: ${timeDiff.toFixed(1)}ms`;
                                    setDebugInfo(prev => [...prev.slice(-9), info]);
                                }

                                const color = obj.type.includes("don") ? "#ff5555" : "#5599ff";
                                addHitAnimation(JUDGMENT_LINE_X, yOffset, color);
                            }
                        }
                    });
                });
        }

        animationFrameRef.current = requestAnimationFrame(updateTime);
    }, [isPlaying, beatmapData, selectedDifficulties, hitsoundVolume, playHitSound, addHitAnimation, debugMode, audioLeadIn, getCurrentTimeMs, duration, cleanupAudio]);

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
                sv: getCurrentSV(currentTime, diff.timingPoints),
                bpm: getCurrentBPM(currentTime, diff.timingPoints),
            });
        }
        return map;
    }, [isGameplayMode, beatmapData, filteredDifficulties, currentTime, getCurrentSV, getCurrentBPM]);

    if (!selectedBeatmap) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-center text-[#7b7b7b]">
                    <div className="text-4xl mb-3 opacity-30">🥁</div>
                    <p>{t("preview.empty.selectBeatmap")}</p>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-center text-[#7b7b7b]">
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
                            <FiMusic className="w-5 h-5 text-[#2563eb]" />
                            <div className="flex-1">
                                <h2 className="text-lg font-bold">{beatmapData.title}</h2>
                                <div className="text-sm text-[#7b7b7b]">
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
                                            ? "bg-[#2563eb]/20 border-[#2563eb] text-white"
                                            : "bg-[#171717] border-[#2a2a2a] text-[#7b7b7b]"
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
