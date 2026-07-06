namespace MappingUtility.Parser.Events;

public sealed class Video
{
    public int StartTime { get; init; }
    public string Filename { get; init; } = "";
    public int OffsetX { get; init; }
    public int OffsetY { get; init; }
}
