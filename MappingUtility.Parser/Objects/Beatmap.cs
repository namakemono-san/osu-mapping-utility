using MappingUtility.Parser.Objects.Events;
using MappingUtility.Parser.Objects.HitObjects;
using MappingUtility.Parser.Objects.TimingLines;
using MappingUtility.Parser.Settings;

namespace MappingUtility.Parser.Objects;

public class Beatmap
{
    public string FileName { get; set; } = "";
    public int FormatVersion { get; set; } = 14;
    public GeneralSettings General { get; set; } = new();
    public MetadataSettings Metadata { get; set; } = new();
    public DifficultySettings Difficulty { get; set; } = new();
    public Background? Background { get; set; }
    public Video? Video { get; set; }
    public List<Break> Breaks { get; set; } = [];
    public List<TimingLine> TimingLines { get; set; } = [];
    public List<HitObject> HitObjects { get; set; } = [];
    public double Bpm { get; set; }
    public long TotalLengthMs { get; set; }
    public long DrainTimeMs { get; set; }
}
