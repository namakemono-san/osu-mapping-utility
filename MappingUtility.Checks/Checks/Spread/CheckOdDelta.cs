using MappingUtility.Checks.Framework;
using MappingUtility.Checks.Utils;
using MappingUtility.Parser.Objects;

namespace MappingUtility.Checks.Checks.Spread;

[Check]
public class CheckOdDelta : BeatmapSetCheck
{
    public override CheckMetadata GetMetadata() => new()
    {
        CheckId = "spread.od_delta",
        Category = "Spread",
        Message = "OD does not increase with difficulty.",
    };

    public override Dictionary<string, IssueTemplate> GetTemplates() => new()
    {
        ["Check"] = new IssueTemplate(Issue.Level.Check,
            "{0} OD {1} is lower than {2} OD {3}.", "", "0", "", "0"),
    };

    public override IEnumerable<Issue> GetIssues(IReadOnlyList<Beatmap> beatmaps)
    {
        if (beatmaps.Count <= 1) yield break;

        var sorted = beatmaps
            .OrderBy(b => TaikoUtils.DifficultyIndex(b.Metadata.Version))
            .ToList();

        for (var i = 1; i < sorted.Count; i++)
        {
            var prev = sorted[i - 1];
            var curr = sorted[i];

            if (curr.Difficulty.OverallDifficulty < prev.Difficulty.OverallDifficulty)
                yield return new Issue(GetTemplate("Check"), null,
                    curr.Metadata.Version, curr.Difficulty.OverallDifficulty,
                    prev.Metadata.Version, prev.Difficulty.OverallDifficulty);
        }
    }
}
