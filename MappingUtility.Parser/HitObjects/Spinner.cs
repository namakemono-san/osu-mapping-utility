namespace MappingUtility.Parser.HitObjects;

public sealed class Spinner : HitObject
{
    public int EndTime { get; set; }

    public override string Serialize() => $"{Header},{EndTime},{HitSample.Serialize()}";
}
