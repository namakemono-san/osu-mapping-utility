using MappingUtility.Checks.Framework;
using MappingUtility.Parser.Objects;

namespace MappingUtility.Checks.Checks.Metadata;

[Check]
public class CheckMetadataConsistency : BeatmapSetCheck
{
    public override CheckMetadata GetMetadata() => new()
    {
        CheckId = "metadata.consistency",
        Category = "Metadata",
        Message = "Metadata is inconsistent across difficulties.",
    };

    public override Dictionary<string, IssueTemplate> GetTemplates() => new()
    {
        ["Problem"] = new IssueTemplate(Issue.Level.Problem,
            "Metadata mismatch across difficulties: {0}.", ""),
    };

    public override IEnumerable<Issue> GetIssues(IReadOnlyList<Beatmap> beatmaps)
    {
        if (beatmaps.Count <= 1) yield break;

        var ref_ = beatmaps[0].Metadata;
        var mismatched = new List<string>();

        string?[] GetFields(Beatmap b) =>
        [
            b.Metadata.Title, b.Metadata.TitleUnicode,
            b.Metadata.Artist, b.Metadata.ArtistUnicode,
            b.Metadata.Creator, b.Metadata.Source, b.Metadata.Tags
        ];

        var fieldNames = new[] { "Title", "TitleUnicode", "Artist", "ArtistUnicode", "Creator", "Source", "Tags" };
        var refFields = GetFields(beatmaps[0]);

        for (var i = 0; i < fieldNames.Length; i++)
        {
            if (beatmaps.Skip(1).Any(b => GetFields(b)[i] != refFields[i]))
                mismatched.Add(fieldNames[i]);
        }

        if (mismatched.Count > 0)
            yield return new Issue(GetTemplate("Problem"), null, string.Join(", ", mismatched));
    }
}
