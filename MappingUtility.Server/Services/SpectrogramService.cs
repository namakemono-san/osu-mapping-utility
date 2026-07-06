using System.Numerics;
using MappingUtility.Server.Utilities;
using SixLabors.Fonts;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Drawing.Processing;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;

namespace MappingUtility.Server.Services;

public static class SpectrogramService
{
    private const int OutputWidth = 800;
    private const int OutputHeight = 450;
    private const int TargetTimeBins = 800;
    private const string AppVersion = "2.0.0-canary.1";
    private const int WindowSize = 4096;
    private const int MinHop = 1024;
    private const float MinDb = -120f;
    private const float MaxDb = 0f;

    private static readonly (float Pos, byte R, byte G, byte B)[] ColorStops =
    [
        (0.00f,  18,   0,  30),
        (0.14f,  40,   0, 120),
        (0.30f,   0,   0, 255),
        (0.46f,   0, 180, 255),
        (0.65f,   0, 255,   0),
        (0.83f, 255, 255,   0),
        (1.00f, 255,   0,   0),
    ];

    private static readonly byte[][] Font8x8 = BuildFont8x8();

    public static (float[][] Frames, int FrameCount, int FreqBins) ComputeFramesPublic(float[] samples, int sampleRate)
    {
        var frames = ComputeFrames(samples, sampleRate);
        int freqBins = frames.Length > 0 ? frames[0].Length : 0;
        return (frames, frames.Length, freqBins);
    }

    public static byte[] GeneratePngFromFrames(
        float[][] frames,
        int sampleRate,
        double durationSeconds,
        double cutoffHz,
        string sourceDisplay = "")
        => RenderPng(frames, sampleRate, durationSeconds, cutoffHz, sourceDisplay);

    public static byte[] GeneratePng(
        float[] samples,
        int sampleRate,
        double durationSeconds,
        double cutoffHz,
        string sourceDisplay = "")
        => RenderPng(ComputeFrames(samples, sampleRate), sampleRate, durationSeconds, cutoffHz, sourceDisplay);

    private static byte[] RenderPng(
        float[][] frames,
        int sampleRate,
        double durationSeconds,
        double cutoffHz,
        string sourceDisplay)
    {
        const int width = OutputWidth;
        const int height = OutputHeight;

        const int marginLeft = 76, marginTop = 44, marginBottom = 38;
        const int barWidth = 18, barLabelGap = 8, rightPadding = 92;

        int colorBarX = width - rightPadding;
        int plotLeft = marginLeft;
        int plotTop = marginTop;
        int plotRight = colorBarX - 14;
        int plotBottom = height - marginBottom;
        int plotWidth = Math.Max(plotRight - plotLeft, 1);
        int plotHeight = Math.Max(plotBottom - plotTop, 1);

        int maxFreqHz = Math.Min(sampleRate / 2, 24000);
        using var image = new Image<Rgb24>(width, height, new Rgb24(0, 0, 0));

        if (frames.Length > 0 && frames[0].Length > 0)
        {
            int srcW = frames.Length;
            int srcH = frames[0].Length;
            float nyquist = sampleRate / 2f;
            float maxFreq = maxFreqHz;

            var xToBin = new int[plotWidth];
            for (int ix = 0; ix < plotWidth; ix++)
            {
                float tx = plotWidth <= 1 ? 0 : (float)ix * (srcW - 1) / (plotWidth - 1);
                xToBin[ix] = (int)Math.Round(Math.Clamp(tx, 0, srcW - 1));
            }

            var yToBin = new int[plotHeight];
            for (int iy = 0; iy < plotHeight; iy++)
            {
                float yNorm = 1f - (float)iy / Math.Max(plotHeight - 1, 1);
                float freq = yNorm * maxFreq;
                float bin = (freq / nyquist) * (srcH - 1);
                yToBin[iy] = (int)Math.Round(Math.Clamp(bin, 0, srcH - 1));
            }

            image.ProcessPixelRows(accessor =>
            {
                for (int iy = 0; iy < plotHeight; iy++)
                {
                    var row = accessor.GetRowSpan(plotTop + iy);
                    int freqBin = yToBin[iy];
                    for (int ix = 0; ix < plotWidth; ix++)
                        row[plotLeft + ix] = DbToColor(frames[xToBin[ix]][freqBin]);
                }
            });
        }

        var freqTicks = BuildFreqTicks(maxFreqHz);
        foreach (var freq in freqTicks)
        {
            int y = FreqToPlotY(freq, plotTop, plotBottom, maxFreqHz);
            DrawHLine(image, plotLeft, plotRight, y, new Rgb24(40, 40, 40));

            var label = FormatFreqLabel(freq);
            int lw = BitmapTextWidth(label, 1);
            DrawBitmapText(image, plotLeft - lw - 8, y - 4, label, new Rgb24(220, 220, 220), 1);
        }

        var timeTicks = BuildTimeTicks(durationSeconds);
        foreach (var tick in timeTicks)
        {
            int x = TimeToPlotX(tick, durationSeconds, plotLeft, plotRight);
            DrawVLine(image, x, plotTop, plotBottom, new Rgb24(40, 40, 40));

            var label = FormatTimeLabel(tick);
            DrawBitmapText(image, x - 9, plotBottom + 8, label, new Rgb24(220, 220, 220), 1);
        }

        const int headerPad = 16;
        const float headerCenterY = marginTop / 2f;

        if (!string.IsNullOrEmpty(sourceDisplay))
        {
            var font = PickFont(sourceDisplay, 16);
            if (font != null)
                image.Mutate(ctx => ctx.DrawText(sourceDisplay, font, Color.White,
                    new PointF(headerPad, headerCenterY - 16f / 2f)));
            else
                DrawBitmapText(image, headerPad, (int)(headerCenterY - 8), sourceDisplay, new Rgb24(255, 255, 255), 2);
        }

        var appLabel = $"osu! mapping utility v{AppVersion}";
        var appFont = PickFont(appLabel, 14);
        if (appFont != null)
        {
            var measure = TextMeasurer.MeasureSize(appLabel, new TextOptions(appFont));
            float x = Math.Max(width - measure.Width - headerPad, headerPad);
            image.Mutate(ctx => ctx.DrawText(appLabel, appFont, Color.White,
                new PointF(x, headerCenterY - 14f / 2f)));
        }
        else
        {
            int appLabelW = BitmapTextWidth(appLabel, 2);
            DrawBitmapText(image, Math.Max(width - appLabelW - headerPad, headerPad),
                (int)(headerCenterY - 8), appLabel, new Rgb24(255, 255, 255), 2);
        }

        if (cutoffHz > 0)
        {
            int cutoffY = FreqToPlotY((int)Math.Min(cutoffHz, maxFreqHz), plotTop, plotBottom, maxFreqHz);
            DrawDashedHLine(image, plotLeft + 1, plotRight - 1, cutoffY, new Rgb24(255, 64, 64), 9, 5);
            if (cutoffY + 1 < plotBottom)
                DrawDashedHLine(image, plotLeft + 1, plotRight - 1, cutoffY + 1, new Rgb24(255, 32, 32), 9, 5);

            var cutoffLabel = $"{cutoffHz / 1000.0:F1}kHz";
            int labelY = Math.Max(cutoffY - 10, plotTop + 2);
            DrawBitmapText(image, plotLeft + 4, labelY, cutoffLabel, new Rgb24(255, 64, 64), 1);
        }

        DrawRect(image, plotLeft, plotTop, plotWidth, plotHeight, new Rgb24(185, 185, 185));

        image.ProcessPixelRows(accessor =>
        {
            for (int y = 0; y < plotHeight; y++)
            {
                var row = accessor.GetRowSpan(plotTop + y);
                float t = 1f - (float)y / Math.Max(plotHeight - 1, 1);
                float db = MinDb + t * (MaxDb - MinDb);
                var color = DbToColor(db);
                for (int x = 0; x < barWidth; x++)
                    row[colorBarX + x] = color;
            }
        });
        DrawRect(image, colorBarX, plotTop, barWidth, plotHeight, new Rgb24(185, 185, 185));

        foreach (var db in new[] { 0, -20, -40, -60, -80, -100, -120 })
        {
            int y = DbToBarY(db, plotTop, plotBottom);
            var label = $"{db} dB";
            DrawBitmapText(image, colorBarX + barWidth + barLabelGap, y - 4, label, new Rgb24(220, 220, 220), 1);
        }

        using var ms = new MemoryStream();
        image.SaveAsPng(ms);
        return ms.ToArray();
    }

    private static float[][] ComputeFrames(float[] samples, int sampleRate)
    {
        _ = sampleRate;
        if (samples.Length == 0)
            return [[.. Enumerable.Repeat(MinDb, WindowSize / 2 + 1)]];

        int desired = Math.Max(TargetTimeBins, 120);
        int hop = samples.Length <= WindowSize || desired <= 1
            ? MinHop
            : Math.Max((samples.Length - WindowSize + desired - 2) / (desired - 1), MinHop);

        int frameCount = samples.Length <= WindowSize
            ? 1
            : DivCeil(samples.Length - WindowSize, hop) + 1;

        int freqBins = WindowSize / 2 + 1;
        float reference = WindowSize / 2f;

        var hann = new float[WindowSize];
        for (int i = 0; i < WindowSize; i++)
        {
            float ratio = i / (float)(WindowSize - 1);
            hann[i] = 0.5f - 0.5f * MathF.Cos(2f * MathF.PI * ratio);
        }

        var frames = new float[frameCount][];

        Parallel.For(0, frameCount, () => new Complex[WindowSize], (f, _, buf) =>
        {
            int start = f * hop;
            for (int i = 0; i < WindowSize; i++)
            {
                float s = start + i < samples.Length ? samples[start + i] : 0f;
                buf[i] = new Complex(s * hann[i], 0.0);
            }

            SpectralAnalysis.FftInPlace(buf);

            var row = new float[freqBins];
            for (int i = 0; i < freqBins; i++)
            {
                float mag = (float)buf[i].Magnitude;
                float normalized = Math.Max(mag / reference, 1e-12f);
                row[i] = Math.Clamp(20f * MathF.Log10(normalized), MinDb, MaxDb);
            }
            frames[f] = row;
            return buf;
        }, _ => { });

        return frames;
    }

    private static int DivCeil(int a, int b) => (a + b - 1) / b;

    private static Font? PickFont(string text, float size)
    {
        bool needsCjk = text.Any(c => c > 127);

        string[] candidates = needsCjk
            ? ["Yu Gothic UI", "Yu Gothic", "Meiryo UI", "Meiryo", "MS UI Gothic",
               "MS Gothic", "Arial Unicode MS", "Segoe UI", "Arial"]
            : ["Segoe UI", "Arial", "Yu Gothic UI", "Meiryo"];

        foreach (var name in candidates)
            if (SystemFonts.TryGet(name, out var family))
                return family.CreateFont(size);

        return null;
    }

    private static Rgb24 DbToColor(float db)
    {
        float normalized = Math.Clamp((db - MinDb) / (MaxDb - MinDb), 0f, 1f);
        for (int i = 0; i < ColorStops.Length - 1; i++)
        {
            var (s, sr, sg, sb) = ColorStops[i];
            var (e, er, eg, eb) = ColorStops[i + 1];
            if (normalized >= s && normalized <= e)
            {
                float t = (normalized - s) / Math.Max(e - s, 1e-6f);
                return new Rgb24(
                    (byte)MathF.Round(sr + (er - sr) * t),
                    (byte)MathF.Round(sg + (eg - sg) * t),
                    (byte)MathF.Round(sb + (eb - sb) * t));
            }
        }
        var last = ColorStops[^1];
        return new Rgb24(last.R, last.G, last.B);
    }

    private static int[] BuildFreqTicks(int maxFreqHz)
    {
        int step = maxFreqHz >= 20000 ? 4000 : 2000;
        var ticks = Enumerable.Range(0, maxFreqHz / step + 1).Select(i => i * step).ToList();
        if (ticks[^1] != maxFreqHz) ticks.Add(maxFreqHz);
        return [.. ticks];
    }

    private static double[] BuildTimeTicks(double durationSeconds)
    {
        if (durationSeconds <= 0) return [0.0];
        double rough = durationSeconds / 8.0;
        double[] steps = [5, 10, 15, 20, 30, 45, 60, 90, 120];
        double step = steps.FirstOrDefault(s => s >= rough, 120);
        var ticks = new List<double> { 0.0 };
        for (double t = step; t < durationSeconds; t += step) ticks.Add(t);
        ticks.Add(durationSeconds);
        if (ticks.Count >= 3 && ticks[^1] - ticks[^2] < step * 0.55)
            ticks.RemoveAt(ticks.Count - 2);
        return [.. ticks];
    }

    private static int FreqToPlotY(int freq, int plotTop, int plotBottom, int maxFreq)
    {
        float f = Math.Clamp(freq, 0, maxFreq);
        float p = 1f - f / Math.Max(maxFreq, 1);
        return (int)(plotTop + p * (plotBottom - plotTop));
    }

    private static int TimeToPlotX(double timeSec, double duration, int plotLeft, int plotRight)
    {
        if (duration <= 0) return plotLeft;
        return (int)(plotLeft + Math.Clamp(timeSec / duration, 0, 1) * (plotRight - plotLeft));
    }

    private static int DbToBarY(int db, int plotTop, int plotBottom)
    {
        float t = ((db - MinDb) / (MaxDb - MinDb));
        float p = 1f - t;
        return (int)(plotTop + p * (plotBottom - plotTop));
    }

    private static string FormatFreqLabel(int freq)
    {
        if (freq == 0) return "0 kHz";
        if (freq % 1000 == 0) return $"{freq / 1000} kHz";
        return $"{freq / 1000.0:F1} kHz";
    }

    private static string FormatTimeLabel(double seconds)
    {
        long total = (long)Math.Round(Math.Max(seconds, 0));
        return $"{total / 60}:{total % 60:D2}";
    }


    private static void DrawHLine(Image<Rgb24> img, int x0, int x1, int y, Rgb24 color)
    {
        if (y < 0 || y >= img.Height) return;
        img.ProcessPixelRows(acc =>
        {
            var row = acc.GetRowSpan(y);
            for (int x = Math.Max(x0, 0); x < Math.Min(x1, img.Width); x++)
                row[x] = color;
        });
    }

    private static void DrawVLine(Image<Rgb24> img, int x, int y0, int y1, Rgb24 color)
    {
        if (x < 0 || x >= img.Width) return;
        img.ProcessPixelRows(acc =>
        {
            for (int y = Math.Max(y0, 0); y < Math.Min(y1, img.Height); y++)
                acc.GetRowSpan(y)[x] = color;
        });
    }

    private static void DrawDashedHLine(Image<Rgb24> img, int x0, int x1, int y, Rgb24 color, int dash, int gap)
    {
        if (y < 0 || y >= img.Height) return;
        img.ProcessPixelRows(acc =>
        {
            var row = acc.GetRowSpan(y);
            int x = Math.Max(x0, 0), end = Math.Min(x1, img.Width);
            while (x < end)
            {
                int segEnd = Math.Min(x + dash, end);
                for (int px = x; px < segEnd; px++) row[px] = color;
                x = segEnd + gap;
            }
        });
    }

    private static void DrawRect(Image<Rgb24> img, int x, int y, int w, int h, Rgb24 color)
    {
        DrawHLine(img, x, x + w, y, color);
        DrawHLine(img, x, x + w, y + h, color);
        DrawVLine(img, x, y, y + h, color);
        DrawVLine(img, x + w, y, y + h, color);
    }


    private static int BitmapTextWidth(string text, int scale)
    {
        int w = 0;
        foreach (char c in text) w += c == ' ' ? 3 * scale : 8 * scale;
        return w;
    }

    private static void DrawBitmapText(Image<Rgb24> img, int x, int y, string text, Rgb24 color, int scale)
    {
        int cx = x;
        foreach (char ch in text)
        {
            if (ch == ' ') { cx += 3 * scale; continue; }
            int idx = (int)ch;
            if (idx >= 0 && idx < Font8x8.Length && Font8x8[idx] != null)
            {
                var glyph = Font8x8[idx];
                img.ProcessPixelRows(acc =>
                {
                    for (int row = 0; row < 8; row++)
                    {
                        byte bits = glyph[row];
                        for (int col = 0; col < 8; col++)
                        {
                            if ((bits & (1 << col)) != 0)
                            {
                                for (int sy = 0; sy < scale; sy++)
                                for (int sx = 0; sx < scale; sx++)
                                {
                                    int px = cx + col * scale + sx;
                                    int py = y + row * scale + sy;
                                    if (px >= 0 && py >= 0 && px < img.Width && py < img.Height)
                                        acc.GetRowSpan(py)[px] = color;
                                }
                            }
                        }
                    }
                });
            }
            cx += 8 * scale;
        }
    }

    private static byte[][] BuildFont8x8()
    {
        var f = new byte[128][];
        f[32] = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
        f[33] = [0x18, 0x3C, 0x3C, 0x18, 0x18, 0x00, 0x18, 0x00];
        f[34] = [0x36, 0x36, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
        f[35] = [0x36, 0x36, 0x7F, 0x36, 0x7F, 0x36, 0x36, 0x00];
        f[36] = [0x0C, 0x3E, 0x03, 0x1E, 0x30, 0x1F, 0x0C, 0x00];
        f[37] = [0x00, 0x63, 0x33, 0x18, 0x0C, 0x66, 0x63, 0x00];
        f[38] = [0x1C, 0x36, 0x1C, 0x6E, 0x3B, 0x33, 0x6E, 0x00];
        f[39] = [0x06, 0x06, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00];
        f[40] = [0x18, 0x0C, 0x06, 0x06, 0x06, 0x0C, 0x18, 0x00];
        f[41] = [0x06, 0x0C, 0x18, 0x18, 0x18, 0x0C, 0x06, 0x00];
        f[42] = [0x00, 0x66, 0x3C, 0xFF, 0x3C, 0x66, 0x00, 0x00];
        f[43] = [0x00, 0x0C, 0x0C, 0x3F, 0x0C, 0x0C, 0x00, 0x00];
        f[44] = [0x00, 0x00, 0x00, 0x00, 0x00, 0x0C, 0x0C, 0x06];
        f[45] = [0x00, 0x00, 0x00, 0x3F, 0x00, 0x00, 0x00, 0x00];
        f[46] = [0x00, 0x00, 0x00, 0x00, 0x00, 0x0C, 0x0C, 0x00];
        f[47] = [0x60, 0x30, 0x18, 0x0C, 0x06, 0x03, 0x01, 0x00];
        f[48] = [0x3E, 0x63, 0x73, 0x7B, 0x6F, 0x67, 0x3E, 0x00];
        f[49] = [0x0C, 0x0E, 0x0C, 0x0C, 0x0C, 0x0C, 0x3F, 0x00];
        f[50] = [0x1E, 0x33, 0x30, 0x1C, 0x06, 0x33, 0x3F, 0x00];
        f[51] = [0x1E, 0x33, 0x30, 0x1C, 0x30, 0x33, 0x1E, 0x00];
        f[52] = [0x38, 0x3C, 0x36, 0x33, 0x7F, 0x30, 0x78, 0x00];
        f[53] = [0x3F, 0x03, 0x1F, 0x30, 0x30, 0x33, 0x1E, 0x00];
        f[54] = [0x1C, 0x06, 0x03, 0x1F, 0x33, 0x33, 0x1E, 0x00];
        f[55] = [0x3F, 0x33, 0x30, 0x18, 0x0C, 0x0C, 0x0C, 0x00];
        f[56] = [0x1E, 0x33, 0x33, 0x1E, 0x33, 0x33, 0x1E, 0x00];
        f[57] = [0x1E, 0x33, 0x33, 0x3E, 0x30, 0x18, 0x0E, 0x00];
        f[58] = [0x00, 0x0C, 0x0C, 0x00, 0x00, 0x0C, 0x0C, 0x00];
        f[59] = [0x00, 0x0C, 0x0C, 0x00, 0x00, 0x0C, 0x0C, 0x06];
        f[60] = [0x18, 0x0C, 0x06, 0x03, 0x06, 0x0C, 0x18, 0x00];
        f[61] = [0x00, 0x00, 0x3F, 0x00, 0x00, 0x3F, 0x00, 0x00];
        f[62] = [0x06, 0x0C, 0x18, 0x30, 0x18, 0x0C, 0x06, 0x00];
        f[63] = [0x1E, 0x33, 0x30, 0x18, 0x0C, 0x00, 0x0C, 0x00];
        f[64] = [0x3E, 0x63, 0x7B, 0x7B, 0x7B, 0x03, 0x1E, 0x00];
        f[65] = [0x0C, 0x1E, 0x33, 0x33, 0x3F, 0x33, 0x33, 0x00];
        f[66] = [0x3F, 0x66, 0x66, 0x3E, 0x66, 0x66, 0x3F, 0x00];
        f[67] = [0x3C, 0x66, 0x03, 0x03, 0x03, 0x66, 0x3C, 0x00];
        f[68] = [0x1F, 0x36, 0x66, 0x66, 0x66, 0x36, 0x1F, 0x00];
        f[69] = [0x7F, 0x46, 0x16, 0x1E, 0x16, 0x46, 0x7F, 0x00];
        f[70] = [0x7F, 0x46, 0x16, 0x1E, 0x16, 0x06, 0x0F, 0x00];
        f[71] = [0x3C, 0x66, 0x03, 0x03, 0x73, 0x66, 0x7C, 0x00];
        f[72] = [0x33, 0x33, 0x33, 0x3F, 0x33, 0x33, 0x33, 0x00];
        f[73] = [0x1E, 0x0C, 0x0C, 0x0C, 0x0C, 0x0C, 0x1E, 0x00];
        f[74] = [0x78, 0x30, 0x30, 0x30, 0x33, 0x33, 0x1E, 0x00];
        f[75] = [0x67, 0x66, 0x36, 0x1E, 0x36, 0x66, 0x67, 0x00];
        f[76] = [0x0F, 0x06, 0x06, 0x06, 0x46, 0x66, 0x7F, 0x00];
        f[77] = [0x63, 0x77, 0x7F, 0x7F, 0x6B, 0x63, 0x63, 0x00];
        f[78] = [0x63, 0x67, 0x6F, 0x7B, 0x73, 0x63, 0x63, 0x00];
        f[79] = [0x1C, 0x36, 0x63, 0x63, 0x63, 0x36, 0x1C, 0x00];
        f[80] = [0x3F, 0x66, 0x66, 0x3E, 0x06, 0x06, 0x0F, 0x00];
        f[81] = [0x1E, 0x33, 0x33, 0x33, 0x3B, 0x1E, 0x38, 0x00];
        f[82] = [0x3F, 0x66, 0x66, 0x3E, 0x36, 0x66, 0x67, 0x00];
        f[83] = [0x1E, 0x33, 0x07, 0x0E, 0x38, 0x33, 0x1E, 0x00];
        f[84] = [0x3F, 0x2D, 0x0C, 0x0C, 0x0C, 0x0C, 0x1E, 0x00];
        f[85] = [0x33, 0x33, 0x33, 0x33, 0x33, 0x33, 0x3F, 0x00];
        f[86] = [0x33, 0x33, 0x33, 0x33, 0x33, 0x1E, 0x0C, 0x00];
        f[87] = [0x63, 0x63, 0x63, 0x6B, 0x7F, 0x77, 0x63, 0x00];
        f[88] = [0x63, 0x63, 0x36, 0x1C, 0x1C, 0x36, 0x63, 0x00];
        f[89] = [0x33, 0x33, 0x33, 0x1E, 0x0C, 0x0C, 0x1E, 0x00];
        f[90] = [0x7F, 0x63, 0x31, 0x18, 0x4C, 0x66, 0x7F, 0x00];
        f[91] = [0x1E, 0x06, 0x06, 0x06, 0x06, 0x06, 0x1E, 0x00];
        f[92] = [0x03, 0x06, 0x0C, 0x18, 0x30, 0x60, 0x40, 0x00];
        f[93] = [0x1E, 0x18, 0x18, 0x18, 0x18, 0x18, 0x1E, 0x00];
        f[94] = [0x08, 0x1C, 0x36, 0x63, 0x00, 0x00, 0x00, 0x00];
        f[95] = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xFF];
        f[96] = [0x0C, 0x0C, 0x18, 0x00, 0x00, 0x00, 0x00, 0x00];
        f[97] = [0x00, 0x00, 0x1E, 0x30, 0x3E, 0x33, 0x6E, 0x00];
        f[98] = [0x07, 0x06, 0x06, 0x3E, 0x66, 0x66, 0x3B, 0x00];
        f[99] = [0x00, 0x00, 0x1E, 0x33, 0x03, 0x33, 0x1E, 0x00];
        f[100] = [0x38, 0x30, 0x30, 0x3e, 0x33, 0x33, 0x6E, 0x00];
        f[101] = [0x00, 0x00, 0x1E, 0x33, 0x3f, 0x03, 0x1E, 0x00];
        f[102] = [0x1C, 0x36, 0x06, 0x0f, 0x06, 0x06, 0x0F, 0x00];
        f[103] = [0x00, 0x00, 0x6E, 0x33, 0x33, 0x3E, 0x30, 0x1F];
        f[104] = [0x07, 0x06, 0x36, 0x6E, 0x66, 0x66, 0x67, 0x00];
        f[105] = [0x0C, 0x00, 0x0E, 0x0C, 0x0C, 0x0C, 0x1E, 0x00];
        f[106] = [0x30, 0x00, 0x30, 0x30, 0x30, 0x33, 0x33, 0x1E];
        f[107] = [0x07, 0x06, 0x66, 0x36, 0x1E, 0x36, 0x67, 0x00];
        f[108] = [0x0E, 0x0C, 0x0C, 0x0C, 0x0C, 0x0C, 0x1E, 0x00];
        f[109] = [0x00, 0x00, 0x33, 0x7F, 0x7F, 0x6B, 0x63, 0x00];
        f[110] = [0x00, 0x00, 0x1F, 0x33, 0x33, 0x33, 0x33, 0x00];
        f[111] = [0x00, 0x00, 0x1E, 0x33, 0x33, 0x33, 0x1E, 0x00];
        f[112] = [0x00, 0x00, 0x3B, 0x66, 0x66, 0x3E, 0x06, 0x0F];
        f[113] = [0x00, 0x00, 0x6E, 0x33, 0x33, 0x3E, 0x30, 0x78];
        f[114] = [0x00, 0x00, 0x3B, 0x6E, 0x66, 0x06, 0x0F, 0x00];
        f[115] = [0x00, 0x00, 0x3E, 0x03, 0x1E, 0x30, 0x1F, 0x00];
        f[116] = [0x08, 0x0C, 0x3E, 0x0C, 0x0C, 0x2C, 0x18, 0x00];
        f[117] = [0x00, 0x00, 0x33, 0x33, 0x33, 0x33, 0x6E, 0x00];
        f[118] = [0x00, 0x00, 0x33, 0x33, 0x33, 0x1E, 0x0C, 0x00];
        f[119] = [0x00, 0x00, 0x63, 0x6B, 0x7F, 0x7F, 0x36, 0x00];
        f[120] = [0x00, 0x00, 0x63, 0x36, 0x1C, 0x36, 0x63, 0x00];
        f[121] = [0x00, 0x00, 0x33, 0x33, 0x33, 0x3E, 0x30, 0x1F];
        f[122] = [0x00, 0x00, 0x3F, 0x19, 0x0C, 0x26, 0x3F, 0x00];
        f[123] = [0x38, 0x0C, 0x0C, 0x07, 0x0C, 0x0C, 0x38, 0x00];
        f[124] = [0x18, 0x18, 0x18, 0x00, 0x18, 0x18, 0x18, 0x00];
        f[125] = [0x07, 0x0C, 0x0C, 0x38, 0x0C, 0x0C, 0x07, 0x00];
        f[126] = [0x6E, 0x3B, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
        return f;
    }
}
