using MappingUtility.Checks.Framework;
using MappingUtility.Checks.Utils;
using MappingUtility.Parser.Objects;

namespace MappingUtility.Checks.Checks.Spread;

[Check]
public class CheckRequiredLevels : BeatmapSetCheck
{
    private record SpreadRule(double MinDrainSec, double MaxDrainSec, string LowestAllowed);

    private static readonly SpreadRule[] TaikoSpread =
    [
        new(195, 240, "Oni"),
        new(150, 195, "Muzukashii"),
        new(30,  150, "Futsuu"),
    ];

    public override CheckMetadata GetMetadata() => new()
    {
        CheckId = "spread.required_levels",
        Category = "Spread",
        Message = "Required difficulty spread not satisfied.",
    };

    public override Dictionary<string, IssueTemplate> GetTemplates() => new()
    {
        ["Problem"] = new IssueTemplate(Issue.Level.Problem,
            "Lowest difficulty must be {0} or easier (drain time: {1}).", "", ""),
    };

    public override IEnumerable<Issue> GetIssues(IReadOnlyList<Beatmap> beatmaps)
    {
        if (beatmaps.Count == 0) yield break;

        var maxDrainSec = beatmaps.Max(b => b.DrainTimeMs / 1000.0);
        var rule = TaikoSpread.FirstOrDefault(r => maxDrainSec >= r.MinDrainSec && maxDrainSec < r.MaxDrainSec)
                   ?? (maxDrainSec >= TaikoSpread[0].MaxDrainSec ? TaikoSpread[0] : null);

        if (rule == null) yield break;

        var lowestAllowedIdx = Array.IndexOf(TaikoUtils.DifficultyOrder, rule.LowestAllowed);
        if (lowestAllowedIdx == -1) yield break;

        var lowestPresentIdx = beatmaps
            .Select(b => Array.IndexOf(TaikoUtils.DifficultyOrder, TaikoUtils.ClassifyDifficulty(b.Metadata.Version)))
            .Where(i => i != -1)
            .DefaultIfEmpty(TaikoUtils.DifficultyOrder.Length)
            .Min();

        if (lowestPresentIdx > lowestAllowedIdx)
            yield return new Issue(GetTemplate("Problem"), null,
                rule.LowestAllowed, RcUtils.FormatDuration(maxDrainSec));
    }
}
