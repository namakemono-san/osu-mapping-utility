import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    FiMusic, FiUpload, FiPlay, FiPause,
    FiZoomIn, FiZoomOut, FiVolume2, FiMaximize, FiRefreshCw
} from "react-icons/fi";

type Props = {
    defaultBpm?: number;
};

export function OffsetCalibrator({ defaultBpm = 120 }: Props) {
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
    const [playVol, setPlayVol] = useState(0.35);

    const [metroOn, setMetroOn] = useState(true);
    const [metroVol, setMetroVol] = useState(0.25);

    const [zoom, setZoom] = useState(1);
    const [viewStartMs, setViewStartMs] = useState(0);

    const containerRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const overlayRef = useRef<HTMLCanvasElement | null>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const srcNodeRef = useRef<AudioBufferSourceNode | null>(null);
    const gainRef = useRef<GainNode | null>(null);
    const rafRef = useRef<number | null>(null);
    const resizeObs = useRef<ResizeObserver | null>(null);

    const schedulerRef = useRef<number | null>(null);
    const nextBeatIndexRef = useRef(0);
    const meterBeats = 4;
    const lookAheadMs = 25;
    const scheduleAheadSec = 0.25;

    const durationMs = useMemo(
        () => (audioBuffer ? audioBuffer.duration * 1000 : 0),
        [audioBuffer]
    );
    const visibleRangeMs = useMemo(
        () => (durationMs ? Math.max(200, durationMs / zoom) : 0),
        [durationMs, zoom]
    );

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

    const clampViewStart = useCallback(
        (v: number) => {
            if (!durationMs) return 0;
            const maxStart = Math.max(0, durationMs - visibleRangeMs);
            return Math.min(Math.max(0, v), maxStart);
        },
        [durationMs, visibleRangeMs]
    );

    const stopPlayback = useCallback(() => {
        if (srcNodeRef.current) {
            try { srcNodeRef.current.stop(); } catch { }
            srcNodeRef.current.disconnect();
            srcNodeRef.current = null;
        }
        setPlaying(false);
        setPlayStartAt(0);
        setPlayStartCtxTime(0);
    }, []);

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
            src.onended = () => setPlaying(false);

            srcNodeRef.current = src;
            gainRef.current = g;

            setPlaying(true);
            setPlayStartAt(ms);
            setPlayStartCtxTime(ctx.currentTime);

            if (zoom > 1) {
                const half = (durationMs / zoom) / 2;
                setViewStartMs(clampViewStart(ms - half));
            }
        },
        [audioBuffer, ensureAudioCtx, stopPlayback, playVol, zoom, durationMs, clampViewStart]
    );

    useEffect(() => {
        if (gainRef.current) gainRef.current.gain.value = playVol;
    }, [playVol]);

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
        [playStartCtxTime, playStartAt]
    );

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
        [ensureAudioCtx, metroVol]
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
                if (when - nowCtx <= scheduleAheadSec) {
                    if (songT >= nowSong - 10) {
                        const strong = i % meterBeats === 0;
                        clickSound(Math.max(nowCtx, when), strong);
                    }
                    nextBeatIndexRef.current = i + 1;
                } else break;
            }
        }, lookAheadMs) as unknown as number;
    }, [bpm, ensureAudioCtx, getCurrentPlayheadMs, isPlaying, metroOn, offsetMs, songMsToCtxTime, stopMetro, clickSound]);

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
        const grad = ctx.createLinearGradient(0, 0, 0, h); grad.addColorStop(0, "#141414"); grad.addColorStop(1, "#1b1b1b");
        ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);

        if (!audioBuffer || durationMs <= 0) return;

        const vStart = clampViewStart(viewStartMs);
        const vEnd = Math.min(durationMs, vStart + visibleRangeMs);
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
            gtx.lineWidth = 1;
            for (let t = offsetMs; t <= vEnd; t += beatMs) {
                if (t < vStart) continue;
                const x = ((t - vStart) / (vEnd - vStart)) * w + 0.5;
                const idx = Math.round((t - offsetMs) / beatMs);
                gtx.strokeStyle = (idx % 4 === 0) ? "rgba(255,255,255,0.20)" : "rgba(255,255,255,0.08)";
                gtx.beginPath(); gtx.moveTo(x, 0); gtx.lineTo(x, h); gtx.stroke();
            }
        }

        if (offsetMs >= vStart && offsetMs <= vEnd) {
            const ox = ((offsetMs - vStart) / (vEnd - vStart)) * w + 0.5;
            gtx.strokeStyle = "#22c55e"; gtx.lineWidth = 2;
            gtx.beginPath(); gtx.moveTo(ox, 0); gtx.lineTo(ox, h); gtx.stroke();
        }

        if (isPlaying) {
            const head = getCurrentPlayheadMs();
            if (head >= vStart && head <= vEnd) {
                const hx = ((head - vStart) / (vEnd - vStart)) * w + 0.5;
                gtx.strokeStyle = "#eab308"; gtx.lineWidth = 2;
                gtx.beginPath(); gtx.moveTo(hx, 0); gtx.lineTo(hx, h); gtx.stroke();
            }
        }
    }, [audioBuffer, durationMs, bpm, offsetMs, isPlaying, viewStartMs, visibleRangeMs, clampViewStart, getCurrentPlayheadMs]);

    useEffect(() => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        const tick = () => {
            if (isPlaying && zoom > 1) {
                const head = getCurrentPlayheadMs();
                const desired = clampViewStart(head - visibleRangeMs / 2);
                if (Math.abs(desired - viewStartMs) > 0.5) setViewStartMs(desired);
            }
            drawWave();
            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    }, [isPlaying, zoom, getCurrentPlayheadMs, clampViewStart, visibleRangeMs, viewStartMs, drawWave]);

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

    const handleFiles = useCallback(async (files: FileList | null) => {
        if (!files || !files[0]) return;
        const f = files[0];
        setFileName(f.name);
        const ctx = ensureAudioCtx();
        const arr = await f.arrayBuffer();
        const buf = await ctx.decodeAudioData(arr.slice(0));
        setAudioBuffer(buf);
        setOffsetMs(0);
        setViewStartMs(0);
        setZoom(100);
        setBpmCandidates([]);
        stopPlayback();
    }, [ensureAudioCtx, stopPlayback]);

    function expAlpha(fc: number, sr: number) {
        return 1 - Math.exp(-2 * Math.PI * fc / sr);
    }

    function movingAvg(arr: Float32Array, win: number) {
        const out = new Float32Array(arr.length);
        let acc = 0;
        for (let i = 0; i < arr.length; i++) {
            acc += arr[i];
            if (i >= win) acc -= arr[i - win];
            out[i] = acc / Math.min(i + 1, win);
        }
        return out;
    }

    function autocorrRange(x: Float32Array, lagMin: number, lagMax: number) {
        const n = x.length;
        let mu = 0;
        for (let i = 0; i < n; i++) mu += x[i];
        mu /= n || 1;

        let varAcc = 0;
        for (let i = 0; i < n; i++) {
            const d = x[i] - mu;
            varAcc += d * d;
        }
        const denom = Math.sqrt(varAcc) || 1;

        const ac = new Float32Array(lagMax + 1);
        for (let lag = lagMin; lag <= lagMax; lag++) {
            let s = 0;
            for (let i = lag; i < n; i++) s += (x[i] - mu) * (x[i - lag] - mu);
            ac[lag] = s / denom;
        }
        return ac;
    }

    function pickLocalPeaks(ac: Float32Array, lagMin: number, lagMax: number) {
        const peaks: { lag: number; score: number }[] = [];
        for (let lag = lagMin + 1; lag < lagMax - 1; lag++) {
            const v = ac[lag];
            if (v > ac[lag - 1] && v > ac[lag + 1]) peaks.push({ lag, score: v });
        }
        return peaks;
    }

    function buildODFMultiBand(
        buf: AudioBuffer,
        frame = 1024,
        hop = 512
    ): { odf: Float32Array; hopSec: number } {
        const sr = buf.sampleRate;
        const ch0 = buf.getChannelData(0);
        const ch1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null;

        const n = ch0.length;
        const a200 = expAlpha(200, sr);
        const a2k = expAlpha(2000, sr);

        let lpf200 = 0;
        let lpf2k = 0;

        const nFrames = Math.max(0, Math.floor((n - frame) / hop));
        const E_low = new Float32Array(nFrames);
        const E_mid = new Float32Array(nFrames);
        const E_high = new Float32Array(nFrames);

        let fIdx = 0;
        let accL = 0, accM = 0, accH = 0;
        let countInFrame = 0;

        for (let i = 0; i < n; i++) {
            let x = ch0[i];
            if (ch1) x = 0.5 * (x + ch1[i]);

            lpf200 += a200 * (x - lpf200);
            lpf2k += a2k * (x - lpf2k);
            const low = lpf200;
            const mid = lpf2k - lpf200;
            const high = x - lpf2k;

            accL += low * low;
            accM += mid * mid;
            accH += high * high;
            countInFrame++;

            if (countInFrame >= frame) {
                if (fIdx < nFrames) {
                    E_low[fIdx] = accL / frame;
                    E_mid[fIdx] = accM / frame;
                    E_high[fIdx] = accH / frame;
                }
                fIdx++;
                accL = accM = accH = 0;
                countInFrame = 0;
            }
        }

        const wL = 1.1, wM = 1.2, wH = 0.7;
        const odf = new Float32Array(nFrames);
        let pL = E_low[0] || 0, pM = E_mid[0] || 0, pH = E_high[0] || 0;
        for (let i = 0; i < nFrames; i++) {
            const dL = Math.max(0, E_low[i] - pL);
            const dM = Math.max(0, E_mid[i] - pM);
            const dH = Math.max(0, E_high[i] - pH);
            odf[i] = wL * dL + wM * dM + wH * dH;
            pL = E_low[i]; pM = E_mid[i]; pH = E_high[i];
        }

        const ma = movingAvg(odf, Math.max(8, Math.round(48)));
        let maxv = 0;
        for (let i = 0; i < odf.length; i++) {
            const v = odf[i] - ma[Math.max(0, i - 1)];
            const r = v > 0 ? Math.sqrt(v) : 0;
            odf[i] = r;
            if (r > maxv) maxv = r;
        }
        if (maxv > 0) {
            for (let i = 0; i < odf.length; i++) odf[i] /= maxv;
        }

        return { odf, hopSec: hop / sr };
    }

    const analyzeBpm = useCallback(async () => {
        if (!audioBuffer) return;
        setAnalyzingBpm(true);
        try {
            const FRAME = 1024, HOP = 512;
            const { odf, hopSec } = buildODFMultiBand(audioBuffer, FRAME, HOP);

            function pickOdfPeaks(x: Float32Array, thrMul = 0.35, minSepFrames = 3) {
                const maWin = Math.max(8, Math.round(0.12 / hopSec));
                const ma = movingAvg(x, maWin);
                const peaks: { idx: number; v: number }[] = [];
                let lastIdx = -1;

                for (let i = 2; i < x.length - 2; i++) {
                    const v = x[i];
                    const base = ma[Math.max(0, i - 1)];
                    const thr = base * thrMul;
                    if (v > thr && v > x[i - 1] && v >= x[i + 1] && v > x[i - 2] && v >= x[i + 2]) {
                        if (lastIdx < 0 || (i - lastIdx) >= minSepFrames) {
                            peaks.push({ idx: i, v });
                            lastIdx = i;
                        } else if (v > peaks[peaks.length - 1].v) {
                            peaks[peaks.length - 1] = { idx: i, v };
                            lastIdx = i;
                        }
                    }
                }
                let vmax = 0; for (const p of peaks) vmax = Math.max(vmax, p.v);
                return peaks.map(p => ({ t: p.idx * hopSec, w: vmax > 0 ? p.v / vmax : 0 }));
            }

            const peaks = pickOdfPeaks(odf);
            if (peaks.length < 8) {
                const fb = Math.round(Math.max(60, Math.min(200, defaultBpm)));
                setBpmCandidates([fb]);
                setBpm(fb);
                setAnalyzingBpm(false);
                return;
            }

            function foldBpm(b: number, min = 60, max = 240) {
                while (b < min) b *= 2;
                while (b > max) b /= 2;
                return b;
            }

            function windowVotes(x: Float32Array, bpmMin = 60, bpmMax = 240) {
                const votes = new Map<number, number>();
                const winSec = 6, hopWinSec = 3;
                const win = Math.max(8, Math.round(winSec / hopSec));
                const step = Math.max(1, Math.round(hopWinSec / hopSec));

                const lagMin = Math.max(2, Math.floor((60 / bpmMax) / hopSec));
                const lagMax = Math.max(lagMin + 1, Math.floor((60 / bpmMin) / hopSec));

                for (let s = 0; s + win < x.length; s += step) {
                    const seg = x.subarray(s, s + win);
                    const ac = autocorrRange(seg as any, lagMin, lagMax);
                    const peaks = pickLocalPeaks(ac, lagMin, lagMax)
                        .sort((a, b) => b.score - a.score).slice(0, 3);

                    let strength = 0;
                    for (let i = 0; i < seg.length; i++) strength += seg[i];
                    strength /= (seg.length || 1);

                    for (const p of peaks) {
                        const bpmRaw = 60 / (p.lag * hopSec);
                        const b = Math.round(foldBpm(bpmRaw));
                        const add = Math.max(0, p.score) * (0.5 + 0.5 * strength);
                        votes.set(b, (votes.get(b) || 0) + add);
                    }
                }

                const all = Array.from(votes.entries());
                for (const [b, _v] of all) {
                    const half = Math.round(b / 2), dbl = Math.round(b * 2);
                    if (votes.has(half)) votes.set(b, (votes.get(b) || 0) + 0.5 * (votes.get(half) || 0));
                    if (votes.has(dbl)) votes.set(b, (votes.get(b) || 0) + 0.5 * (votes.get(dbl) || 0));
                }
                return votes;
            }

            const votes = windowVotes(odf);
            let candList = Array.from(votes.entries())
                .sort((a, b) => b[1] - a[1])
                .map(([b]) => b);
            if (candList.length === 0) candList = [Math.round(foldBpm(defaultBpm))];

            const uniq: number[] = [];
            for (const b of candList) {
                if (!uniq.some(u => Math.abs(u - b) <= 1)) uniq.push(b);
                if (uniq.length >= 5) break;
            }

            function phaseCost(bpm: number) {
                const T = 60 / bpm;
                if (T <= 0) return { phi: 0, cost: 1e9 };

                const GRID = 64;
                let bestPhi = 0, bestC = Number.POSITIVE_INFINITY;

                const costAtPhi = (phi: number) => {
                    let s = 0, wsum = 0;
                    for (let i = 0; i < peaks.length; i++) {
                        const t = peaks[i].t, w = peaks[i].w;
                        let r = t - phi;
                        r -= Math.floor(r / T) * T;
                        const d = Math.min(r, T - r);
                        s += w * (d * d) / (T * T);
                        wsum += w;
                    }
                    return (wsum > 0 ? s / wsum : s);
                };

                for (let k = 0; k < GRID; k++) {
                    const phi = (k / GRID) * T;
                    const c = costAtPhi(phi);
                    if (c < bestC) { bestC = c; bestPhi = phi; }
                }
                const step = T / GRID;
                const left = Math.max(0, bestPhi - step), right = Math.min(T, bestPhi + step);
                const cL = costAtPhi(left), c0 = costAtPhi(bestPhi), cR = costAtPhi(right);
                const denom = (cL - 2 * c0 + cR);
                if (Math.abs(denom) > 1e-12) {
                    const delta = 0.5 * (cL - cR) / denom;
                    const phi2 = Math.min(T, Math.max(0, bestPhi + delta * step));
                    const c2 = costAtPhi(phi2);
                    if (c2 < bestC) { bestC = c2; bestPhi = phi2; }
                }
                return { phi: bestPhi, cost: bestC };
            }

            function refineBpmAround(bpm0: number) {
                const loInit = bpm0 * 0.92, hiInit = bpm0 * 1.08;
                const phiFor = new Map<number, { phi: number, cost: number }>();

                const f = (b: number) => {
                    const key = Math.round(b * 1000) / 1000;
                    if (phiFor.has(key)) return phiFor.get(key)!.cost;
                    const res = phaseCost(b);
                    phiFor.set(key, res);
                    return res.cost;
                };

                let a = Math.max(40, loInit), b = Math.min(260, hiInit);
                const gr = (Math.sqrt(5) - 1) / 2;
                let c = b - gr * (b - a);
                let d = a + gr * (b - a);
                let fc = f(c), fd = f(d);

                for (let iter = 0; iter < 40; iter++) {
                    if (fc > fd) {
                        a = c; c = d; fc = fd; d = a + gr * (b - a); fd = f(d);
                    } else {
                        b = d; d = c; fd = fc; c = b - gr * (b - a); fc = f(c);
                    }
                    if (Math.abs(b - a) < 0.01) break;
                }
                const bpmBest = (fc < fd) ? c : d;
                const res = phaseCost(bpmBest);
                return { bpm: bpmBest, phi: res.phi, cost: res.cost };
            }

            type Fit = { bpm: number; phi: number; cost: number; tag: '0.5x' | '1x' | '2x' };
            const fits: Fit[] = [];
            for (const bInt of uniq) {
                const bases = [bInt / 2, bInt, bInt * 2]
                    .map(x => Math.max(40, Math.min(260, x)));
                for (let i = 0; i < bases.length; i++) {
                    const r = refineBpmAround(bases[i]);
                    const tag = (i === 0 ? '0.5x' : i === 1 ? '1x' : '2x') as Fit['tag'];
                    fits.push({ bpm: r.bpm, phi: r.phi, cost: r.cost, tag });
                }
            }

            fits.sort((a, b) => a.cost - b.cost);
            const best = fits[0];

            const candInts: number[] = [];
            for (const f of fits) {
                const v = Math.round(f.bpm);
                if (v >= 60 && v <= 240 && !candInts.some(c => Math.abs(c - v) <= 1)) {
                    candInts.push(v);
                }
                if (candInts.length >= 8) break;
            }
            if (candInts.length === 0) candInts.push(Math.round(foldBpm(defaultBpm)));

            setBpmCandidates(candInts);
            setBpm(Math.round(best.bpm));
        } finally {
            setAnalyzingBpm(false);
        }
    }, [audioBuffer, defaultBpm, setAnalyzingBpm, setBpm, setBpmCandidates]);

    const analyzeOffset = useCallback(async () => {
        if (!audioBuffer || bpm <= 0) return;
        setAnalyzingOffset(true);

        const sr = audioBuffer.sampleRate;
        const ch = audioBuffer.getChannelData(0);
        const frame = 1024, hop = 512; const nFrames = Math.max(0, Math.floor((ch.length - frame) / hop));
        if (nFrames <= 0) { setAnalyzingOffset(false); return; }

        const GATE_DB = -35, GATE_HOLD_MS = 30;
        const gateLin = Math.pow(10, GATE_DB / 20);
        const holdFrames = Math.max(1, Math.round((GATE_HOLD_MS / 1000) / (hop / sr)));

        const rms = new Float32Array(nFrames);
        for (let i = 0; i < nFrames; i++) { let sum = 0, st = i * hop; for (let j = 0; j < frame; j++) { const v = ch[st + j] || 0; sum += v * v; } rms[i] = Math.sqrt(sum / frame); }

        const ok: boolean[] = new Array(nFrames).fill(false);
        for (let i = 0, run = 0; i < nFrames; i++) { if (rms[i] >= gateLin) { run++; if (run >= holdFrames) ok[i] = true; } else run = 0; }

        const diff = new Float32Array(nFrames);
        let prev = rms[0] || 0; for (let i = 0; i < nFrames; i++) { const d = rms[i] - prev; diff[i] = d > 0 ? d : 0; prev = rms[i]; }
        const smooth = (arr: Float32Array, win: number) => { const out = new Float32Array(arr.length); let acc = 0; for (let i = 0; i < arr.length; i++) { acc += arr[i]; if (i >= win) acc -= arr[i - win]; out[i] = acc / Math.min(i + 1, win); } return out; };
        const mean = smooth(diff, 30);
        for (let i = 0; i < nFrames; i++) diff[i] = ok[i] ? Math.max(0, diff[i] - mean[Math.max(0, i - 1)]) : 0;

        const periodMs = 60000 / bpm;
        const hopSec = hop / sr;
        let best = 0, bestScore = -Infinity;
        const win = 20, tol = Math.floor(win / (hopSec * 1000));
        for (let o = 0; o < Math.floor(periodMs); o += 5) {
            let sc = 0;
            for (let t = o; t < nFrames * hopSec * 1000; t += periodMs) {
                const idx = Math.round((t / 1000) / hopSec);
                const i0 = Math.max(0, idx - tol), i1 = Math.min(nFrames - 1, idx + tol);
                let peak = 0; for (let k = i0; k <= i1; k++) peak = Math.max(peak, diff[k]);
                sc += peak;
            }
            if (sc > bestScore) { bestScore = sc; best = o; }
        }
        setOffsetMs(Math.max(0, Math.min(durationMs, Math.round(best))));
        setAnalyzingOffset(false);
    }, [audioBuffer, bpm, durationMs]);

    const zoomAt = useCallback((factor: number) => {
        if (!durationMs) return;
        const prev = zoom, next = Math.max(1, Math.min(128, prev * factor));
        if (next === prev) return;
        const rangeNext = durationMs / next;
        const anchor = isPlaying ? getCurrentPlayheadMs() : offsetMs;
        setZoom(next);
        setViewStartMs(clampViewStart(anchor - rangeNext / 2));
    }, [durationMs, zoom, isPlaying, getCurrentPlayheadMs, offsetMs, clampViewStart]);

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
    const onMouseDown = useCallback((e: React.MouseEvent) => { if (!durationMs) return; draggingRef.current = { startX: e.clientX, startViewMs: viewStartMs }; }, [durationMs, viewStartMs]);
    const onMouseMove = useCallback((e: React.MouseEvent) => { if (!durationMs || !draggingRef.current) return; const parent = containerRef.current!; const dx = e.clientX - draggingRef.current.startX; const panMs = -(dx / parent.clientWidth) * visibleRangeMs; setViewStartMs(clampViewStart(draggingRef.current.startViewMs + panMs)); }, [durationMs, visibleRangeMs, clampViewStart]);
    const onMouseUp = useCallback(() => { draggingRef.current = null; }, []);

    const clickArmed = useRef(false);
    const onMouseDownClick = useCallback(() => { clickArmed.current = true; }, []);
    const onMouseMoveCancelClick = useCallback(() => { if (draggingRef.current) clickArmed.current = false; }, []);
    const onClickSetOffset = useCallback((e: React.MouseEvent) => { if (!clickArmed.current || !durationMs) return; const parent = containerRef.current!; const rect = parent.getBoundingClientRect(); const x = e.clientX - rect.left; const ms = viewStartMs + (x / rect.width) * visibleRangeMs; setOffsetMs(Math.max(0, Math.min(durationMs, ms))); }, [durationMs, viewStartMs, visibleRangeMs]);

    return (
        <div className="flex flex-col gap-2 text-zinc-200">

            <div className={`flex items-center gap-2 ${PANEL} p-2`}>
                <div
                    className={`${CHIP} shrink min-w-0 max-w-[min(50%,520px)]`}
                    title={fileName || "No audio loaded"}
                >
                    <FiMusic className="opacity-80" />
                    <span className="truncate">{fileName || "No audio loaded"}</span>
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
                    <FiUpload /> Load
                </button>
                <button
                    onClick={() => (isPlaying ? stopPlayback() : playFrom(Math.max(0, offsetMs - 100)))}
                    className={BTN}
                >
                    {isPlaying ? <FiPause /> : <FiPlay />} {isPlaying ? "Pause" : "Play"}
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
                    title="Metronome (plays while audio is playing)"
                >
                    Metronome {metroOn ? "ON" : "OFF"}
                </button>
                <div className={CHIP}>
                    <span className="opacity-80">Met Vol</span>
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
                        <span className="opacity-80">BPM</span>
                        <input
                            type="number" min={1}
                            value={bpm}
                            onChange={(e) => setBpm(Math.max(1, Math.floor(Number(e.target.value || 0))))}
                            className={INPUT + " w-24"}
                        />
                    </div>
                    <div className={CHIP}>
                        <span className="opacity-80">Offset</span>
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
                        <FiRefreshCw className={analyzingBpm ? "animate-spin" : ""} /> BPM Analyze
                    </button>
                    <button disabled={!audioBuffer || analyzingOffset} onClick={analyzeOffset} className={BTN}>
                        <FiRefreshCw className={analyzingOffset ? "animate-spin" : ""} /> Offset Analyze
                    </button>
                </div>
            </div>

            <div
                ref={containerRef}
                className={`relative w-full h-56 ${PANEL} overflow-hidden select-none`}
                onWheel={onWheel}
                onMouseDown={(e) => { onMouseDown(e); onMouseDownClick(); }}
                onMouseMove={(e) => { onMouseMove(e); onMouseMoveCancelClick(); }}
                onMouseUp={onMouseUp}
                onClick={onClickSetOffset}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files; handleFiles(f); }}
                onDragOver={(e) => e.preventDefault()}
            >
                <canvas ref={canvasRef} className="absolute inset-0" />
                <canvas ref={overlayRef} className="absolute inset-0 pointer-events-none" />
                {!audioBuffer && (
                    <div className="absolute inset-0 grid place-items-center text-sm opacity-70">
                        Drop audio here or click “Load”.
                    </div>
                )}
            </div>

            <div className={`flex items-center gap-2 ${PANEL} p-2`}>
                <button onClick={() => zoomAt(1 / 1.2)} className={BTN} title="Zoom Out">
                    <FiZoomOut /> Zoom Out
                </button>
                <button onClick={() => zoomAt(1.2)} className={BTN} title="Zoom In">
                    <FiZoomIn /> Zoom In
                </button>
                <button onClick={() => { setZoom(1); setViewStartMs(0); }} className={BTN} title="Fit">
                    <FiMaximize /> Fit
                </button>

                <div className="ml-auto text-xs opacity-75">
                    Zoom: <span className="font-mono">{zoom.toFixed(2)}×</span>
                    <span className="mx-2">|</span>
                    View: <span className="font-mono">{Math.round(viewStartMs)}–{Math.round(Math.min(durationMs, viewStartMs + visibleRangeMs))} ms</span>
                </div>
            </div>

            <div className={`flex h-[55px] flex-wrap items-center gap-2 ${PANEL} p-2`}>
                <span className="text-xs opacity-80">BPM Candidates:</span>
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
                        No BPM detected
                    </span>
                )}
            </div>
        </div>
    );
}
