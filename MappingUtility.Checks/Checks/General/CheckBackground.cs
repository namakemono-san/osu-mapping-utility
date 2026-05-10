using MappingUtility.Checks.Framework;
using MappingUtility.Parser.Objects;

namespace MappingUtility.Checks.Checks.General;

[Check]
public class CheckBackground : GeneralCheck
{
    public override CheckMetadata GetMetadata() => new()
    {
        CheckId = "general.background",
        Category = "General",
        Message = "No background image specified.",
    };

    public override Dictionary<string, IssueTemplate> GetTemplates() => new()
    {
        ["Problem"] = new IssueTemplate(Issue.Level.Problem,
            "No background image is specified for any difficulty."),
    };

    public override IEnumerable<Issue> GetIssues(IReadOnlyList<Beatmap> beatmaps)
    {
        if (!beatmaps.Any(b => b.Background != null))
            yield return new Issue(GetTemplate("Problem"), null);
    }
}
