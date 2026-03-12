using System.Text.Json.Serialization;

namespace MappingUtility.Parser.Objects.HitObjects;

[Flags]
public enum HitObjectType
{
    Circle = 1,
    Slider = 2,
    NewCombo = 4,
    Spinner = 8,
    ManiaHoldNote = 128,
}

[Flags]
public enum HitSound
{
    None = 0,
    Normal = 1,
    Whistle = 2,
    Finish = 4,
    Clap = 8,
}

[JsonPolymorphic]
[JsonDerivedType(typeof(Circle))]
[JsonDerivedType(typeof(Slider))]
[JsonDerivedType(typeof(Spinner))]
[JsonDerivedType(typeof(HoldNote))]
public abstract class HitObject
{
    public int Time { get; set; }
    public HitObjectType TypeFlags { get; set; }
    public HitSound HitSoundFlags { get; set; }
    public int EndTime { get; set; }
    public bool IsNewCombo => TypeFlags.HasFlag(HitObjectType.NewCombo);
}
