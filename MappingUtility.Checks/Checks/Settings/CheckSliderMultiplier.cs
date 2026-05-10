using MappingUtility.Checks.Framework;
using MappingUtility.Checks.Utils;
using MappingUtility.Parser.Objects;
using MappingUtility.Parser.Objects.HitObjects;

namespace MappingUtility.Checks.Checks.Settings;

[Check]
public class CheckSliderMultiplier : BeatmapCheck
{
    private static readonly int[] ThirdDivisions = [3, 6];
    private static readonly int[] FourthDivisions = [4];

    public override CheckMetadata GetMetadata() => new()
    {
        CheckId = "settings.slider_multiplier",
        Category = "Settings",
        Message = "SliderMultiplier or TickRate non-standard.",
    };

    public override Dictionary<string, IssueTemplate> GetTemplates() => new()
    {
        ["SmWarn"] = new IssueTemplate(Issue.Level.Warning,
            "SliderMultiplier is {0} (standard for osu!taiko is 1.40).", "0"),
        ["TrWarn"] = new IssueTemplate(Issue.Level.Warning,
            "SliderTickRate is {0} — {1}% of notes are 1/3-snapped ({2} rhythm, recommended: {3}).", "0", "0", "", "0"),
    };

    public override IEnumerable<Issue> GetIssues(Beatmap beatmap)
    {
        if (beatmap.General.Mode != 1) yield break;

        var sm = beatmap.Difficulty.SliderMultiplier;
        if (Math.Abs(sm - 1.4) >= 0.001)
            yield return new Issue(GetTemplate("SmWarn"), beatmap, sm);

        var tr = beatmap.Difficulty.SliderTickRate;
        var circles = beatmap.HitObjects
            .Where(ho => ho.TypeFlags.HasFlag(HitObjectType.Circle)
                      && !ho.TypeFlags.HasFlag(HitObjectType.Slider)
                      && !ho.TypeFlags.HasFlag(HitObjectType.Spinner))
            .ToList();

        if (circles.Count > 10)
        {
            var thirdCount = circles.Count(ho =>
                RcUtils.NearestSnapError(ho.Time, beatmap.TimingLines, ThirdDivisions) <= 3
                && RcUtils.NearestSnapError(ho.Time, beatmap.TimingLines, FourthDivisions) > 3);

            var ratio = (double)thirdCount / circles.Count;
            var isSwing = ratio >= 0.3;
            var expectedTr = isSwing ? 3 : 1;
            var percent = (int)Math.Round(ratio * 100);

            if (Math.Abs(tr - expectedTr) >= 0.01)
                yield return new Issue(GetTemplate("TrWarn"), beatmap,
                    tr, percent, isSwing ? "swing" : "normal", expectedTr);
        }
    }
}
