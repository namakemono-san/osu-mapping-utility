import { useCallback, useEffect, useRef, useState } from "react";
import {
    FiMusic, FiUpload, FiPlay, FiPause,
    FiZoomIn, FiZoomOut, FiVolume2, FiMaximize, FiRefreshCw
} from "react-icons/fi";

import { useCalibratorSettings } from "../hooks/useStorage";
import { useI18n } from "../hooks/i18nContext";
import { useMetronome } from "../hooks/useMetronome";
import { useWaveformRenderer } from "../hooks/useWaveformRenderer";
import { analyzeBpmFromBuffer, analyzeOffsetFromBuffer } from "../domain/audio/bpmDetector";

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

    const H = "h-9";
    const BTN = `${H} inline-flex items-center gap-2 whitespace-nowrap px-3 rounded-md bg-[#2a2a2a] hover:bg-[#343434] transition-colors disabled:opacity-50`;
    const CHIP = `px-2 ${H} inline-flex items-center gap-2 whitespace-nowrap rounded-md bg-[#1f1f1f] border border-[#2a2a2a] text-sm`;
    const INPUT = `${H} px-2 py-1 rounded-md bg-[#101010] border border-[#2a2a2a] text-sm leading-tight`;
    const PANEL = "rounded-lg bg-[#1c1c1c] border border-[#2a2a2a]";

    const ensureAudioCtx = useCallback(() => {
        if (!audioCtxRef.current) {
            audioCtxRef.current = new (window.AudioContext ||
                (window as any).webkitAudioContext)();
        }
        return audioCtxRef.current!;
    }, []);

    const stopPlayback = useCallback(() => {
        if (srcNodeRef.current) {
            srcNodeRef.current.onended = null;
            try { srcNodeRef.current.stop(); } catch { }
            srcNodeRef.current.disconnect();
            srcNodeRef.current = null;
        }
        setPlaying(false);
        setPlayStartAt(0);
        setPlayStartCtxTime(0);
    }, []);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            stopPlayback();
            if (audioCtxRef.current) {
                try { void audioCtxRef.current.close(); } catch { }
                audioCtxRef.current = null;
            }
        };
    }, [stopPlayback]);

    const durationMs = audioBuffer ? audioBuffer.duration * 1000 : 0;

    const getCurrentPlayheadMs = useCallback(() => {
        const ctx = audioCtxRef.current;
        if (!isPlaying || !ctx) return 0;
        const elapsed = (ctx.currentTime - playStartCtxTime) * 1000;
        return Math.min(durationMs, playStartAt + elapsed);
    }, [isPlaying, playStartCtxTime, playStartAt, durationMs]);

    const songMsToCtxTime = useCallback(
        (songMs: number) => {
            return playStartCtxTime + (songMs - playStartAt) / 1000;
        },
        [playStartCtxTime, playStartAt],
    );

    const waveform = useWaveformRenderer(
        {
            audioBuffer,
            bpm,
            offsetMs,
            isPlaying,
            getCurrentPlayheadMs,
        },
        setOffsetMs,
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
                if (mountedRef.current) setPlaying(false);
            };

            srcNodeRef.current = src;
            gainRef.current = g;

            setPlaying(true);
            setPlayStartAt(ms);
            setPlayStartCtxTime(ctx.currentTime);

            if (waveform.zoom > 1) {
                const half = (durationMs / waveform.zoom) / 2;
                waveform.setViewStartMs(ms - half);
            }
        },
        [audioBuffer, ensureAudioCtx, stopPlayback, playVol, waveform.zoom, durationMs],
    );

    useEffect(() => {
        if (gainRef.current) gainRef.current.gain.value = playVol;
    }, [playVol]);

    useMetronome({
        bpm,
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
        const f = files[0];
        setFileName(f.name);
        const ctx = ensureAudioCtx();
        const arr = await f.arrayBuffer();
        const buf = await ctx.decodeAudioData(arr.slice(0));
        setAudioBuffer(buf);
        setOffsetMs(0);
        waveform.setViewStartMs(0);
        waveform.setZoom(100);
        setBpmCandidates([]);
        stopPlayback();
    }, [ensureAudioCtx, stopPlayback]);

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

    return (
        <div className="flex flex-col gap-2 text-zinc-200">

            <div className={`flex items-center gap-2 ${PANEL} p-2`}>
                <div
                    className={`${CHIP} shrink min-w-0 max-w-[min(50%,520px)]`}
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
                    onClick={() => (isPlaying ? stopPlayback() : playFrom(Math.max(0, offsetMs - 100)))}
                    className={BTN}
                >
                    {isPlaying ? <FiPause /> : <FiPlay />} {isPlaying ? t("calibrator.pause") : t("calibrator.play")}
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
                    className={`${BTN} ${metroOn ? "!bg-[#16a34a] hover:!bg-[#148a41]" : ""}`}
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

            <div className={`flex items-center gap-2 ${PANEL} p-2`}>
                <div className="flex items-center gap-2">
                    <div className={CHIP}>
                        <span className="opacity-80">{t("calibrator.bpm")}</span>
                        <input
                            type="number" min={1}
                            value={bpm}
                            onChange={(e) => setBpm(Math.max(1, Math.floor(Number(e.target.value || 0))))}
                            className={INPUT + " w-24"}
                        />
                    </div>
                    <div className={CHIP}>
                        <span className="opacity-80">{t("calibrator.offset")}</span>
                        <input
                            type="number"
                            value={Math.round(offsetMs)}
                            onChange={(e) => setOffsetMs(Math.max(0, Math.min(durationMs, Number(e.target.value || 0))))}
                            className={INPUT + " w-28"}
                        />
                    </div>
                </div>

                <div className="flex-1" />

                <div className="flex items-center gap-2">
                    <button disabled={!audioBuffer || analyzingBpm} onClick={analyzeBpm} className={BTN}>
                        <FiRefreshCw className={analyzingBpm ? "animate-spin" : ""} /> {t("calibrator.analyzeBpm")}
                    </button>
                    <button disabled={!audioBuffer || analyzingOffset} onClick={analyzeOffset} className={BTN}>
                        <FiRefreshCw className={analyzingOffset ? "animate-spin" : ""} /> {t("calibrator.analyzeOffset")}
                    </button>
                </div>
            </div>

            <div
                ref={waveform.containerRef}
                className={`relative w-full h-56 ${PANEL} overflow-hidden select-none`}
                onWheel={waveform.onWheel}
                onMouseDown={(e) => { waveform.onMouseDown(e); waveform.onMouseDownClick(); }}
                onMouseMove={(e) => { waveform.onMouseMove(e); waveform.onMouseMoveCancelClick(); }}
                onMouseUp={waveform.onMouseUp}
                onClick={waveform.onClickSetOffset}
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

            <div className={`flex h-[55px] flex-wrap items-center gap-2 ${PANEL} p-2`}>
                <span className="text-xs opacity-80">{t("calibrator.bpmCandidates")}</span>
                {bpmCandidates.length > 0 ? (
                    bpmCandidates.map((b) => (
                        <button
                            key={b}
                            onClick={() => setBpm(b)}
                            className={`${H} inline-flex items-center whitespace-nowrap px-2 rounded-md text-sm transition-colors ${b === bpm ? "bg-[#2563eb]" : "bg-[#2a2a2a] hover:bg-[#343434]"
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
    );
}
