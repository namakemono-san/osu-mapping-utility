using MappingUtility.Checks.Framework;
using MappingUtility.Checks.Utils;
using MappingUtility.Parser.Objects;
using MappingUtility.Parser.Objects.TimingLines;

namespace MappingUtility.Checks.Checks.General;

[Check]
public class CheckEpilepsyWarning : GeneralCheck
{
    public override CheckMetadata GetMetadata() => new()
    {
        CheckId = "general.epilepsy",
        Category = "General",
        Message = "Potential epilepsy risk from kiai sections.",
    };

    public override Dictionary<string, IssueTemplate> GetTemplates() => new()
    {
        ["FlashWarn"]    = new IssueTemplate(Issue.Level.Warning,
            "Rapid kiai flash ({0} transition(s) ≥3Hz): {1}", "0", ""),
        ["FlashCaution"] = new IssueTemplate(Issue.Level.Check,
            "Rapid kiai flash ({0} transition(s) ≥2Hz): {1}", "0", ""),
        ["BpmWarn"]      = new IssueTemplate(Issue.Level.Warning,
            "High-BPM kiai ({0} BPM / {1} section(s)): {2}", "0", "0", ""),
        ["BpmCaution"]   = new IssueTemplate(Issue.Level.Check,
            "High-BPM kiai ({0} BPM / {1} section(s)): {2}", "0", "0", ""),
    };

    public override IEnumerable<Issue> GetIssues(IReadOnlyList<Beatmap> beatmaps)
    {
        if (beatmaps.Count == 0) yield break;
        var d = beatmaps[0];

        var kiaiOnTimes = GetKiaiOnTimes(d.TimingLines);
        var (flashWarn, flashCaution) = GetFlashIssues(kiaiOnTimes);
        var (bpmWarn, bpmCaution) = GetBpmIssues(d.TimingLines);

        if (flashWarn.Count > 0)
            yield return new Issue(GetTemplate("FlashWarn"), null,
                flashWarn.Count, RcUtils.FormatTimestampList(flashWarn));
        else if (flashCaution.Count > 0)
            yield return new Issue(GetTemplate("FlashCaution"), null,
                flashCaution.Count, RcUtils.FormatTimestampList(flashCaution));

        if (bpmWarn.Count > 0)
        {
            var maxBpm = (int)bpmWarn.Max(b => b.Bpm);
            yield return new Issue(GetTemplate("BpmWarn"), null,
                maxBpm, bpmWarn.Count, RcUtils.FormatTimestampList(bpmWarn.Select(b => b.Ts)));
        }
        else if (bpmCaution.Count > 0)
        {
            var maxBpm = (int)bpmCaution.Max(b => b.Bpm);
            yield return new Issue(GetTemplate("BpmCaution"), null,
                maxBpm, bpmCaution.Count, RcUtils.FormatTimestampList(bpmCaution.Select(b => b.Ts)));
        }
    }

    private static List<double> GetKiaiOnTimes(IReadOnlyList<TimingLine> timingLines)
    {
        var result = new List<double>();
        var prevKiai = false;
        foreach (var tp in timingLines)
        {
            if (tp.Kiai && !prevKiai) result.Add(tp.Offset);
            prevKiai = tp.Kiai;
        }
        return result;
    }

    private static (List<string> Warn, List<string> Caution) GetFlashIssues(List<double> kiaiOnTimes)
    {
        var warn = new List<string>();
        var caution = new List<string>();
        for (var i = 1; i < kiaiOnTimes.Count; i++)
        {
            var intervalMs = kiaiOnTimes[i] - kiaiOnTimes[i - 1];
            if (intervalMs <= 0) continue;
            var hz = 1000.0 / intervalMs;
            if (hz >= 3) warn.Add(RcUtils.FormatMs(kiaiOnTimes[i]));
            else if (hz >= 2) caution.Add(RcUtils.FormatMs(kiaiOnTimes[i]));
        }
        return (warn, caution);
    }

    private static (List<(string Ts, double Bpm)> Warn, List<(string Ts, double Bpm)> Caution)
        GetBpmIssues(IReadOnlyList<TimingLine> timingLines)
    {
        var warn = new List<(string Ts, double Bpm)>();
        var caution = new List<(string Ts, double Bpm)>();
        var inKiai = false;
        var currentBpm = 120.0;
        foreach (var tp in timingLines)
        {
            if (tp is UninheritedLine ul) currentBpm = ul.Bpm;
            if (tp.Kiai && !inKiai)
            {
                if (currentBpm >= 300) warn.Add((RcUtils.FormatMs(tp.Offset), currentBpm));
                else if (currentBpm >= 240) caution.Add((RcUtils.FormatMs(tp.Offset), currentBpm));
                inKiai = true;
            }
            else if (!tp.Kiai)
            {
                inKiai = false;
            }
        }
        return (warn, caution);
    }
}
