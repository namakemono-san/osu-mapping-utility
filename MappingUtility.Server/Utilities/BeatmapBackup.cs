using MappingUtility.Parser;

namespace MappingUtility.Server.Utilities;

internal static class BeatmapBackup
{
    public static void Save(Beatmap beatmap, string file)
    {
        var metadata = beatmap.Metadata;
        if (metadata.BeatmapSetId is not int setId || metadata.BeatmapId is not int beatmapId) return;

        var backupDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "osu-mapping-utility", "backup",
            setId.ToString(), beatmapId.ToString());
        Directory.CreateDirectory(backupDir);

        var timestamp = DateTime.Now.ToString("yyyyMMddHHmmss");
        File.Copy(file, Path.Combine(backupDir, $"{timestamp}_{Path.GetFileName(file)}"), overwrite: true);
    }
}
