using MappingUtility.Checks.Framework;
using MappingUtility.Checks.Utils;
using MappingUtility.Parser.Objects;

namespace MappingUtility.Checks.Checks.Timing;

[Check]
public class CheckSampleSet : BeatmapCheck
{
    private static readonly Dictionary<int, string> SampleSetNames = new()
    {
        [2] = "Soft",
        [3] = "Drum",
    };

    public override CheckMetadata GetMetadata() => new()
    {
        CheckId = "timing.sample_set",
        Category = "Timing",
        Message = "Non-Normal sampleset on timing points.",
    };

    public override Dictionary<string, IssueTemplate> GetTemplates() => new()
    {
        ["Check"] = new IssueTemplate(Issue.Level.Check,
            "{0} timing point(s) with non-Normal sampleset: {1}", "0", ""),
    };

    public override IEnumerable<Issue> GetIssues(Beatmap beatmap)
    {
        var issues = new List<string>();
        foreach (var tp in beatmap.TimingLines)
        {
            if (tp.SampleSet != 0 && tp.SampleSet != 1)
            {
                var name = SampleSetNames.GetValueOrDefault(tp.SampleSet, $"set {tp.SampleSet}");
                issues.Add($"{RcUtils.FormatMs(tp.Offset)} ({name})");
            }
        }

        if (issues.Count > 0)
            yield return new Issue(GetTemplate("Check"), beatmap,
                issues.Count, RcUtils.FormatTimestampList(issues));
    }
}
