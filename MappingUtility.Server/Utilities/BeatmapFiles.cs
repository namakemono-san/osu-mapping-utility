using System.Diagnostics;

namespace MappingUtility.Server.Utilities;

internal static class BeatmapFiles
{
    public static string[] EnumerateOsuFiles(string folderPath) =>
        Directory.Exists(folderPath)
            ? Directory.GetFiles(folderPath, "*.osu", SearchOption.TopDirectoryOnly)
            : [];

    public static string? FindByVersion(string folderPath, string version) =>
        EnumerateOsuFiles(folderPath).FirstOrDefault(f => ReadVersion(f) == version);

    private static string? ReadVersion(string file)
    {
        try
        {
            foreach (var line in File.ReadLines(file))
            {
                var trimmed = line.TrimStart();
                if (trimmed.StartsWith("Version:", StringComparison.OrdinalIgnoreCase))
                    return trimmed[(trimmed.IndexOf(':') + 1)..].Trim();
            }
        }
        catch (Exception ex)
        {
            Trace.TraceWarning($"Failed to read version from '{file}': {ex.Message}");
        }
        return null;
    }
}
