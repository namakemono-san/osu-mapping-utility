namespace MappingUtility.Parser.HitObjects;

public sealed class HitCircle : HitObject
{
    public override string Serialize() => $"{Header},{HitSample.Serialize()}";
}
