import { useCallback, useEffect, useRef } from "react";

const METER_BEATS = 4;
const LOOK_AHEAD_MS = 25;
const SCHEDULE_AHEAD_SEC = 0.25;

const METRONOME_SOUND_URLS = {
    latch: [
        "/sounds/metronome/metronome-latch.wav",
        "/sounds/metronome/metronome-latch.ogg",
        "/sounds/metronome/metronome-latch.mp3",
    ],
    tick: [
        "/sounds/metronome/metronome-tick.wav",
        "/sounds/metronome/metronome-tick.ogg",
        "/sounds/metronome/metronome-tick.mp3",
    ],
    tickDownbeat: [
        "/sounds/metronome/metronome-tick-downbeat.wav",
        "/sounds/metronome/metronome-tick-downbeat.ogg",
        "/sounds/metronome/metronome-tick-downbeat.mp3",
    ],
} as const;

interface MetronomeSounds {
    latch: AudioBuffer;
    tick: AudioBuffer;
    tickDownbeat: AudioBuffer;
}

let cachedMetronomeSounds: MetronomeSounds | null = null;
let loadingPromise: Promise<MetronomeSounds> | null = null;

function looksLikeAudioData(buf: ArrayBuffer): boolean {
    if (buf.byteLength < 4) return false;
    const sig = new Uint8Array(buf.slice(0, 4));
    const txt = String.fromCharCode(sig[0], sig[1], sig[2], sig[3]);
    return txt === "RIFF" || txt === "OggS" || txt === "ID3" || txt === "fLaC";
}

async function decodeAudioFromUrl(ctx: AudioContext, url: string): Promise<AudioBuffer> {
    const assetUrl = new URL(url, window.location.origin).toString();
    const response = await fetch(assetUrl, { cache: "no-store" });
    if (!response.ok || response.headers.get("content-type")?.includes("text/html")) {
        throw new Error(`Failed to load metronome sound: ${assetUrl}`);
    }
    const arr = await response.arrayBuffer();
    if (!looksLikeAudioData(arr)) {
        throw new Error(`Invalid audio binary for metronome sound: ${assetUrl}`);
    }
    return await ctx.decodeAudioData(arr.slice(0));
}

async function decodeAudioFromCandidates(
    ctx: AudioContext,
    candidates: readonly string[],
): Promise<AudioBuffer> {
    let lastError: unknown = null;
    for (const url of candidates) {
        try {
            return await decodeAudioFromUrl(ctx, url);
        } catch (err) {
            lastError = err;
        }
    }
    throw lastError ?? new Error("No metronome sound candidates succeeded");
}

async function loadMetronomeSounds(ctx: AudioContext): Promise<MetronomeSounds> {
    if (cachedMetronomeSounds) return cachedMetronomeSounds;
    if (loadingPromise) return loadingPromise;

    loadingPromise = (async () => {
        const [latch, tick, tickDownbeat] = await Promise.all([
            decodeAudioFromCandidates(ctx, METRONOME_SOUND_URLS.latch),
            decodeAudioFromCandidates(ctx, METRONOME_SOUND_URLS.tick),
            decodeAudioFromCandidates(ctx, METRONOME_SOUND_URLS.tickDownbeat),
        ]);

        cachedMetronomeSounds = { latch, tick, tickDownbeat };
        return cachedMetronomeSounds;
    })();

    try {
        return await loadingPromise;
    } finally {
        loadingPromise = null;
    }
}

function playMetronomeSound(
    ctx: AudioContext,
    buffer: AudioBuffer,
    whenSec: number,
    volume: number,
) {
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = buffer;
    src.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(Math.max(0, volume), whenSec);
    src.start(whenSec);
}

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
    const soundsRef = useRef<MetronomeSounds | null>(cachedMetronomeSounds);

    const clickSound = useCallback(
        (whenSec: number, strong: boolean) => {
            const ctx = ensureAudioCtx();
            const sounds = soundsRef.current;

            if (!sounds) return;
            const buffer = strong ? sounds.tickDownbeat : sounds.tick;
            playMetronomeSound(ctx, buffer, whenSec, metroVol);
        },
        [ensureAudioCtx, metroVol],
    );

    useEffect(() => {
        if (!metroOn) return;
        const ctx = ensureAudioCtx();
        let mounted = true;

        void loadMetronomeSounds(ctx).then((sounds) => {
            if (!mounted) return;
            soundsRef.current = sounds;
        }).catch((err) => {
            console.error("Metronome sound loading failed.", err);
        });

        return () => {
            mounted = false;
        };
    }, [metroOn, ensureAudioCtx]);

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
        if (!soundsRef.current) {
            const ctx = ensureAudioCtx();
            void loadMetronomeSounds(ctx)
                .then((sounds) => {
                    soundsRef.current = sounds;
                    if (metroOn && isPlaying) startMetro();
                })
                .catch((err) => {
                    console.error("Metronome sound loading failed.", err);
                });
            return;
        }

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
