using MappingUtility.Parser;
using MappingUtility.Parser.TimingPoints;
using MappingUtility.Parser.Transforms;
using MappingUtility.Server.Models;
using MappingUtility.Server.Services;
using MappingUtility.Server.Utilities;
using Microsoft.AspNetCore.SignalR;
using System.Diagnostics;
using System.Text;

namespace MappingUtility.Server.Hubs;

public class BeatmapsetHub(BeatmapsetLibrary library) : Hub
{
    private const int PageSize = 100;
    private const int SearchChunkSize = 50;

    public Task<string?> GetSongsPath() => Task.FromResult(library.SongsPath);

    public Task<string> GetCurrentBeatmap()
    {
        var result = CurrentBeatmapLookupService.Detect(library.SongsPath);
        var info = result.FolderPath is null ? null : library.GetOrParse(result.FolderPath);

        return Task.FromResult(Json.Serialize(new
        {
            status = result.Status,
            message = result.Message,
            detectedFilename = result.DetectedFilename,
            beatmapset = info
        }));
    }

    public async Task ScanBeatmapsets(string? songsPath = null, bool forceRefresh = false)
    {
        try
        {
            var path = songsPath ?? library.SongsPath;
            if (path is null)
            {
                await Clients.Caller.SendAsync("ScanError", "osu! Songs folder not found");
                return;
            }

            var folders = library.Scan(path, forceRefresh);
            await Clients.Caller.SendAsync("BeatmapsetsTotalCount", folders.Length);

            var first = await Task.Run(() => library.ParseRange(0, PageSize));
            if (first.Count > 0)
                await Clients.Caller.SendAsync("BeatmapsetsChunk", Json.Serialize(first));

            await Clients.Caller.SendAsync("BeatmapsetsScanComplete");
        }
        catch (Exception ex)
        {
            await Clients.Caller.SendAsync("ScanError", ex.Message);
        }
    }

    public Task<string> FetchBeatmapsets(int startIndex, int count) =>
        Task.Run(() => Json.Serialize(library.ParseRange(startIndex, count)));

    public async Task SearchBeatmapsets(string query)
    {
        var folders = library.Snapshot();
        var trimmed = query.Trim();
        var buffer = new List<BeatmapsetInfo>(SearchChunkSize);

        foreach (var dir in folders)
        {
            var info = library.GetOrParse(dir);
            if (info is null || !Matches(info, trimmed)) continue;

            buffer.Add(info);
            if (buffer.Count < SearchChunkSize) continue;

            await Clients.Caller.SendAsync("SearchChunk", Json.Serialize(buffer));
            buffer.Clear();
        }

        if (buffer.Count > 0)
            await Clients.Caller.SendAsync("SearchChunk", Json.Serialize(buffer));

        await Clients.Caller.SendAsync("SearchComplete");
    }

    private static bool Matches(BeatmapsetInfo info, string query)
        => info.Title.Contains(query, StringComparison.OrdinalIgnoreCase) ||
           info.Artist.Contains(query, StringComparison.OrdinalIgnoreCase) ||
           info.Creator.Contains(query, StringComparison.OrdinalIgnoreCase);

    public Task<string> GetBeatmapsetMetadata(string folderPath)
    {
        var parsed = ReadOrderedBeatmaps(folderPath);

        var starRatings = new double[parsed.Count];
        Parallel.For(0, parsed.Count, i => starRatings[i] = StarRatingCalculator.Calculate(parsed[i].File));

        var results = parsed.Select((x, i) => new
        {
            version = x.Beatmap.Metadata.Version,
            title = x.Beatmap.Metadata.Title,
            titleUnicode = x.Beatmap.Metadata.TitleUnicode,
            artist = x.Beatmap.Metadata.Artist,
            artistUnicode = x.Beatmap.Metadata.ArtistUnicode,
            source = x.Beatmap.Metadata.Source,
            tags = string.Join(" ", x.Beatmap.Metadata.Tags),
            backgroundFile = x.Beatmap.Background?.Filename ?? "",
            backgroundOffsetX = x.Beatmap.Background?.OffsetX ?? 0,
            backgroundOffsetY = x.Beatmap.Background?.OffsetY ?? 0,
            starRating = starRatings[i]
        });

        return Task.FromResult(Json.Serialize(results));
    }

    public Task<string> GetTimingInfo(string folderPath)
    {
        var results = ReadOrderedBeatmaps(folderPath).Select(x => new
        {
            version = x.Beatmap.Metadata.Version,
            audioFilename = x.Beatmap.General.AudioFilename,
            points = x.Beatmap.TimingPoints.OfType<UninheritedPoint>()
                .OrderBy(tp => tp.Time)
                .Select(tp => new { time = tp.Time, bpm = Math.Round(tp.Bpm, 3) })
                .ToList()
        });

        return Task.FromResult(Json.Serialize(results));
    }

    private static List<(string File, Beatmap Beatmap)> ReadOrderedBeatmaps(string folderPath) =>
        BeatmapFiles.EnumerateOsuFiles(folderPath)
            .Select(f => (File: f, Beatmap: TryReadBeatmap(f)))
            .Where(x => x.Beatmap is not null)
            .Select(x => (x.File, Beatmap: x.Beatmap!))
            .OrderBy(x => x.Beatmap.General.Mode)
            .ThenBy(x => DifficultyOrder.GetLevel(x.Beatmap.General.Mode, x.Beatmap.Metadata.Version))
            .ThenBy(x => x.Beatmap.HitObjects.Count)
            .ThenBy(x => x.Beatmap.Metadata.Version, StringComparer.OrdinalIgnoreCase)
            .ToList();

    private static Beatmap? TryReadBeatmap(string file)
    {
        try { return Beatmap.FromFile(file); }
        catch (Exception ex)
        {
            Trace.TraceWarning($"Skipped unreadable beatmap '{file}': {ex.Message}");
            return null;
        }
    }

    public Task ApplyMetadata(string folderPath, string[] versions, MetadataUpdateDto update)
    {
        var versionsSet = new HashSet<string>(versions, StringComparer.OrdinalIgnoreCase);
        var bgLookup = update.Backgrounds?
            .ToDictionary(b => b.Version, b => b, StringComparer.OrdinalIgnoreCase)
            ?? new Dictionary<string, DiffBackgroundDto>(StringComparer.OrdinalIgnoreCase);

        var allVersions = versionsSet.Concat(bgLookup.Keys)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        return RunBatchAsync(folderPath, allVersions, v => v, async version =>
        {
            var (file, beatmap) = OpenVersion(folderPath, version);

            if (versionsSet.Contains(version))
                beatmap.ApplyMetadata(update.Title, update.TitleUnicode, update.Artist,
                    update.ArtistUnicode, update.Source, update.Tags);

            if (bgLookup.TryGetValue(version, out var bg))
                beatmap.ApplyBackground(bg.Filename, bg.OffsetX, bg.OffsetY);

            await WriteAsync(file, beatmap);
        }, "MetadataError", "MetadataComplete");
    }

    public Task ApplyBackgrounds(string folderPath, DiffBackgroundDto[] backgrounds)
        => RunBatchAsync(folderPath, backgrounds, b => b.Version, async bg =>
        {
            var (file, beatmap) = OpenVersion(folderPath, bg.Version);
            beatmap.ApplyBackground(bg.Filename, bg.OffsetX, bg.OffsetY);
            await WriteAsync(file, beatmap);
        }, "BackgroundError", "BackgroundComplete");

    public Task ApplyTransforms(string folderPath, string[] versions, string[] transformIds, bool backup)
        => RunBatchAsync(folderPath, versions, v => v, async version =>
        {
            var (file, beatmap) = OpenVersion(folderPath, version);

            foreach (var id in transformIds)
                Transforms.Apply(id, beatmap);

            if (backup) BeatmapBackup.Save(beatmap, file);

            await WriteAsync(file, beatmap);
            StarRatingCalculator.InvalidateCache(file);
        }, "TransformError", "TransformComplete");

    public async Task ApplyOffset(string folderPath, string[] versions, int deltaMs)
    {
        if (deltaMs == 0) return;

        var versionsSet = new HashSet<string>(versions, StringComparer.OrdinalIgnoreCase);
        var errors = new List<string>();

        await Task.Run(() =>
        {
            foreach (var file in BeatmapFiles.EnumerateOsuFiles(folderPath))
            {
                try
                {
                    var beatmap = Beatmap.FromFile(file);
                    if (!versionsSet.Contains(beatmap.Metadata.Version)) continue;

                    Transforms.ShiftOffset(beatmap, deltaMs);
                    BeatmapBackup.Save(beatmap, file);
                    SafeFileWrite.WriteAllTextAtomic(file, beatmap.Serialize(), new UTF8Encoding(false));
                    StarRatingCalculator.InvalidateCache(file);
                }
                catch (Exception ex)
                {
                    errors.Add($"{Path.GetFileName(file)}: {ex.Message}");
                }
            }
        });

        library.Invalidate(folderPath);

        if (errors.Count > 0)
            throw new HubException(string.Join("\n", errors));
    }

    public Task<string> CloneBeatmap(CloneRequest req) => BeatmapCloneService.CreateOszAsync(req);

    private static (string File, Beatmap Beatmap) OpenVersion(string folderPath, string version)
    {
        var file = BeatmapFiles.FindByVersion(folderPath, version)
            ?? throw new FileNotFoundException($"Not found: {version}");
        return (file, Beatmap.FromFile(file));
    }

    private static Task WriteAsync(string file, Beatmap beatmap) =>
        SafeFileWrite.WriteAllTextAtomicAsync(file, beatmap.Serialize(), new UTF8Encoding(false));

    private async Task RunBatchAsync<T>(
        string folderPath, IEnumerable<T> items, Func<T, string> label, Func<T, Task> action,
        string errorEvent, string completeEvent)
    {
        var errors = new List<string>();
        foreach (var item in items)
        {
            try { await action(item); }
            catch (Exception ex) { errors.Add($"{label(item)}: {ex.Message}"); }
        }

        library.Invalidate(folderPath);

        if (errors.Count > 0)
            await Clients.Caller.SendAsync(errorEvent, string.Join("\n", errors));
        else
            await Clients.Caller.SendAsync(completeEvent);
    }
}
