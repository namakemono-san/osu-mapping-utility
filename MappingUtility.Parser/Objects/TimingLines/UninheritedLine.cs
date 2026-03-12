namespace MappingUtility.Parser.Objects.TimingLines;

public class UninheritedLine : TimingLine
{
    public double MsPerBeat => BeatLength;
    public double Bpm => 60000.0 / BeatLength;
}
