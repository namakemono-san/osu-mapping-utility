using System.Diagnostics;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.SignalR;
using MappingUtility.Server.Services;
using MappingUtility.Server.Utilities;

namespace MappingUtility.Server.Hubs;

public class AudioHub(ILogger<AudioHub> logger) : Hub
{
    private static readonly JsonSerializerOptions CamelCase = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public async Task<string> AnalyzeBpm(string folderPath, string audioFilename)
    {
        var (_, samples, targetSr, durationMs) =
            await LoadSamplesAsync(folderPath, audioFilename, 48000, Context.ConnectionAborted);
        var defaultBpm = 120;
        var result = BpmDetectionService.AnalyzeBpm(samples, targetSr, defaultBpm);
        var offsetMs = BpmDetectionService.AnalyzeOffset(samples, targetSr, result.Bpm, durationMs);
        return JsonSerializer.Serialize(new { bpm = result.Bpm, candidates = result.Candidates, offsetMs }, CamelCase);
    }

    public async Task<string> AnalyzeOffset(string folderPath, string audioFilename, double bpm)
    {
        var (_, samples, targetSr, durationMs) =
            await LoadSamplesAsync(folderPath, audioFilename, 48000, Context.ConnectionAborted);
        var offsetMs = BpmDetectionService.AnalyzeOffset(samples, targetSr, bpm, durationMs);
        return JsonSerializer.Serialize(new { offsetMs }, CamelCase);
    }

    private async Task<(string AudioPath, float[] Samples, int SampleRate, double DurationMs)> LoadSamplesAsync(
        string folderPath, string audioFilename, int capSampleRate, CancellationToken ct)
    {
        var audioPath = ResolveAudioPath(folderPath, audioFilename);

        var sw = Stopwatch.StartNew();
        var (_, _, sampleRate, durationMs) = await AudioAnalysisService.ProbePublicAsync(audioPath, ct);
        var targetSr = Math.Min(sampleRate > 0 ? sampleRate : 44100, capSampleRate);
        logger.LogInformation("[audio] probe {Elapsed}ms — {File} @ {Sr}Hz {Dur:F1}s",
            sw.ElapsedMilliseconds, audioFilename, targetSr, durationMs / 1000.0);

        sw.Restart();
        var samples = await AudioAnalysisService.ExtractPcmForSpectrogramAsync(audioPath, targetSr, ct);
        logger.LogInformation("[audio] decode {Elapsed}ms — {Samples:N0} samples", sw.ElapsedMilliseconds, samples.Length);

        return (audioPath, samples, targetSr, durationMs);
    }

    private string ResolveAudioPath(string folderPath, string audioFilename)
    {
        var audioPath = PathGuard.ResolveWithinRoot(folderPath, audioFilename);
        if (audioPath is null || !File.Exists(audioPath))
        {
            var found = Directory.Exists(folderPath)
                ? Directory.EnumerateFiles(folderPath)
                    .FirstOrDefault(f => string.Equals(Path.GetFileName(f), audioFilename, StringComparison.OrdinalIgnoreCase))
                : null;
            if (found is null) throw new HubException($"Audio file not found: {audioFilename}");
            audioPath = found;
        }
        return audioPath;
    }

    public async Task<string> AnalyzeAudio(string folderPath)
    {
        var results = await AudioAnalysisService.AnalyzeAsync(folderPath, Context.ConnectionAborted);
        return JsonSerializer.Serialize(results, CamelCase);
    }

    private static string StripFolderPrefix(string folder)
    {
        if (string.IsNullOrEmpty(folder)) return folder;
        var m = Regex.Match(folder, @"^beatmap-\d+-(.+)$");
        return m.Success ? m.Groups[1].Value : folder;
    }

    public async Task<string> GetSpectrogram(string folderPath, string audioFilename, double cutoffHz)
    {
        var total = Stopwatch.StartNew();
        logger.LogInformation("[spectrogram] start: {File}", audioFilename);

        var (_, samples, targetSr, durationMs) =
            await LoadSamplesAsync(folderPath, audioFilename, 48000, Context.ConnectionAborted);
        if (samples.Length == 0)
            throw new HubException("Failed to decode audio.");

        var sw = Stopwatch.StartNew();
        var (frames, frameCount, freqBins) = SpectrogramService.ComputeFramesPublic(samples, targetSr);
        logger.LogInformation("[spectrogram] FFT {Elapsed}ms — {Frames} frames x {Bins} bins", sw.ElapsedMilliseconds, frameCount, freqBins);

        sw.Restart();
        var parentFolder = Path.GetFileName(folderPath);
        var folderTitle = StripFolderPrefix(parentFolder);
        var sourceDisplay = string.IsNullOrEmpty(folderTitle) ? audioFilename : $"{folderTitle}/{audioFilename}";
        var png = SpectrogramService.GeneratePngFromFrames(frames, targetSr, durationMs / 1000.0, cutoffHz, sourceDisplay);
        logger.LogInformation("[spectrogram] render {Elapsed}ms — {Size}KB", sw.ElapsedMilliseconds, png.Length / 1024);

        logger.LogInformation("[spectrogram] total {Elapsed}ms", total.ElapsedMilliseconds);

        return Convert.ToBase64String(png);
    }
}
