using MappingUtility.Parser.Objects;
using MappingUtility.Parser.Objects.HitObjects;
using MappingUtility.Parser.Objects.TimingLines;

namespace MappingUtility.Parser.Checks;

public static class UnsnapChecker
{
    private static readonly int[] Divisors = [5, 7, 9, 12, 16];

    private static UninheritedLine? GetUninheritedLine(double time, Beatmap beatmap)
    {
        UninheritedLine? result = null;
        foreach (var line in beatmap.TimingLines)
            if (line is UninheritedLine ul && ul.Offset <= time)
                result = ul;
        return result;
    }

    private static double GetOffsetIntoBeat(double time, UninheritedLine line)
    {
        var msOffset = time - line.Offset;
        var division = msOffset / line.MsPerBeat;
        var fraction = division - Math.Floor(division);
        return fraction * line.MsPerBeat;
    }

    private static double GetTheoreticalUnsnap(double time, int divisor, UninheritedLine line)
    {
        var beatOffset = GetOffsetIntoBeat(time, line);
        var currentFraction = beatOffset / line.MsPerBeat;
        var desiredFraction = Math.Round(currentFraction * divisor) / divisor;
        var differenceFraction = currentFraction - desiredFraction;
        return differenceFraction * line.MsPerBeat;
    }

    private static double GetPracticalUnsnap(double time, int divisor, UninheritedLine line)
        => time - (int)(time - GetTheoreticalUnsnap(time, divisor, line));

    public static double GetPracticalUnsnap(double time, Beatmap beatmap)
    {
        var line = GetUninheritedLine(time, beatmap);
        if (line == null) return 0;

        var practicalUnsnaps = Divisors.Select(d => GetPracticalUnsnap(time, d, line)).ToArray();
        var minAbs = practicalUnsnaps.Min(Math.Abs);
        return practicalUnsnaps.First(u => Math.Abs(u) == minAbs);
    }

    public static int GetCorrectedTime(double time, Beatmap beatmap)
    {
        var line = GetUninheritedLine(time, beatmap);
        if (line == null) return (int)time;

        var bestDivisor = Divisors.OrderBy(d => Math.Abs(GetPracticalUnsnap(time, d, line))).First();
        return (int)(time - GetTheoreticalUnsnap(time, bestDivisor, line));
    }

    private static IEnumerable<(double Time, string PartName)> GetEdges(HitObject ho)
    {
        var headName = ho switch
        {
            Slider  => "Slider head",
            Spinner => "Spinner head",
            HoldNote => "Hold note head",
            _ => "Circle",
        };
        yield return (ho.Time, headName);

        if (ho is Slider slider)
        {
            var durationPerSlide = (double)(ho.EndTime - ho.Time) / slider.Slides;
            for (var i = 1; i <= slider.Slides; i++)
            {
                var edgeTime = ho.Time + durationPerSlide * i;
                var partName = i == slider.Slides ? "Slider tail" : "Slider reverse";
                yield return (edgeTime, partName);
            }
        }

        if (ho is Spinner)
            yield return (ho.EndTime, "Spinner tail");

        if (ho is HoldNote)
            yield return (ho.EndTime, "Hold note tail");
    }

    public static IEnumerable<UnsnapResult> Check(Beatmap beatmap)
    {
        foreach (var ho in beatmap.HitObjects)
        {
            foreach (var (edgeTime, partName) in GetEdges(ho))
            {
                if (partName.Contains("Spinner"))
                    continue;

                var unsnap = GetPracticalUnsnap(edgeTime, beatmap);

                if (Math.Abs(unsnap) >= 2)
                {
                    yield return new UnsnapResult(edgeTime, partName, unsnap, UnsnapLevel.Problem);
                }
                else if (Math.Abs(unsnap) >= 1)
                {
                    var level = partName == "Slider tail" && unsnap < -1
                        ? UnsnapLevel.AiModFalsePositive
                        : UnsnapLevel.Minor;
                    yield return new UnsnapResult(edgeTime, partName, unsnap, level);
                }
            }
        }
    }
}
