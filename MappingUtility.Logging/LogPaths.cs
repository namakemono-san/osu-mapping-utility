namespace MappingUtility.Logging;

public static class LogPaths
{
    public static string Directory { get; } = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "osu-mapping-utility", "logs");

    public static string FileFor(string component) =>
        Path.Combine(Directory, $"{component}-{DateTime.Now:yyyy-MM-dd}.log");
}
