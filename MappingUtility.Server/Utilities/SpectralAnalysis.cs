using System.Numerics;

namespace MappingUtility.Server.Utilities;

internal static class SpectralAnalysis
{
    private const int WindowSize = 2048;
    private const int HopSize = 512;

    public static double EstimateCutoffHz(
        float[] samples, int sampleRate, float thresholdDb = -94.0f, float minOccupancy = 0.18f)
    {
        const int w = WindowSize, h = HopSize;
        var hann = new double[w];
        for (var i = 0; i < w; i++)
            hann[i] = 0.5 - 0.5 * Math.Cos(2.0 * Math.PI * i / (w - 1));

        var freqBins = w / 2 + 1;
        var buf = new Complex[w];
        var hits = new int[freqBins];
        var frameCount = 0;

        for (var start = 0; start + w <= samples.Length; start += h)
        {
            for (var i = 0; i < w; i++)
                buf[i] = new Complex(samples[start + i] * hann[i], 0.0);
            FftInPlace(buf);
            for (var i = 0; i < freqBins; i++)
            {
                var mag = buf[i].Magnitude / (w / 2.0);
                var db = (float)Math.Clamp(20.0 * Math.Log10(Math.Max(mag, 1e-12)), -120.0, 0.0);
                if (db > thresholdDb) hits[i]++;
            }
            frameCount++;
        }

        if (frameCount == 0) return 0;

        var startBin = (int)Math.Round(1000.0 / (sampleRate / 2.0) * (freqBins - 1));

        var occupancy = new float[freqBins];
        for (var b = 0; b < freqBins; b++)
            occupancy[b] = (float)hits[b] / frameCount;

        var smooth = new float[freqBins];
        for (var b = 0; b < freqBins; b++)
        {
            var b0 = Math.Max(b - 3, 0);
            var b1 = Math.Min(b + 3, freqBins - 1);
            float sum = 0;
            var cnt = 0;
            for (var j = b0; j <= b1; j++) { sum += occupancy[j]; cnt++; }
            smooth[b] = sum / cnt;
        }

        var cutoffBin = startBin;
        for (var b = startBin; b < freqBins; b++)
            if (smooth[b] >= minOccupancy) cutoffBin = b;

        var refinedBin = cutoffBin;
        for (var b = cutoffBin; b >= startBin; b--)
        {
            var next = Math.Min(b + 1, freqBins - 1);
            if (smooth[b] - smooth[next] > 0.08f) { refinedBin = b; break; }
        }

        return Math.Round((double)refinedBin / (freqBins - 1) * (sampleRate / 2.0));
    }

    public static void FftInPlace(Complex[] buf)
    {
        var n = buf.Length;
        for (int i = 1, j = 0; i < n; i++)
        {
            var bit = n >> 1;
            for (; (j & bit) != 0; bit >>= 1) j ^= bit;
            j ^= bit;
            if (i < j) (buf[i], buf[j]) = (buf[j], buf[i]);
        }
        for (var len = 2; len <= n; len <<= 1)
        {
            var ang = -2.0 * Math.PI / len;
            var wlen = new Complex(Math.Cos(ang), Math.Sin(ang));
            for (var i = 0; i < n; i += len)
            {
                var w = Complex.One;
                for (var j = 0; j < len / 2; j++)
                {
                    var u = buf[i + j];
                    var v = buf[i + j + len / 2] * w;
                    buf[i + j] = u + v;
                    buf[i + j + len / 2] = u - v;
                    w *= wlen;
                }
            }
        }
    }
}
