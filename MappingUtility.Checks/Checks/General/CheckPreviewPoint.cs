using MappingUtility.Checks.Framework;
using MappingUtility.Parser.Objects;

namespace MappingUtility.Checks.Checks.General;

[Check]
public class CheckPreviewPoint : BeatmapCheck
{
    public override CheckMetadata GetMetadata() => new()
    {
        CheckId = "general.preview_point",
        Category = "General",
        Message = "No preview point set.",
    };

    public override Dictionary<string, IssueTemplate> GetTemplates() => new()
    {
        ["Problem"] = new IssueTemplate(Issue.Level.Problem,
            "Preview point is not set (PreviewTime must be > 0)."),
    };

    public override IEnumerable<Issue> GetIssues(Beatmap beatmap)
    {
        if (beatmap.General.PreviewTime <= 0)
            yield return new Issue(GetTemplate("Problem"), beatmap);
    }
}
