namespace MappingUtility.Parser.Settings;

public class MetadataSettings
{
    public string Title { get; set; } = "";
    public string TitleUnicode { get; set; } = "";
    public string Artist { get; set; } = "";
    public string ArtistUnicode { get; set; } = "";
    public string Creator { get; set; } = "";
    public string Version { get; set; } = "";
    public string Source { get; set; } = "";
    public string Tags { get; set; } = "";
    public long BeatmapId { get; set; } = 0;
    public long BeatmapSetId { get; set; } = -1;
}
