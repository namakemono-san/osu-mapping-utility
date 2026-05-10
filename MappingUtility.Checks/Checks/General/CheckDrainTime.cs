using MappingUtility.Checks.Framework;
using MappingUtility.Checks.Utils;
using MappingUtility.Parser.Objects;

namespace MappingUtility.Checks.Checks.General;

[Check]
public class CheckDrainTime : BeatmapCheck
{
    public override CheckMetadata GetMetadata() => new()
    {
        CheckId = "general.drain_time",
        Category = "General",
        Message = "Drain time is too short.",
    };

    public override Dictionary<string, IssueTemplate> GetTemplates() => new()
    {
        ["Problem"] = new IssueTemplate(Issue.Level.Problem,
            "Drain time is too short ({0}, must be ≥ 0:30).", "0:00"),
    };

    public override IEnumerable<Issue> GetIssues(Beatmap beatmap)
    {
        var drainSec = beatmap.DrainTimeMs / 1000.0;
        if (drainSec < 30)
            yield return new Issue(GetTemplate("Problem"), beatmap, RcUtils.FormatDuration(drainSec));
    }
}
