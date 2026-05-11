using MappingUtility.Checks.Framework;
using MappingUtility.Parser.Objects;
using System.Text.RegularExpressions;

namespace MappingUtility.Checks.Checks.Metadata;

[Check]
public class CheckGdTag : GeneralCheck
{
    public override CheckMetadata GetMetadata() => new()
    {
        CheckId = "metadata.gd_tag",
        Category = "Metadata",
        Message = "Guest difficulty mapper names missing from tags.",
    };

    public override Dictionary<string, IssueTemplate> GetTemplates() => new()
    {
        ["Problem"] = new IssueTemplate(Issue.Level.Problem,
            "Guest difficulty mapper names missing from tags: {0}.", ""),
    };

    public override IEnumerable<Issue> GetIssues(IReadOnlyList<Beatmap> beatmaps)
    {
        if (beatmaps.Count == 0) yield break;

        var creator = beatmaps[0].Metadata.Creator.ToLowerInvariant();
        var tags = beatmaps[0].Metadata.Tags.ToLowerInvariant();

        var gdMappers = new HashSet<string>();
        foreach (var b in beatmaps)
        {
            var match = Regex.Match(b.Metadata.Version, @"^(.+)'s\s+", RegexOptions.IgnoreCase);
            if (!match.Success) continue;
            foreach (var name in match.Groups[1].Value.Split('&'))
            {
                var trimmed = name.Trim().ToLowerInvariant();
                if (!string.IsNullOrEmpty(trimmed) && trimmed != creator)
                    gdMappers.Add(trimmed);
            }
        }

        if (gdMappers.Count == 0) yield break;

        var missing = gdMappers.Where(m => !tags.Contains(m)).ToList();
        if (missing.Count > 0)
            yield return new Issue(GetTemplate("Problem"), null, string.Join(", ", missing));
    }
}
