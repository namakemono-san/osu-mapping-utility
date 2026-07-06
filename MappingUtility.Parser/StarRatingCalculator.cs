using osu.Game.Beatmaps;
using System.Collections.Concurrent;
using System.Diagnostics;

namespace MappingUtility.Parser;

public static class StarRatingCalculator
{
    private static readonly CancellationToken UncancelledToken =
        new CancellationTokenSource().Token;

    private static readonly ConcurrentDictionary<string, (DateTime ModifiedUtc, double StarRating)> _cache = new(StringComparer.OrdinalIgnoreCase);

    public static double Calculate(string filePath)
    {
        try
        {
            var modified = File.GetLastWriteTimeUtc(filePath);
            if (_cache.TryGetValue(filePath, out var cached) && cached.ModifiedUtc == modified)
                return cached.StarRating;

            var working = new FlatWorkingBeatmap(filePath);
            var ruleset = working.BeatmapInfo.Ruleset.CreateInstance();
            var calculator = ruleset.CreateDifficultyCalculator(working);
            var sr = Math.Round(calculator.Calculate([], UncancelledToken).StarRating, 2);
            _cache[filePath] = (modified, sr);
            return sr;
        }
        catch (Exception ex)
        {
            Trace.TraceWarning($"Star rating calculation failed for '{filePath}': {ex.Message}");
            return 0;
        }
    }

    public static void InvalidateCache(string filePath) => _cache.TryRemove(filePath, out _);

    public static void Warmup()
    {
        Task.Run(() =>
        {
            try
            {
                var tmp = Path.Combine(Path.GetTempPath(), $"mu_warmup_{Guid.NewGuid():N}.osu");
                const string content =
                    "osu file format v14\r\n\r\n" +
                    "[General]\r\nAudioFilename: audio.mp3\r\nMode: 0\r\n\r\n" +
                    "[Metadata]\r\nTitle:warmup\r\nArtist:warmup\r\nCreator:warmup\r\nVersion:warmup\r\nBeatmapID:0\r\nBeatmapSetID:-1\r\n\r\n" +
                    "[Difficulty]\r\nHPDrainRate:5\r\nCircleSize:4\r\nOverallDifficulty:5\r\nApproachRate:9\r\nSliderMultiplier:1.4\r\nSliderTickRate:1\r\n\r\n" +
                    "[TimingPoints]\r\n0,500,4,1,0,100,1,0\r\n\r\n" +
                    "[HitObjects]\r\n256,192,1000,5,0,0:0:0:0:\r\n";
                File.WriteAllText(tmp, content);
                Calculate(tmp);
                File.Delete(tmp);
                _cache.TryRemove(tmp, out _);
            }
            catch (Exception ex)
            {
                Trace.TraceWarning($"Star rating warmup failed: {ex.Message}");
            }
        });
    }
}
