import { useCallback, useEffect, useRef } from "react";

const METER_BEATS = 4;
const LOOK_AHEAD_MS = 25;
const SCHEDULE_AHEAD_SEC = 0.25;

export interface UseMetronomeOptions {
    bpm: number;
    offsetMs: number;
    metroOn: boolean;
    metroVol: number;
    isPlaying: boolean;
    getCurrentPlayheadMs: () => number;
    songMsToCtxTime: (songMs: number) => number;
    ensureAudioCtx: () => AudioContext;
}

export function useMetronome({
    bpm,
    offsetMs,
    metroOn,
    metroVol,
    isPlaying,
    getCurrentPlayheadMs,
    songMsToCtxTime,
    ensureAudioCtx,
}: UseMetronomeOptions) {
    const schedulerRef = useRef<number | null>(null);
    const nextBeatIndexRef = useRef(0);

    const clickSound = useCallback(
        (whenSec: number, strong: boolean) => {
            const ctx = ensureAudioCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "square";
            osc.frequency.value = strong ? 1200 : 880;
            gain.gain.value = 0;
            osc.connect(gain);
            gain.connect(ctx.destination);
            gain.gain.setValueAtTime(0, whenSec);
            gain.gain.linearRampToValueAtTime(metroVol, whenSec + 0.001);
            gain.gain.exponentialRampToValueAtTime(0.0001, whenSec + 0.08);
            osc.start(whenSec);
            osc.stop(whenSec + 0.12);
        },
        [ensureAudioCtx, metroVol],
    );

    const resetMetroPhase = useCallback(() => {
        const beatMs = 60000 / Math.max(1, bpm);
        const nowSong = getCurrentPlayheadMs();
        const rel = nowSong - offsetMs;
        nextBeatIndexRef.current = rel <= 0 ? 0 : Math.ceil(rel / beatMs);
    }, [bpm, offsetMs, getCurrentPlayheadMs]);

    const stopMetro = useCallback(() => {
        if (schedulerRef.current) {
            window.clearInterval(schedulerRef.current);
            schedulerRef.current = null;
        }
    }, []);

    const startMetro = useCallback(() => {
        if (!metroOn || !isPlaying) return;
        stopMetro();
        resetMetroPhase();
        const ctx = ensureAudioCtx();

        schedulerRef.current = window.setInterval(() => {
            if (!metroOn || !isPlaying) return;
            const beatMs = 60000 / Math.max(1, bpm);
            const nowCtx = ctx.currentTime;
            const nowSong = getCurrentPlayheadMs();

            while (true) {
                const i = nextBeatIndexRef.current;
                const songT = offsetMs + i * beatMs;
                const when = songMsToCtxTime(songT);
                if (when - nowCtx <= SCHEDULE_AHEAD_SEC) {
                    if (songT >= nowSong - 10) {
                        const strong = i % METER_BEATS === 0;
                        clickSound(Math.max(nowCtx, when), strong);
                    }
                    nextBeatIndexRef.current = i + 1;
                } else break;
            }
        }, LOOK_AHEAD_MS) as unknown as number;
    }, [bpm, ensureAudioCtx, getCurrentPlayheadMs, isPlaying, metroOn, offsetMs, songMsToCtxTime, stopMetro, clickSound, resetMetroPhase]);

    useEffect(() => {
        if (metroOn && isPlaying) startMetro();
        else stopMetro();
        return () => stopMetro();
    }, [metroOn, isPlaying, startMetro, stopMetro]);

    useEffect(() => {
        if (metroOn && isPlaying) {
            resetMetroPhase();
            startMetro();
        }
    }, [bpm, offsetMs, metroOn, isPlaying, resetMetroPhase, startMetro]);

    useEffect(() => {
        return () => {
            if (schedulerRef.current) {
                window.clearInterval(schedulerRef.current);
                schedulerRef.current = null;
            }
        };
    }, []);
}
