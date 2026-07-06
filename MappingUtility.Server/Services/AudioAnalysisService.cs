using System.Diagnostics;
using System.Text.Json;
using MappingUtility.Parser;
using MappingUtility.Server.Utilities;

namespace MappingUtility.Server.Services;

public record AudioGroup(
    string AudioFilename,
    IReadOnlyList<string> UsedByDifficulties,
    string Format,
    double BitrateKbps,
    int SampleRate,
    double DurationMs,
    long FileSizeBytes,
    double? CutoffHz,
    IReadOnlyList<CheckIssue> Issues
);

public record CheckIssue(string Severity, string Message);

public static class AudioAnalysisService
{
    private const int MaxBitrateMp3 = 192;
    private const int MaxBitrateOgg = 208;
    private const int MinBitrate = 128;
    private const int MaxSampleRate = 48000;

    public static async Task<IReadOnlyList<AudioGroup>> AnalyzeAsync(
        string folderPath, CancellationToken ct = default)
    {
        var beatmapSet = BeatmapSet.FromFolder(folderPath);

        var groups = beatmapSet.Beatmaps
            .GroupBy(b => b.General.AudioFilename, StringComparer.OrdinalIgnoreCase)
            .Where(g => !string.IsNullOrEmpty(g.Key))
            .ToList();

        var results = new List<AudioGroup>();
        foreach (var group in groups)
        {
            var filename = group.Key;
            var audioPath = Path.Combine(folderPath, filename);
            var diffs = group.Select(b => b.Metadata.Version).ToList();

            if (!File.Exists(audioPath))
            {
                results.Add(new AudioGroup(
                    filename, diffs, "Unknown", 0, 0, 0, 0, null,
                    [new CheckIssue("problem", $"Audio file not found: {filename}")]
                ));
                continue;
            }

            results.Add(await AnalyzeSingleAsync(audioPath, filename, diffs, ct));
        }

        return results;
    }

    private static async Task<AudioGroup> AnalyzeSingleAsync(
        string audioPath, string filename, List<string> diffs, CancellationToken ct)
    {
        var (format, bitrateKbps, sampleRate, durationMs) = await ProbeAsync(audioPath, ct);
        var fileSizeBytes = new FileInfo(audioPath).Length;

        double? cutoffHz = null;
        try
        {
            var targetSr = Math.Min(sampleRate > 0 ? sampleRate : 44100, 48000);
            var durationSec = durationMs / 1000.0;
            var startSec = Math.Max(0, (durationSec - 30.0) / 2.0);
            var samples = await ExtractPcmSliceAsync(audioPath, targetSr, startSec, 30, ct);
            if (samples.Length >= 2048)
                cutoffHz = EstimateCutoffHz(samples, targetSr);
        }
        catch (Exception ex)
        {
            Trace.TraceWarning($"Cutoff estimation failed for '{audioPath}': {ex.Message}");
        }

        var issues = RunChecks(format, bitrateKbps, sampleRate, cutoffHz);
        return new AudioGroup(filename, diffs, format, bitrateKbps, sampleRate, durationMs, fileSizeBytes, cutoffHz, issues);
    }

    public static async Task<float[]> ExtractPcmForSpectrogramAsync(
        string audioPath, int sampleRate, CancellationToken ct)
        => await ExtractPcmAsync(audioPath, Math.Min(sampleRate, 48000), -1, ct);

    public static Task<(string Format, double BitrateKbps, int SampleRate, double DurationMs)> ProbePublicAsync(
        string audioPath, CancellationToken ct)
        => ProbeAsync(audioPath, ct);

    private static IReadOnlyList<CheckIssue> RunChecks(
        string format, double bitrateKbps, int sampleRate, double? cutoffHz)
    {
        var issues = new List<CheckIssue>();

        if (format is not ("MP3" or "OGG"))
        {
            issues.Add(new CheckIssue("problem", $"Invalid format: {format}. Must be MP3 or OGG."));
            return issues;
        }

        var maxBitrate = format == "MP3" ? MaxBitrateMp3 : MaxBitrateOgg;

        if (bitrateKbps < MinBitrate)
            issues.Add(new CheckIssue("problem",
                $"Bitrate too low: {bitrateKbps:F0} kbps (minimum {MinBitrate} kbps)"));
        else if (bitrateKbps > maxBitrate)
            issues.Add(new CheckIssue("problem",
                $"Bitrate too high: {bitrateKbps:F0} kbps (maximum {maxBitrate} kbps for {format})"));

        if (sampleRate > MaxSampleRate)
            issues.Add(new CheckIssue("problem",
                $"Sample rate too high: {sampleRate} Hz (maximum {MaxSampleRate} Hz)"));

        if (cutoffHz.HasValue)
        {
            var expected = ExpectedCutoffHz(format, bitrateKbps);
            if (cutoffHz.Value < expected - 500)
                issues.Add(new CheckIssue("warning",
                    $"Possible lossy re-encode: cutoff {cutoffHz.Value / 1000.0:F1} kHz < expected {expected / 1000.0:F1} kHz"));
        }

        return issues;
    }

    private static double ExpectedCutoffHz(string format, double bitrateKbps)
    {
        if (format == "OGG")
        {
            if (bitrateKbps <= 128) return 15000;
            if (bitrateKbps <= 192) return 16000;
            return 18000;
        }
        if (bitrateKbps <= 128) return 16000;
        if (bitrateKbps <= 192) return 18000;
        return 19500;
    }

    private static async Task<(string Format, double BitrateKbps, int SampleRate, double DurationMs)> ProbeAsync(
        string audioPath, CancellationToken ct)
    {
        var args = new[]
        {
            "-v", "error",
            "-select_streams", "a:0",
            "-show_entries", "stream=codec_name,sample_rate,bit_rate",
            "-show_entries", "format=duration,bit_rate",
            "-of", "json",
            audioPath
        };

        var (exitCode, stdout, _) = await ProcessRunner.RunCaptureAsync(BinsHelper.Ffprobe, args, ct);
        if (exitCode < 0) return ("Unknown", 0, 0, 0);

        try
        {
            using var json = JsonDocument.Parse(stdout);
            var streams = json.RootElement.GetProperty("streams");
            var stream = streams.EnumerateArray().FirstOrDefault();
            var fmt = json.RootElement.GetProperty("format");

            var codec = stream.TryGetProperty("codec_name", out var cn) ? cn.GetString() ?? "" : "";
            var format = codec switch { "mp3" => "MP3", "vorbis" => "OGG", _ => codec.ToUpperInvariant() };

            int sampleRate = 0;
            if (stream.TryGetProperty("sample_rate", out var sr) && int.TryParse(sr.GetString(), out var srv))
                sampleRate = srv;

            double bitrateKbps = 0;
            if (stream.TryGetProperty("bit_rate", out var sbr) && double.TryParse(sbr.GetString(),
                System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var sbrv))
                bitrateKbps = Math.Round(sbrv / 1000.0);
            else if (fmt.TryGetProperty("bit_rate", out var fbr) && double.TryParse(fbr.GetString(),
                System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var fbrv))
                bitrateKbps = Math.Round(fbrv / 1000.0);

            double durationMs = 0;
            if (fmt.TryGetProperty("duration", out var dur) && double.TryParse(dur.GetString(),
                System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var durv))
                durationMs = durv * 1000.0;

            return (format, bitrateKbps, sampleRate, durationMs);
        }
        catch (Exception ex)
        {
            Trace.TraceWarning($"Failed to parse ffprobe output for '{audioPath}': {ex.Message}");
            return ("Unknown", 0, 0, 0);
        }
    }

    private static Task<float[]> ExtractPcmSliceAsync(
        string audioPath, int targetSampleRate, double startSeconds, double durationSeconds, CancellationToken ct)
    {
        var args = new List<string> { "-v", "error", "-ss", startSeconds.ToString(System.Globalization.CultureInfo.InvariantCulture), "-t", durationSeconds.ToString(System.Globalization.CultureInfo.InvariantCulture) };
        args.AddRange(["-i", audioPath, "-vn", "-ac", "1", "-ar", targetSampleRate.ToString(), "-f", "f32le", "pipe:1"]);
        return RunFfmpegPcmAsync(args, ct);
    }

    private static Task<float[]> ExtractPcmAsync(
        string audioPath, int targetSampleRate, double limitSeconds, CancellationToken ct)
    {
        var args = new List<string> { "-v", "error" };
        if (limitSeconds > 0) { args.Add("-t"); args.Add(limitSeconds.ToString(System.Globalization.CultureInfo.InvariantCulture)); }
        args.AddRange(["-i", audioPath, "-vn", "-ac", "1", "-ar", targetSampleRate.ToString(), "-f", "f32le", "pipe:1"]);
        return RunFfmpegPcmAsync(args, ct);
    }

    private static Task<float[]> RunFfmpegPcmAsync(List<string> args, CancellationToken ct)
        => ProcessRunner.RunPcmPipeAsync(BinsHelper.Ffmpeg, args, ct);

    internal static double EstimateCutoffHz(float[] samples, int sampleRate)
        => SpectralAnalysis.EstimateCutoffHz(samples, sampleRate);
}
