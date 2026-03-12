namespace MappingUtility.Parser.Objects.Events;

public class Break
{
    public int StartTime { get; set; }
    public int EndTime { get; set; }
    public int Duration => EndTime - StartTime;
}
