using System.Reflection;
using MappingUtility.Parser.Objects;

namespace MappingUtility.Checks.Framework;

public static class Checker
{
    private static readonly List<Check> _checks = [];
    private static bool _loaded;

    public static void LoadChecks()
    {
        if (_loaded) return;
        _loaded = true;

        foreach (var type in typeof(Checker).Assembly.GetExportedTypes())
        {
            if (type.GetCustomAttribute<CheckAttribute>() == null) continue;
            if (type.IsAbstract) continue;
            if (Activator.CreateInstance(type) is Check check)
                _checks.Add(check);
        }
    }

    public static RcCheckResponse GetCheckResults(IReadOnlyList<Beatmap> beatmaps)
    {
        LoadChecks();

        var results = new List<CheckResult>();

        foreach (var check in _checks.OfType<GeneralCheck>())
        {
            var issues = check.GetIssues(beatmaps).ToList();
            results.Add(BuildCheckResult(check, "general", null, issues));
        }

        foreach (var check in _checks.OfType<BeatmapSetCheck>())
        {
            var issues = check.GetIssues(beatmaps).ToList();
            results.Add(BuildCheckResult(check, "set", null, issues));
        }

        foreach (var beatmap in beatmaps)
        {
            foreach (var check in _checks.OfType<BeatmapCheck>())
            {
                var issues = check.GetIssues(beatmap).ToList();
                results.Add(BuildCheckResult(check, "beatmap", beatmap.Metadata.Version, issues));
            }
        }

        return new RcCheckResponse(results);
    }

    private static CheckResult BuildCheckResult(Check check, string scope, string? beatmapVersion, List<Issue> issues)
    {
        var metadata = check.GetMetadata();
        var passed = !issues.Any(i => i.IssueLevel >= Issue.Level.Check);

        var issueResults = issues
            .Select(i => new IssueResult(
                i.IssueLevel.ToString(),
                i.Message,
                i.Beatmap?.Metadata.Version))
            .ToList();

        return new CheckResult(
            metadata.CheckId,
            metadata.Category,
            metadata.Message,
            scope,
            beatmapVersion,
            passed,
            issueResults);
    }
}
