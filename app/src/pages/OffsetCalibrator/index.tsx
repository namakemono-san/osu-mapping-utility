import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    FiMusic, FiUpload, FiPlay, FiPause,
    FiZoomIn, FiZoomOut, FiVolume2, FiMaximize, FiRefreshCw
} from "react-icons/fi";

import { useCalibratorSettings } from "../../hooks/useStorage";
import { useI18n } from "../../hooks/i18nContext";
import { useMetronome } from "../../hooks/useMetronome";
import { useWaveformRenderer } from "../../hooks/useWaveformRenderer";
import { analyzeBpmFromBuffer, analyzeOffsetFromBuffer } from "../../domain/audio/bpmDetector";
import { AdjustButtons } from "./AdjustButtons";
import { BeatWaveformList } from "./BeatWaveformList";

type Props = {
    defaultBpm?: number;
};

export function OffsetCalibrator({ defaultBpm = 120 }: Props) {
    const { t } = useI18n();
    const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
    const [fileName, setFileName] = useState("");

    const [bpm, setBpm] = useState<number>(Math.floor(defaultBpm));
    const [bpmCandidates, setBpmCandidates] = useState<number[]>([]);
    const [analyzingBpm, setAnalyzingBpm] = useState(false);

    const [offsetMs, setOffsetMs] = useState(0);
    const [analyzingOffset, setAnalyzingOffset] = useState(false);

    const [isPlaying, setPlaying] = useState(false);
    const [playStartAt, setPlayStartAt] = useState(0);
    const [playStartCtxTime, setPlayStartCtxTime] = useState(0);
    const [cursorMs, setCursorMs] = useState(0);
    const [ctrlBoost, setCtrlBoost] = useState(false);

    const {
        playVolume: playVol,
        setPlayVolume: setPlayVol,
        metroVolume: metroVol,
        setMetroVolume: setMetroVol,
        metroOn,
        setMetroOn,
    } = useCalibratorSettings();

    const audioCtxRef = useRef<AudioContext | null>(null);
    const srcNodeRef = useRef<AudioBufferSourceNode | null>(null);
    const gainRef = useRef<GainNode | null>(null);
    const mountedRef = useRef(true);
    const playFromRef = useRef<(ms: number) => void>(() => { });
    const playStartAtRef = useRef(0);
    const playStartCtxTimeRef = useRef(0);
    const cursorMsRef = useRef(0);
    const isPlayingRef = useRef(false);

    const H = "h-9";
    const BTN = `${H} inline-flex items-center gap-2 whitespace-nowrap px-3 rounded-md bg-surface-hover hover:bg-surface-hover-soft transition-colors disabled:opacity-50`;
    const CHIP = `px-2 ${H} inline-flex items-center gap-2 whitespace-nowrap rounded-md bg-surface-base border border-border-muted text-sm`;
    const INPUT = `${H} px-2 py-1 rounded-md bg-surface-input border border-border-muted text-sm leading-tight`;
    const PANEL = "rounded-lg bg-surface-base-soft border border-border-muted";

    const ensureAudioCtx = useCallback(() => {
        if (!audioCtxRef.current) {
            audioCtxRef.current = new (window.AudioContext ||
                (window as any).webkitAudioContext)();
        }
        return audioCtxRef.current!;
    }, []);

    const durationMs = audioBuffer ? audioBuffer.duration * 1000 : 0;
    const effectiveBpm = useMemo(() => (ctrlBoost ? bpm * 2 : bpm), [ctrlBoost, bpm]);

    const stopPlayback = useCallback((reset = false) => {
        let nextCursor = cursorMsRef.current;
        const ctx = audioCtxRef.current;
        const maxDuration = audioBuffer ? audioBuffer.duration * 1000 : 0;
        if (!reset && isPlayingRef.current && ctx) {
            const elapsed = (ctx.currentTime - playStartCtxTimeRef.current) * 1000;
            nextCursor = Math.min(maxDuration, Math.max(0, playStartAtRef.current + elapsed));
        }

        if (srcNodeRef.current) {
            srcNodeRef.current.onended = null;
            try { srcNodeRef.current.stop(); } catch { }
            srcNodeRef.current.disconnect();
            srcNodeRef.current = null;
        }

        setPlaying(false);
        setPlayStartAt(0);
        setPlayStartCtxTime(0);
        isPlayingRef.current = false;
        playStartAtRef.current = 0;
        playStartCtxTimeRef.current = 0;
        cursorMsRef.current = reset ? 0 : nextCursor;
        setCursorMs(reset ? 0 : nextCursor);
    }, [audioBuffer]);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            if (srcNodeRef.current) {
                srcNodeRef.current.onended = null;
                try { srcNodeRef.current.stop(); } catch { }
                srcNodeRef.current.disconnect();
                srcNodeRef.current = null;
            }
            if (audioCtxRef.current) {
                try { void audioCtxRef.current.close(); } catch { }
                audioCtxRef.current = null;
            }
        };
    }, []);

    const getCurrentPlayheadMs = useCallback(() => {
        const ctx = audioCtxRef.current;
        if (!isPlayingRef.current || !ctx) return cursorMsRef.current;
        const elapsed = (ctx.currentTime - playStartCtxTimeRef.current) * 1000;
        return Math.min(durationMs, playStartAtRef.current + elapsed);
    }, [durationMs]);

    const seekTo = useCallback((ms: number) => {
        const next = Math.max(0, Math.min(durationMs, ms));
        if (isPlaying) {
            playFromRef.current(next);
            return;
        }
        cursorMsRef.current = next;
        setCursorMs(next);
    }, [durationMs, isPlaying]);

    const songMsToCtxTime = useCallback(
        (songMs: number) => {
            return playStartCtxTime + (songMs - playStartAt) / 1000;
        },
        [playStartCtxTime, playStartAt],
    );

    const waveform = useWaveformRenderer(
        {
            audioBuffer,
            bpm: effectiveBpm,
            offsetMs,
            isPlaying,
            getCurrentPlayheadMs,
        },
        seekTo,
    );

    const playFrom = useCallback(
        async (ms: number) => {
            if (!audioBuffer) return;
            const ctx = ensureAudioCtx();
            await ctx.resume();
            stopPlayback();

            const src = ctx.createBufferSource();
            const g = ctx.createGain();
            src.buffer = audioBuffer;
            src.connect(g);
            g.connect(ctx.destination);
            g.gain.value = playVol;

            src.start(0, Math.max(0, ms / 1000));
            src.onended = () => {
                if (mountedRef.current) {
                    setPlaying(false);
                    setPlayStartAt(0);
                    setPlayStartCtxTime(0);
                    isPlayingRef.current = false;
                    playStartAtRef.current = 0;
                    playStartCtxTimeRef.current = 0;
                    cursorMsRef.current = durationMs;
                    setCursorMs(durationMs);
                }
            };

            srcNodeRef.current = src;
            gainRef.current = g;

            setPlaying(true);
            setPlayStartAt(ms);
            setPlayStartCtxTime(ctx.currentTime);
            isPlayingRef.current = true;
            playStartAtRef.current = ms;
            playStartCtxTimeRef.current = ctx.currentTime;
            cursorMsRef.current = ms;
            setCursorMs(ms);
        },
        [audioBuffer, ensureAudioCtx, stopPlayback, playVol, durationMs],
    );

    useEffect(() => {
        cursorMsRef.current = cursorMs;
    }, [cursorMs]);

    useEffect(() => {
        playFromRef.current = (ms: number) => {
            void playFrom(ms);
        };
    }, [playFrom]);

    useEffect(() => {
        if (gainRef.current) gainRef.current.gain.value = playVol;
    }, [playVol]);

    useMetronome({
        bpm: effectiveBpm,
        offsetMs,
        metroOn,
        metroVol,
        isPlaying,
        getCurrentPlayheadMs,
        songMsToCtxTime,
        ensureAudioCtx,
    });

    const handleFiles = useCallback(async (files: FileList | null) => {
        if (!files || !files[0]) return;
        stopPlayback(true);

        const f = files[0];
        setFileName(f.name);
        const ctx = ensureAudioCtx();
        const arr = await f.arrayBuffer();
        const buf = await ctx.decodeAudioData(arr.slice(0));
        setAudioBuffer(buf);
        setOffsetMs(0);
        setCursorMs(0);
        waveform.setViewStartMs(0);
        waveform.setZoom(100);
        setBpmCandidates([]);
    }, [ensureAudioCtx, stopPlayback, waveform]);

    const analyzeBpm = useCallback(async () => {
        if (!audioBuffer) return;
        setAnalyzingBpm(true);
        try {
            const result = analyzeBpmFromBuffer(audioBuffer, defaultBpm);
            setBpmCandidates(result.candidates);
            setBpm(result.bpm);
        } finally {
            setAnalyzingBpm(false);
        }
    }, [audioBuffer, defaultBpm]);

    const analyzeOffset = useCallback(async () => {
        if (!audioBuffer || bpm <= 0) return;
        setAnalyzingOffset(true);
        const offset = analyzeOffsetFromBuffer(audioBuffer, bpm, durationMs);
        setOffsetMs(offset);
        setAnalyzingOffset(false);
    }, [audioBuffer, bpm, durationMs]);

    const handleTogglePlayCurrent = useCallback(() => {
        if (isPlaying) {
            stopPlayback();
            return;
        }
        const atEnd = durationMs > 0 && cursorMs >= durationMs - 10;
        playFromRef.current(atEnd ? 0 : cursorMs);
    }, [cursorMs, durationMs, isPlaying, stopPlayback]);

    useEffect(() => {
        const isEditableTarget = (target: EventTarget | null) => {
            const el = target as HTMLElement | null;
            if (!el) return false;
            const tag = el.tagName;
            return el.isContentEditable || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
        };

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Control") {
                setCtrlBoost(true);
                return;
            }

            if (e.code === "Space") {
                if (isEditableTarget(e.target) || e.repeat) return;
                e.preventDefault();
                handleTogglePlayCurrent();
            }
        };

        const onKeyUp = (e: KeyboardEvent) => {
            if (e.key === "Control") setCtrlBoost(false);
        };

        const onBlur = () => setCtrlBoost(false);

        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("keyup", onKeyUp);
        window.addEventListener("blur", onBlur);
        return () => {
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("keyup", onKeyUp);
            window.removeEventListener("blur", onBlur);
        };
    }, [handleTogglePlayCurrent]);

    return (
        <div className="flex flex-col gap-2 text-zinc-200">

            <div className={`flex items-center gap-2 ${PANEL} p-2`}>
                <div
                    className={`${CHIP} shrink min-w-0 max-w-min-50-520`}
                    title={fileName || t("calibrator.noAudio")}
                >
                    <FiMusic className="opacity-80" />
                    <span className="truncate">{fileName || t("calibrator.noAudio")}</span>
                </div>
                <div className="flex-1" />
                <button
                    onClick={() => {
                        const i = document.createElement("input");
                        i.type = "file"; i.accept = "audio/*";
                        i.onchange = () => handleFiles(i.files);
                        i.click();
                    }}
                    className={BTN}
                >
                    <FiUpload /> {t("calibrator.load")}
                </button>
                <button
                    onClick={handleTogglePlayCurrent}
                    className={BTN}
                >
                    {isPlaying ? <FiPause /> : <FiPlay />} {isPlaying ? t("calibrator.pause") : t("calibrator.playCurrent")}
                </button>
                <button
                    onClick={() => { playFromRef.current(0); }}
                    className={BTN}
                >
                    <FiPlay /> {t("calibrator.playFromStart")}
                </button>
            </div>

            <div className={`flex items-center gap-2 ${PANEL} p-2`}>
                <div className={CHIP}>
                    <FiVolume2 className="opacity-80" />
                    <input
                        type="range" min={0} max={1} step={0.01}
                        value={playVol} onChange={(e) => setPlayVol(Number(e.target.value))}
                        className="w-40"
                    />
                </div>
                <div className="flex-1" />
                <button
                    onClick={() => setMetroOn(v => !v)}
                    className={`${BTN} ${metroOn ? "bg-success-primary! hover:bg-success-hover!" : ""}`}
                    title={t("calibrator.metronome.title")}
                >
                    {t("calibrator.metronome.label", { state: metroOn ? t("calibrator.on") : t("calibrator.off") })}
                </button>
                <div className={CHIP}>
                    <span className="opacity-80">{t("calibrator.metronome.volume")}</span>
                    <input
                        type="range" min={0} max={1} step={0.01}
                        value={metroVol}
                        onChange={(e) => setMetroVol(Number(e.target.value))}
                        className="w-28"
                    />
                </div>
            </div>

            <div className={`${PANEL} p-2 flex flex-col gap-2`}>
                <div className="flex flex-wrap items-center gap-2">
                    <div className={`${CHIP} min-w-160`}>
                        <span className="w-14 text-center opacity-80">{t("calibrator.bpm")}</span>
                        <input
                            type="number"
                            min={1}
                            value={bpm}
                            onChange={(e) => setBpm(Math.max(1, Math.floor(Number(e.target.value || 0))))}
                            className={INPUT + " w-28"}
                        />
                    </div>
                    {ctrlBoost && (
                        <div className={CHIP}>
                            <span className="text-xs opacity-80">×2</span>
                            <span className="font-mono">{effectiveBpm}</span>
                        </div>
                    )}
                    <AdjustButtons
                        value={bpm}
                        min={1}
                        max={400}
                        onChange={(v) => setBpm(Math.max(1, Math.floor(v)))}
                    />
                    <button
                        disabled={!audioBuffer || analyzingBpm}
                        onClick={analyzeBpm}
                        className={`${BTN} min-w-40 justify-center`}
                    >
                        <FiRefreshCw className={analyzingBpm ? "animate-spin" : ""} /> {t("calibrator.analyzeBpm")}
                    </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <div className={`${CHIP} min-w-160`}>
                        <span className="w-14 text-center opacity-80">{t("calibrator.offset")}</span>
                        <input
                            type="number"
                            value={Math.round(offsetMs)}
                            onChange={(e) => setOffsetMs(Math.max(0, Math.min(durationMs, Number(e.target.value || 0))))}
                            className={INPUT + " w-28"}
                        />
                    </div>
                    <AdjustButtons
                        value={Math.round(offsetMs)}
                        min={0}
                        max={Math.max(0, Math.round(durationMs))}
                        onChange={(v) => setOffsetMs(Math.max(0, Math.min(durationMs, Math.round(v))))}
                    />
                    <button
                        disabled={!audioBuffer || analyzingOffset}
                        onClick={analyzeOffset}
                        className={`${BTN} min-w-40 justify-center`}
                    >
                        <FiRefreshCw className={analyzingOffset ? "animate-spin" : ""} /> {t("calibrator.analyzeOffset")}
                    </button>
                </div>
            </div>

            <div className="flex flex-col gap-2 xl:flex-row">
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div
                        ref={waveform.containerRef}
                        className={`relative w-full h-56 ${PANEL} overflow-hidden select-none`}
                        onWheel={waveform.onWheel}
                        onMouseDown={(e) => { waveform.onMouseDown(e); waveform.onMouseDownClick(); }}
                        onMouseMove={(e) => { waveform.onMouseMove(e); waveform.onMouseMoveCancelClick(); }}
                        onMouseUp={waveform.onMouseUp}
                        onClick={waveform.onClickSeek}
                        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files; handleFiles(f); }}
                        onDragOver={(e) => e.preventDefault()}
                    >
                        <canvas ref={waveform.canvasRef} className="absolute inset-0" />
                        <canvas ref={waveform.overlayRef} className="absolute inset-0 pointer-events-none" />
                        {!audioBuffer && (
                            <div className="absolute inset-0 grid place-items-center text-sm opacity-70">
                                {t("calibrator.dropHint", { load: t("calibrator.load") })}
                            </div>
                        )}
                    </div>

                    <div className={`flex items-center gap-2 ${PANEL} p-2`}>
                        <button onClick={() => waveform.zoomAt(1 / 1.2)} className={BTN} title={t("calibrator.zoomOut")}>
                            <FiZoomOut /> {t("calibrator.zoomOut")}
                        </button>
                        <button onClick={() => waveform.zoomAt(1.2)} className={BTN} title={t("calibrator.zoomIn")}>
                            <FiZoomIn /> {t("calibrator.zoomIn")}
                        </button>
                        <button onClick={() => { waveform.setZoom(1); waveform.setViewStartMs(0); }} className={BTN} title={t("calibrator.fit")}>
                            <FiMaximize /> {t("calibrator.fit")}
                        </button>

                        <div className="ml-auto text-xs opacity-75">
                            {t("calibrator.zoom")}: <span className="font-mono">{waveform.zoom.toFixed(2)}×</span>
                            <span className="mx-2">|</span>
                            {t("calibrator.view")}: <span className="font-mono">{Math.round(waveform.viewStartMs)}–{Math.round(Math.min(durationMs, waveform.viewStartMs + waveform.visibleRangeMs))} ms</span>
                        </div>
                    </div>

                    <div className={`flex h-55 flex-wrap items-center gap-2 ${PANEL} p-2`}>
                        <span className="text-xs opacity-80">{t("calibrator.bpmCandidates")}</span>
                        {bpmCandidates.length > 0 ? (
                            bpmCandidates.map((b) => (
                                <button
                                    key={b}
                                    onClick={() => setBpm(b)}
                                    className={`${H} inline-flex items-center whitespace-nowrap px-2 rounded-md text-sm transition-colors ${b === bpm ? "bg-accent-primary" : "bg-surface-hover hover:bg-surface-hover-soft"
                                        }`}
                                >
                                    {b}
                                </button>
                            ))
                        ) : (
                            <span className="text-xs text-zinc-500 italic opacity-60 select-none">
                                {t("calibrator.noBpm")}
                            </span>
                        )}
                    </div>
                </div>

                <div className="flex w-full flex-col gap-2 xl:w-96">
                    <BeatWaveformList
                        audioBuffer={audioBuffer}
                        bpm={effectiveBpm}
                        offsetMs={offsetMs}
                        isPlaying={isPlaying}
                        getCurrentPlayheadMs={getCurrentPlayheadMs}
                        numBeats={6}
                    />

                </div>
            </div>
        </div>
    );
}
