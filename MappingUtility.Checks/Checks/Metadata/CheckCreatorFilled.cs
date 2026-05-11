using MappingUtility.Checks.Framework;
using MappingUtility.Parser.Objects;

namespace MappingUtility.Checks.Checks.Metadata;

[Check]
public class CheckCreatorFilled : GeneralCheck
{
    public override CheckMetadata GetMetadata() => new()
    {
        CheckId = "metadata.creator_filled",
        Category = "Metadata",
        Message = "Creator field is empty.",
    };

    public override Dictionary<string, IssueTemplate> GetTemplates() => new()
    {
        ["Problem"] = new IssueTemplate(Issue.Level.Problem,
            "Creator field is empty."),
    };

    public override IEnumerable<Issue> GetIssues(IReadOnlyList<Beatmap> beatmaps)
    {
        if (beatmaps.Count == 0) yield break;
        if (string.IsNullOrWhiteSpace(beatmaps[0].Metadata.Creator))
            yield return new Issue(GetTemplate("Problem"), null);
    }
}
