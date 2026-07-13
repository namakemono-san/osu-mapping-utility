using MappingUtility.Parser;
using MappingUtility.Parser.TimingPoints;
using MappingUtility.Parser.Transforms;
using MappingUtility.Server.Services;
using MappingUtility.Server.Utilities;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Win32;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.IO.Compression;
using System.Text;
using System.Text.Json;
using System.Threading;

namespace MappingUtility.Server.Hubs;

public class BeatmapsetHub : Hub
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    private const int PageSize = 100;
    private static readonly int Parallelism = Math.Max(1, Environment.ProcessorCount / 2);

    private static string? _songsPath;
    private static string[]? _folderList;
    private static readonly object _folderLock = new();
    private static readonly ConcurrentDictionary<string, BeatmapsetInfo> _infoCache = new(StringComparer.OrdinalIgnoreCase);

    private static IHubContext<BeatmapsetHub>? _hubContext;
    private static FileSystemWatcher? _watcher;
    private static Timer? _watcherDebounce;
    private static readonly object _watcherLock = new();

    public static void Initialize(IHubContext<BeatmapsetHub> hubContext) => _hubContext = hubContext;

    private static void EnsureWatcher(string path)
    {
        lock (_watcherLock)
        {
            if (_watcher is not null && _watcher.Path.Equals(path, StringComparison.OrdinalIgnoreCase))
                return;

            _watcher?.Dispose();
            _watcher = new FileSystemWatcher(path)
            {
                NotifyFilter = NotifyFilters.DirectoryName,
                IncludeSubdirectories = false
            };
            _watcher.Created += OnSongsFolderChanged;
            _watcher.Deleted += OnSongsFolderChanged;
            _watcher.Renamed += OnSongsFolderChanged;
            _watcher.Error += (_, e) =>
                Trace.TraceWarning($"Songs folder watcher error: {e.GetException().Message}");
            _watcher.EnableRaisingEvents = true;
        }
    }

    private static void OnSongsFolderChanged(object sender, FileSystemEventArgs e)
    {
        lock (_watcherLock)
        {
            _watcherDebounce?.Dispose();
            _watcherDebounce = new Timer(_ => ReconcileFolderList(), null, 1500, Timeout.Infinite);
        }
    }

    private static void ReconcileFolderList()
    {
        string path;
        lock (_folderLock)
        {
            if (_songsPath is null || _folderList is null) return;
            path = _songsPath;
        }

        string[] dirs;
        try { dirs = Directory.GetDirectories(path); }
        catch (Exception ex)
        {
            Trace.TraceWarning($"Failed to re-scan songs folder '{path}': {ex.Message}");
            return;
        }

        lock (_folderLock)
        {
            if (_folderList is null || _folderList.Length == dirs.Length &&
                _folderList.OrderBy(f => f, StringComparer.OrdinalIgnoreCase)
                    .SequenceEqual(dirs.OrderBy(f => f, StringComparer.OrdinalIgnoreCase), StringComparer.OrdinalIgnoreCase))
                return;

            var removed = _folderList.Except(dirs, StringComparer.OrdinalIgnoreCase);
            foreach (var dir in removed) _infoCache.TryRemove(dir, out _);

            _folderList = dirs.OrderByDescending(Directory.GetLastWriteTimeUtc).ToArray();
        }

        _ = _hubContext?.Clients.All.SendAsync("BeatmapsetsListChanged");
    }

    public Task<string?> GetSongsPath() => Task.FromResult(_songsPath ?? DetectSongsPath());

    public Task<string> GetCurrentBeatmap()
    {
        var songsPath = _songsPath ?? DetectSongsPath();
        var result = CurrentBeatmapLookupService.Detect(songsPath);

        BeatmapsetInfo? info = null;
        if (result.FolderPath is not null && !_infoCache.TryGetValue(result.FolderPath, out info))
            info = ParseFolder(result.FolderPath);

        return Task.FromResult(JsonSerializer.Serialize(new
        {
            status = result.Status,
            message = result.Message,
            detectedFilename = result.DetectedFilename,
            beatmapset = info
        }, JsonOptions));
    }

    public async Task ScanBeatmapsets(string? songsPath = null, bool forceRefresh = false)
    {
        try
        {
            var path = songsPath ?? DetectSongsPath();
            if (path is null)
            {
                await Clients.Caller.SendAsync("ScanError", "osu! Songs folder not found");
                return;
            }

            string[] folders;
            lock (_folderLock)
            {
                if (forceRefresh || _songsPath != path || _folderList is null)
                {
                    if (_songsPath != path) _infoCache.Clear();
                    var dirs = Directory.GetDirectories(path);
                    _folderList = dirs.OrderByDescending(Directory.GetLastWriteTimeUtc).ToArray();
                    _songsPath = path;
                }
                folders = _folderList;
            }

            EnsureWatcher(path);

            await Clients.Caller.SendAsync("BeatmapsetsTotalCount", folders.Length);

            var first = await Task.Run(() => ParseRange(folders, 0, PageSize));
            if (first.Count > 0)
                await Clients.Caller.SendAsync("BeatmapsetsChunk", JsonSerializer.Serialize(first, JsonOptions));

            await Clients.Caller.SendAsync("BeatmapsetsScanComplete");
        }
        catch (Exception ex)
        {
            await Clients.Caller.SendAsync("ScanError", ex.Message);
        }
    }

    public async Task SearchBeatmapsets(string query)
    {
        string[]? folders;
        lock (_folderLock) { folders = _folderList; }

        if (folders is null)
        {
            await Clients.Caller.SendAsync("SearchComplete");
            return;
        }

        var q = query.Trim();
        var buffer = new List<BeatmapsetInfo>(50);

        foreach (var dir in folders)
        {
            BeatmapsetInfo? info;
            if (!_infoCache.TryGetValue(dir, out info))
                info = ParseFolder(dir);

            if (info is null || !Matches(info, q)) continue;

            buffer.Add(info);
            if (buffer.Count >= 50)
            {
                await Clients.Caller.SendAsync("SearchChunk", JsonSerializer.Serialize(buffer, JsonOptions));
                buffer.Clear();
            }
        }

        if (buffer.Count > 0)
            await Clients.Caller.SendAsync("SearchChunk", JsonSerializer.Serialize(buffer, JsonOptions));

        await Clients.Caller.SendAsync("SearchComplete");
    }

    private static bool Matches(BeatmapsetInfo info, string query)
        => info.Title.Contains(query, StringComparison.OrdinalIgnoreCase) ||
           info.Artist.Contains(query, StringComparison.OrdinalIgnoreCase) ||
           info.Creator.Contains(query, StringComparison.OrdinalIgnoreCase);

    private static BeatmapsetInfo? ParseFolder(string dir)
    {
        try
        {
            var files = Directory.GetFiles(dir, "*.osu", SearchOption.TopDirectoryOnly);
            if (files.Length == 0) return null;

            var beatmaps = files
                .Select(f =>
                {
                    try { return Beatmap.FromFile(f); }
                    catch (Exception ex)
                    {
                        Trace.TraceWarning($"Skipped unreadable beatmap '{f}': {ex.Message}");
                        return null;
                    }
                })
                .Where(b => b is not null)
                .OrderBy(b => b!.General.Mode)
                .ThenBy(b => DifficultyOrder.GetLevel(b!.General.Mode, b.Metadata.Version))
                .ThenBy(b => b!.HitObjects.Count)
                .ThenBy(b => b!.Metadata.Version, StringComparer.OrdinalIgnoreCase)
                .ToList();

            if (beatmaps.Count == 0) return null;

            var primary = beatmaps.FirstOrDefault(b => b!.Metadata.BeatmapSetId.HasValue) ?? beatmaps[0];
            var info = new BeatmapsetInfo(
                primary!.Metadata.BeatmapSetId ?? 0,
                primary.Metadata.Title,
                primary.Metadata.Artist,
                primary.Metadata.Creator,
                dir,
                primary.Background?.Filename,
                beatmaps.Select(b => new DifficultyInfo(b!.Metadata.Version, (int)b.General.Mode)).ToList(),
                (int)primary.General.Mode
            );
            _infoCache[dir] = info;
            return info;
        }
        catch (Exception ex)
        {
            Trace.TraceWarning($"Failed to parse beatmapset folder '{dir}': {ex.Message}");
            return null;
        }
    }

    private static string? FindOsuFile(string folderPath, string version) =>
        Directory.GetFiles(folderPath, "*.osu", SearchOption.TopDirectoryOnly)
            .FirstOrDefault(f =>
            {
                try
                {
                    foreach (var line in File.ReadLines(f))
                    {
                        var t = line.TrimStart();
                        if (t.StartsWith("Version:", StringComparison.OrdinalIgnoreCase))
                            return t[(t.IndexOf(':') + 1)..].Trim() == version;
                    }
                    return false;
                }
                catch (Exception ex)
                {
                    Trace.TraceWarning($"Failed to read '{f}' while looking for version '{version}': {ex.Message}");
                    return false;
                }
            });

    public async Task<string> GetBeatmapsetMetadata(string folderPath)
    {
        var files = Directory.GetFiles(folderPath, "*.osu", SearchOption.TopDirectoryOnly);
        var parsed = files
            .Select(f =>
            {
                try { return (file: f, beatmap: Beatmap.FromFile(f)); }
                catch (Exception ex)
                {
                    Trace.TraceWarning($"Skipped unreadable beatmap '{f}': {ex.Message}");
                    return (file: f, beatmap: (Beatmap?)null);
                }
            })
            .Where(x => x.beatmap is not null)
            .OrderBy(x => x.beatmap!.General.Mode)
            .ThenBy(x => DifficultyOrder.GetLevel(x.beatmap!.General.Mode, x.beatmap!.Metadata.Version))
            .ThenBy(x => x.beatmap!.HitObjects.Count)
            .ThenBy(x => x.beatmap!.Metadata.Version, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var starRatings = new double[parsed.Count];
        Parallel.For(0, parsed.Count, i => starRatings[i] = StarRatingCalculator.Calculate(parsed[i].file));

        var results = parsed
            .Select((x, i) => (object?)new
            {
                version           = x.beatmap!.Metadata.Version,
                title             = x.beatmap.Metadata.Title,
                titleUnicode      = x.beatmap.Metadata.TitleUnicode,
                artist            = x.beatmap.Metadata.Artist,
                artistUnicode     = x.beatmap.Metadata.ArtistUnicode,
                source            = x.beatmap.Metadata.Source,
                tags              = string.Join(" ", x.beatmap.Metadata.Tags),
                backgroundFile    = x.beatmap.Background?.Filename ?? "",
                backgroundOffsetX = x.beatmap.Background?.OffsetX ?? 0,
                backgroundOffsetY = x.beatmap.Background?.OffsetY ?? 0,
                starRating        = starRatings[i],
            })
            .ToList();
        return JsonSerializer.Serialize(results, JsonOptions);
    }

    private async Task RunBatchAsync<T>(
        IEnumerable<T> items, Func<T, string> label, Func<T, Task> action,
        string errorEvent, string completeEvent)
    {
        var errors = new List<string>();
        foreach (var item in items)
        {
            try { await action(item); }
            catch (Exception ex) { errors.Add($"{label(item)}: {ex.Message}"); }
        }

        if (errors.Count > 0)
            await Clients.Caller.SendAsync(errorEvent, string.Join("\n", errors));
        else
            await Clients.Caller.SendAsync(completeEvent);
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

        return RunBatchAsync(allVersions, v => v, async version =>
        {
            var file = FindOsuFile(folderPath, version) ?? throw new FileNotFoundException($"Not found: {version}");

            var beatmap = Beatmap.FromFile(file);

            if (versionsSet.Contains(version))
                beatmap.ApplyMetadata(update.Title, update.TitleUnicode, update.Artist,
                    update.ArtistUnicode, update.Source, update.Tags);

            if (bgLookup.TryGetValue(version, out var bg))
                beatmap.ApplyBackground(bg.Filename, bg.OffsetX, bg.OffsetY);

            await SafeFileWrite.WriteAllTextAtomicAsync(file, beatmap.Serialize(), new UTF8Encoding(false));
            _infoCache.TryRemove(folderPath, out _);
        }, "MetadataError", "MetadataComplete");
    }

    public Task ApplyBackgrounds(string folderPath, DiffBackgroundDto[] backgrounds)
        => RunBatchAsync(backgrounds, b => b.Version, async bg =>
        {
            var file = FindOsuFile(folderPath, bg.Version) ?? throw new FileNotFoundException($"Not found: {bg.Version}");

            var beatmap = Beatmap.FromFile(file);
            beatmap.ApplyBackground(bg.Filename, bg.OffsetX, bg.OffsetY);
            await SafeFileWrite.WriteAllTextAtomicAsync(file, beatmap.Serialize(), new UTF8Encoding(false));
            _infoCache.TryRemove(folderPath, out _);
        }, "BackgroundError", "BackgroundComplete");

    public Task ApplyTransforms(string folderPath, string[] versions, string[] transformIds, bool backup)
        => RunBatchAsync(versions, v => v, async version =>
        {
            var file = FindOsuFile(folderPath, version) ?? throw new FileNotFoundException($"Not found: {version}");

            var beatmap = Beatmap.FromFile(file);
            foreach (var id in transformIds)
                Transforms.Apply(id, beatmap);

            if (backup) BackupBeatmapFile(beatmap, file);

            await SafeFileWrite.WriteAllTextAtomicAsync(file, beatmap.Serialize(), new UTF8Encoding(false));

            _infoCache.TryRemove(folderPath, out _);
            StarRatingCalculator.InvalidateCache(file);
        }, "TransformError", "TransformComplete");

    private static void BackupBeatmapFile(Beatmap beatmap, string file)
    {
        var m = beatmap.Metadata;
        if (m.BeatmapSetId is not int bsid || m.BeatmapId is not int bid) return;

        var backupDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "osu-mapping-utility", "backup",
            bsid.ToString(), bid.ToString());
        Directory.CreateDirectory(backupDir);
        var ts = DateTime.Now.ToString("yyyyMMddHHmmss");
        File.Copy(file, Path.Combine(backupDir, $"{ts}_{Path.GetFileName(file)}"), overwrite: true);
    }

    public async Task<string> FetchBeatmapsets(int startIndex, int count)
    {
        string[] folders;
        lock (_folderLock)
        {
            if (_folderList is null) return "[]";
            folders = _folderList;
        }

        var results = await Task.Run(() => ParseRange(folders, startIndex, count));
        return JsonSerializer.Serialize(results, JsonOptions);
    }

    private static List<BeatmapsetInfo> ParseRange(string[] folders, int startIndex, int count)
    {
        var end = Math.Min(startIndex + count, folders.Length);
        if (startIndex >= end) return [];

        var slice = folders[startIndex..end];
        var bag = new ConcurrentBag<(int Index, BeatmapsetInfo Info)>();

        Parallel.For(0, slice.Length, new ParallelOptions { MaxDegreeOfParallelism = Parallelism }, i =>
        {
            var dir = slice[i];
            if (!_infoCache.TryGetValue(dir, out var info))
                info = ParseFolder(dir);
            if (info is not null)
                bag.Add((i, info));
        });

        return bag.OrderBy(x => x.Index).Select(x => x.Info).ToList();
    }

    public Task<string> GetTimingInfo(string folderPath)
    {
        var files = Directory.GetFiles(folderPath, "*.osu", SearchOption.TopDirectoryOnly);
        var results = files
            .Select(f =>
            {
                try
                {
                    var b = Beatmap.FromFile(f);
                    var points = b.TimingPoints.OfType<UninheritedPoint>()
                        .OrderBy(tp => tp.Time)
                        .Select(tp => new { time = tp.Time, bpm = Math.Round(tp.Bpm, 3) })
                        .ToList();
                    if (points.Count == 0) return null;
                    return (object?)new { version = b.Metadata.Version, points };
                }
                catch (Exception ex)
                {
                    Trace.TraceWarning($"Failed to read timing info from '{f}': {ex.Message}");
                    return null;
                }
            })
            .Where(x => x is not null)
            .ToList();
        return Task.FromResult(JsonSerializer.Serialize(results, JsonOptions));
    }

    public async Task ApplyOffset(string folderPath, string[] versions, int deltaMs)
    {
        if (deltaMs == 0) return;

        var versionsSet = new HashSet<string>(versions, StringComparer.OrdinalIgnoreCase);
        var errors = new List<string>();

        await Task.Run(() =>
        {
            foreach (var file in Directory.GetFiles(folderPath, "*.osu", SearchOption.TopDirectoryOnly))
            {
                string version;
                try
                {
                    var beatmap = Beatmap.FromFile(file);
                    version = beatmap.Metadata.Version;
                    if (!versionsSet.Contains(version)) continue;

                    Transforms.ShiftOffset(beatmap, deltaMs);
                    BackupBeatmapFile(beatmap, file);
                    SafeFileWrite.WriteAllTextAtomic(file, beatmap.Serialize(), new UTF8Encoding(false));
                    _infoCache.TryRemove(folderPath, out _);
                    StarRatingCalculator.InvalidateCache(file);
                }
                catch (Exception ex)
                {
                    errors.Add($"{Path.GetFileName(file)}: {ex.Message}");
                }
            }
        });

        if (errors.Count > 0)
            throw new HubException(string.Join("\n", errors));
    }

    public Task<string> CloneBeatmap(CloneRequest req)
    {
        if (!Directory.Exists(req.FolderPath))
            throw new HubException($"Beatmap folder not found: {req.FolderPath}");

        if (req.TemplateVersion.Contains('\\') || req.TemplateVersion.Contains('/'))
            throw new HubException("Invalid version string");

        var templatePath = FindOsuFile(req.FolderPath, req.TemplateVersion)
            ?? throw new HubException($"Template .osu not found for version: {req.TemplateVersion}");

        var templateContent = File.ReadAllText(templatePath, new UTF8Encoding(false));
        var beatmap = Beatmap.FromContent(templateContent);

        var audioFilename = beatmap.General.AudioFilename;
        if (string.IsNullOrEmpty(audioFilename))
            throw new HubException("AudioFilename not found in .osu");

        if (CloneSafeRelPath(audioFilename) is not string audioRel)
            throw new HubException("Invalid audio filename");
        if (!File.Exists(Path.Combine(req.FolderPath, audioRel)))
            throw new HubException($"Audio file not found: {audioRel}");

        var audioNewName = "audio" + Path.GetExtension(audioRel).ToLowerInvariant();

        string? bgFilename = beatmap.Background?.Filename;
        if (!string.IsNullOrWhiteSpace(bgFilename))
        {
            if (CloneSafeRelPath(bgFilename) is not string bgRel)
                throw new HubException("Invalid background filename");
            if (!File.Exists(Path.Combine(req.FolderPath, bgRel)))
                throw new HubException($"Background file not found: {bgRel}");
        }

        string? videoFilename = beatmap.Video?.Filename;
        if (!string.IsNullOrWhiteSpace(videoFilename))
        {
            if (CloneSafeRelPath(videoFilename) is not string vidRel)
                throw new HubException("Invalid video filename");
            if (!File.Exists(Path.Combine(req.FolderPath, vidRel)))
                throw new HubException($"Video file not found: {vidRel}");
        }

        var newContent = CloneProcessOsuContent(
            templateContent, req.GameMode,
            req.Title, req.TitleUnicode, req.Artist, req.ArtistUnicode, req.Source, req.Tags,
            req.ResetTimingPoints, req.CopyPreviewTime, req.ResetDifficulty,
            audioNewName, bgFilename, videoFilename);

        var artistSan = CloneSanitize(req.Artist);
        var titleSan  = CloneSanitize(req.Title);
        if (string.IsNullOrEmpty(artistSan)) artistSan = "Unknown";
        if (string.IsNullOrEmpty(titleSan))  titleSan  = "Untitled";

        var oszStem = $"beatmap-{DateTime.Now.Ticks}-{audioNewName}";

        var outDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "osu-mapping-utility", "clone");
        Directory.CreateDirectory(outDir);

        var oszPath   = CloneNextAvailablePath(Path.Combine(outDir, $"{oszStem}.osz"));
        var osuEntry  = $"{artistSan} - {titleSan}.osu";

        var includeFiles = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { audioRel };
        if (!string.IsNullOrWhiteSpace(bgFilename))    includeFiles.Add(bgFilename);
        if (!string.IsNullOrWhiteSpace(videoFilename)) includeFiles.Add(videoFilename);

        if (!req.RemoveSkinFiles)
        {
            var mediaExts = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
                { ".mp3", ".ogg", ".wav", ".jpg", ".jpeg", ".png", ".mp4", ".webm", ".avi", ".mkv" };
            foreach (var f in Directory.EnumerateFiles(req.FolderPath))
                if (mediaExts.Contains(Path.GetExtension(f)))
                    includeFiles.Add(Path.GetFileName(f));
        }

        return Task.Run(() =>
        {
            using var fs  = File.Create(oszPath);
            using var zip = new ZipArchive(fs, ZipArchiveMode.Create);

            var osuZipEntry = zip.CreateEntry(osuEntry, CompressionLevel.Optimal);
            using (var s = osuZipEntry.Open())
                s.Write(new UTF8Encoding(false).GetBytes(newContent));

            foreach (var rel in includeFiles)
            {
                var abs = Path.Combine(req.FolderPath, rel);
                if (!File.Exists(abs)) continue;
                var entryName = string.Equals(rel, audioRel, StringComparison.OrdinalIgnoreCase)
                    ? audioNewName
                    : rel.Replace('\\', '/');
                var e = zip.CreateEntry(entryName, CompressionLevel.Optimal);
                using var es = e.Open();
                using var fi = File.OpenRead(abs);
                fi.CopyTo(es);
            }

            return oszPath;
        });
    }

    private static string CloneProcessOsuContent(
        string content, int gameMode,
        string title, string titleUnicode, string artist, string artistUnicode, string source, string tags,
        bool resetTimingPoints, bool copyPreviewTime, bool resetDifficulty,
        string audioFilename, string? backgroundFile, string? videoFile)
    {
        var eol   = content.Contains("\r\n") ? "\r\n" : "\n";
        var lines  = content.Split(new[] { eol }, StringSplitOptions.None);
        var output = new List<string>();

        var currentSection   = "";
        var skipSection      = false;
        var inEditorSection  = false;
        var inTimingSection  = false;
        var inEventsSection  = false;
        var inHitObjects     = false;
        var wrotePreviewTime = false;
        var timingLines      = new List<string>();

        foreach (var line in lines)
        {
            var trimmed = line.Trim();

            if (trimmed.StartsWith('[') && trimmed.EndsWith(']'))
            {
                var leavingEvents  = currentSection == "[Events]"       && inEventsSection;
                var leavingTiming  = currentSection == "[TimingPoints]" && inTimingSection;

                if (leavingEvents && (output.Count == 0 || output[^1].Length > 0))
                    output.Add("");

                if (leavingTiming && resetTimingPoints)
                {
                    output.AddRange(CloneResetTimingPoints(timingLines));
                    timingLines.Clear();
                }
                if (leavingTiming && (output.Count == 0 || output[^1].Length > 0))
                    output.Add("");

                currentSection  = trimmed;
                skipSection     = currentSection == "[Colours]";
                inEditorSection = currentSection == "[Editor]";
                inTimingSection = currentSection == "[TimingPoints]";
                inEventsSection = currentSection == "[Events]";
                inHitObjects    = currentSection == "[HitObjects]";

                if (inTimingSection)  timingLines.Clear();
                if (currentSection == "[General]") wrotePreviewTime = false;

                if (skipSection) continue;

                if (inEditorSection)
                {
                    output.Add(line);
                    output.Add("DistanceSpacing: 1");
                    output.Add("BeatDivisor: 4");
                    output.Add("GridSize: 32");
                    output.Add("TimelineZoom: 2");
                    continue;
                }
                output.Add(line);

                if (inEventsSection)
                {
                    output.Add("//Background and Video events");
                    if (!string.IsNullOrWhiteSpace(backgroundFile))
                        output.Add($"0,0,\"{backgroundFile}\",0,0");
                    if (!string.IsNullOrWhiteSpace(videoFile))
                        output.Add($"Video,0,\"{videoFile}\"");
                    output.Add("//Break Periods");
                    output.Add("//Storyboard Layer 0 (Background)");
                    output.Add("//Storyboard Layer 1 (Fail)");
                    output.Add("//Storyboard Layer 2 (Pass)");
                    output.Add("//Storyboard Layer 3 (Foreground)");
                    output.Add("//Storyboard Layer 4 (Overlay)");
                    output.Add("//Storyboard Sound Samples");
                }
                continue;
            }

            if (skipSection || inEditorSection || inEventsSection || inHitObjects) continue;

            if (inTimingSection && resetTimingPoints)
            {
                timingLines.Add(line);
                continue;
            }

            if (currentSection == "[General]")
            {
                if (trimmed.StartsWith("AudioFilename:")) { output.Add($"AudioFilename: {audioFilename}"); continue; }
                if (trimmed.StartsWith("Mode:"))          { output.Add($"Mode: {gameMode}"); continue; }
                if (trimmed.StartsWith("PreviewTime:"))
                {
                    output.Add(copyPreviewTime ? line : "PreviewTime:-1");
                    wrotePreviewTime = true;
                    continue;
                }
                if (!copyPreviewTime && !wrotePreviewTime)
                {
                    output.Add("PreviewTime:-1");
                    wrotePreviewTime = true;
                }
                if (resetTimingPoints && trimmed.StartsWith("SampleSet:")) { output.Add("SampleSet: Normal"); continue; }
            }

            if (currentSection == "[Metadata]")
            {
                if (trimmed.StartsWith("Title:"))        { output.Add($"Title:{title}");               continue; }
                if (trimmed.StartsWith("TitleUnicode:")) { output.Add($"TitleUnicode:{titleUnicode}");  continue; }
                if (trimmed.StartsWith("Artist:"))       { output.Add($"Artist:{artist}");              continue; }
                if (trimmed.StartsWith("ArtistUnicode:")){ output.Add($"ArtistUnicode:{artistUnicode}"); continue; }
                if (trimmed.StartsWith("Creator:"))      { output.Add("Creator:");                      continue; }
                if (trimmed.StartsWith("Version:"))      { output.Add("Version:");                      continue; }
                if (trimmed.StartsWith("Source:"))       { output.Add($"Source:{source}");              continue; }
                if (trimmed.StartsWith("Tags:"))         { output.Add($"Tags:{tags}");                  continue; }
                if (trimmed.StartsWith("BeatmapID:"))    { output.Add("BeatmapID:0");                   continue; }
                if (trimmed.StartsWith("BeatmapSetID:")) { output.Add("BeatmapSetID:-1");               continue; }
            }

            if (currentSection == "[Difficulty]" && resetDifficulty)
            {
                if (trimmed.StartsWith("HPDrainRate:"))      { output.Add("HPDrainRate:5");         continue; }
                if (trimmed.StartsWith("CircleSize:"))       { output.Add("CircleSize:5");          continue; }
                if (trimmed.StartsWith("OverallDifficulty:")) { output.Add("OverallDifficulty:5");  continue; }
                if (trimmed.StartsWith("ApproachRate:"))     { output.Add("ApproachRate:5");        continue; }
                if (trimmed.StartsWith("SliderMultiplier:")) { output.Add("SliderMultiplier:1.4");  continue; }
                if (trimmed.StartsWith("SliderTickRate:"))   { output.Add("SliderTickRate:1");      continue; }
            }

            output.Add(line);
        }

        if (currentSection == "[TimingPoints]" && inTimingSection && resetTimingPoints)
            output.AddRange(CloneResetTimingPoints(timingLines));

        return string.Join(eol, output);
    }

    private static List<string> CloneResetTimingPoints(IEnumerable<string> lines)
    {
        var result = new List<string>();

        foreach (var line in lines)
        {
            var t = line.Trim();
            if (string.IsNullOrEmpty(t) || t.StartsWith("//")) continue;

            var p = t.Split(',');
            if (p.Length < 8) continue;

            var uninherited = p[6].Trim();
            if (uninherited != "1") continue;

            var time       = p[0].Trim();
            var beatLength = p[1].Trim();
            var meter      = p[2].Trim();

            result.Add($"{time},{beatLength},{meter},1,0,100,{uninherited},0");
        }

        return result;
    }

    private static string CloneSanitize(string input)
    {
        const string forbidden = "<>:\"/\\|?*";
        var s = new string(input.Where(c => !char.IsControl(c) && !forbidden.Contains(c)).ToArray());
        s = s.TrimEnd(' ', '.');
        s = string.Join(" ", s.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries)).Trim();
        if (string.IsNullOrEmpty(s)) return "";
        var reserved = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            { "con","prn","aux","nul","com1","com2","com3","com4","com5",
              "com6","com7","com8","com9","lpt1","lpt2","lpt3","lpt4","lpt5",
              "lpt6","lpt7","lpt8","lpt9" };
        if (reserved.Contains(s.TrimEnd('.', ' '))) s = "_" + s;
        return s.TrimEnd(' ', '.');
    }

    private static string? CloneSafeRelPath(string? rel)
    {
        if (string.IsNullOrWhiteSpace(rel)) return null;
        rel = rel.Trim();
        if (Path.IsPathRooted(rel)) return null;
        foreach (var part in rel.Replace('\\', '/').Split('/'))
            if (part == "..") return null;
        return rel;
    }

    private static string CloneNextAvailablePath(string path)
    {
        if (!File.Exists(path)) return path;
        var dir  = Path.GetDirectoryName(path) ?? "";
        var stem = Path.GetFileNameWithoutExtension(path);
        var ext  = Path.GetExtension(path);
        for (var i = 1; i <= 9999; i++)
        {
            var candidate = Path.Combine(dir, $"{stem} ({i}){ext}");
            if (!File.Exists(candidate)) return candidate;
        }
        return path;
    }

    private static string? DetectSongsPath()
    {
        using var key = Registry.ClassesRoot.OpenSubKey(@"osustable.Uri.osu\DefaultIcon");
        if (key?.GetValue(null) is string iconValue)
        {
            var exePath = iconValue.Split(',')[0].Trim().Trim('"');
            if (exePath.EndsWith("osu!.exe", StringComparison.OrdinalIgnoreCase))
            {
                var exeDir = Path.GetDirectoryName(exePath);
                if (exeDir is not null)
                {
                    var songsPath = Path.Combine(exeDir, "Songs");
                    if (Directory.Exists(songsPath)) return songsPath;
                }
            }
        }

        var localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        var defaultPath = Path.Combine(localAppData, "osu!", "Songs");
        return Directory.Exists(defaultPath) ? defaultPath : null;
    }
}

public record BeatmapsetInfo(
    int Id,
    string Title,
    string Artist,
    string Creator,
    string FolderPath,
    string? BackgroundFile,
    IReadOnlyList<DifficultyInfo> Difficulties,
    int Mode
);

public record DifficultyInfo(string Version, int Mode);

public record MetadataUpdateDto(
    string Title,
    string TitleUnicode,
    string Artist,
    string ArtistUnicode,
    string Source,
    string Tags,
    DiffBackgroundDto[]? Backgrounds
);

public record DiffBackgroundDto(
    string Version,
    string Filename,
    int OffsetX,
    int OffsetY
);

public record CloneRequest(
    string FolderPath,
    string TemplateVersion,
    int GameMode,
    string Title,
    string TitleUnicode,
    string Artist,
    string ArtistUnicode,
    string Source,
    string Tags,
    bool ResetTimingPoints,
    bool RemoveSkinFiles,
    bool CopyPreviewTime,
    bool ResetDifficulty
);
