using MappingUtility.Parser.Objects.TimingLines;

namespace MappingUtility.Checks.Utils;

public static class RcUtils
{
    public static readonly int[] DefaultDivisions = [1, 2, 3, 4, 6, 8, 12, 16];

    public static string FormatMs(double ms)
    {
        var totalSeconds = (int)(ms / 1000);
        var mins = totalSeconds / 60;
        var secs = totalSeconds % 60;
        var millis = (int)(ms % 1000);
        return $"{mins:D2}:{secs:D2}:{millis:D3}";
    }

    public static string FormatTimestampList(IEnumerable<string> timestamps, int max = 5)
    {
        var list = timestamps.ToList();
        if (list.Count <= max) return string.Join(", ", list);
        return string.Join(", ", list.Take(max)) + $" (+{list.Count - max})";
    }

    public static UninheritedLine? GetUninheritedLineAt(double time, IReadOnlyList<TimingLine> timingLines)
    {
        UninheritedLine? result = null;
        foreach (var line in timingLines)
        {
            if (line.Offset > time) break;
            if (line is UninheritedLine ul) result = ul;
        }
        return result;
    }

    public static double NearestSnapError(double offset, IReadOnlyList<TimingLine> timingLines, int[]? divisions = null)
    {
        var divs = divisions ?? DefaultDivisions;
        var uninherited = GetUninheritedLineAt(offset, timingLines);
        if (uninherited == null) return 0;

        var pos = offset - uninherited.Offset;
        var minError = double.MaxValue;

        foreach (var d in divs)
        {
            var snapLen = uninherited.MsPerBeat / d;
            if (snapLen < 0.5) continue;
            var nearest = Math.Round(pos / snapLen) * snapLen;
            var err = Math.Abs(pos - nearest);
            if (err < minError) minError = err;
        }

        return minError;
    }

    public static int NearestSnapDiff(double time, IReadOnlyList<TimingLine> timingLines, int[]? divisions = null)
    {
        var divs = divisions ?? DefaultDivisions;
        var uninherited = GetUninheritedLineAt(time, timingLines);
        if (uninherited == null) return 0;

        var bestAbsDiff = int.MaxValue;
        var bestDiff = 0;

        foreach (var d in divs)
        {
            var snapLen = uninherited.MsPerBeat / d;
            if (snapLen < 0.5) continue;
            var pos = time - uninherited.Offset;
            var snapIndex = Math.Round(pos / snapLen);
            var nearestSnap = uninherited.Offset + (snapIndex * snapLen);
            var snapped = (int)nearestSnap;
            var diff = snapped - (int)time;
            if (Math.Abs(diff) < bestAbsDiff)
            {
                bestAbsDiff = Math.Abs(diff);
                bestDiff = diff;
            }
        }

        return bestDiff;
    }

    public static bool IsOnGrid(double offset, IReadOnlyList<TimingLine> timingLines, int division, double tolerance = 2)
    {
        var uninherited = GetUninheritedLineAt(offset, timingLines);
        if (uninherited == null) return false;

        var pos = offset - uninherited.Offset;
        var snapLen = uninherited.MsPerBeat / division;
        if (snapLen < 0.5) return false;
        var nearest = Math.Round(pos / snapLen) * snapLen;
        return Math.Abs(pos - nearest) <= tolerance;
    }

    public static string FormatDuration(double seconds)
    {
        var m = (int)(seconds / 60);
        var s = (int)Math.Round(seconds % 60);
        return $"{m}:{s:D2}";
    }
}
