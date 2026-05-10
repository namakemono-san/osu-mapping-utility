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

        var kiaiOnTimes = new List<double>();
        var prevKiai = false;
        foreach (var tp in d.TimingLines)
        {
            if (tp.Kiai && !prevKiai) kiaiOnTimes.Add(tp.Offset);
            prevKiai = tp.Kiai;
        }

        var flashWarn    = new List<string>();
        var flashCaution = new List<string>();
        for (var i = 1; i < kiaiOnTimes.Count; i++)
        {
            var intervalMs = kiaiOnTimes[i] - kiaiOnTimes[i - 1];
            if (intervalMs <= 0) continue;
            var hz = 1000.0 / intervalMs;
            if (hz >= 3)
                flashWarn.Add(RcUtils.FormatMs(kiaiOnTimes[i]));
            else if (hz >= 2)
                flashCaution.Add(RcUtils.FormatMs(kiaiOnTimes[i]));
        }

        var bpmWarn    = new List<(string Ts, double Bpm)>();
        var bpmCaution = new List<(string Ts, double Bpm)>();
        var inKiai = false;
        var currentBpm = 120.0;
        foreach (var tp in d.TimingLines)
        {
            if (tp is UninheritedLine ul) currentBpm = ul.Bpm;
            if (tp.Kiai && !inKiai)
            {
                if (currentBpm >= 300)
                    bpmWarn.Add((RcUtils.FormatMs(tp.Offset), currentBpm));
                else if (currentBpm >= 240)
                    bpmCaution.Add((RcUtils.FormatMs(tp.Offset), currentBpm));
                inKiai = true;
            }
            else if (!tp.Kiai)
            {
                inKiai = false;
            }
        }

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
}
