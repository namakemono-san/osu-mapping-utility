using MappingUtility.Checks.Framework;
using MappingUtility.Parser.Objects;
using MappingUtility.Parser.Objects.TimingLines;

namespace MappingUtility.Checks.Checks.General;

[Check]
public class CheckTimingPointExists : BeatmapCheck
{
    public override CheckMetadata GetMetadata() => new()
    {
        CheckId = "general.timing_point_exists",
        Category = "General",
        Message = "No uninherited timing point found.",
    };

    public override Dictionary<string, IssueTemplate> GetTemplates() => new()
    {
        ["Problem"] = new IssueTemplate(Issue.Level.Problem,
            "No uninherited timing point found."),
    };

    public override IEnumerable<Issue> GetIssues(Beatmap beatmap)
    {
        if (!beatmap.TimingLines.OfType<UninheritedLine>().Any())
            yield return new Issue(GetTemplate("Problem"), beatmap);
    }
}
