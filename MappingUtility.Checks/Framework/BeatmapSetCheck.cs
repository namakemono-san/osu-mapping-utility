using MappingUtility.Parser.Objects;

namespace MappingUtility.Checks.Framework;

public abstract class BeatmapSetCheck : Check
{
    public abstract IEnumerable<Issue> GetIssues(IReadOnlyList<Beatmap> beatmaps);
}
