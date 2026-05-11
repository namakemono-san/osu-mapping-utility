function expAlpha(fc: number, sr: number): number {
    return 1 - Math.exp(-2 * Math.PI * fc / sr);
}

function movingAvg(arr: Float32Array, win: number): Float32Array {
    const out = new Float32Array(arr.length);
    let acc = 0;
    for (let i = 0; i < arr.length; i++) {
        acc += arr[i];
        if (i >= win) acc -= arr[i - win];
        out[i] = acc / Math.min(i + 1, win);
    }
    return out;
}

function autocorrRange(
    x: Float32Array,
    lagMin: number,
    lagMax: number,
): Float32Array {
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

function pickLocalPeaks(
    ac: Float32Array,
    lagMin: number,
    lagMax: number,
): { lag: number; score: number }[] {
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
    hop = 512,
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

interface OdfPeak {
    t: number;
    w: number;
}

function pickOdfPeaks(
    x: Float32Array,
    hopSec: number,
    thrMul = 0.35,
    minSepFrames = 3,
): OdfPeak[] {
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
    let vmax = 0;
    for (const p of peaks) vmax = Math.max(vmax, p.v);
    return peaks.map(p => ({ t: p.idx * hopSec, w: vmax > 0 ? p.v / vmax : 0 }));
}

function foldBpm(b: number, min = 60, max = 240): number {
    while (b < min) b *= 2;
    while (b > max) b /= 2;
    return b;
}

function windowVotes(
    x: Float32Array,
    hopSec: number,
    bpmMin = 60,
    bpmMax = 240,
): Map<number, number> {
    const votes = new Map<number, number>();
    const winSec = 6, hopWinSec = 3;
    const win = Math.max(8, Math.round(winSec / hopSec));
    const step = Math.max(1, Math.round(hopWinSec / hopSec));

    const lagMin = Math.max(2, Math.floor((60 / bpmMax) / hopSec));
    const lagMax = Math.max(lagMin + 1, Math.floor((60 / bpmMin) / hopSec));

    for (let s = 0; s + win < x.length; s += step) {
        const seg = x.subarray(s, s + win);
        const ac = autocorrRange(seg as Float32Array, lagMin, lagMax);
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
    for (const [b] of all) {
        const half = Math.round(b / 2), dbl = Math.round(b * 2);
        if (votes.has(half)) votes.set(b, (votes.get(b) || 0) + 0.5 * (votes.get(half) || 0));
        if (votes.has(dbl)) votes.set(b, (votes.get(b) || 0) + 0.5 * (votes.get(dbl) || 0));
    }
    return votes;
}

function phaseCost(
    bpm: number,
    peaks: OdfPeak[],
): { phi: number; cost: number } {
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

function refineBpmAround(
    bpm0: number,
    peaks: OdfPeak[],
): { bpm: number; phi: number; cost: number } {
    const loInit = bpm0 * 0.92, hiInit = bpm0 * 1.08;
    const phiFor = new Map<number, { phi: number; cost: number }>();

    const f = (b: number) => {
        const key = Math.round(b * 1000) / 1000;
        if (phiFor.has(key)) return phiFor.get(key)!.cost;
        const res = phaseCost(b, peaks);
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
    const res = phaseCost(bpmBest, peaks);
    return { bpm: bpmBest, phi: res.phi, cost: res.cost };
}

export interface BpmAnalysisResult {
    bpm: number;
    candidates: number[];
}

export function analyzeBpmFromBuffer(
    audioBuffer: AudioBuffer,
    defaultBpm: number,
): BpmAnalysisResult {
    const FRAME = 1024, HOP = 512;
    const { odf, hopSec } = buildODFMultiBand(audioBuffer, FRAME, HOP);

    const peaks = pickOdfPeaks(odf, hopSec);
    if (peaks.length < 8) {
        const fb = Math.round(Math.max(60, Math.min(200, defaultBpm)));
        return { bpm: fb, candidates: [fb] };
    }

    const votes = windowVotes(odf, hopSec);
    let candList = Array.from(votes.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([b]) => b);
    if (candList.length === 0) candList = [Math.round(foldBpm(defaultBpm))];

    const uniq: number[] = [];
    for (const b of candList) {
        if (!uniq.some(u => Math.abs(u - b) <= 1)) uniq.push(b);
        if (uniq.length >= 5) break;
    }

    type Fit = { bpm: number; phi: number; cost: number; tag: '0.5x' | '1x' | '2x' };
    const fits: Fit[] = [];
    for (const bInt of uniq) {
        const bases = [bInt / 2, bInt, bInt * 2]
            .map(x => Math.max(40, Math.min(260, x)));
        for (let i = 0; i < bases.length; i++) {
            const r = refineBpmAround(bases[i], peaks);
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

    return { bpm: Math.round(best.bpm), candidates: candInts };
}

export function analyzeOffsetFromBuffer(
    audioBuffer: AudioBuffer,
    bpm: number,
    durationMs: number,
): number {
    if (bpm <= 0) return 0;

    const sr = audioBuffer.sampleRate;
    const ch = audioBuffer.getChannelData(0);
    const frame = 1024, hop = 512;
    const nFrames = Math.max(0, Math.floor((ch.length - frame) / hop));
    if (nFrames <= 0) return 0;

    const GATE_DB = -35, GATE_HOLD_MS = 30;
    const gateLin = Math.pow(10, GATE_DB / 20);
    const holdFrames = Math.max(1, Math.round((GATE_HOLD_MS / 1000) / (hop / sr)));

    const rms = new Float32Array(nFrames);
    for (let i = 0; i < nFrames; i++) {
        let sum = 0;
        const st = i * hop;
        for (let j = 0; j < frame; j++) {
            const v = ch[st + j] || 0;
            sum += v * v;
        }
        rms[i] = Math.sqrt(sum / frame);
    }

    const ok: boolean[] = new Array(nFrames).fill(false);
    for (let i = 0, run = 0; i < nFrames; i++) {
        if (rms[i] >= gateLin) {
            run++;
            if (run >= holdFrames) ok[i] = true;
        } else {
            run = 0;
        }
    }

    const diff = new Float32Array(nFrames);
    let prev = rms[0] || 0;
    for (let i = 0; i < nFrames; i++) {
        const d = rms[i] - prev;
        diff[i] = d > 0 ? d : 0;
        prev = rms[i];
    }
    const mean = movingAvg(diff, 30);
    for (let i = 0; i < nFrames; i++) {
        diff[i] = ok[i] ? Math.max(0, diff[i] - mean[Math.max(0, i - 1)]) : 0;
    }

    const periodMs = 60000 / bpm;
    const hopSec = hop / sr;
    let best = 0, bestScore = -Infinity;
    const tol = Math.floor(20 / (hopSec * 1000));
    for (let o = 0; o < Math.floor(periodMs); o += 5) {
        let sc = 0;
        for (let t = o; t < nFrames * hopSec * 1000; t += periodMs) {
            const idx = Math.round((t / 1000) / hopSec);
            const i0 = Math.max(0, idx - tol), i1 = Math.min(nFrames - 1, idx + tol);
            let peak = 0;
            for (let k = i0; k <= i1; k++) peak = Math.max(peak, diff[k]);
            sc += peak;
        }
        if (sc > bestScore) { bestScore = sc; best = o; }
    }
    return Math.max(0, Math.min(durationMs, Math.round(best)));
}
