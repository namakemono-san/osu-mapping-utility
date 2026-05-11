using MappingUtility.Checks.Framework;
using MappingUtility.Parser.Objects;
using System.Text.RegularExpressions;

namespace MappingUtility.Checks.Checks.Metadata;

[Check]
public class CheckTitleMarker : GeneralCheck
{
    public override CheckMetadata GetMetadata() => new()
    {
        CheckId = "metadata.title_marker",
        Category = "Metadata",
        Message = "Title field marker formatting issue.",
    };

    public override Dictionary<string, IssueTemplate> GetTemplates() => new()
    {
        ["Warning"] = new IssueTemplate(Issue.Level.Warning,
            "Title marker formatting issue: {0}.", ""),
    };

    private static List<string> CheckMarkerFormat(string field)
    {
        var issues = new List<string>();
        if (Regex.IsMatch(field, @"\bfeat\s+", RegexOptions.IgnoreCase) &&
            !Regex.IsMatch(field, @"\bfeat\.\s", RegexOptions.IgnoreCase))
            issues.Add("use \"feat.\" (with period)");
        if (Regex.IsMatch(field, @"\bCV[^:\s]", RegexOptions.IgnoreCase) ||
            Regex.IsMatch(field, @"\bCV\s", RegexOptions.IgnoreCase))
            issues.Add("use \"CV:\" (with colon, no space before)");
        if (Regex.IsMatch(field, @"\bVO[^:\s]", RegexOptions.IgnoreCase) ||
            Regex.IsMatch(field, @"\bVO\s", RegexOptions.IgnoreCase))
            issues.Add("use \"VO:\" (with colon, no space before)");
        if (Regex.IsMatch(field, @"\bvs\s+", RegexOptions.IgnoreCase) &&
            !Regex.IsMatch(field, @"\bvs\.\s", RegexOptions.IgnoreCase))
            issues.Add("use \"vs.\" (with period)");
        if (field.Contains("  ")) issues.Add("consecutive spaces");
        if (field.Contains('　')) issues.Add("full-width space");
        return issues;
    }

    public override IEnumerable<Issue> GetIssues(IReadOnlyList<Beatmap> beatmaps)
    {
        if (beatmaps.Count == 0) yield break;
        var meta = beatmaps[0].Metadata;

        var issues = CheckMarkerFormat(meta.Title)
            .Concat(CheckMarkerFormat(meta.TitleUnicode))
            .Distinct()
            .ToList();

        if (issues.Count > 0)
            yield return new Issue(GetTemplate("Warning"), null, string.Join(", ", issues));
    }
}
