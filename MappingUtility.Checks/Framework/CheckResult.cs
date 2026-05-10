namespace MappingUtility.Checks.Framework;

public record IssueResult(
    string Level,
    string FormattedMessage,
    string? BeatmapVersion
);

public record CheckResult(
    string CheckId,
    string Category,
    string Message,
    string Scope,
    string? BeatmapVersion,
    bool Passed,
    IReadOnlyList<IssueResult> Issues
);

public record RcCheckResponse(IReadOnlyList<CheckResult> Checks);
