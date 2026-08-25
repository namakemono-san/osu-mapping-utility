using MappingUtility.Parser;
using MappingUtility.Server.Hubs;
using MappingUtility.Server.Models;
using MappingUtility.Server.Utilities;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Win32;
using System.Collections.Concurrent;
using System.Diagnostics;

namespace MappingUtility.Server.Services;

public sealed class BeatmapsetLibrary(IHubContext<BeatmapsetHub> hub) : IDisposable
{
    private const int WatcherBufferSize = 64 * 1024;
    private const int StructureDebounceMs = 1500;
    private const int ContentDebounceMs = 600;

    private static readonly int Parallelism = Math.Max(1, Environment.ProcessorCount / 2);

    private readonly ConcurrentDictionary<string, BeatmapsetInfo> _infoCache = new(StringComparer.OrdinalIgnoreCase);

    private readonly object _folderLock = new();
    private string? _songsPath;
    private string[]? _folders;

    private readonly object _watcherLock = new();
    private FileSystemWatcher? _structureWatcher;
    private FileSystemWatcher? _contentWatcher;
    private Timer? _structureDebounce;

    private readonly object _pendingLock = new();
    private readonly Dictionary<string, Timer> _pendingFolders = new(StringComparer.OrdinalIgnoreCase);

    public string? SongsPath
    {
        get
        {
            lock (_folderLock)
            {
                if (_songsPath is not null) return _songsPath;
            }
            return DetectSongsPath();
        }
    }

    public string[] Snapshot()
    {
        lock (_folderLock) return _folders ?? [];
    }

    public string[] Scan(string path, bool forceRefresh)
    {
        string[] folders;
        lock (_folderLock)
        {
            var pathChanged = !string.Equals(_songsPath, path, StringComparison.OrdinalIgnoreCase);
            if (forceRefresh || pathChanged || _folders is null)
            {
                if (forceRefresh || pathChanged) _infoCache.Clear();
                _folders = OrderByRecency(Directory.GetDirectories(path));
                _songsPath = path;
            }
            folders = _folders;
        }

        EnsureWatchers(path);
        return folders;
    }

    public BeatmapsetInfo? GetOrParse(string dir) =>
        _infoCache.TryGetValue(dir, out var cached) ? cached : ParseFolder(dir);

    public List<BeatmapsetInfo> ParseRange(int startIndex, int count)
    {
        var folders = Snapshot();
        var end = Math.Min(startIndex + count, folders.Length);
        if (startIndex < 0 || startIndex >= end) return [];

        var slice = folders[startIndex..end];
        var results = new BeatmapsetInfo?[slice.Length];

        Parallel.For(0, slice.Length, new ParallelOptions { MaxDegreeOfParallelism = Parallelism },
            i => results[i] = GetOrParse(slice[i]));

        return results.Where(info => info is not null).Select(info => info!).ToList();
    }

    public void Invalidate(string dir)
    {
        _infoCache.TryRemove(dir, out _);
        ScheduleFolderRefresh(dir);
    }

    private static string[] OrderByRecency(IEnumerable<string> dirs) =>
        dirs.OrderByDescending(LastWriteUtcOrMin).ToArray();

    private static DateTime LastWriteUtcOrMin(string dir)
    {
        try { return Directory.GetLastWriteTimeUtc(dir); }
        catch { return DateTime.MinValue; }
    }

    private BeatmapsetInfo? ParseFolder(string dir)
    {
        try
        {
            var files = Directory.GetFiles(dir, "*.osu", SearchOption.TopDirectoryOnly);
            if (files.Length == 0) return null;

            var beatmaps = files
                .Select(TryReadBeatmap)
                .Where(b => b is not null)
                .Select(b => b!)
                .OrderBy(b => b.General.Mode)
                .ThenBy(b => DifficultyOrder.GetLevel(b.General.Mode, b.Metadata.Version))
                .ThenBy(b => b.HitObjects.Count)
                .ThenBy(b => b.Metadata.Version, StringComparer.OrdinalIgnoreCase)
                .ToList();

            if (beatmaps.Count == 0) return null;

            var primary = beatmaps.FirstOrDefault(b => b.Metadata.BeatmapSetId.HasValue) ?? beatmaps[0];
            var info = new BeatmapsetInfo(
                primary.Metadata.BeatmapSetId ?? 0,
                primary.Metadata.Title,
                primary.Metadata.Artist,
                primary.Metadata.Creator,
                dir,
                primary.Background?.Filename,
                beatmaps.Select(b => new DifficultyInfo(b.Metadata.Version, (int)b.General.Mode)).ToList(),
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

    private static Beatmap? TryReadBeatmap(string file)
    {
        try { return Beatmap.FromFile(file); }
        catch (Exception ex)
        {
            Trace.TraceWarning($"Skipped unreadable beatmap '{file}': {ex.Message}");
            return null;
        }
    }

    private void EnsureWatchers(string path)
    {
        lock (_watcherLock)
        {
            if (_structureWatcher is not null &&
                _structureWatcher.Path.Equals(path, StringComparison.OrdinalIgnoreCase))
                return;

            DisposeWatchers();

            _structureWatcher = new FileSystemWatcher(path)
            {
                NotifyFilter = NotifyFilters.DirectoryName,
                IncludeSubdirectories = false,
                InternalBufferSize = WatcherBufferSize
            };
            _structureWatcher.Created += OnStructureChanged;
            _structureWatcher.Deleted += OnStructureChanged;
            _structureWatcher.Renamed += OnStructureChanged;
            _structureWatcher.Error += (_, e) => OnWatcherError("Songs folder", e);
            _structureWatcher.EnableRaisingEvents = true;

            _contentWatcher = new FileSystemWatcher(path, "*.osu")
            {
                NotifyFilter = NotifyFilters.FileName | NotifyFilters.LastWrite | NotifyFilters.Size,
                IncludeSubdirectories = true,
                InternalBufferSize = WatcherBufferSize
            };
            _contentWatcher.Created += OnBeatmapFileChanged;
            _contentWatcher.Changed += OnBeatmapFileChanged;
            _contentWatcher.Deleted += OnBeatmapFileChanged;
            _contentWatcher.Renamed += OnBeatmapFileRenamed;
            _contentWatcher.Error += (_, e) => OnWatcherError("Beatmap file", e);
            _contentWatcher.EnableRaisingEvents = true;
        }
    }

    private void OnWatcherError(string label, ErrorEventArgs e)
    {
        Trace.TraceWarning($"{label} watcher error: {e.GetException().Message}");
        ScheduleStructureReconcile();
    }

    private void OnStructureChanged(object sender, FileSystemEventArgs e) => ScheduleStructureReconcile();

    private void ScheduleStructureReconcile()
    {
        lock (_watcherLock)
        {
            _structureDebounce?.Dispose();
            _structureDebounce = new Timer(_ => ReconcileFolders(), null, StructureDebounceMs, Timeout.Infinite);
        }
    }

    private void OnBeatmapFileChanged(object sender, FileSystemEventArgs e) =>
        ScheduleFolderRefresh(BeatmapsetFolderOf(e.FullPath));

    private void OnBeatmapFileRenamed(object sender, RenamedEventArgs e)
    {
        ScheduleFolderRefresh(BeatmapsetFolderOf(e.OldFullPath));
        ScheduleFolderRefresh(BeatmapsetFolderOf(e.FullPath));
    }

    private string? BeatmapsetFolderOf(string filePath)
    {
        var dir = Path.GetDirectoryName(filePath);
        if (dir is null) return null;

        string? root;
        lock (_folderLock) root = _songsPath;
        if (root is null) return null;

        var parent = Path.GetDirectoryName(dir);
        if (parent is null) return null;

        var normalizedRoot = root.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        var normalizedParent = parent.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        return normalizedParent.Equals(normalizedRoot, StringComparison.OrdinalIgnoreCase) ? dir : null;
    }

    private void ScheduleFolderRefresh(string? dir)
    {
        if (dir is null) return;
        lock (_pendingLock)
        {
            if (_pendingFolders.TryGetValue(dir, out var existing))
            {
                existing.Change(ContentDebounceMs, Timeout.Infinite);
                return;
            }
            _pendingFolders[dir] = new Timer(OnFolderRefreshDue, dir, ContentDebounceMs, Timeout.Infinite);
        }
    }

    private void OnFolderRefreshDue(object? state)
    {
        var dir = (string)state!;
        lock (_pendingLock)
        {
            if (_pendingFolders.Remove(dir, out var timer)) timer.Dispose();
        }

        _infoCache.TryRemove(dir, out _);
        var info = Directory.Exists(dir) ? ParseFolder(dir) : null;
        _ = hub.Clients.All.SendAsync("BeatmapsetChanged", dir, info is null ? null : Json.Serialize(info));
    }

    private void ReconcileFolders()
    {
        string path;
        lock (_folderLock)
        {
            if (_songsPath is null || _folders is null) return;
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
            if (_folders is null || SameFolders(_folders, dirs)) return;

            foreach (var removed in _folders.Except(dirs, StringComparer.OrdinalIgnoreCase))
                _infoCache.TryRemove(removed, out _);

            _folders = OrderByRecency(dirs);
        }

        _ = hub.Clients.All.SendAsync("BeatmapsetsListChanged");
    }

    private static bool SameFolders(string[] a, string[] b) =>
        a.Length == b.Length &&
        a.OrderBy(f => f, StringComparer.OrdinalIgnoreCase)
            .SequenceEqual(b.OrderBy(f => f, StringComparer.OrdinalIgnoreCase), StringComparer.OrdinalIgnoreCase);

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

    private void DisposeWatchers()
    {
        _structureWatcher?.Dispose();
        _structureWatcher = null;
        _contentWatcher?.Dispose();
        _contentWatcher = null;
    }

    public void Dispose()
    {
        lock (_watcherLock)
        {
            DisposeWatchers();
            _structureDebounce?.Dispose();
            _structureDebounce = null;
        }
        lock (_pendingLock)
        {
            foreach (var timer in _pendingFolders.Values) timer.Dispose();
            _pendingFolders.Clear();
        }
    }
}
