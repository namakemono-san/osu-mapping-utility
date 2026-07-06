using System.Text.RegularExpressions;
using MappingUtility.Parser.Primitives;

namespace MappingUtility.Parser.Sections;

public sealed partial class Colours
{
    public IReadOnlyList<OsuColor> Combos { get; init; } = [];
    public OsuColor? SliderTrackOverride { get; init; }
    public OsuColor? SliderBorder { get; init; }

    [GeneratedRegex(@"^Combo(\d+)$", RegexOptions.IgnoreCase)]
    private static partial Regex ComboKeyRegex();

    internal static Colours Parse(Dictionary<string, string> kv)
    {
        var combos = kv.Keys
            .Select(k => ComboKeyRegex().Match(k))
            .Where(m => m.Success)
            .Select(m => (Index: int.Parse(m.Groups[1].Value), Key: m.Value))
            .OrderBy(m => m.Index)
            .Select(m => kv[m.Key])
            .Select(raw => TryParseColor(raw, out var color) ? color : (OsuColor?)null)
            .Where(c => c.HasValue)
            .Select(c => c!.Value)
            .ToList();

        OsuColor? sliderTrack = null;
        if (kv.TryGetValue("SliderTrackOverride", out var st) && TryParseColor(st, out var stc))
            sliderTrack = stc;

        OsuColor? sliderBorder = null;
        if (kv.TryGetValue("SliderBorder", out var sb) && TryParseColor(sb, out var sbc))
            sliderBorder = sbc;

        return new Colours
        {
            Combos              = combos,
            SliderTrackOverride = sliderTrack,
            SliderBorder        = sliderBorder,
        };
    }

    private static bool TryParseColor(string raw, out OsuColor color)
    {
        var parts = raw.Split(',', StringSplitOptions.TrimEntries);
        if (parts.Length >= 3 &&
            byte.TryParse(parts[0], out var r) &&
            byte.TryParse(parts[1], out var g) &&
            byte.TryParse(parts[2], out var b))
        {
            color = new OsuColor(r, g, b);
            return true;
        }
        color = default;
        return false;
    }
}
