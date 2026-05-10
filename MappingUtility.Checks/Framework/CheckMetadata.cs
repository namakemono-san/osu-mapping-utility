namespace MappingUtility.Checks.Framework;

public class CheckMetadata
{
    public string CheckId { get; set; } = "";
    public string Category { get; set; } = "Other";
    public string Message { get; set; } = "";
    public Dictionary<string, string> Documentation { get; set; } = new();
}
