import { useCallback } from "react";
import type { TaikoDifficulty, TaikoHitObjectWithStart } from "../../domain/osu/taikoMapper";
import type { OsuTimingPoint } from "../../domain/osu/types";
import type { Tick } from "../../domain/osu/tickGenerator";

interface HitAnimation { id: number; x: number; y: number; color: string; timestamp: number; }

const PLAYFIELD_WIDTH = 800;
const JUDGMENT_LINE_X = 100;
const VISIBLE_LENGTH = PLAYFIELD_WIDTH - JUDGMENT_LINE_X;
const JUDGMENT_CIRCLE_RADIUS = 20;
const HIT_CIRCLE_SIZE = 30;
const HIT_ANIMATION_DURATION_MS = 300;
const HIT_ANIMATION_FLOAT_DISTANCE = 50;

export interface PlayfieldSVGProps {
    filteredDifficulties: TaikoDifficulty[];
    processedDifficulties: Map<string, { hitObjects: TaikoHitObjectWithStart[]; ticks: Tick[] }>;
    currentSVBPMMap: Map<string, { sv: number; bpm: number }>;
    currentTime: number;
    isGameplayMode: boolean;
    isViewSVLine: boolean;
    hitAnimations: HitAnimation[];
    calculateGameplayStart: (objectTime: number, timingPoints: OsuTimingPoint[]) => number;
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
}: PlayfieldSVGProps) {

    const getObjectX = useCallback((objectTime: number, gameplayStart: number) => {
        const total = objectTime - gameplayStart;
        if (total <= 0) {
            return JUDGMENT_LINE_X;
        }
        const progress = (currentTime - gameplayStart) / total;
        return JUDGMENT_LINE_X + VISIBLE_LENGTH * (1 - progress);
    }, [currentTime]);

    const renderHitObject = useCallback((obj: TaikoHitObjectWithStart, difficulty: TaikoDifficulty, yOffset: number, index: number) => {
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
    }, [getObjectX, calculateGameplayStart]);

    const renderSVLines = useCallback((difficulty: TaikoDifficulty, yOffset: number) => {
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

    return (
        <div className="flex items-center justify-center mb-4">
            <div
                className="relative bg-surface-input rounded-lg border border-border-muted overflow-hidden"
                style={{ width: `${PLAYFIELD_WIDTH}px`, height: `${filteredDifficulties.length * 100}px` }}
            >
                <svg width={PLAYFIELD_WIDTH} height={filteredDifficulties.length * 100}>
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
                                transform: 'translate(-50%, -50%)',
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
            </div>
        </div>
    );
}
