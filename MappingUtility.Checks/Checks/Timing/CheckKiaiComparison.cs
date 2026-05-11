using MappingUtility.Checks.Framework;
using MappingUtility.Checks.Utils;
using MappingUtility.Parser.Objects;

namespace MappingUtility.Checks.Checks.Timing;

[Check]
public class CheckKiaiComparison : BeatmapSetCheck
{
    public override CheckMetadata GetMetadata() => new()
    {
        CheckId = "timing.kiai_comparison",
        Category = "Timing",
        Message = "Kiai sections inconsistent across difficulties.",
    };

    public override Dictionary<string, IssueTemplate> GetTemplates() => new()
    {
        ["Warning"] = new IssueTemplate(Issue.Level.Warning,
            "Kiai mismatch between difficulties at {0} point(s): {1}", "0", ""),
    };

    private static bool GetKiaiStateAt(double offset, IReadOnlyList<Parser.Objects.TimingLines.TimingLine> timingLines)
    {
        var state = false;
        foreach (var tp in timingLines)
        {
            if (tp.Offset > offset) break;
            state = tp.Kiai;
        }
        return state;
    }

    public override IEnumerable<Issue> GetIssues(IReadOnlyList<Beatmap> beatmaps)
    {
        if (beatmaps.Count <= 1) yield break;

        var changeOffsets = new HashSet<double>();
        foreach (var d in beatmaps)
        {
            var prev = false;
            foreach (var tp in d.TimingLines)
            {
                if (tp.Kiai != prev) changeOffsets.Add(tp.Offset);
                prev = tp.Kiai;
            }
        }

        var mismatches = new List<string>();
        foreach (var offset in changeOffsets.OrderBy(o => o))
        {
            var states = beatmaps.Select(d => GetKiaiStateAt(offset, d.TimingLines)).ToList();
            if (states.Any(s => s != states[0]))
                mismatches.Add(RcUtils.FormatMs(offset));
        }

        if (mismatches.Count > 0)
            yield return new Issue(GetTemplate("Warning"), null,
                mismatches.Count, RcUtils.FormatTimestampList(mismatches));
    }
}
