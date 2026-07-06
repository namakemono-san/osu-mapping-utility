using MappingUtility.Parser.Internal;

namespace MappingUtility.Parser.Sections;

public sealed class Difficulty
{
    public float HpDrainRate { get; init; } = 5f;
    public float CircleSize { get; init; } = 5f;
    public float OverallDifficulty { get; init; } = 5f;
    public float ApproachRate { get; init; } = 5f;
    public float SliderMultiplier { get; init; } = 1.4f;
    public float SliderTickRate { get; init; } = 1f;

    internal static Difficulty Parse(Dictionary<string, string> kv)
    {
        var od = kv.TryGetFloat("OverallDifficulty", 5f);
        return new Difficulty
        {
            HpDrainRate       = kv.TryGetFloat("HPDrainRate", 5f),
            CircleSize        = kv.TryGetFloat("CircleSize", 5f),
            OverallDifficulty = od,
            ApproachRate      = kv.TryGetFloat("ApproachRate", od),
            SliderMultiplier  = kv.TryGetFloat("SliderMultiplier", 1.4f),
            SliderTickRate    = kv.TryGetFloat("SliderTickRate", 1f),
        };
    }
}
