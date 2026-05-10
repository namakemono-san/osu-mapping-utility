using MappingUtility.Checks.Framework;
using MappingUtility.Parser.Objects;

namespace MappingUtility.Checks.Checks.Metadata;

[Check]
public class CheckUnicodeFilled : GeneralCheck
{
    public override CheckMetadata GetMetadata() => new()
    {
        CheckId = "metadata.unicode_filled",
        Category = "Metadata",
        Message = "Unicode metadata fields are empty.",
    };

    public override Dictionary<string, IssueTemplate> GetTemplates() => new()
    {
        ["Check"] = new IssueTemplate(Issue.Level.Check,
            "TitleUnicode or ArtistUnicode is empty."),
    };

    public override IEnumerable<Issue> GetIssues(IReadOnlyList<Beatmap> beatmaps)
    {
        if (beatmaps.Count == 0) yield break;
        var meta = beatmaps[0].Metadata;

        if (string.IsNullOrEmpty(meta.TitleUnicode) || string.IsNullOrEmpty(meta.ArtistUnicode))
            yield return new Issue(GetTemplate("Check"), null);
    }
}
