using MappingUtility.Checks.Framework;
using MappingUtility.Parser.Objects;

namespace MappingUtility.Checks.Checks.Metadata;

[Check]
public class CheckRomanisedAscii : GeneralCheck
{
    private static bool IsAsciiOnly(string s) => s.All(c => c >= 0x20 && c <= 0x7E);

    public override CheckMetadata GetMetadata() => new()
    {
        CheckId = "metadata.romanised_ascii",
        Category = "Metadata",
        Message = "Non-ASCII characters in romanised fields.",
    };

    public override Dictionary<string, IssueTemplate> GetTemplates() => new()
    {
        ["Problem"] = new IssueTemplate(Issue.Level.Problem,
            "Non-ASCII characters found in romanised fields: {0}.", ""),
    };

    public override IEnumerable<Issue> GetIssues(IReadOnlyList<Beatmap> beatmaps)
    {
        if (beatmaps.Count == 0) yield break;
        var meta = beatmaps[0].Metadata;

        var bad = new List<string>();
        if (!IsAsciiOnly(meta.Title)) bad.Add("Title");
        if (!IsAsciiOnly(meta.Artist)) bad.Add("Artist");

        if (bad.Count > 0)
            yield return new Issue(GetTemplate("Problem"), null, string.Join(", ", bad));
    }
}
