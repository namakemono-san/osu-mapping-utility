using MappingUtility.Checks.Framework;
using MappingUtility.Parser.Objects;
using System.Text.RegularExpressions;

namespace MappingUtility.Checks.Checks.Metadata;

[Check]
public class CheckLanguageTag : GeneralCheck
{
    private static readonly string[] LanguageTags =
    [
        "english", "japanese", "chinese", "korean", "french", "german",
        "italian", "spanish", "portuguese", "russian", "polish",
        "indonesian", "swedish", "instrumental", "other",
    ];

    public override CheckMetadata GetMetadata() => new()
    {
        CheckId = "metadata.language_tag",
        Category = "Metadata",
        Message = "Tags are missing a language tag.",
    };

    public override Dictionary<string, IssueTemplate> GetTemplates() => new()
    {
        ["Problem"] = new IssueTemplate(Issue.Level.Problem,
            "Tags are missing a language tag (e.g. english, japanese, instrumental, etc.)."),
    };

    public override IEnumerable<Issue> GetIssues(IReadOnlyList<Beatmap> beatmaps)
    {
        if (beatmaps.Count == 0) yield break;
        var tags = beatmaps[0].Metadata.Tags.ToLowerInvariant();

        var hasLanguage = LanguageTags.Any(lang =>
            Regex.IsMatch(tags, $@"(?:^|\s){Regex.Escape(lang)}(?:\s|$)"));

        if (!hasLanguage)
            yield return new Issue(GetTemplate("Problem"), null);
    }
}
