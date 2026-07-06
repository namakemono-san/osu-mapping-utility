using MappingUtility.Parser.Primitives;

namespace MappingUtility.Parser.HitObjects;

public sealed class HoldNote : HitObject
{
    public int EndTime { get; set; }
    public int Column { get; init; }

    public override string Serialize() => $"{Header},{EndTime}:{HitSample.Serialize()}";

    internal static HoldNote ParseHoldNote(int x, int y, int time, HitObjectType type, HitSound hitSound, string[] p, float circleSize)
    {
        var column  = (int)Math.Floor(x * circleSize / 512.0);
        var endTime = time;
        HitSample sample = HitSample.Default;

        if (p.Length > 5)
        {
            var extra = p[5].Split(':');
            if (extra.Length > 0 && int.TryParse(extra[0], out var et))
                endTime = et;
            if (extra.Length > 1)
                sample = HitSample.Parse(string.Join(":", extra[1..]));
        }

        return new HoldNote
        {
            X        = x,
            Y        = y,
            Time     = time,
            Type     = type,
            HitSound = hitSound,
            HitSample = sample,
            EndTime  = endTime,
            Column   = column,
        };
    }
}
