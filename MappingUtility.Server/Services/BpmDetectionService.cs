namespace MappingUtility.Server.Services;

public record BpmResult(int Bpm, int[] Candidates);

public static class BpmDetectionService
{
    private record OdfPeak(double T, double W);

    private static float ExpAlpha(float fc, int sr) =>
        1f - MathF.Exp(-2f * MathF.PI * fc / sr);

    private static float[] MovingAvg(float[] arr, int win)
    {
        var out_ = new float[arr.Length];
        double acc = 0;
        for (var i = 0; i < arr.Length; i++)
        {
            acc += arr[i];
            if (i >= win) acc -= arr[i - win];
            out_[i] = (float)(acc / Math.Min(i + 1, win));
        }
        return out_;
    }

    private static double[] AutocorrRange(float[] x, int lagMin, int lagMax)
    {
        var n = x.Length;
        double mu = 0;
        for (var i = 0; i < n; i++) mu += x[i];
        mu /= Math.Max(1, n);

        double varAcc = 0;
        for (var i = 0; i < n; i++) { var d = x[i] - mu; varAcc += d * d; }
        var denom = Math.Sqrt(varAcc);
        if (denom < 1e-10) denom = 1;

        var ac = new double[lagMax + 1];
        for (var lag = lagMin; lag <= lagMax; lag++)
        {
            double s = 0;
            for (var i = lag; i < n; i++) s += (x[i] - mu) * (x[i - lag] - mu);
            ac[lag] = s / denom;
        }
        return ac;
    }

    private static (int Lag, double Score)[] PickLocalPeaks(double[] ac, int lagMin, int lagMax)
    {
        var peaks = new List<(int, double)>();
        for (var lag = lagMin + 1; lag < lagMax - 1; lag++)
        {
            var v = ac[lag];
            if (v > ac[lag - 1] && v > ac[lag + 1]) peaks.Add((lag, v));
        }
        return [.. peaks];
    }

    private static (float[] Odf, double HopSec) BuildOdfMultiBand(float[] samples, int sr, int frame = 1024, int hop = 512)
    {
        var n = samples.Length;
        var a200 = ExpAlpha(200, sr);
        var a2k = ExpAlpha(2000, sr);

        float lpf200 = 0, lpf2k = 0;
        var nFrames = Math.Max(0, (n - frame) / hop);
        var E_low = new float[nFrames];
        var E_mid = new float[nFrames];
        var E_high = new float[nFrames];

        int fIdx = 0;
        double accL = 0, accM = 0, accH = 0;
        int countInFrame = 0;

        for (var i = 0; i < n; i++)
        {
            var x = samples[i];
            lpf200 += a200 * (x - lpf200);
            lpf2k += a2k * (x - lpf2k);
            var low = lpf200;
            var mid = lpf2k - lpf200;
            var high = x - lpf2k;

            accL += low * low;
            accM += mid * mid;
            accH += high * high;
            countInFrame++;

            if (countInFrame >= frame)
            {
                if (fIdx < nFrames)
                {
                    E_low[fIdx] = (float)(accL / frame);
                    E_mid[fIdx] = (float)(accM / frame);
                    E_high[fIdx] = (float)(accH / frame);
                }
                fIdx++;
                accL = accM = accH = 0;
                countInFrame = 0;
            }
        }

        const float wL = 1.1f, wM = 1.2f, wH = 0.7f;
        var odf = new float[nFrames];
        float pL = nFrames > 0 ? E_low[0] : 0, pM = nFrames > 0 ? E_mid[0] : 0, pH = nFrames > 0 ? E_high[0] : 0;
        for (var i = 0; i < nFrames; i++)
        {
            var dL = Math.Max(0f, E_low[i] - pL);
            var dM = Math.Max(0f, E_mid[i] - pM);
            var dH = Math.Max(0f, E_high[i] - pH);
            odf[i] = wL * dL + wM * dM + wH * dH;
            pL = E_low[i]; pM = E_mid[i]; pH = E_high[i];
        }

        var ma = MovingAvg(odf, Math.Max(8, 48));
        float maxv = 0;
        for (var i = 0; i < odf.Length; i++)
        {
            var v = odf[i] - (i > 0 ? ma[i - 1] : 0);
            var r = v > 0 ? MathF.Sqrt(v) : 0;
            odf[i] = r;
            if (r > maxv) maxv = r;
        }
        if (maxv > 0) for (var i = 0; i < odf.Length; i++) odf[i] /= maxv;

        return (odf, (double)hop / sr);
    }

    private static OdfPeak[] PickOdfPeaks(float[] x, double hopSec, float thrMul = 0.35f, int minSepFrames = 3)
    {
        var maWin = Math.Max(8, (int)Math.Round(0.12 / hopSec));
        var ma = MovingAvg(x, maWin);
        var peaks = new List<(int Idx, float V)>();
        var lastIdx = -1;

        for (var i = 2; i < x.Length - 2; i++)
        {
            var v = x[i];
            var thr = ma[Math.Max(0, i - 1)] * thrMul;
            if (v > thr && v > x[i - 1] && v >= x[i + 1] && v > x[i - 2] && v >= x[i + 2])
            {
                if (lastIdx < 0 || (i - lastIdx) >= minSepFrames)
                {
                    peaks.Add((i, v));
                    lastIdx = i;
                }
                else if (v > peaks[^1].V)
                {
                    peaks[^1] = (i, v);
                    lastIdx = i;
                }
            }
        }

        float vmax = 0;
        foreach (var p in peaks) if (p.V > vmax) vmax = p.V;
        return [.. peaks.Select(p => new OdfPeak(p.Idx * hopSec, vmax > 0 ? p.V / vmax : 0))];
    }

    private static double FoldBpm(double b, double min = 60, double max = 240)
    {
        while (b < min) b *= 2;
        while (b > max) b /= 2;
        return b;
    }

    private static Dictionary<int, double> WindowVotes(float[] x, double hopSec, int bpmMin = 60, int bpmMax = 240)
    {
        var votes = new Dictionary<int, double>();
        const double winSec = 6, hopWinSec = 3;
        var win = Math.Max(8, (int)Math.Round(winSec / hopSec));
        var step = Math.Max(1, (int)Math.Round(hopWinSec / hopSec));

        var lagMin = Math.Max(2, (int)Math.Floor(60.0 / bpmMax / hopSec));
        var lagMax = Math.Max(lagMin + 1, (int)Math.Floor(60.0 / bpmMin / hopSec));

        for (var s = 0; s + win < x.Length; s += step)
        {
            var seg = x[s..(s + win)];
            var ac = AutocorrRange(seg, lagMin, lagMax);
            var peaks = PickLocalPeaks(ac, lagMin, lagMax)
                .OrderByDescending(p => p.Score).Take(3).ToArray();

            double strength = 0;
            foreach (var v in seg) strength += v;
            strength /= Math.Max(1, seg.Length);

            foreach (var p in peaks)
            {
                var bpmRaw = 60.0 / (p.Lag * hopSec);
                var b = (int)Math.Round(FoldBpm(bpmRaw));
                var add = Math.Max(0, p.Score) * (0.5 + 0.5 * strength);
                votes[b] = (votes.TryGetValue(b, out var old) ? old : 0) + add;
            }
        }

        foreach (var b in votes.Keys.ToArray())
        {
            var half = (int)Math.Round(b / 2.0);
            var dbl = (int)Math.Round(b * 2.0);
            if (votes.TryGetValue(half, out var hv)) votes[b] += 0.5 * hv;
            if (votes.TryGetValue(dbl, out var dv)) votes[b] += 0.5 * dv;
        }
        return votes;
    }

    private static (double Phi, double Cost) PhaseCost(double bpm, OdfPeak[] peaks)
    {
        var T = 60.0 / bpm;
        if (T <= 0) return (0, 1e9);

        const int GRID = 64;
        var bestPhi = 0.0; var bestC = double.PositiveInfinity;

        double CostAtPhi(double phi)
        {
            double s = 0, wsum = 0;
            foreach (var p in peaks)
            {
                var r = p.T - phi;
                r -= Math.Floor(r / T) * T;
                var d = Math.Min(r, T - r);
                s += p.W * d * d / (T * T);
                wsum += p.W;
            }
            return wsum > 0 ? s / wsum : s;
        }

        for (var k = 0; k < GRID; k++)
        {
            var phi = k / (double)GRID * T;
            var c = CostAtPhi(phi);
            if (c < bestC) { bestC = c; bestPhi = phi; }
        }

        var stepSize = T / GRID;
        var left = Math.Max(0, bestPhi - stepSize);
        var right = Math.Min(T, bestPhi + stepSize);
        var cL = CostAtPhi(left); var c0 = CostAtPhi(bestPhi); var cR = CostAtPhi(right);
        var denom = cL - 2 * c0 + cR;
        if (Math.Abs(denom) > 1e-12)
        {
            var delta = 0.5 * (cL - cR) / denom;
            var phi2 = Math.Clamp(bestPhi + delta * stepSize, 0, T);
            var c2 = CostAtPhi(phi2);
            if (c2 < bestC) { bestC = c2; bestPhi = phi2; }
        }
        return (bestPhi, bestC);
    }

    private static (double Bpm, double Phi, double Cost) RefineBpmAround(double bpm0, OdfPeak[] peaks)
    {
        var loInit = bpm0 * 0.92; var hiInit = bpm0 * 1.08;
        var phiFor = new Dictionary<long, (double Phi, double Cost)>();

        double F(double b)
        {
            var key = (long)Math.Round(b * 1000);
            if (phiFor.TryGetValue(key, out var cached)) return cached.Cost;
            var res = PhaseCost(b, peaks);
            phiFor[key] = res;
            return res.Cost;
        }

        double a = Math.Max(40, loInit), bVal = Math.Min(260, hiInit);
        const double gr = 0.6180339887; // (sqrt(5)-1)/2
        var c = bVal - gr * (bVal - a); var d = a + gr * (bVal - a);
        var fc = F(c); var fd = F(d);

        for (var iter = 0; iter < 40; iter++)
        {
            if (fc > fd) { a = c; c = d; fc = fd; d = a + gr * (bVal - a); fd = F(d); }
            else { bVal = d; d = c; fd = fc; c = bVal - gr * (bVal - a); fc = F(c); }
            if (Math.Abs(bVal - a) < 0.01) break;
        }
        var bpmBest = fc < fd ? c : d;
        var res2 = PhaseCost(bpmBest, peaks);
        return (bpmBest, res2.Phi, res2.Cost);
    }

    public static BpmResult AnalyzeBpm(float[] samples, int sampleRate, int defaultBpm = 120)
    {
        var (odf, hopSec) = BuildOdfMultiBand(samples, sampleRate);
        var peaks = PickOdfPeaks(odf, hopSec);

        if (peaks.Length < 8)
        {
            var fb = Math.Clamp((int)Math.Round(FoldBpm(defaultBpm)), 60, 240);
            return new BpmResult(fb, [fb]);
        }

        var votes = WindowVotes(odf, hopSec);
        var candList = votes.OrderByDescending(kv => kv.Value).Select(kv => kv.Key).ToList();
        if (candList.Count == 0) candList.Add((int)Math.Round(FoldBpm(defaultBpm)));

        var uniq = new List<int>();
        foreach (var b in candList)
        {
            if (!uniq.Any(u => Math.Abs(u - b) <= 1)) uniq.Add(b);
            if (uniq.Count >= 5) break;
        }

        var fits = new List<(double Bpm, double Phi, double Cost)>();
        foreach (var bInt in uniq)
        {
            foreach (var baseB in new[] { bInt / 2.0, (double)bInt, bInt * 2.0 }
                .Select(x => Math.Clamp(x, 40, 260)))
            {
                fits.Add(RefineBpmAround(baseB, peaks));
            }
        }
        fits.Sort((x, y) => x.Cost.CompareTo(y.Cost));
        var best = fits[0];

        var candInts = new List<int>();
        foreach (var f in fits)
        {
            var v = (int)Math.Round(f.Bpm);
            if (v >= 60 && v <= 240 && !candInts.Any(c => Math.Abs(c - v) <= 1))
                candInts.Add(v);
            if (candInts.Count >= 8) break;
        }
        if (candInts.Count == 0) candInts.Add((int)Math.Round(FoldBpm(defaultBpm)));

        return new BpmResult((int)Math.Round(best.Bpm), [.. candInts]);
    }

    public static int AnalyzeOffset(float[] samples, int sampleRate, double bpm, double durationMs)
    {
        if (bpm <= 0) return 0;

        const int frame = 1024, hop = 512;
        var nFrames = Math.Max(0, (samples.Length - frame) / hop);
        if (nFrames <= 0) return 0;

        const double GATE_DB = -35;
        var gateLin = Math.Pow(10, GATE_DB / 20.0);
        var holdFrames = Math.Max(1, (int)Math.Round(0.030 / ((double)hop / sampleRate)));

        var rms = new float[nFrames];
        for (var i = 0; i < nFrames; i++)
        {
            double sum = 0;
            var st = i * hop;
            for (var j = 0; j < frame; j++) { var v = samples[st + j]; sum += v * v; }
            rms[i] = (float)Math.Sqrt(sum / frame);
        }

        var ok = new bool[nFrames];
        for (int i = 0, run = 0; i < nFrames; i++)
        {
            if (rms[i] >= gateLin) { run++; if (run >= holdFrames) ok[i] = true; }
            else run = 0;
        }

        var diff = new float[nFrames];
        float prev = rms[0];
        for (var i = 0; i < nFrames; i++)
        {
            var d = rms[i] - prev;
            diff[i] = d > 0 ? d : 0;
            prev = rms[i];
        }
        var mean = MovingAvg(diff, 30);
        for (var i = 0; i < nFrames; i++)
            diff[i] = ok[i] ? Math.Max(0f, diff[i] - (i > 0 ? mean[i - 1] : 0)) : 0;

        var periodMs = 60000.0 / bpm;
        var hopSec = (double)hop / sampleRate;
        var tol = (int)Math.Floor(20.0 / (hopSec * 1000));
        int best = 0; double bestScore = double.NegativeInfinity;

        for (var o = 0; o < (int)Math.Floor(periodMs); o += 5)
        {
            double sc = 0;
            for (var t = (double)o; t < nFrames * hopSec * 1000; t += periodMs)
            {
                var idx = (int)Math.Round(t / 1000.0 / hopSec);
                var i0 = Math.Max(0, idx - tol); var i1 = Math.Min(nFrames - 1, idx + tol);
                float peak = 0;
                for (var k = i0; k <= i1; k++) if (diff[k] > peak) peak = diff[k];
                sc += peak;
            }
            if (sc > bestScore) { bestScore = sc; best = o; }
        }

        return Math.Max(0, Math.Min((int)Math.Round(durationMs), best));
    }
}
