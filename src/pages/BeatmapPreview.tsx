import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
    FiPlay,
    FiPause,
    FiRefreshCw,
    FiMusic,
    FiAlertCircle,
    FiVolume2,
    FiVolumeX,
    FiSkipBack,
    FiEdit2,
    FiCheck,
    FiX,
    FiEdit,
    FiHeadphones,
    FiEye,
    FiEyeOff
} from "react-icons/fi";

import { Button } from "../components/common/Button";
import { Card } from "../components/common/Card";

interface BeatmapPreviewProps {
    selectedBeatmap?: {
        folder_name: string;
        title: string;
        artist: string;
        creator: string;
    };
}

interface HitObject {
    time: number;
    type: "don" | "kat" | "don-big" | "kat-big" | "drumroll" | "spinner";
    endTime?: number;
}

interface HitObjectWithStart extends HitObject {
    gameplayStart: number;
}

interface TimingPoint {
    time: number;
    beatLength: number;
    meter: number;
    uninherited: boolean;
    svMultiplier?: number;
}

interface Difficulty {
    fileName: string;
    version: string;
    hitObjects: HitObject[];
    timingPoints: TimingPoint[];
    bpm: number;
    hpDrainRate: number;
    overallDifficulty: number;
    sliderMultiplier: number;
}

interface BeatmapData {
    audioFilename: string;
    title: string;
    artist: string;
    creator: string;
    difficulties: Difficulty[];
}

interface Tick {
    time: number;
    type: "measure" | "beat" | "half" | "quarter";
    gameplayStart: number;
}

interface HitAnimation {
    id: number;
    x: number;
    y: number;
    color: string;
    timestamp: number;
}

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

function categorizeDifficulty(version: string): string {
    for (const [category, pattern] of Object.entries(DIFFICULTY_PATTERNS)) {
        if (pattern.test(version)) {
            return category;
        }
    }
    return "Custom";
}

function sortDifficulties(difficulties: Difficulty[]): { sorted: Difficulty[], error?: string } {
    const categorized = difficulties.map(diff => ({
        difficulty: diff,
        category: categorizeDifficulty(diff.version)
    }));

    const sorted = categorized.sort((a, b) => {
        const indexA = DIFFICULTY_ORDER.indexOf(a.category as any);
        const indexB = DIFFICULTY_ORDER.indexOf(b.category as any);
        return indexA - indexB;
    });

    return { sorted: sorted.map(c => c.difficulty) };
}

export function BeatmapPreview({ selectedBeatmap }: BeatmapPreviewProps) {
    const [loading, setLoading] = useState(false);
    const [loadingStep, setLoadingStep] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [beatmapData, setBeatmapData] = useState<BeatmapData | null>(null);
    const [selectedDifficulties, setSelectedDifficulties] = useState<Set<string>>(new Set());

    const [isPlaying, setIsPlaying] = useState(false);
    const [musicVolume, setMusicVolume] = useState(0.35);
    const [hitsoundVolume, setHitsoundVolume] = useState(0.30);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [hitAnimations, setHitAnimations] = useState<HitAnimation[]>([]);

    const [audioLeadIn, setAudioLeadIn] = useState(0);
    const [debugMode, setDebugMode] = useState(false);
    const [debugInfo, setDebugInfo] = useState<string[]>([]);

    const [isEditingTime, setIsEditingTime] = useState(false);
    const [timeInput, setTimeInput] = useState("");

    const [isGameplayMode, setIsGameplayMode] = useState(true);
    const [isViewSVLine, setViewSVLine] = useState(true);

    const audioContextRef = useRef<AudioContext | null>(null);
    const audioBufferRef = useRef<AudioBuffer | null>(null);
    const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
    const audioGainNodeRef = useRef<GainNode | null>(null);
    const audioStartTimeRef = useRef<number>(0);
    const audioOffsetRef = useRef<number>(0);

    const donBufferRef = useRef<AudioBuffer | null>(null);
    const katBufferRef = useRef<AudioBuffer | null>(null);
    const lastHitTimeRef = useRef<Map<string, number>>(new Map());
    const animationFrameRef = useRef<number | null>(null);
    const animationIdCounterRef = useRef<number>(0);

    const processedDifficultiesRef = useRef<Map<string, { hitObjects: HitObjectWithStart[], ticks: Tick[] }>>(new Map());

    const SPEED_CONSTANT = 175;
    const APPROACH_TIME = 2000;
    const PLAYFIELD_WIDTH = 800;
    const JUDGMENT_LINE_X = 100;
    const VISIBLE_LENGTH = PLAYFIELD_WIDTH - JUDGMENT_LINE_X;
    const HIT_WINDOW = 50;

    const EDIT_PIXELS_PER_MS = VISIBLE_LENGTH / APPROACH_TIME;

    const createDonSound = () => {
        const audioContext = new AudioContext();
        const sampleRate = audioContext.sampleRate;
        const duration = 0.15;
        const buffer = audioContext.createBuffer(1, sampleRate * duration, sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < buffer.length; i++) {
            const t = i / sampleRate;
            const envelope = Math.exp(-t * 8);
            data[i] = Math.sin(2 * Math.PI * 200 * t) * envelope * 0.5;
        }

        const wavBlob = bufferToWave(buffer, buffer.length);
        return URL.createObjectURL(wavBlob);
    };

    const createKatSound = () => {
        const audioContext = new AudioContext();
        const sampleRate = audioContext.sampleRate;
        const duration = 0.1;
        const buffer = audioContext.createBuffer(1, sampleRate * duration, sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < buffer.length; i++) {
            const t = i / sampleRate;
            const envelope = Math.exp(-t * 12);
            data[i] = Math.sin(2 * Math.PI * 600 * t) * envelope * 0.5;
        }

        const wavBlob = bufferToWave(buffer, buffer.length);
        return URL.createObjectURL(wavBlob);
    };

    const bufferToWave = (abuffer: AudioBuffer, len: number) => {
        const numOfChan = abuffer.numberOfChannels;
        const length = len * numOfChan * 2 + 44;
        const buffer = new ArrayBuffer(length);
        const view = new DataView(buffer);
        const channels = [];
        let sample;
        let offset = 0;
        let pos = 0;

        setUint32(0x46464952);
        setUint32(length - 8);
        setUint32(0x45564157);
        setUint32(0x20746d66);
        setUint32(16);
        setUint16(1);
        setUint16(numOfChan);
        setUint32(abuffer.sampleRate);
        setUint32(abuffer.sampleRate * 2 * numOfChan);
        setUint16(numOfChan * 2);
        setUint16(16);
        setUint32(0x61746164);
        setUint32(length - pos - 4);

        for (let i = 0; i < abuffer.numberOfChannels; i++) {
            channels.push(abuffer.getChannelData(i));
        }

        while (pos < length) {
            for (let i = 0; i < numOfChan; i++) {
                sample = Math.max(-1, Math.min(1, channels[i][offset]));
                sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
                view.setInt16(pos, sample, true);
                pos += 2;
            }
            offset++;
        }

        return new Blob([buffer], { type: "audio/wav" });

        function setUint16(data: number) {
            view.setUint16(pos, data, true);
            pos += 2;
        }

        function setUint32(data: number) {
            view.setUint32(pos, data, true);
            pos += 4;
        }
    };

    useEffect(() => {
        const initAudio = async () => {
            const audioContext = new AudioContext();
            audioContextRef.current = audioContext;

            try {
                const donResponse = await fetch("/hitsounds/don.wav");
                if (!donResponse.ok) throw new Error("Failed to load don.wav");
                const donArrayBuffer = await donResponse.arrayBuffer();
                const donBuffer = await audioContext.decodeAudioData(donArrayBuffer);
                donBufferRef.current = donBuffer;

                const katResponse = await fetch("/hitsounds/kat.wav");
                if (!katResponse.ok) throw new Error("Failed to load kat.wav");
                const katArrayBuffer = await katResponse.arrayBuffer();
                const katBuffer = await audioContext.decodeAudioData(katArrayBuffer);
                katBufferRef.current = katBuffer;

                console.log("Hitsounds loaded successfully!");
            } catch (err) {
                console.warn("Failed to load hitsounds, using generated sounds:", err);
                const donResponse = await fetch(createDonSound());
                const donArrayBuffer = await donResponse.arrayBuffer();
                const donBuffer = await audioContext.decodeAudioData(donArrayBuffer);
                donBufferRef.current = donBuffer;

                const katResponse = await fetch(createKatSound());
                const katArrayBuffer = await katResponse.arrayBuffer();
                const katBuffer = await audioContext.decodeAudioData(katArrayBuffer);
                katBufferRef.current = katBuffer;
            }
        };

        initAudio();

        return () => {
            if (audioContextRef.current) {
                audioContextRef.current.close();
            }
        };
    }, []);

    const playHitSound = useCallback((type: HitObject["type"]) => {
        if (!audioContextRef.current || hitsoundVolume === 0) return;

        const isKat = type.includes("kat");
        const isBig = type.includes("big");
        const buffer = isKat ? katBufferRef.current : donBufferRef.current;

        if (!buffer) return;

        const playCount = isBig ? 2 : 1;

        for (let i = 0; i < playCount; i++) {
            const source = audioContextRef.current.createBufferSource();
            const gainNode = audioContextRef.current.createGain();

            source.buffer = buffer;
            source.connect(gainNode);
            gainNode.connect(audioContextRef.current.destination);

            gainNode.gain.value = isBig ? hitsoundVolume * 1.2 : hitsoundVolume;
            source.start(audioContextRef.current.currentTime);
        }
    }, [hitsoundVolume]);

    const addHitAnimation = useCallback((x: number, y: number, color: string) => {
        const id = animationIdCounterRef.current++;
        setHitAnimations(prev => [...prev, { id, x, y, color, timestamp: Date.now() }]);
    }, []);

    const getCurrentBPM = useCallback((time: number, timingPoints: TimingPoint[]): number => {
        let currentBeatLength = 500;

        for (const tp of timingPoints) {
            if (tp.time > time) break;

            if (tp.uninherited) {
                currentBeatLength = tp.beatLength;
            }
        }

        return Math.round(60000 / currentBeatLength);
    }, []);

    const getCurrentSV = useCallback((time: number, timingPoints: TimingPoint[]): number => {
        let svMultiplier = 1.0;

        for (const tp of timingPoints) {
            if (tp.time > time) break;

            if (tp.uninherited) {
                svMultiplier = 1.0;
            } else if (tp.svMultiplier !== undefined) {
                svMultiplier = tp.svMultiplier;
            }
        }

        return svMultiplier;
    }, []);

    const calculateGameplayStart = useCallback((objectTime: number, timingPoints: TimingPoint[]): number => {
        if (isGameplayMode) {
            let currentBeatLength = 500;
            let svMultiplier = 1.0;

            for (const tp of timingPoints) {
                if (tp.time > objectTime) break;

                if (tp.uninherited) {
                    currentBeatLength = tp.beatLength;
                    svMultiplier = 1.0;
                } else if (tp.svMultiplier !== undefined) {
                    svMultiplier = tp.svMultiplier;
                }
            }
            const approachTime = (4 * currentBeatLength) / svMultiplier;
            return objectTime - approachTime;
        } else {
            return objectTime - APPROACH_TIME;
        }
    }, [isGameplayMode, APPROACH_TIME]);

    const calculateObjectEndPosition = useCallback((
        startTime: number,
        endTime: number,
        timingPoints: TimingPoint[]
    ): number => {
        if (isGameplayMode) {
            let currentTime = startTime;
            let visualLength = 0;

            let currentBeatLength = 500;
            let svMultiplier = 1.0;

            for (const tp of timingPoints) {
                if (tp.time > startTime) break;
                if (tp.uninherited) {
                    currentBeatLength = tp.beatLength;
                    svMultiplier = 1.0;
                } else if (tp.svMultiplier !== undefined) {
                    svMultiplier = tp.svMultiplier;
                }
            }

            const relevantPoints = timingPoints.filter(tp => tp.time > startTime && tp.time < endTime);

            for (const tp of relevantPoints) {
                const duration = tp.time - currentTime;
                const speed = (SPEED_CONSTANT * svMultiplier) / currentBeatLength;
                visualLength += duration * speed;

                currentTime = tp.time;
                if (tp.uninherited) {
                    currentBeatLength = tp.beatLength;
                    svMultiplier = 1.0;
                } else if (tp.svMultiplier !== undefined) {
                    svMultiplier = tp.svMultiplier;
                }
            }

            const finalDuration = endTime - currentTime;
            const finalSpeed = (SPEED_CONSTANT * svMultiplier) / currentBeatLength;
            visualLength += finalDuration * finalSpeed;

            return visualLength;
        } else {
            const duration = endTime - startTime;
            return duration * EDIT_PIXELS_PER_MS;
        }
    }, [isGameplayMode, EDIT_PIXELS_PER_MS, SPEED_CONSTANT]);

    const generateTicks = useCallback((timingPoint: TimingPoint, nextTime: number, timingPoints: TimingPoint[]): Tick[] => {
        const ticks: Tick[] = [];
        const beatLength = timingPoint.beatLength;
        const meter = timingPoint.meter;

        let time = timingPoint.time;
        let beatIndex = 0;

        while (time < nextTime) {
            const gameplayStart = calculateGameplayStart(time, timingPoints);

            if (beatIndex % meter === 0) {
                ticks.push({ time, type: "measure", gameplayStart });
            } else {
                ticks.push({ time, type: "beat", gameplayStart });
            }

            if (!isGameplayMode) {
                const halfTime = time + beatLength / 2;
                if (halfTime < nextTime) {
                    const halfGameplayStart = calculateGameplayStart(halfTime, timingPoints);
                    ticks.push({ time: halfTime, type: "half", gameplayStart: halfGameplayStart });
                }

                const quarter1 = time + beatLength / 4;
                const quarter3 = time + beatLength * 3 / 4;
                if (quarter1 < nextTime) {
                    const q1GameplayStart = calculateGameplayStart(quarter1, timingPoints);
                    ticks.push({ time: quarter1, type: "quarter", gameplayStart: q1GameplayStart });
                }
                if (quarter3 < nextTime) {
                    const q3GameplayStart = calculateGameplayStart(quarter3, timingPoints);
                    ticks.push({ time: quarter3, type: "quarter", gameplayStart: q3GameplayStart });
                }
            }

            time += beatLength;
            beatIndex++;
        }

        return ticks.sort((a, b) => a.time - b.time);
    }, [calculateGameplayStart, isGameplayMode]);

    const calculateSliderDuration = useCallback((
        sliderLength: number,
        repeatCount: number,
        sliderMultiplier: number,
        beatLength: number
    ): number => {
        const duration = (sliderLength * beatLength * repeatCount) / (sliderMultiplier * 100);
        return duration;
    }, []);

    const getCurrentTimingPoint = useCallback((time: number, timingPoints: TimingPoint[]): TimingPoint | null => {
        let currentTP: TimingPoint | null = null;

        for (const tp of timingPoints) {
            if (tp.time > time) break;
            if (tp.uninherited) {
                currentTP = tp;
            }
        }

        return currentTP;
    }, []);

    const parseOsuFile = useCallback((content: string, fileName: string): Difficulty | null => {
        const lines = content.split(/\r?\n/);

        let mode = 0;
        let version = "";
        let bpm = 120;
        let hpDrainRate = 5;
        let overallDifficulty = 5;
        let sliderMultiplier = 1.4;
        let leadIn = 0;

        let section = "";
        const hitObjects: HitObject[] = [];
        const timingPoints: TimingPoint[] = [];

        for (const line of lines) {
            const trimmed = line.trim();

            if (/^\[([A-Za-z]+)\]$/.test(trimmed)) {
                section = trimmed.toLowerCase();
                continue;
            }

            if (!trimmed || trimmed.startsWith("//")) continue;

            if (section === "[general]") {
                const [key, value] = trimmed.split(":").map(s => s.trim());
                if (key === "Mode") mode = parseInt(value);
                if (key === "AudioLeadIn") leadIn = parseInt(value);
            }

            if (section === "[metadata]") {
                const colonIndex = trimmed.indexOf(":");
                if (colonIndex === -1) continue;
                const key = trimmed.substring(0, colonIndex).trim();
                const value = trimmed.substring(colonIndex + 1).trim();
                if (key === "Version") version = value;
            }

            if (section === "[difficulty]") {
                const [key, value] = trimmed.split(":").map(s => s.trim());
                if (key === "HPDrainRate") hpDrainRate = parseFloat(value);
                if (key === "OverallDifficulty") overallDifficulty = parseFloat(value);
                if (key === "SliderMultiplier") sliderMultiplier = parseFloat(value);
            }

            if (section === "[timingpoints]") {
                const parts = trimmed.split(",");
                if (parts.length >= 2) {
                    const time = parseInt(parts[0]);
                    const beatLength = parseFloat(parts[1]);
                    const meter = parts.length >= 3 ? parseInt(parts[2]) : 4;
                    const uninherited = parts.length >= 7 ? parseInt(parts[6]) === 1 : beatLength > 0;

                    if (uninherited && beatLength > 0) {
                        timingPoints.push({ time, beatLength, meter, uninherited });
                    } else if (!uninherited && beatLength < 0) {
                        const svMultiplier = -100 / beatLength;
                        timingPoints.push({
                            time,
                            beatLength: 0,
                            meter,
                            uninherited: false,
                            svMultiplier
                        });
                    }
                }
            }

            if (section === "[hitobjects]") {
                const parts = trimmed.split(",");
                if (parts.length >= 5) {
                    const time = parseInt(parts[2]);
                    const type = parseInt(parts[3]);
                    const hitSound = parseInt(parts[4]);

                    const isCircle = (type & 1) !== 0;
                    const isSlider = (type & 2) !== 0;
                    const isSpinner = (type & 8) !== 0;

                    const hasWhistle = (hitSound & 2) !== 0;
                    const hasFinish = (hitSound & 4) !== 0;
                    const hasClap = (hitSound & 8) !== 0;

                    if (isCircle) {
                        const isKat = hasWhistle || hasClap;
                        const isBig = hasFinish;

                        let objType: HitObject["type"];
                        if (isKat && isBig) objType = "kat-big";
                        else if (isKat) objType = "kat";
                        else if (isBig) objType = "don-big";
                        else objType = "don";

                        hitObjects.push({ time, type: objType });
                    } else if (isSlider) {
                        const repeatCount = parts.length >= 7 ? parseInt(parts[6]) : 1;
                        const sliderLength = parts.length >= 8 ? parseFloat(parts[7]) : 100;

                        const currentTP = getCurrentTimingPoint(time, timingPoints);
                        const beatLength = currentTP ? currentTP.beatLength : 500;

                        const duration = calculateSliderDuration(sliderLength, repeatCount, sliderMultiplier, beatLength);
                        const endTime = time + Math.round(duration);

                        hitObjects.push({ time, type: "drumroll", endTime });
                    } else if (isSpinner) {
                        const endTime = parts.length >= 6 ? parseInt(parts[5]) : time + 1000;
                        hitObjects.push({ time, type: "spinner", endTime });
                    }
                }
            }
        }

        if (mode !== 1) return null;

        if (timingPoints.length > 0) {
            const firstUninherited = timingPoints.find(tp => tp.uninherited);
            if (firstUninherited) {
                bpm = Math.round(60000 / firstUninherited.beatLength);
            }
        }

        if (leadIn > 0 && audioLeadIn === 0) {
            setAudioLeadIn(leadIn);
        }

        return {
            fileName,
            version,
            hitObjects: hitObjects.sort((a, b) => a.time - b.time),
            timingPoints: timingPoints.sort((a, b) => a.time - b.time),
            bpm,
            hpDrainRate,
            overallDifficulty,
            sliderMultiplier,
        };
    }, [audioLeadIn, calculateSliderDuration, getCurrentTimingPoint]);

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
    }, [beatmapData, processDifficulty, isGameplayMode]);

    const cleanupAudio = useCallback(() => {
        if (audioSourceRef.current) {
            try {
                audioSourceRef.current.stop();
            } catch (e) {
                // エラーを握りつぶす
            }
            audioSourceRef.current.disconnect();
            audioSourceRef.current = null;
        }
        audioGainNodeRef.current = null;
        audioOffsetRef.current = 0;
        audioStartTimeRef.current = 0;
        setIsPlaying(false);
        setCurrentTime(0);
        lastHitTimeRef.current.clear();
        setDebugInfo([]);
        setHitAnimations([]);
    }, []);

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
                const songsFolder = localStorage.getItem("songsFolder");
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

                    const difficulty = parseOsuFile(content, file);
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
                const audioArrayBuffer = new Uint8Array(audioData).buffer;

                if (audioContextRef.current) {
                    const audioBuffer = await audioContextRef.current.decodeAudioData(audioArrayBuffer);
                    audioBufferRef.current = audioBuffer;
                    setDuration(audioBuffer.duration * 1000);
                }

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
    }, [selectedBeatmap, parseOsuFile, cleanupAudio]);

    useEffect(() => {
        lastHitTimeRef.current.clear();
    }, [selectedDifficulties]);

    const getCurrentTimeMs = useCallback((): number => {
        if (!audioContextRef.current || !isPlaying) {
            return audioOffsetRef.current;
        }

        const elapsedMs = (audioContextRef.current.currentTime - audioStartTimeRef.current) * 1000;
        return audioOffsetRef.current + elapsedMs;
    }, [isPlaying]);

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
    }, [isPlaying, beatmapData, selectedDifficulties, hitsoundVolume, playHitSound, addHitAnimation, debugMode, audioLeadIn, getCurrentTimeMs, duration, cleanupAudio, JUDGMENT_LINE_X]);

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

    const togglePlayPause = useCallback(() => {
        if (!audioContextRef.current || !audioBufferRef.current) return;

        if (isPlaying) {
            if (audioSourceRef.current) {
                audioSourceRef.current.stop();
                audioSourceRef.current.disconnect();
            }

            const elapsedMs = (audioContextRef.current.currentTime - audioStartTimeRef.current) * 1000;
            audioOffsetRef.current = audioOffsetRef.current + elapsedMs;

            audioSourceRef.current = null;
            audioGainNodeRef.current = null;
            setIsPlaying(false);
        } else {
            const source = audioContextRef.current.createBufferSource();
            const gainNode = audioContextRef.current.createGain();

            source.buffer = audioBufferRef.current;
            source.connect(gainNode);
            gainNode.connect(audioContextRef.current.destination);
            gainNode.gain.value = musicVolume;

            const startOffsetSec = audioOffsetRef.current / 1000;

            if (startOffsetSec < audioBufferRef.current.duration) {
                source.start(0, startOffsetSec);

                audioSourceRef.current = source;
                audioGainNodeRef.current = gainNode;
                audioStartTimeRef.current = audioContextRef.current.currentTime;

                setIsPlaying(true);
            }
        }
    }, [isPlaying, musicVolume]);

    const seekTo = useCallback((timeMs: number) => {
        if (!audioContextRef.current || !audioBufferRef.current) return;

        const wasPlaying = isPlaying;

        if (audioSourceRef.current) {
            audioSourceRef.current.stop();
            audioSourceRef.current.disconnect();
            audioSourceRef.current = null;
            audioGainNodeRef.current = null;
        }

        audioOffsetRef.current = Math.max(0, Math.min(timeMs, duration));
        setCurrentTime(audioOffsetRef.current);
        lastHitTimeRef.current.clear();

        if (wasPlaying) {
            const source = audioContextRef.current.createBufferSource();
            const gainNode = audioContextRef.current.createGain();

            source.buffer = audioBufferRef.current;
            source.connect(gainNode);
            gainNode.connect(audioContextRef.current.destination);
            gainNode.gain.value = musicVolume;

            const startOffsetSec = audioOffsetRef.current / 1000;

            if (startOffsetSec < audioBufferRef.current.duration) {
                source.start(0, startOffsetSec);

                audioSourceRef.current = source;
                audioGainNodeRef.current = gainNode;
                audioStartTimeRef.current = audioContextRef.current.currentTime;
            }
        }
    }, [isPlaying, musicVolume, duration]);

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
    }, [seekTo, isPlaying]);

    useEffect(() => {
        if (audioGainNodeRef.current) {
            audioGainNodeRef.current.gain.value = musicVolume;
        }
    }, [musicVolume]);

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

    const formatTime = (ms: number) => {
        const totalSeconds = Math.floor(ms / 1000);
        const mins = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;
        const millis = Math.floor(ms % 1000);
        return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}:${millis.toString().padStart(3, "0")}`;
    };

    const parseTimeInput = (input: string): number | null => {
        const match = input.match(/^(\d{1,2}):(\d{2}):(\d{3})$/);
        if (!match) return null;

        const mins = parseInt(match[1]);
        const secs = parseInt(match[2]);
        const millis = parseInt(match[3]);

        if (secs >= 60 || millis >= 1000) return null;

        return mins * 60 * 1000 + secs * 1000 + millis;
    };

    const handleTimeInputSubmit = () => {
        const timeMs = parseTimeInput(timeInput);
        if (timeMs !== null && timeMs >= 0 && timeMs <= duration) {
            seekTo(timeMs);
        }
        setIsEditingTime(false);
        setTimeInput("");
    };

    const getObjectX = useCallback((objectTime: number, gameplayStart: number) => {
        const total = objectTime - gameplayStart;
        if (total <= 0) {
            return JUDGMENT_LINE_X;
        }

        const progress = (currentTime - gameplayStart) / total;

        return JUDGMENT_LINE_X + VISIBLE_LENGTH * (1 - progress);
    }, [currentTime, JUDGMENT_LINE_X, VISIBLE_LENGTH]);

    const renderHitObject = useCallback((obj: HitObjectWithStart, difficulty: Difficulty, yOffset: number, index: number) => {
        const headX = getObjectX(obj.time, obj.gameplayStart);
        const size = obj.type.includes("big") ? 60 : 40;
        const centerY = yOffset + 50;

        const DRUMROLL_LEFT = JUDGMENT_LINE_X - 25;
        const RIGHT_LIMIT = PLAYFIELD_WIDTH + 100;

        if (obj.type === "drumroll" && obj.endTime) {
            const endGameplayStart = calculateGameplayStart(obj.endTime, difficulty.timingPoints);
            const tailX = getObjectX(obj.endTime, endGameplayStart);

            const leftX = Math.min(headX, tailX);
            const rightX = Math.max(headX, tailX);

            if (rightX < DRUMROLL_LEFT || leftX > RIGHT_LIMIT) return null;

            const displayX = Math.max(leftX, DRUMROLL_LEFT);
            const displayEndX = Math.min(rightX, RIGHT_LIMIT);
            const displayWidth = displayEndX - displayX;

            if (displayWidth <= 0) return null;

            return (
                <rect
                    key={`${index}-drumroll`}
                    x={displayX}
                    y={centerY - 20}
                    width={displayWidth}
                    height={40}
                    fill="#ffaa00"
                    stroke="#ffffff"
                    strokeWidth={2}
                    opacity={0.7}
                    rx={20}
                />
            );
        } else if (obj.type === "spinner" && obj.endTime) {
            const endGameplayStart = calculateGameplayStart(obj.endTime, difficulty.timingPoints);
            const tailX = getObjectX(obj.endTime, endGameplayStart);

            const leftX = Math.min(headX, tailX);
            const rightX = Math.max(headX, tailX);

            if (rightX < DRUMROLL_LEFT || leftX > RIGHT_LIMIT) return null;

            const displayX = Math.max(leftX, DRUMROLL_LEFT);
            const displayEndX = Math.min(rightX, RIGHT_LIMIT);
            const displayWidth = displayEndX - displayX;

            if (displayWidth <= 0) return null;

            return (
                <rect
                    key={`${index}-spinner`}
                    x={displayX}
                    y={centerY - 25}
                    width={displayWidth}
                    height={50}
                    fill="#8b5cf6"
                    stroke="#ffffff"
                    strokeWidth={2}
                    opacity={0.7}
                    rx={25}
                />
            );
        } else {
            if (headX < JUDGMENT_LINE_X || headX > PLAYFIELD_WIDTH + 100) return null;

            const color = obj.type.includes("don") ? "#ff5555" : "#5599ff";
            const isBig = obj.type.includes("big");

            return (
                <circle
                    key={`${index}-circle`}
                    cx={headX}
                    cy={centerY}
                    r={size / 2}
                    fill={color}
                    stroke="#ffffff"
                    strokeWidth={isBig ? 3 : 1.5}
                />
            );
        }
    }, [getObjectX, calculateObjectEndPosition, PLAYFIELD_WIDTH, JUDGMENT_LINE_X]);


    const renderSVLines = useCallback((difficulty: Difficulty, yOffset: number) => {
        if (isGameplayMode || !isViewSVLine) return null;

        const lines: JSX.Element[] = [];
        const centerY = yOffset + 50;
        const height = 70;

        const svPoints = difficulty.timingPoints.filter(tp => !tp.uninherited && tp.svMultiplier !== undefined);

        svPoints.forEach((svPoint, index) => {
            const gameplayStart = calculateGameplayStart(svPoint.time, difficulty.timingPoints);
            const x = getObjectX(svPoint.time, gameplayStart);

            if (x < -50 || x > PLAYFIELD_WIDTH + 50) return;

            const startY = centerY - height / 2;

            lines.push(
                <g key={`sv-${index}`}>
                    <line
                        x1={x}
                        y1={startY}
                        x2={x}
                        y2={startY + height}
                        stroke="#22c55e"
                        strokeWidth={2}
                        opacity={0.8}
                    />
                    <text
                        x={x + 2}
                        y={yOffset + 25}
                        fill="#fff"
                        fontSize="10"
                        fontWeight="semibold"
                    >
                        {svPoint.svMultiplier?.toFixed(2)}x
                    </text>
                </g>
            );
        });

        return lines;
    }, [currentTime, getObjectX, PLAYFIELD_WIDTH, isGameplayMode, calculateGameplayStart, isViewSVLine]);

    const renderTicks = useCallback((difficulty: Difficulty, yOffset: number) => {
        const ticks: JSX.Element[] = [];
        const centerY = yOffset + 50;

        const processedData = processedDifficultiesRef.current.get(difficulty.version);
        if (!processedData) return ticks;

        processedData.ticks.forEach((tick, tickIndex) => {
            const x = getObjectX(tick.time, tick.gameplayStart);

            if (x < -50 || x > PLAYFIELD_WIDTH + 50) return;

            let height = 10;
            let color = "#ffffff";
            let opacity = 0.3;
            let strokeWidth = 1;

            if (isGameplayMode) {
                switch (tick.type) {
                    case "measure":
                        height = 40;
                        color = "#ffffff";
                        opacity = 0.8;
                        strokeWidth = 2;
                        break;
                    default:
                        return;
                }
            } else {
                switch (tick.type) {
                    case "measure":
                        height = 40;
                        color = "#ffffff";
                        opacity = 0.8;
                        strokeWidth = 2;
                        break;
                    case "beat":
                        height = 30;
                        color = "#ffffff";
                        opacity = 0.5;
                        strokeWidth = 1.5;
                        break;
                    case "half":
                        height = 25;
                        color = "#ff5555";
                        opacity = 0.4;
                        strokeWidth = 1;
                        break;
                    case "quarter":
                        height = 15;
                        color = "#5599ff";
                        opacity = 0.3;
                        strokeWidth = 1;
                        break;
                }
            }

            const startY = centerY - height / 2;

            ticks.push(
                <line
                    key={`tick-${tickIndex}`}
                    x1={x}
                    y1={startY}
                    x2={x}
                    y2={startY + height}
                    stroke={color}
                    strokeWidth={strokeWidth}
                    opacity={opacity}
                />
            );
        });

        return ticks;
    }, [currentTime, getObjectX, PLAYFIELD_WIDTH, isGameplayMode]);

    if (!selectedBeatmap) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-center text-[#7b7b7b]">
                    <div className="text-4xl mb-3 opacity-30">🥁</div>
                    <p>Select a beatmap to preview</p>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-center text-[#7b7b7b]">
                    <FiRefreshCw className="w-8 h-8 animate-spin mx-auto mb-3" />
                    <p className="font-semibold mb-1">Loading beatmap...</p>
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
                            <div className="font-semibold mb-1">Failed to load beatmap</div>
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

    const filteredDifficulties = beatmapData.difficulties.filter(d =>
        selectedDifficulties.has(d.version)
    );

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
                                    {beatmapData.artist} // Mapped by {beatmapData.creator}
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
                        <div className="flex items-center justify-center mb-4">
                            <div
                                className="relative bg-[#101010] rounded-lg border border-[#2a2a2a] overflow-hidden"
                                style={{ width: `${PLAYFIELD_WIDTH}px`, height: `${filteredDifficulties.length * 100}px` }}
                            >
                                <svg width={PLAYFIELD_WIDTH} height={filteredDifficulties.length * 100}>
                                    {filteredDifficulties.map((diff, diffIndex) => {
                                        const yOffset = diffIndex * 100;
                                        const centerY = yOffset + 50;
                                        const processedData = processedDifficultiesRef.current.get(diff.version);
                                        const currentSV = isGameplayMode ? getCurrentSV(currentTime, diff.timingPoints) : null;
                                        const currentBPM = isGameplayMode ? getCurrentBPM(currentTime, diff.timingPoints) : null;

                                        return (
                                            <g key={diff.version}>
                                                <rect
                                                    x={0}
                                                    y={yOffset}
                                                    width={PLAYFIELD_WIDTH}
                                                    height={100}
                                                    fill={diffIndex % 2 === 0 ? "#0a0a0a" : "#151515"}
                                                />

                                                <text
                                                    x={10}
                                                    y={yOffset + 20}
                                                    fill="#7b7b7b"
                                                    fontSize="12"
                                                    fontWeight="bold"
                                                >
                                                    {diff.version}
                                                    {currentBPM !== null && currentSV !== null && (
                                                        <tspan fill="#2563eb" fontWeight="normal">
                                                            {` (${currentBPM} BPM, SV: ${currentSV.toFixed(2)})`}
                                                        </tspan>
                                                    )}
                                                </text>

                                                {renderTicks(diff, yOffset)}

                                                {processedData?.hitObjects
                                                    .map((obj, objIndex) =>
                                                        renderHitObject(obj, diff, yOffset, objIndex)
                                                    )}

                                                <circle
                                                    cx={JUDGMENT_LINE_X}
                                                    cy={centerY}
                                                    r={20}
                                                    fill="none"
                                                    stroke="#ffffff"
                                                    strokeWidth={2}
                                                    opacity={0.3}
                                                />

                                                {renderSVLines(diff, yOffset)}
                                            </g>
                                        );
                                    })}
                                </svg>

                                {hitAnimations.map(anim => {
                                    const age = Date.now() - anim.timestamp;
                                    const progress = age / 300;
                                    const offsetY = -progress * 50;
                                    const opacity = 1 - progress;

                                    return (
                                        <div
                                            key={anim.id}
                                            className="absolute pointer-events-none"
                                            style={{
                                                left: `${anim.x}px`,
                                                top: `${anim.y + offsetY}px`,
                                                transform: 'translate(-50%, -50%)',
                                                opacity,
                                            }}
                                        >
                                            <div
                                                className="rounded-full"
                                                style={{
                                                    width: '30px',
                                                    height: '30px',
                                                    backgroundColor: anim.color,
                                                    boxShadow: `0 0 20px ${anim.color}`,
                                                }}
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center gap-2">
                                <div className="relative group">
                                    <button
                                        onClick={togglePlayPause}
                                        className="flex items-center h-8 px-2 py-1.5 rounded-lg bg-[#2563eb] hover:bg-[#1f56cc] text-white shadow-lg transition-colors text-sm font-medium"
                                    >
                                        {isPlaying ? <FiPause className="w-4 h-4" /> : <FiPlay className="w-4 h-4" />}
                                    </button>
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                                        {isPlaying ? "Pause" : "Play"}
                                    </div>
                                </div>

                                <div className="relative group">
                                    <button
                                        onClick={restartFromBeginning}
                                        className="flex items-center h-8 px-2 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors text-sm font-medium"
                                    >
                                        <FiSkipBack className="w-4 h-4" />
                                    </button>
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                                        Restart
                                    </div>
                                </div>

                                <div className="relative group">
                                    <button
                                        onClick={togglePlayMode}
                                        className="flex items-center h-8 px-2 py-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-colors text-sm font-medium"
                                    >
                                        {isGameplayMode ? <FiHeadphones className="w-4 h-4" /> : <FiEdit className="w-4 h-4" />}
                                    </button>
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                                        {isGameplayMode ? "Edit mode" : "Gameplay mode"}
                                    </div>
                                </div>

                                <div className="relative group">
                                    <button
                                        onClick={toggleViewSVLine}
                                        className="flex items-center h-8 px-2 py-1.5 rounded-lg border border-green-500/30 bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors text-sm font-medium"
                                    >
                                        {isViewSVLine ? <FiEye className="w-4 h-4" /> : <FiEyeOff className="w-4 h-4" />}
                                    </button>
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                                        {isViewSVLine ? "Hide SV lines" : "Show SV lines"}
                                    </div>
                                </div>

                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setDebugMode(!debugMode)}
                                >
                                    {debugMode ? "Hide Debug" : "Show Debug"}
                                </Button>

                                <div className="flex items-center gap-2 text-sm font-mono ml-auto">
                                    {isEditingTime ? (
                                        <div className="flex items-center gap-1">
                                            <input
                                                type="text"
                                                value={timeInput}
                                                onChange={(e) => setTimeInput(e.target.value)}
                                                placeholder="00:00:000"
                                                className="w-28 px-2 py-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded text-[#e0e0e0] text-xs font-mono focus:outline-none focus:border-[#2563eb]"
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") handleTimeInputSubmit();
                                                    if (e.key === "Escape") {
                                                        setIsEditingTime(false);
                                                        setTimeInput("");
                                                    }
                                                }}
                                                autoFocus
                                            />
                                            <button
                                                onClick={handleTimeInputSubmit}
                                                className="p-1 text-green-400 hover:text-green-300"
                                            >
                                                <FiCheck className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setIsEditingTime(false);
                                                    setTimeInput("");
                                                }}
                                                className="p-1 text-red-400 hover:text-red-300"
                                            >
                                                <FiX className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => {
                                                setTimeInput(formatTime(currentTime));
                                                setIsEditingTime(true);
                                            }}
                                            className="flex items-center gap-1 text-[#7b7b7b] hover:text-[#e0e0e0] transition-colors"
                                        >
                                            <span>{formatTime(currentTime)}</span>
                                            <FiEdit2 className="w-3 h-3" />
                                        </button>
                                    )}
                                    <span className="text-[#7b7b7b]">/</span>
                                    <span className="text-[#7b7b7b]">{formatTime(duration)}</span>
                                </div>
                            </div>

                            {debugMode && (
                                <div className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg p-3">
                                    <div className="text-xs font-mono text-[#7b7b7b] space-y-1">
                                        <div className="text-[#e0e0e0] mb-2">Debug Info:</div>
                                        <div>Mode: {isGameplayMode ? "Gameplay" : "Edit"}</div>
                                        <div>Current Time: {currentTime.toFixed(1)}ms</div>
                                        <div>Raw Audio Time: {getCurrentTimeMs().toFixed(1)}ms</div>
                                        <div>AudioLeadIn: {audioLeadIn}ms</div>
                                        <div>Hit Window: ±{HIT_WINDOW}ms</div>
                                        {isGameplayMode && beatmapData && filteredDifficulties.length > 0 && (
                                            <>
                                                <div>Current BPM: {getCurrentBPM(currentTime, filteredDifficulties[0].timingPoints)}</div>
                                                <div>Current SV: {getCurrentSV(currentTime, filteredDifficulties[0].timingPoints).toFixed(2)}</div>
                                            </>
                                        )}
                                        <div className="border-t border-[#2a2a2a] pt-2 mt-2">
                                            <div className="text-[#e0e0e0] mb-1">Recent Hits:</div>
                                            {debugInfo.length === 0 ? (
                                                <div className="opacity-50">No hits yet</div>
                                            ) : (
                                                debugInfo.map((info, i) => (
                                                    <div key={i} className="opacity-80">{info}</div>
                                                ))
                                            )}
                                        </div>

                                        {beatmapData && (
                                            <div className="border-t border-[#2a2a2a] pt-2 mt-2">
                                                <div className="text-[#e0e0e0] mb-1">Next Notes:</div>
                                                {beatmapData.difficulties
                                                    .filter(d => selectedDifficulties.has(d.version))
                                                    .flatMap(diff =>
                                                        diff.hitObjects
                                                            .filter(obj => obj.time > currentTime && obj.time < currentTime + 3000)
                                                            .slice(0, 3)
                                                            .map(obj => ({
                                                                diff: diff.version,
                                                                time: obj.time,
                                                                type: obj.type,
                                                                endTime: obj.endTime,
                                                                timeUntil: obj.time - currentTime
                                                            }))
                                                    )
                                                    .sort((a, b) => a.time - b.time)
                                                    .slice(0, 5)
                                                    .map((note, i) => (
                                                        <div key={i} className="opacity-80">
                                                            {note.diff}: {note.type} in {note.timeUntil.toFixed(0)}ms
                                                            {note.endTime && ` (${note.time}-${note.endTime}, dur: ${note.endTime - note.time}ms)`}
                                                        </div>
                                                    ))
                                                }
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            <div className="relative">
                                <div
                                    className="h-2 bg-[#2a2a2a] rounded-full cursor-pointer relative overflow-visible"
                                    onClick={(e) => {
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        const x = e.clientX - rect.left;
                                        const percent = x / rect.width;
                                        seekTo(percent * duration);
                                    }}
                                >
                                    <div
                                        className="h-full bg-[#2563eb] rounded-full"
                                        style={{ width: `${(currentTime / duration) * 100}%` }}
                                    />
                                    <div
                                        className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg cursor-grab active:cursor-grabbing"
                                        style={{ left: `${(currentTime / duration) * 100}%`, transform: 'translate(-50%, -50%)' }}
                                        onMouseDown={(e) => {
                                            e.stopPropagation();
                                            const parent = e.currentTarget.parentElement;
                                            if (!parent) return;

                                            const handleMouseMove = (moveEvent: MouseEvent) => {
                                                const rect = parent.getBoundingClientRect();
                                                const x = moveEvent.clientX - rect.left;
                                                const percent = Math.max(0, Math.min(1, x / rect.width));
                                                seekTo(percent * duration);
                                            };

                                            const handleMouseUp = () => {
                                                document.removeEventListener('mousemove', handleMouseMove);
                                                document.removeEventListener('mouseup', handleMouseUp);
                                            };

                                            document.addEventListener('mousemove', handleMouseMove);
                                            document.addEventListener('mouseup', handleMouseUp);
                                        }}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <FiMusic className="w-4 h-4 text-[#7b7b7b]" />
                                        <span className="text-sm text-[#7b7b7b]">Music Volume</span>
                                        <span className="text-sm text-[#e0e0e0] ml-auto">{Math.round(musicVolume * 100)}%</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0"
                                        max="1"
                                        step="0.01"
                                        value={musicVolume}
                                        onChange={(e) => setMusicVolume(parseFloat(e.target.value))}
                                        className="w-full h-2 bg-[#2a2a2a] rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#2563eb]"
                                    />
                                </div>

                                <div>
                                    <div className="flex items-center gap-2 mb-2">
                                        {hitsoundVolume === 0 ? <FiVolumeX className="w-4 h-4 text-[#7b7b7b]" /> : <FiVolume2 className="w-4 h-4 text-[#7b7b7b]" />}
                                        <span className="text-sm text-[#7b7b7b]">Hitsound Volume</span>
                                        <span className="text-sm text-[#e0e0e0] ml-auto">{Math.round(hitsoundVolume * 100)}%</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0"
                                        max="1"
                                        step="0.01"
                                        value={hitsoundVolume}
                                        onChange={(e) => setHitsoundVolume(parseFloat(e.target.value))}
                                        className="w-full h-2 bg-[#2a2a2a] rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#2563eb]"
                                    />
                                </div>
                            </div>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
}