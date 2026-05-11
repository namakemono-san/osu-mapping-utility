using MappingUtility.Parser.Objects;

namespace MappingUtility.Checks.Framework;

public abstract class GeneralCheck : Check
{
    public abstract IEnumerable<Issue> GetIssues(IReadOnlyList<Beatmap> beatmaps);
}
