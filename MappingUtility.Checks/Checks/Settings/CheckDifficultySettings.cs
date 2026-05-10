using MappingUtility.Checks.Framework;
using MappingUtility.Checks.Utils;
using MappingUtility.Parser.Objects;

namespace MappingUtility.Checks.Checks.Settings;

[Check]
public class CheckDifficultySettings : BeatmapCheck
{
    private record Range(double? Min, double? Max)
    {
        public bool Contains(double value) =>
            (Min == null || value >= Min) && (Max == null || value <= Max);

        public override string ToString() =>
            (Min, Max) switch
            {
                (not null, not null) => $"{Min}-{Max}",
                (not null, null)     => $"≥{Min}",
                (null, not null)     => $"≤{Max}",
                _                    => "",
            };
    }

    private record DiffGuideline(Range? Od, Range? Hp);

    private static readonly Dictionary<string, DiffGuideline> TaikoGuidelines = new()
    {
        ["Kantan"]    = new(new(null, 3),  new(8, null)),
        ["Futsuu"]    = new(new(null, 4),  new(7, null)),
        ["Muzukashii"]= new(new(null, 5),  new(6, null)),
        ["Oni"]       = new(new(5, null),  new(5, null)),
        ["Inner Oni"] = new(new(6, null),  new(5, null)),
        ["Ura Oni"]   = new(new(6, null),  new(5, null)),
    };

    public override CheckMetadata GetMetadata() => new()
    {
        CheckId = "settings.difficulty_settings",
        Category = "Settings",
        Message = "Difficulty settings outside guidelines.",
    };

    public override Dictionary<string, IssueTemplate> GetTemplates() => new()
    {
        ["Check"] = new IssueTemplate(Issue.Level.Check,
            "{0}: {1} {2} is outside guideline ({3}).", "", "", "0", ""),
    };

    public override IEnumerable<Issue> GetIssues(Beatmap beatmap)
    {
        var category = TaikoUtils.ClassifyDifficulty(beatmap.Metadata.Version);
        if (category == "Custom") yield break;
        if (!TaikoGuidelines.TryGetValue(category, out var guide)) yield break;

        if (guide.Od is { } od && !od.Contains(beatmap.Difficulty.OverallDifficulty))
            yield return new Issue(GetTemplate("Check"), beatmap,
                category, "OD", beatmap.Difficulty.OverallDifficulty, od);

        if (guide.Hp is { } hp && !hp.Contains(beatmap.Difficulty.HpDrainRate))
            yield return new Issue(GetTemplate("Check"), beatmap,
                category, "HP", beatmap.Difficulty.HpDrainRate, hp);
    }
}
