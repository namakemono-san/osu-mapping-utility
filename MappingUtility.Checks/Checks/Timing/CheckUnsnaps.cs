using MappingUtility.Checks.Framework;
using MappingUtility.Checks.Utils;
using MappingUtility.Parser.Objects;
using MappingUtility.Parser.Objects.HitObjects;

namespace MappingUtility.Checks.Checks.Timing;

[Check]
public class CheckUnsnaps : BeatmapCheck
{
    public override CheckMetadata GetMetadata() => new()
    {
        CheckId = "timing.unsnaps",
        Category = "Timing",
        Message = "Unsnapped hit objects.",
    };

    public override Dictionary<string, IssueTemplate> GetTemplates() => new()
    {
        ["Problem"] = new IssueTemplate(Issue.Level.Problem,
            "{0} object(s) with 2–3ms unsnap: {1}", "0", ""),
        ["Minor"] = new IssueTemplate(Issue.Level.Minor,
            "{0} object(s) with ~1ms unsnap: {1}", "0", ""),
    };

    public override IEnumerable<Issue> GetIssues(Beatmap beatmap)
    {
        if (beatmap.General.Mode != 1) yield break;

        var problems = new List<string>();
        var minors = new List<string>();

        foreach (var ho in beatmap.HitObjects)
        {
            foreach (var time in GetCheckTimes(ho))
            {
                var diff = RcUtils.NearestSnapDiff(time, beatmap.TimingLines);
                var absDiff = Math.Abs(diff);

                if (absDiff >= 2 && absDiff <= 3)
                    problems.Add(RcUtils.FormatMs(time));
                else if (absDiff == 1)
                    minors.Add(RcUtils.FormatMs(time));
            }
        }

        if (problems.Count > 0)
            yield return new Issue(GetTemplate("Problem"), beatmap,
                problems.Count, RcUtils.FormatTimestampList(problems));

        if (minors.Count > 0)
            yield return new Issue(GetTemplate("Minor"), beatmap,
                minors.Count, RcUtils.FormatTimestampList(minors));
    }

    private static IEnumerable<int> GetCheckTimes(HitObject ho)
    {
        yield return ho.Time;

        if (ho is Spinner)
            yield return ho.EndTime;
    }
}
