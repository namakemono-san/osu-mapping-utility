using System.Globalization;
using MappingUtility.Parser.Internal;

namespace MappingUtility.Parser.Sections;

public sealed class Editor
{
    public List<int> Bookmarks { get; set; } = [];
    public float DistanceSpacing { get; init; } = 1f;
    public int BeatDivisor { get; init; } = 4;
    public int GridSize { get; init; } = 4;
    public float? TimelineZoom { get; init; }

    internal static Editor Parse(Dictionary<string, string> kv)
    {
        var bookmarks = new List<int>();
        if (kv.TryGetValue("Bookmarks", out var raw) && !string.IsNullOrWhiteSpace(raw))
        {
            bookmarks.AddRange(raw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                                  .Select(s => int.TryParse(s, out var v) ? v : -1)
                                  .Where(v => v >= 0));
        }

        float? timelineZoom = null;
        if (kv.TryGetValue("TimelineZoom", out var tz) &&
            float.TryParse(tz, NumberStyles.Float, CultureInfo.InvariantCulture, out var tzf))
            timelineZoom = tzf;

        return new Editor
        {
            Bookmarks       = bookmarks,
            DistanceSpacing = kv.TryGetFloat("DistanceSpacing", 1f),
            BeatDivisor     = kv.TryGetInt("BeatDivisor", 4),
            GridSize        = kv.TryGetInt("GridSize", 4),
            TimelineZoom    = timelineZoom,
        };
    }
}
