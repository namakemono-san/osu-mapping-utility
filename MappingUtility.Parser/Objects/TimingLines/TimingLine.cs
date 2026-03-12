using System.Text.Json.Serialization;

namespace MappingUtility.Parser.Objects.TimingLines;

[JsonPolymorphic]
[JsonDerivedType(typeof(UninheritedLine))]
[JsonDerivedType(typeof(InheritedLine))]
public abstract class TimingLine
{
    public double Offset { get; set; }
    public double BeatLength { get; set; }
    public int Meter { get; set; } = 4;
    public int SampleSet { get; set; }
    public int SampleIndex { get; set; }
    public int Volume { get; set; } = 100;
    public bool Uninherited { get; set; }
    public bool Kiai { get; set; }
    public bool OmitsBarLine { get; set; }
    public float SvMult { get; set; } = 1f;
}
