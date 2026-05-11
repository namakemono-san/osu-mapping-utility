using MappingUtility.Checks.Framework;
using MappingUtility.Checks.Utils;
using MappingUtility.Parser.Objects;
using MappingUtility.Parser.Objects.TimingLines;

namespace MappingUtility.Checks.Checks.Timing;

[Check]
public class CheckRedGreenMatch : BeatmapCheck
{
    public override CheckMetadata GetMetadata() => new()
    {
        CheckId = "timing.red_green_match",
        Category = "Timing",
        Message = "Red/green line kiai or volume mismatch.",
    };

    public override Dictionary<string, IssueTemplate> GetTemplates() => new()
    {
        ["Warning"] = new IssueTemplate(Issue.Level.Warning,
            "{0} red/green mismatch(es) (kiai or volume): {1}", "0", ""),
    };

    public override IEnumerable<Issue> GetIssues(Beatmap beatmap)
    {
        var firstRedOffset = beatmap.TimingLines
            .FirstOrDefault(t => t.Uninherited)?.Offset ?? -1;

        var byOffset = beatmap.TimingLines
            .GroupBy(t => t.Offset)
            .ToDictionary(g => g.Key, g => g.ToList());

        var issues = new List<string>();
        foreach (var (offset, lines) in byOffset)
        {
            if (offset == firstRedOffset) continue;
            var red = lines.FirstOrDefault(l => l.Uninherited);
            var green = lines.FirstOrDefault(l => !l.Uninherited);
            if (red == null || green == null) continue;

            if (red.Kiai != green.Kiai || Math.Abs(red.Volume - green.Volume) >= 5)
                issues.Add(RcUtils.FormatMs(offset));
        }

        if (issues.Count > 0)
            yield return new Issue(GetTemplate("Warning"), beatmap,
                issues.Count, RcUtils.FormatTimestampList(issues));
    }
}
