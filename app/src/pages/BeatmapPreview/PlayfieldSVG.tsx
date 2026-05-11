import { useCallback, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { TaikoDifficulty, TaikoHitObjectWithStart } from "../../domain/osu/taikoMapper";
import type { TimingLine } from "../../types/osu";
import type { Tick } from "../../domain/osu/tickGenerator";

interface HitAnimation { id: number; x: number; y: number; color: string; timestamp: number; }

const PLAYFIELD_WIDTH = 800;
const JUDGMENT_LINE_X = 100;
const VISIBLE_LENGTH = PLAYFIELD_WIDTH - JUDGMENT_LINE_X;
const JUDGMENT_CIRCLE_RADIUS = 20;
const HIT_CIRCLE_SIZE = 30;
const HIT_ANIMATION_DURATION_MS = 300;
const HIT_ANIMATION_FLOAT_DISTANCE = 50;
const APPROACH_TIME = 2000;

function formatTimestamp(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    const millis = Math.floor(ms % 1000);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}:${millis.toString().padStart(3, "0")}`;
}

export interface PlayfieldSVGProps {
    filteredDifficulties: TaikoDifficulty[];
    processedDifficulties: Map<string, { hitObjects: TaikoHitObjectWithStart[]; ticks: Tick[] }>;
    currentSVBPMMap: Map<string, { sv: number; bpm: number }>;
    currentTime: number;
    isGameplayMode: boolean;
    isViewSVLine: boolean;
    hitAnimations: HitAnimation[];
    calculateGameplayStart: (objectTime: number, timingLines: TimingLine[]) => number;
    isPlaying: boolean;
    seekTo: (timeMs: number) => void;
    duration: number;
}

export function PlayfieldSVG({
    filteredDifficulties,
    processedDifficulties,
    currentSVBPMMap,
    currentTime,
    isGameplayMode,
    isViewSVLine,
    hitAnimations,
    calculateGameplayStart,
    isPlaying,
    seekTo,
    duration,
}: PlayfieldSVGProps) {

    const [hoveredNote, setHoveredNote] = useState<{ time: number; x: number; y: number } | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [feedbackFlashes, setFeedbackFlashes] = useState<Array<{
        id: number; x: number; y: number; text: string; color: string;
    }>>([]);
    const flashIdRef = useRef(0);

    const addFeedback = useCallback((x: number, y: number, text: string, color: string) => {
        const id = flashIdRef.current++;
        setFeedbackFlashes(prev => [...prev, { id, x, y, text, color }]);
        setTimeout(() => setFeedbackFlashes(prev => prev.filter(f => f.id !== id)), 700);
    }, []);

    const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (isPlaying) return;
        e.preventDefault();
        setHoveredNote(null);
        setIsDragging(true);

        const startX = e.clientX;
        const startTime = currentTime;
        const msPerPx = APPROACH_TIME / VISIBLE_LENGTH;

        const handleMouseMove = (moveEvent: MouseEvent) => {
            const deltaX = moveEvent.clientX - startX;
            const newTime = Math.max(0, Math.min(duration, startTime - deltaX * msPerPx));
            seekTo(newTime);
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
        };

        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
    }, [isPlaying, currentTime, duration, seekTo]);

    const getObjectX = useCallback((objectTime: number, gameplayStart: number) => {
        const total = objectTime - gameplayStart;
        if (total <= 0) {
            return JUDGMENT_LINE_X;
        }
        const progress = (currentTime - gameplayStart) / total;
        return JUDGMENT_LINE_X + VISIBLE_LENGTH * (1 - progress);
    }, [currentTime]);

    const handleNoteMouseEnter = useCallback((time: number, x: number, y: number) => {
        if (!isPlaying && !isDragging) {
            setHoveredNote({ time, x, y });
        }
    }, [isPlaying, isDragging]);

    const handleNoteClick = useCallback((e: React.MouseEvent, time: number, x: number, y: number) => {
        if (!isPlaying && e.ctrlKey) {
            e.preventDefault();
            openUrl(`osu://edit/${formatTimestamp(time)}`).catch(console.error);
            addFeedback(x, y - 24, "Opened!", "#60a5fa");
        }
    }, [isPlaying, addFeedback]);

    const handleNoteContextMenu = useCallback((e: React.MouseEvent, time: number, x: number, y: number) => {
        if (!isPlaying && e.ctrlKey) {
            e.preventDefault();
            navigator.clipboard.writeText(`${formatTimestamp(time)} - `).catch(console.error);
            addFeedback(x, y - 24, "Copied!", "#4ade80");
        }
    }, [isPlaying, addFeedback]);

    const renderLongObject = useCallback((
        obj: TaikoHitObjectWithStart,
        difficulty: TaikoDifficulty,
        headX: number,
        centerY: number,
        index: number,
    ) => {
        const isDrumroll = obj.type === "drumroll";
        const halfHeight = isDrumroll ? 20 : 25;
        const fill = isDrumroll ? "#ffaa00" : "#8b5cf6";
        const DRUMROLL_LEFT = JUDGMENT_LINE_X - 25;
        const RIGHT_LIMIT = PLAYFIELD_WIDTH + 100;

        const endGameplayStart = calculateGameplayStart(obj.endTime!, difficulty.timingLines);
        const tailX = getObjectX(obj.endTime!, endGameplayStart);
        const leftX = Math.min(headX, tailX);
        const rightX = Math.max(headX, tailX);

        if (rightX < DRUMROLL_LEFT || leftX > RIGHT_LIMIT) return null;

        const displayX = Math.max(leftX, DRUMROLL_LEFT);
        const displayWidth = Math.min(rightX, RIGHT_LIMIT) - displayX;
        if (displayWidth <= 0) return null;

        const topY = centerY - halfHeight;
        return (
            <rect
                key={`${index}-${obj.type}`}
                x={displayX}
                y={topY}
                width={displayWidth}
                height={halfHeight * 2}
                fill={fill}
                stroke="#ffffff"
                strokeWidth={2}
                opacity={0.7}
                rx={halfHeight}
                style={{ cursor: !isPlaying ? "pointer" : "default" }}
                onMouseEnter={() => handleNoteMouseEnter(obj.time, headX, topY)}
                onMouseLeave={() => setHoveredNote(null)}
                onClick={(e) => handleNoteClick(e, obj.time, headX, topY)}
                onContextMenu={(e) => handleNoteContextMenu(e, obj.time, headX, topY)}
            />
        );
    }, [getObjectX, calculateGameplayStart, isPlaying, handleNoteMouseEnter, handleNoteClick, handleNoteContextMenu]);

    const renderHitObject = useCallback((obj: TaikoHitObjectWithStart, difficulty: TaikoDifficulty, yOffset: number, index: number) => {
        const headX = getObjectX(obj.time, obj.gameplayStart);
        const centerY = yOffset + 50;

        if ((obj.type === "drumroll" || obj.type === "spinner") && obj.endTime)
            return renderLongObject(obj, difficulty, headX, centerY, index);

        if (headX < JUDGMENT_LINE_X || headX > PLAYFIELD_WIDTH + 100) return null;

        const color = obj.type.includes("don") ? "#ff5555" : "#5599ff";
        const isBig = obj.type.includes("big");
        const size = isBig ? 60 : 40;

        return (
            <circle
                key={`${index}-circle`}
                cx={headX}
                cy={centerY}
                r={size / 2}
                fill={color}
                stroke="#ffffff"
                strokeWidth={isBig ? 3 : 1.5}
                style={{ cursor: !isPlaying ? "pointer" : "default" }}
                onMouseEnter={() => handleNoteMouseEnter(obj.time, headX, centerY)}
                onMouseLeave={() => setHoveredNote(null)}
                onClick={(e) => handleNoteClick(e, obj.time, headX, centerY)}
                onContextMenu={(e) => handleNoteContextMenu(e, obj.time, headX, centerY)}
            />
        );
    }, [getObjectX, renderLongObject, isPlaying, handleNoteMouseEnter, handleNoteClick, handleNoteContextMenu]);

    const renderSVLines = useCallback((difficulty: TaikoDifficulty, yOffset: number) => {
        if (isGameplayMode || !isViewSVLine) return null;

        const lines: JSX.Element[] = [];
        const centerY = yOffset + 50;
        const height = 70;

        const svPoints = difficulty.timingLines.filter(tp => !tp.uninherited);

        svPoints.forEach((svPoint, index) => {
            const gameplayStart = calculateGameplayStart(svPoint.offset, difficulty.timingLines);
            const x = getObjectX(svPoint.offset, gameplayStart);

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
                        {svPoint.svMult?.toFixed(2)}x
                    </text>
                </g>
            );
        });

        return lines;
    }, [getObjectX, isGameplayMode, calculateGameplayStart, isViewSVLine]);

    const renderTicks = useCallback((difficulty: TaikoDifficulty, yOffset: number) => {
        const ticks: JSX.Element[] = [];
        const centerY = yOffset + 50;

        const processedData = processedDifficulties.get(difficulty.version);
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
    }, [getObjectX, processedDifficulties, isGameplayMode]);

    const playfieldHeight = filteredDifficulties.length * 100;

    return (
        <div className="flex items-center justify-center mb-4">
            <div
                className="relative bg-surface-input rounded-lg border border-border-muted overflow-hidden"
                style={{
                    width: `${PLAYFIELD_WIDTH}px`,
                    height: `${playfieldHeight}px`,
                    cursor: isPlaying ? "default" : isDragging ? "grabbing" : "grab",
                    userSelect: "none",
                }}
                onMouseDown={handleMouseDown}
            >
                <svg width={PLAYFIELD_WIDTH} height={playfieldHeight}>
                    {filteredDifficulties.map((diff, diffIndex) => {
                        const yOffset = diffIndex * 100;
                        const centerY = yOffset + 50;
                        const processedData = processedDifficulties.get(diff.version);
                        const svBpm = currentSVBPMMap.get(diff.version);
                        const currentSV = svBpm?.sv ?? null;
                        const currentBPM = svBpm?.bpm ?? null;

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
                                    r={JUDGMENT_CIRCLE_RADIUS}
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
                    const progress = age / HIT_ANIMATION_DURATION_MS;
                    const offsetY = -progress * HIT_ANIMATION_FLOAT_DISTANCE;
                    const opacity = 1 - progress;

                    return (
                        <div
                            key={anim.id}
                            className="absolute pointer-events-none"
                            style={{
                                left: `${anim.x}px`,
                                top: `${anim.y + offsetY}px`,
                                transform: "translate(-50%, -50%)",
                                opacity,
                            }}
                        >
                            <div
                                className="rounded-full"
                                style={{
                                    width: `${HIT_CIRCLE_SIZE}px`,
                                    height: `${HIT_CIRCLE_SIZE}px`,
                                    backgroundColor: anim.color,
                                    boxShadow: `0 0 20px ${anim.color}`,
                                }}
                            />
                        </div>
                    );
                })}

                {hoveredNote && !isPlaying && (
                    <div
                        key={hoveredNote.time}
                        className="tooltip-in absolute pointer-events-none z-10 px-2 py-1.5 rounded-md bg-zinc-900/95 border border-zinc-600 text-xs text-zinc-200 whitespace-nowrap shadow-lg"
                        style={{
                            left: `${hoveredNote.x}px`,
                            top: `${hoveredNote.y - 52}px`,
                            transform: "translateX(-50%)",
                        }}
                    >
                        <div className="font-mono text-center text-zinc-100 mb-0.5">{formatTimestamp(hoveredNote.time)}</div>
                        <div className="text-zinc-500 text-[10px] text-center leading-tight">
                            Ctrl+Click · Ctrl+R-Click to copy
                        </div>
                    </div>
                )}

                {feedbackFlashes.map(flash => (
                    <div
                        key={flash.id}
                        className="feedback-flash absolute pointer-events-none z-20 text-xs font-bold whitespace-nowrap"
                        style={{
                            left: `${flash.x}px`,
                            top: `${flash.y}px`,
                            color: flash.color,
                            textShadow: `0 0 8px ${flash.color}80`,
                            transform: "translateX(-50%)",
                        }}
                    >
                        {flash.text}
                    </div>
                ))}
            </div>
        </div>
    );
}
