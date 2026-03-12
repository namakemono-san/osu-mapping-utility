using MappingUtility.Parser.Objects;
using MappingUtility.Parser.Objects.HitObjects;
using MappingUtility.Parser.Objects.TimingLines;

namespace MappingUtility.Parser.Extensions;

public static class BeatmapExtensions
{
    private static int BinaryTimeSearch<T>(IReadOnlyList<T> list, Func<T, double> getTime, double time)
    {
        if (list.Count == 0) return -1;

        var lo = 0;
        var hi = list.Count - 1;

        if (getTime(list[0]) > time) return -1;

        while (lo < hi)
        {
            var mid = lo + (hi - lo + 1) / 2;
            if (getTime(list[mid]) <= time)
                lo = mid;
            else
                hi = mid - 1;
        }

        return lo;
    }

    public static TimingLine? GetTimingLine(this Beatmap beatmap, double time)
    {
        var idx = BinaryTimeSearch(beatmap.TimingLines, t => t.Offset, time);
        return idx >= 0 ? beatmap.TimingLines[idx] : null;
    }

    public static UninheritedLine? GetUninheritedLine(this Beatmap beatmap, double time)
    {
        UninheritedLine? result = null;
        foreach (var tl in beatmap.TimingLines)
        {
            if (tl.Offset > time) break;
            if (tl is UninheritedLine ul) result = ul;
        }
        return result;
    }

    public static TimingLine? GetNextTimingLine(this Beatmap beatmap, double time)
    {
        var idx = BinaryTimeSearch(beatmap.TimingLines, t => t.Offset, time);
        var next = idx + 1;
        return next < beatmap.TimingLines.Count ? beatmap.TimingLines[next] : null;
    }

    public static HitObject? GetHitObject(this Beatmap beatmap, double time)
    {
        var idx = BinaryTimeSearch(beatmap.HitObjects, h => h.Time, time);
        return idx >= 0 ? beatmap.HitObjects[idx] : null;
    }

    public static HitObject? GetNextHitObject(this Beatmap beatmap, double time)
    {
        var idx = BinaryTimeSearch(beatmap.HitObjects, h => h.Time, time);
        var next = idx + 1;
        return next < beatmap.HitObjects.Count ? beatmap.HitObjects[next] : null;
    }

    public static double GetBpm(this Beatmap beatmap, double time)
    {
        var ul = beatmap.GetUninheritedLine(time);
        return ul?.Bpm ?? beatmap.Bpm;
    }

    public static double GetSvMultiplier(this Beatmap beatmap, double time)
    {
        var tl = beatmap.GetTimingLine(time);
        return tl?.SvMult ?? 1.0;
    }

    public static long GetDrainTime(this Beatmap beatmap) => beatmap.DrainTimeMs;
}
