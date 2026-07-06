using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;

namespace MappingUtility.Server.Services;

public readonly record struct CurrentBeatmapLookup(
    string Status,
    string? Message,
    string? DetectedFilename,
    string? FolderPath
);

public static partial class CurrentBeatmapLookupService
{
    [GeneratedRegex(@"^\s*osu!\s*(?:cuttingedge|beta)?\s*(?:b\d+)?\s*-\s*(?<filename>.+?\.osu)\s*$",
        RegexOptions.IgnoreCase)]
    private static partial Regex OsuEditorWindowRegex();

    [GeneratedRegex(@"^osu!\s*(?:cuttingedge|beta)?\s*(?:b\d+)?\s*-\s*", RegexOptions.IgnoreCase)]
    private static partial Regex OsuBuildTitlePrefixRegex();

    [GeneratedRegex(@"(?<filename>[^\\/:*?""<>|\r\n]+?\.osu)", RegexOptions.IgnoreCase)]
    private static partial Regex AnyOsuFilenameRegex();

    public static CurrentBeatmapLookup Detect(string? songsFolder)
    {
        if (!OperatingSystem.IsWindows())
            return new CurrentBeatmapLookup(
                "unsupported_platform", "Current map lookup is only supported on Windows.", null, null);

        var processIds = SnapshotStableProcessIds();
        if (processIds.Count == 0)
            return new CurrentBeatmapLookup("no_process", "Could not detect an osu! process.", null, null);

        var filename = GetWindowTitles(processIds)
            .Select(TryExtractOsuFilename)
            .FirstOrDefault(f => !string.IsNullOrWhiteSpace(f));

        if (string.IsNullOrWhiteSpace(filename))
            return new CurrentBeatmapLookup("no_editor_title", "Open a map in the editor first.", null, null);

        if (string.IsNullOrWhiteSpace(songsFolder) || !Directory.Exists(songsFolder))
            return new CurrentBeatmapLookup(
                "songs_folder_not_found", "Songs folder could not be detected.", filename, null);

        var folder = TryFindBeatmapSetFolder(songsFolder, filename);
        return folder is null
            ? new CurrentBeatmapLookup(
                "not_found", "Detected a beatmap in the editor, but couldn't find a matching file in Songs.", filename, null)
            : new CurrentBeatmapLookup("found", "Current beatmap found.", filename, folder);
    }

    private static HashSet<int> SnapshotStableProcessIds()
    {
        var ids = new HashSet<int>();
        foreach (var process in Process.GetProcesses())
        {
            try
            {
                if (!process.ProcessName.Contains("osu", StringComparison.OrdinalIgnoreCase))
                    continue;

                string? exePath = null;
                try { exePath = process.MainModule?.FileName; }
                catch { }

                if (exePath?.Contains("lazer", StringComparison.OrdinalIgnoreCase) == true)
                    continue;

                ids.Add(process.Id);
            }
            catch { }
            finally { process.Dispose(); }
        }
        return ids;
    }

    private static List<string> GetWindowTitles(HashSet<int> processIds)
    {
        var titles = new List<string>();

        EnumWindows((hwnd, _) =>
        {
            if (!IsWindowVisible(hwnd)) return true;

            GetWindowThreadProcessId(hwnd, out var pid);
            if (!processIds.Contains((int)pid)) return true;

            var length = GetWindowTextLengthW(hwnd);
            if (length <= 0) return true;

            var sb = new StringBuilder(length + 1);
            GetWindowTextW(hwnd, sb, sb.Capacity);
            var title = sb.ToString();
            if (!string.IsNullOrWhiteSpace(title)) titles.Add(title);
            return true;
        }, IntPtr.Zero);

        return titles;
    }

    private static string? TryExtractOsuFilename(string windowTitle)
    {
        var trimmed = windowTitle.Trim();

        var strict = OsuEditorWindowRegex().Match(trimmed);
        if (strict.Success)
            return Sanitize(strict.Groups["filename"].Value.Trim());

        var loose = AnyOsuFilenameRegex().Matches(trimmed);
        if (loose.Count == 0) return null;

        return Sanitize(loose[^1].Groups["filename"].Value.Trim());
    }

    private static string? Sanitize(string filename)
    {
        var trimmed = OsuBuildTitlePrefixRegex().Replace(filename, "").Trim();
        return string.IsNullOrWhiteSpace(trimmed) ? null : trimmed;
    }

    private static string? TryFindBeatmapSetFolder(string songsFolder, string filename)
    {
        var matches = new List<string>();
        try
        {
            foreach (var folder in Directory.EnumerateDirectories(songsFolder))
            {
                var candidate = Path.Combine(folder, filename);
                if (File.Exists(candidate)) matches.Add(candidate);
            }
        }
        catch
        {
            return null;
        }

        var selected = matches.OrderByDescending(File.GetLastWriteTimeUtc).FirstOrDefault();
        return selected is null ? null : Path.GetDirectoryName(selected);
    }

    private delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc enumFunc, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowTextLengthW(IntPtr hWnd);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowTextW(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
}
