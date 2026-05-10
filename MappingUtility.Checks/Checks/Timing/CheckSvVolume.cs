using MappingUtility.Checks.Framework;
using MappingUtility.Checks.Utils;
using MappingUtility.Parser.Objects;

namespace MappingUtility.Checks.Checks.Timing;

[Check]
public class CheckSvVolume : BeatmapCheck
{
    public override CheckMetadata GetMetadata() => new()
    {
        CheckId = "timing.sv_volume",
        Category = "Timing",
        Message = "Volume changes near notes.",
    };

    public override Dictionary<string, IssueTemplate> GetTemplates() => new()
    {
        ["Warning"] = new IssueTemplate(Issue.Level.Warning,
            "{0} volume change(s) within 5ms of a note (≥15% diff): {1}", "0", ""),
    };

    public override IEnumerable<Issue> GetIssues(Beatmap beatmap)
    {
        var hitTimes = beatmap.HitObjects.Select(ho => (double)ho.Time).ToHashSet();
        var inherited = beatmap.TimingLines.Where(t => !t.Uninherited).ToList();

        var issues = new List<string>();
        for (var i = 1; i < inherited.Count; i++)
        {
            var prev = inherited[i - 1];
            var curr = inherited[i];
            if (Math.Abs(curr.Volume - prev.Volume) < 15) continue;

            var tooClose = hitTimes.Any(t => t != curr.Offset && Math.Abs(t - curr.Offset) < 5);
            if (tooClose) issues.Add(RcUtils.FormatMs(curr.Offset));
        }

        if (issues.Count > 0)
            yield return new Issue(GetTemplate("Warning"), beatmap,
                issues.Count, RcUtils.FormatTimestampList(issues));
    }
}
