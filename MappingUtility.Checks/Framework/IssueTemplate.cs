namespace MappingUtility.Checks.Framework;

public class IssueTemplate
{
    private readonly string _format;
    private readonly object[] _defaultArguments;

    public Issue.Level Level { get; }
    public string? Cause { get; private set; }

    public IssueTemplate(Issue.Level level, string format, params object[] defaultArguments)
    {
        Level = level;
        _format = format;
        _defaultArguments = defaultArguments;
    }

    public IssueTemplate WithCause(string cause)
    {
        Cause = cause;
        return this;
    }

    public string Format(object?[] arguments)
    {
        if (arguments.Length != _defaultArguments.Length)
            throw new ArgumentException(
                $"Template \"{_format}\" expects {_defaultArguments.Length} argument(s), got {arguments.Length}.");

        return string.Format(_format, arguments.Select(a => (object?)a?.ToString()?.Trim()).ToArray());
    }

    public override string ToString() => Format(_defaultArguments.Cast<object?>().ToArray());
}
