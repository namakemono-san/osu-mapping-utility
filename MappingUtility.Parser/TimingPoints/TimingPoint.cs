using System.Globalization;
using MappingUtility.Parser.Primitives;

namespace MappingUtility.Parser.TimingPoints;

public abstract class TimingPoint
{
    public double Time { get; init; }
    public SampleSet SampleSet { get; init; }
    public int SampleIndex { get; init; }
    public int Volume { get; init; }
    public bool Kiai { get; init; }

    internal static TimingPoint Parse(string line)
    {
        var p = line.Split(',');
        if (p.Length < 2) throw new FormatException($"Invalid timing point: {line}");

        var time       = double.Parse(p[0], NumberStyles.Float, CultureInfo.InvariantCulture);
        var beatLength = double.Parse(p[1], NumberStyles.Float, CultureInfo.InvariantCulture);
        var meter      = p.Length > 2 && int.TryParse(p[2], out var m) ? m : 4;
        var sampleSet  = p.Length > 3 && int.TryParse(p[3], out var ss) ? (SampleSet)ss : SampleSet.Default;
        var sampleIdx  = p.Length > 4 && int.TryParse(p[4], out var si) ? si : 0;
        var volume     = p.Length > 5 && int.TryParse(p[5], out var v)  ? v  : 100;
        var uninherited = p.Length > 6 && p[6].Trim() == "1";
        var effects    = p.Length > 7 && int.TryParse(p[7], out var e)  ? e  : 0;
        var kiai       = (effects & 1) != 0;

        if (uninherited)
        {
            return new UninheritedPoint
            {
                Time         = time,
                BeatLength   = beatLength,
                Meter        = meter,
                SampleSet    = sampleSet,
                SampleIndex  = sampleIdx,
                Volume       = volume,
                Kiai         = kiai,
            };
        }
        else
        {
            var sliderVelocity = beatLength < 0 ? -100.0 / beatLength : 1.0;
            return new InheritedPoint
            {
                Time            = time,
                SliderVelocity  = sliderVelocity,
                SampleSet       = sampleSet,
                SampleIndex     = sampleIdx,
                Volume          = volume,
                Kiai            = kiai,
            };
        }
    }
}
