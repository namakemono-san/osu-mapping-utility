using MappingUtility.Checks.Framework;
using MappingUtility.Checks.Utils;
using MappingUtility.Parser.Objects;
using MappingUtility.Parser.Objects.TimingLines;

namespace MappingUtility.Checks.Checks.Timing;

[Check]
public class CheckDoubleSv : BeatmapCheck
{
    public override CheckMetadata GetMetadata() => new()
    {
        CheckId = "timing.double_sv",
        Category = "Timing",
        Message = "Duplicate SV lines within 5ms.",
    };

    public override Dictionary<string, IssueTemplate> GetTemplates() => new()
    {
        ["Warning"] = new IssueTemplate(Issue.Level.Warning,
            "{0} SV line(s) within 5ms of another: {1}", "0", ""),
    };

    public override IEnumerable<Issue> GetIssues(Beatmap beatmap)
    {
        var inherited = beatmap.TimingLines
            .Where(t => !t.Uninherited)
            .ToList();

        var issues = new List<string>();
        for (var i = 0; i < inherited.Count - 1; i++)
        {
            var gap = Math.Abs(inherited[i + 1].Offset - inherited[i].Offset);
            if (gap is > 0 and <= 5)
                issues.Add(RcUtils.FormatMs(inherited[i].Offset));
        }

        if (issues.Count > 0)
            yield return new Issue(GetTemplate("Warning"), beatmap,
                issues.Count, RcUtils.FormatTimestampList(issues));
    }
}
