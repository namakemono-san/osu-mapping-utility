using MappingUtility.Parser.Primitives;

namespace MappingUtility.Parser.HitObjects;

public abstract class HitObject
{
    public int X { get; set; }
    public int Y { get; set; }
    public int Time { get; set; }
    public HitObjectType Type { get; set; }
    public HitSound HitSound { get; set; }
    public HitSample HitSample { get; set; }
    public bool IsNewCombo => (Type & HitObjectType.NewCombo) != 0;
    public int ComboSkip => (((int)Type >> 4) & 0b111);

    public string RawLine { get; internal set; } = "";

    public bool IsDirty { get; internal set; }

    protected string Header => $"{X},{Y},{Time},{(int)Type},{(int)HitSound}";
    public abstract string Serialize();

    internal static HitObject Parse(string line, float circleSize)
    {
        var p    = line.Split(',');
        if (p.Length < 5) throw new FormatException($"Invalid hit object: {line}");

        var x        = int.Parse(p[0]);
        var y        = int.Parse(p[1]);
        var time     = int.Parse(p[2]);
        var type     = (HitObjectType)int.Parse(p[3]);
        var hitSound = (HitSound)int.Parse(p[4]);

        HitObject obj;

        if ((type & HitObjectType.HitCircle) != 0)
        {
            var sample = p.Length > 5 ? HitSample.Parse(p[5]) : HitSample.Default;
            obj = new HitCircle { X = x, Y = y, Time = time, Type = type, HitSound = hitSound, HitSample = sample };
        }
        else if ((type & HitObjectType.Slider) != 0)
        {
            obj = Slider.ParseSlider(x, y, time, type, hitSound, p);
        }
        else if ((type & HitObjectType.Spinner) != 0)
        {
            var endTime = p.Length > 5 && int.TryParse(p[5], out var et) ? et : time;
            var sample  = p.Length > 6 ? HitSample.Parse(p[6]) : HitSample.Default;
            obj = new Spinner { X = x, Y = y, Time = time, Type = type, HitSound = hitSound, HitSample = sample, EndTime = endTime };
        }
        else if ((type & HitObjectType.HoldNote) != 0)
        {
            obj = HoldNote.ParseHoldNote(x, y, time, type, hitSound, p, circleSize);
        }
        else
        {
            throw new FormatException($"Unknown hit object type: {type}");
        }

        obj.RawLine = line;
        return obj;
    }
}
