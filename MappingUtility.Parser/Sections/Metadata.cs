namespace MappingUtility.Parser.Sections;

public sealed class Metadata
{
    public string Title { get; init; } = "";
    public string TitleUnicode { get; init; } = "";
    public string Artist { get; init; } = "";
    public string ArtistUnicode { get; init; } = "";
    public string Creator { get; init; } = "";
    public string Version { get; init; } = "";
    public string Source { get; init; } = "";
    public IReadOnlyList<string> Tags { get; init; } = [];
    public int? BeatmapId { get; init; }
    public int? BeatmapSetId { get; init; }

    internal static Metadata Parse(Dictionary<string, string> kv)
    {
        int? beatmapId = null;
        if (kv.TryGetValue("BeatmapID", out var bid) && int.TryParse(bid, out var bidv) && bidv != 0)
            beatmapId = bidv;

        int? beatmapSetId = null;
        if (kv.TryGetValue("BeatmapSetID", out var bsid) && int.TryParse(bsid, out var bsidv) && bsidv != -1)
            beatmapSetId = bsidv;

        var tags = Array.Empty<string>();
        if (kv.TryGetValue("Tags", out var rawTags) && !string.IsNullOrWhiteSpace(rawTags))
            tags = rawTags.Split(' ', StringSplitOptions.RemoveEmptyEntries);

        var title = kv.GetValueOrDefault("Title", "");
        return new Metadata
        {
            Title          = title,
            TitleUnicode   = kv.GetValueOrDefault("TitleUnicode", title),
            Artist         = kv.GetValueOrDefault("Artist", ""),
            ArtistUnicode  = kv.GetValueOrDefault("ArtistUnicode", kv.GetValueOrDefault("Artist", "")),
            Creator        = kv.GetValueOrDefault("Creator", ""),
            Version        = kv.GetValueOrDefault("Version", ""),
            Source         = kv.GetValueOrDefault("Source", ""),
            Tags           = tags,
            BeatmapId      = beatmapId,
            BeatmapSetId   = beatmapSetId,
        };
    }
}
