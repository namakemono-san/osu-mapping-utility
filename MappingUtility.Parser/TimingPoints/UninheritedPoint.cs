namespace MappingUtility.Parser.TimingPoints;

public sealed class UninheritedPoint : TimingPoint
{
    public double BeatLength { get; init; }
    public int Meter { get; init; } = 4;
    public double Bpm => BeatLength > 0 ? 60_000.0 / BeatLength : 0;
}
