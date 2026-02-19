import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../hooks/i18nContext";

type Props = {
    audioBuffer: AudioBuffer | null;
    bpm: number;
    offsetMs: number;
    isPlaying: boolean;
    getCurrentPlayheadMs: () => number;
    numBeats?: number;
};

type BeatRow = {
    beatIndex: number;
    beatStartMs: number;
};

const BEFORE_MS = 100;
const AFTER_MS = 100;

function getBeatWaveform(
    audioBuffer: AudioBuffer,
    beatStartMs: number,
    beforeMs = BEFORE_MS,
    afterMs = AFTER_MS,
): Float32Array {
    const sr = audioBuffer.sampleRate;
    const ch0 = audioBuffer.getChannelData(0);
    const ch1 = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : null;

    const startMs = Math.max(0, beatStartMs - beforeMs);
    const endMs = Math.min(audioBuffer.duration * 1000, beatStartMs + afterMs);
    const startSample = Math.max(0, Math.floor((startMs / 1000) * sr));
    const endSample = Math.min(ch0.length, Math.ceil((endMs / 1000) * sr));
    const length = Math.max(0, endSample - startSample);

    const out = new Float32Array(length);
    for (let i = 0; i < length; i++) {
        const s0 = ch0[startSample + i] || 0;
        out[i] = ch1 ? (s0 + (ch1[startSample + i] || 0)) * 0.5 : s0;
    }
    return out;
}

export function BeatWaveformList({
    audioBuffer,
    bpm,
    offsetMs,
    isPlaying,
    getCurrentPlayheadMs,
    numBeats = 6,
}: Props) {
    const { t } = useI18n();
    const [playheadMs, setPlayheadMs] = useState(0);
    const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);

    useEffect(() => {
        if (!isPlaying) return;
        let raf = 0;
        const tick = () => {
            setPlayheadMs(getCurrentPlayheadMs());
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [isPlaying, getCurrentPlayheadMs]);

    const beatRows = useMemo<BeatRow[]>(() => {
        if (bpm <= 0) return [];
        const beatMs = 60000 / bpm;
        const current = isPlaying ? playheadMs : Math.max(0, offsetMs);
        const currentIndex = Math.max(0, Math.floor((current - offsetMs) / beatMs));
        const startIndex = Math.max(0, currentIndex);

        return Array.from({ length: numBeats }, (_, i) => {
            const beatIndex = startIndex + i;
            return {
                beatIndex,
                beatStartMs: offsetMs + beatIndex * beatMs,
            };
        });
    }, [bpm, isPlaying, playheadMs, offsetMs, numBeats]);

    useEffect(() => {
        for (let i = 0; i < beatRows.length; i++) {
            const row = beatRows[i];
            const canvas = canvasRefs.current[i];
            if (!canvas) continue;

            const dpr = window.devicePixelRatio || 1;
            const cssW = canvas.clientWidth || 220;
            const cssH = canvas.clientHeight || 36;
            canvas.width = Math.floor(cssW * dpr);
            canvas.height = Math.floor(cssH * dpr);

            const ctx = canvas.getContext("2d");
            if (!ctx) continue;
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.scale(dpr, dpr);

            const beatMs = 60000 / Math.max(1, bpm);
            const active = isPlaying
                ? playheadMs >= row.beatStartMs && playheadMs < row.beatStartMs + beatMs
                : row.beatIndex === 0;

            ctx.fillStyle = active ? "#22c55e22" : "#18181b";
            ctx.fillRect(0, 0, cssW, cssH);

            ctx.strokeStyle = "rgba(255,255,255,0.08)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, cssH * 0.5 + 0.5);
            ctx.lineTo(cssW, cssH * 0.5 + 0.5);
            ctx.stroke();

            const centerX = cssW / 2;
            ctx.strokeStyle = active ? "#ef4444" : "#71717a";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(centerX + 0.5, 0);
            ctx.lineTo(centerX + 0.5, cssH);
            ctx.stroke();

            if (!audioBuffer) continue;

            const data = getBeatWaveform(audioBuffer, row.beatStartMs);
            if (data.length <= 1) continue;

            const waveColor = active ? "#22c55e" : "#3cc4ff";
            ctx.strokeStyle = waveColor;
            ctx.lineWidth = 1;

            let peak = 0;
            for (let k = 0; k < data.length; k++) {
                const abs = Math.abs(data[k]);
                if (abs > peak) peak = abs;
            }
            const gain = peak > 0.001 ? Math.min(8, 0.9 / peak) : 1;

            const step = Math.max(1, Math.floor(data.length / cssW));
            for (let x = 0; x < cssW; x++) {
                const from = x * step;
                const to = Math.min(data.length, from + step);
                let min = 1;
                let max = -1;
                for (let k = from; k < to; k++) {
                    const v = Math.max(-1, Math.min(1, data[k] * gain));
                    if (v < min) min = v;
                    if (v > max) max = v;
                }

                const y1 = cssH * 0.5 - max * (cssH * 0.42);
                const y2 = cssH * 0.5 - min * (cssH * 0.42);
                const h = Math.max(1.2, y2 - y1);
                ctx.fillStyle = waveColor;
                ctx.fillRect(x, y1, 1, h);
            }
        }
    }, [audioBuffer, beatRows, bpm, isPlaying, playheadMs]);

    return (
        <div className="flex h-full min-w-220 flex-1 flex-col gap-1.5 rounded-lg border border-border-muted bg-surface-base-soft p-2">
            <div className="px-1 text-xs opacity-80">{t("calibrator.beatWaveforms")}</div>
            {beatRows.map((row, i) => {
                const beatInMeasure = (row.beatIndex % 4) + 1;
                const beatMs = 60000 / Math.max(1, bpm || 1);
                const active = isPlaying
                    ? playheadMs >= row.beatStartMs && playheadMs < row.beatStartMs + beatMs
                    : row.beatIndex === 0;
                return (
                    <div
                        key={row.beatIndex}
                        className={`flex items-center gap-2 rounded-md border px-2 py-1 ${active
                            ? "border-green-500/40 bg-green-500/10"
                            : "border-border-muted bg-surface-panel"
                            }`}
                    >
                        <div className="w-11 text-xs font-mono opacity-85">
                            {row.beatIndex + 1} ({beatInMeasure}/4)
                        </div>
                        <canvas
                            ref={(el) => {
                                canvasRefs.current[i] = el;
                            }}
                            className="h-9 w-full rounded-sm"
                        />
                    </div>
                );
            })}
        </div>
    );
}
