import { useState, useCallback } from "react";
import {
    FiPlay,
    FiPause,
    FiSkipBack,
    FiEdit2,
    FiCheck,
    FiX,
    FiEdit,
    FiHeadphones,
    FiEye,
    FiEyeOff,
    FiMusic,
    FiVolume2,
    FiVolumeX,
} from "react-icons/fi";

import { Button } from "../common/Button";
import { TooltipButton } from "../common/TooltipButton";
import { DebugPanel } from "./DebugPanel";

import type { Difficulty, ModState, BeatmapData } from "../../domain/osu/osuFileParser";
import type { LocaleKey } from "../../locale";

function formatTime(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    const millis = Math.floor(ms % 1000);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}:${millis.toString().padStart(3, "0")}`;
}

function parseTimeInput(input: string): number | null {
    const match = input.match(/^(\d{1,2}):(\d{2}):(\d{3})$/);
    if (!match) return null;

    const mins = parseInt(match[1]);
    const secs = parseInt(match[2]);
    const millis = parseInt(match[3]);

    if (secs >= 60 || millis >= 1000) return null;

    return mins * 60 * 1000 + secs * 1000 + millis;
}

export interface PreviewControlsProps {
    t: (key: LocaleKey, params?: Record<string, string | number>) => string;

    isPlaying: boolean;
    togglePlayPause: () => void;
    restartFromBeginning: () => void;
    currentTime: number;
    duration: number;
    seekTo: (timeMs: number) => void;

    // Mode toggles
    isGameplayMode: boolean;
    togglePlayMode: () => void;
    isViewSVLine: boolean;
    toggleViewSVLine: () => void;

    // Mods
    mods: ModState;
    toggleDT: () => void;
    toggleHR: () => void;

    // Debug
    debugMode: boolean;
    setDebugMode: (value: boolean | ((prev: boolean) => boolean)) => void;

    // Volume
    musicVolume: number;
    setMusicVolume: (value: number | ((prev: number) => number)) => void;
    hitsoundVolume: number;
    setHitsoundVolume: (value: number | ((prev: number) => number)) => void;

    // Debug panel passthrough
    getCurrentTimeMs: () => number;
    audioLeadIn: number;
    hitWindow: number;
    filteredDifficulties: Difficulty[];
    getCurrentBPM: (time: number, timingPoints: Difficulty["timingPoints"]) => number;
    getCurrentSV: (time: number, timingPoints: Difficulty["timingPoints"]) => number;
    debugInfo: string[];
    beatmapData: BeatmapData | null;
}

export function PreviewControls({
    t,
    isPlaying,
    togglePlayPause,
    restartFromBeginning,
    currentTime,
    duration,
    seekTo,
    isGameplayMode,
    togglePlayMode,
    isViewSVLine,
    toggleViewSVLine,
    mods,
    toggleDT,
    toggleHR,
    debugMode,
    setDebugMode,
    musicVolume,
    setMusicVolume,
    hitsoundVolume,
    setHitsoundVolume,
    getCurrentTimeMs,
    audioLeadIn,
    hitWindow,
    filteredDifficulties,
    getCurrentBPM,
    getCurrentSV,
    debugInfo,
    beatmapData,
}: PreviewControlsProps) {
    const [isEditingTime, setIsEditingTime] = useState(false);
    const [timeInput, setTimeInput] = useState("");

    const handleTimeInputSubmit = useCallback(() => {
        const timeMs = parseTimeInput(timeInput);
        if (timeMs !== null && timeMs >= 0 && timeMs <= duration) {
            seekTo(timeMs);
        }
        setIsEditingTime(false);
        setTimeInput("");
    }, [timeInput, duration, seekTo]);

    return (
        <div className="space-y-4">
            {/* Controls bar */}
            <div className="flex items-center gap-2">
                <TooltipButton
                    onClick={togglePlayPause}
                    className="bg-[#2563eb] hover:bg-[#1f56cc] text-white shadow-lg transition-colors"
                    tooltip={isPlaying ? t("preview.controls.pause") : t("preview.controls.play")}
                >
                    {isPlaying ? <FiPause className="w-4 h-4" /> : <FiPlay className="w-4 h-4" />}
                </TooltipButton>

                <TooltipButton
                    onClick={restartFromBeginning}
                    className="border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                    tooltip={t("preview.controls.restart")}
                >
                    <FiSkipBack className="w-4 h-4" />
                </TooltipButton>

                <TooltipButton
                    onClick={togglePlayMode}
                    className="border border-purple-500/30 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-colors"
                    tooltip={isGameplayMode ? t("preview.controls.editMode") : t("preview.controls.gameplayMode")}
                >
                    {isGameplayMode ? <FiHeadphones className="w-4 h-4" /> : <FiEdit className="w-4 h-4" />}
                </TooltipButton>

                <TooltipButton
                    onClick={toggleViewSVLine}
                    className="border border-green-500/30 bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors"
                    tooltip={isViewSVLine ? t("preview.controls.hideSvLines") : t("preview.controls.showSvLines")}
                >
                    {isViewSVLine ? <FiEye className="w-4 h-4" /> : <FiEyeOff className="w-4 h-4" />}
                </TooltipButton>

                <TooltipButton
                    onClick={toggleDT}
                    className={`border font-bold ${mods.isDT
                        ? "border-[#2563eb] bg-[#2563eb]/20 text-white"
                        : "border-[#2a2a2a] bg-[#171717] text-[#7b7b7b] hover:border-[#3a3a3a]"
                        }`}
                    tooltip={mods.isDT ? t("preview.controls.disableDt") : t("preview.controls.enableDt")}
                >
                    DT
                </TooltipButton>

                <TooltipButton
                    onClick={toggleHR}
                    className={`border font-bold ${mods.isHR
                        ? "border-red-500 bg-red-500/20 text-white"
                        : "border-[#2a2a2a] bg-[#171717] text-[#7b7b7b] hover:border-[#3a3a3a]"
                        }`}
                    tooltip={mods.isHR ? t("preview.controls.disableHr") : t("preview.controls.enableHr")}
                >
                    HR
                </TooltipButton>

                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDebugMode(!debugMode)}
                >
                    {debugMode ? t("preview.controls.hideDebug") : t("preview.controls.showDebug")}
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

            {/* Debug panel */}
            {debugMode && (
                <DebugPanel
                    t={t}
                    isGameplayMode={isGameplayMode}
                    mods={mods}
                    currentTime={currentTime}
                    getCurrentTimeMs={getCurrentTimeMs}
                    audioLeadIn={audioLeadIn}
                    hitWindow={hitWindow}
                    filteredDifficulties={filteredDifficulties}
                    getCurrentBPM={getCurrentBPM}
                    getCurrentSV={getCurrentSV}
                    debugInfo={debugInfo}
                    beatmapData={beatmapData}
                />
            )}

            {/* Seek bar */}
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

            {/* Volume sliders */}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <FiMusic className="w-4 h-4 text-[#7b7b7b]" />
                        <span className="text-sm text-[#7b7b7b]">{t("preview.volume.music")}</span>
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
                        <span className="text-sm text-[#7b7b7b]">{t("preview.volume.hitsound")}</span>
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
    );
}
