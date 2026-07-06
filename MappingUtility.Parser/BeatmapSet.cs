using System.Collections.Concurrent;
using System.Diagnostics;

namespace MappingUtility.Parser;

public sealed class BeatmapSet
{
    public string FolderPath { get; private init; } = "";
    public IReadOnlyList<Beatmap> Beatmaps { get; private init; } = [];

    public static BeatmapSet FromFolder(string path)
    {
        var files = Directory.GetFiles(path, "*.osu", SearchOption.TopDirectoryOnly);
        var bag   = new ConcurrentBag<Beatmap>();

        Parallel.ForEach(files, file =>
        {
            try { bag.Add(Beatmap.FromFile(file)); }
            catch (Exception ex) { Trace.TraceWarning($"Skipped unreadable beatmap file '{file}': {ex.Message}"); }
        });

        var sorted = bag
            .OrderBy(b => b.General.Mode)
            .ThenBy(b => DifficultyOrder.GetLevel(b.General.Mode, b.Metadata.Version))
            .ThenBy(b => b.HitObjects.Count)
            .ThenBy(b => b.Metadata.Version, StringComparer.OrdinalIgnoreCase)
            .ToList();

        return new BeatmapSet
        {
            FolderPath = path,
            Beatmaps   = sorted,
        };
    }
}
