using MappingUtility.Parser.Objects;

namespace MappingUtility.Checks.Framework;

public class Issue
{
    public enum Level { Info, Check, Minor, Warning, Problem }

    public readonly Beatmap? Beatmap;
    public readonly Level IssueLevel;
    public readonly string Message;

    public Issue(IssueTemplate template, Beatmap? beatmap, params object?[] templateArguments)
    {
        IssueLevel = template.Level;
        Message = template.Format(templateArguments);
        Beatmap = beatmap;
    }
}
