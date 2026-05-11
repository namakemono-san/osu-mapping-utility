using MappingUtility.Checks.Framework;
using MappingUtility.Parser.Objects;
using MappingUtility.Parser.Objects.TimingLines;

namespace MappingUtility.Checks.Checks.General;

[Check]
public class CheckConcurrentUninherited : BeatmapCheck
{
    public override CheckMetadata GetMetadata() => new()
    {
        CheckId = "general.concurrent_uninherited",
        Category = "General",
        Message = "Concurrent uninherited timing points.",
    };

    public override Dictionary<string, IssueTemplate> GetTemplates() => new()
    {
        ["Problem"] = new IssueTemplate(Issue.Level.Problem,
            "Multiple uninherited timing points at the same offset."),
    };

    public override IEnumerable<Issue> GetIssues(Beatmap beatmap)
    {
        var offsets = beatmap.TimingLines
            .OfType<UninheritedLine>()
            .Select(l => l.Offset)
            .ToList();

        if (offsets.Count != offsets.Distinct().Count())
            yield return new Issue(GetTemplate("Problem"), beatmap);
    }
}
