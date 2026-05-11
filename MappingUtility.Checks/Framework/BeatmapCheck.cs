using MappingUtility.Parser.Objects;

namespace MappingUtility.Checks.Framework;

public abstract class BeatmapCheck : Check
{
    public abstract IEnumerable<Issue> GetIssues(Beatmap beatmap);
}
