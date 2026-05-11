using MappingUtility.Checks.Framework;
using MappingUtility.Parser.Objects;
using System.Text.RegularExpressions;

namespace MappingUtility.Checks.Checks.Metadata;

[Check]
public class CheckGenreTag : GeneralCheck
{
    private static readonly string[] GenreTags =
    [
        "video game", "anime", "rock", "pop", "novelty", "hip hop",
        "electronic", "metal", "classical", "folk", "jazz",
    ];

    public override CheckMetadata GetMetadata() => new()
    {
        CheckId = "metadata.genre_tag",
        Category = "Metadata",
        Message = "Tags are missing a genre tag.",
    };

    public override Dictionary<string, IssueTemplate> GetTemplates() => new()
    {
        ["Problem"] = new IssueTemplate(Issue.Level.Problem,
            "Tags are missing a genre tag (e.g. rock, pop, electronic, anime, etc.)."),
    };

    public override IEnumerable<Issue> GetIssues(IReadOnlyList<Beatmap> beatmaps)
    {
        if (beatmaps.Count == 0) yield break;
        var tags = beatmaps[0].Metadata.Tags.ToLowerInvariant();

        var hasGenre = GenreTags.Any(genre =>
            Regex.IsMatch(tags, $@"(?:^|\s){Regex.Escape(genre)}(?:\s|$)"));

        if (!hasGenre)
            yield return new Issue(GetTemplate("Problem"), null);
    }
}
