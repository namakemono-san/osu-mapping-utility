namespace MappingUtility.Parser.Primitives;

public readonly record struct HitSample
{
    public SampleSet NormalSet { get; init; }
    public SampleSet AdditionSet { get; init; }
    public int Index { get; init; }
    public int Volume { get; init; }
    public string? Filename { get; init; }

    public static readonly HitSample Default = new();

    public string Serialize()
        => $"{(int)NormalSet}:{(int)AdditionSet}:{Index}:{Volume}:{Filename ?? ""}";

    internal static HitSample Parse(string raw)
    {
        var parts = raw.Split(':');
        return new HitSample
        {
            NormalSet   = parts.Length > 0 && int.TryParse(parts[0], out var ns)  ? (SampleSet)ns  : SampleSet.Default,
            AdditionSet = parts.Length > 1 && int.TryParse(parts[1], out var ads) ? (SampleSet)ads : SampleSet.Default,
            Index       = parts.Length > 2 && int.TryParse(parts[2], out var idx) ? idx : 0,
            Volume      = parts.Length > 3 && int.TryParse(parts[3], out var vol) ? vol : 0,
            Filename    = parts.Length > 4 && !string.IsNullOrEmpty(parts[4]) ? parts[4] : null,
        };
    }
}
