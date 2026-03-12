import { useCallback, useEffect, useRef, useMemo, useState } from "react";

export interface UseWaveformRendererOptions {
    audioBuffer: AudioBuffer | null;
    bpm: number;
    offsetMs: number;
    isPlaying: boolean;
    getCurrentPlayheadMs: () => number;
}

export interface UseWaveformRendererReturn {
    containerRef: React.RefObject<HTMLDivElement>;
    canvasRef: React.RefObject<HTMLCanvasElement>;
    overlayRef: React.RefObject<HTMLCanvasElement>;
    zoom: number;
    viewStartMs: number;
    durationMs: number;
    visibleRangeMs: number;
    setViewStartMs: React.Dispatch<React.SetStateAction<number>>;
    zoomAt: (factor: number) => void;
    onWheel: (e: React.WheelEvent) => void;
    onMouseDown: (e: React.MouseEvent) => void;
    onMouseMove: (e: React.MouseEvent) => void;
    onMouseUp: () => void;
    onMouseDownClick: () => void;
    onMouseMoveCancelClick: () => void;
    onClickSeek: (e: React.MouseEvent) => void;
    setZoom: React.Dispatch<React.SetStateAction<number>>;
}

export function useWaveformRenderer(
    {
        audioBuffer,
        bpm,
        offsetMs,
        isPlaying,
        getCurrentPlayheadMs,
    }: UseWaveformRendererOptions,
    onSeekMs: (ms: number) => void,
): UseWaveformRendererReturn {
    const containerRef = useRef<HTMLDivElement>(null!);
    const canvasRef = useRef<HTMLCanvasElement>(null!);
    const overlayRef = useRef<HTMLCanvasElement>(null!);
    const rafRef = useRef<number | null>(null);
    const resizeObs = useRef<ResizeObserver | null>(null);

    const [zoom, setZoomState] = useState(1);
    const [viewStartMs, setViewStartMs] = useState(0);

    const durationMs = useMemo(
        () => (audioBuffer ? audioBuffer.duration * 1000 : 0),
        [audioBuffer],
    );
    const visibleRangeMs = useMemo(
        () => (durationMs ? Math.max(200, durationMs / zoom) : 0),
        [durationMs, zoom],
    );

    const clampViewStart = useCallback(
        (v: number) => {
            if (!durationMs) return 0;
            const maxStart = Math.max(0, durationMs - visibleRangeMs);
            return Math.min(Math.max(0, v), maxStart);
        },
        [durationMs, visibleRangeMs],
    );

    const drawWave = useCallback(() => {
        const cnv = canvasRef.current, ov = overlayRef.current, parent = containerRef.current;
        if (!cnv || !ov || !parent) return;

        const dpr = window.devicePixelRatio || 1;
        const w = parent.clientWidth, h = parent.clientHeight;

        cnv.width = Math.floor(w * dpr); cnv.height = Math.floor(h * dpr);
        cnv.style.width = `${w}px`; cnv.style.height = `${h}px`;
        ov.width = Math.floor(w * dpr); ov.height = Math.floor(h * dpr);
        ov.style.width = `${w}px`; ov.style.height = `${h}px`;

        const ctx = cnv.getContext("2d")!;
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.scale(dpr, dpr); ctx.clearRect(0, 0, w, h);
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, "#141414"); grad.addColorStop(1, "#1b1b1b");
        ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);

        if (!audioBuffer || durationMs <= 0) return;

        const headForCenter = getCurrentPlayheadMs();
        const clampedStart = clampViewStart(viewStartMs);
        const clampedEnd = Math.min(durationMs, clampedStart + visibleRangeMs);

        let vStart: number;
        let vEnd: number;

        if (isPlaying) {
            vStart = headForCenter - visibleRangeMs / 2;
            vEnd = vStart + visibleRangeMs;
        } else {
            const headOutsideView = headForCenter < clampedStart || headForCenter > clampedEnd;
            const baseStart = headOutsideView
                ? clampViewStart(headForCenter - visibleRangeMs / 2)
                : clampedStart;
            vStart = baseStart;
            vEnd = Math.min(durationMs, vStart + visibleRangeMs);
        }
        const sr = audioBuffer.sampleRate;
        const ch0 = audioBuffer.getChannelData(0);
        const ch1 = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : null;

        const msToSample = (ms: number) => Math.max(0, Math.min(ch0.length - 1, Math.floor((ms / 1000) * sr)));
        const xToMs = (x: number) => vStart + (x / w) * (vEnd - vStart);

        const mid = Math.floor(h / 2);
        ctx.fillStyle = "#3cc4ff22";
        const samplesPerPixel = Math.max(1, Math.floor((msToSample(vEnd) - msToSample(vStart)) / w));
        const step = Math.max(1, Math.floor(samplesPerPixel / 50));
        for (let x = 0; x < w; x++) {
            const sA = msToSample(xToMs(x)), sB = msToSample(xToMs(x + 1));
            let maxVal = -Infinity, minVal = Infinity;
            for (let s = sA; s <= sB; s += step) {
                let v = ch0[s]; if (ch1) v = (v + ch1[s]) * 0.5;
                if (v > maxVal) maxVal = v; if (v < minVal) minVal = v;
            }
            const y1 = mid - maxVal * (h * 0.45), y2 = mid - minVal * (h * 0.45);
            ctx.fillRect(x, y1, 1, Math.max(1, y2 - y1));
        }

        const gtx = ov.getContext("2d")!;
        gtx.setTransform(1, 0, 0, 1, 0, 0); gtx.scale(dpr, dpr); gtx.clearRect(0, 0, w, h);

        if (bpm > 0) {
            const beatMs = 60000 / bpm;
            for (let t = offsetMs; t <= vEnd; t += beatMs) {
                if (t < vStart) continue;
                const x = ((t - vStart) / (vEnd - vStart)) * w + 0.5;
                const idx = Math.round((t - offsetMs) / beatMs);
                const isMeasureStart = idx % 4 === 0;
                gtx.strokeStyle = isMeasureStart
                    ? "rgba(239, 68, 68, 0.6)"
                    : "rgba(255, 255, 255, 0.3)";
                gtx.lineWidth = isMeasureStart ? 2 : 1;
                gtx.beginPath(); gtx.moveTo(x, 0); gtx.lineTo(x, h); gtx.stroke();

                if (isMeasureStart && zoom > 3) {
                    const measureNum = Math.floor(idx / 4) + 1;
                    gtx.fillStyle = "rgba(239, 68, 68, 0.8)";
                    gtx.font = "11px monospace";
                    gtx.fillText(`${measureNum}`, x + 4, 14);
                }
            }
        }

        if (offsetMs >= vStart && offsetMs <= vEnd) {
            const ox = ((offsetMs - vStart) / (vEnd - vStart)) * w + 0.5;
            gtx.strokeStyle = "#22c55e"; gtx.lineWidth = 2;
            gtx.beginPath(); gtx.moveTo(ox, 0); gtx.lineTo(ox, h); gtx.stroke();
            gtx.fillStyle = "#22c55e";
            gtx.font = "10px sans-serif";
            gtx.fillText("Offset", ox + 4, h - 6);
        }

        const head = getCurrentPlayheadMs();
        if (head >= vStart && head <= vEnd) {
            const hx = ((head - vStart) / (vEnd - vStart)) * w + 0.5;
            gtx.strokeStyle = isPlaying ? "#eab308" : "rgba(234, 179, 8, 0.7)";
            gtx.lineWidth = isPlaying ? 3 : 2;
            gtx.beginPath(); gtx.moveTo(hx, 0); gtx.lineTo(hx, h); gtx.stroke();
        }
    }, [audioBuffer, durationMs, bpm, offsetMs, isPlaying, viewStartMs, visibleRangeMs, clampViewStart, getCurrentPlayheadMs, zoom]);

    useEffect(() => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        const tick = () => {
            drawWave();
            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    }, [drawWave]);

    useEffect(() => {
        if (!containerRef.current) return;
        if (resizeObs.current) resizeObs.current.disconnect();

        if (typeof ResizeObserver !== "undefined") {
            resizeObs.current = new ResizeObserver(() => drawWave());
            resizeObs.current.observe(containerRef.current);
            return () => resizeObs.current?.disconnect();
        } else {
            const id = window.setInterval(drawWave, 250);
            return () => window.clearInterval(id);
        }
    }, [drawWave]);

    useEffect(() => { drawWave(); }, [drawWave]);

    const zoomAt = useCallback((factor: number) => {
        if (!durationMs) return;
        const prev = zoom, next = Math.max(1, Math.min(128, prev * factor));
        if (next === prev) return;
        const rangeNext = durationMs / next;
        const anchor = getCurrentPlayheadMs();
        setZoomState(next);
        setViewStartMs(clampViewStart(anchor - rangeNext / 2));
    }, [durationMs, zoom, getCurrentPlayheadMs, clampViewStart]);

    const onWheel = useCallback((e: React.WheelEvent) => {
        if (!durationMs) return;
        e.preventDefault();
        if (e.ctrlKey || e.shiftKey || e.metaKey) {
            const factor = Math.exp(-e.deltaY * 0.0015); zoomAt(factor);
        } else {
            const panMs = (e.deltaY) * (visibleRangeMs / 600);
            setViewStartMs(v => clampViewStart(v + panMs));
        }
    }, [durationMs, visibleRangeMs, zoomAt, clampViewStart]);

    const draggingRef = useRef<{ startX: number; startViewMs: number } | null>(null);

    const onMouseDown = useCallback((e: React.MouseEvent) => {
        if (!durationMs) return;
        draggingRef.current = { startX: e.clientX, startViewMs: viewStartMs };
    }, [durationMs, viewStartMs]);

    const onMouseMove = useCallback((e: React.MouseEvent) => {
        if (!durationMs || !draggingRef.current) return;
        const parent = containerRef.current!;
        const dx = e.clientX - draggingRef.current.startX;
        const panMs = -(dx / parent.clientWidth) * visibleRangeMs;
        setViewStartMs(clampViewStart(draggingRef.current.startViewMs + panMs));
    }, [durationMs, visibleRangeMs, clampViewStart]);

    const onMouseUp = useCallback(() => { draggingRef.current = null; }, []);

    const clickArmed = useRef(false);
    const onMouseDownClick = useCallback(() => { clickArmed.current = true; }, []);
    const onMouseMoveCancelClick = useCallback(() => { if (draggingRef.current) clickArmed.current = false; }, []);
    const onClickSeek = useCallback((e: React.MouseEvent) => {
        if (!clickArmed.current || !durationMs) return;
        const parent = containerRef.current!;
        const rect = parent.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const ms = viewStartMs + (x / rect.width) * visibleRangeMs;
        onSeekMs(Math.max(0, Math.min(durationMs, ms)));
    }, [durationMs, viewStartMs, visibleRangeMs, onSeekMs]);

    return {
        containerRef,
        canvasRef,
        overlayRef,
        zoom,
        viewStartMs,
        durationMs,
        visibleRangeMs,
        setViewStartMs,
        zoomAt,
        onWheel,
        onMouseDown,
        onMouseMove,
        onMouseUp,
        onMouseDownClick,
        onMouseMoveCancelClick,
        onClickSeek,
        setZoom: setZoomState,
    };
}
