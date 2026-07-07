using System.Collections.Concurrent;
using System.Text;

namespace MappingUtility.Logging;

public static class LogPaths
{
    public static string Directory { get; } = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "osu-mapping-utility", "logs");

    public static string FileFor(string component) =>
        Path.Combine(Directory, $"{component}-{DateTime.Now:yyyy-MM-dd}.log");

    private static readonly ConcurrentDictionary<string, object> Locks = new();

    public static void AppendLine(string component, string line)
    {
        var path = FileFor(component);
        var gate = Locks.GetOrAdd(path, _ => new object());
        lock (gate)
        {
            System.IO.Directory.CreateDirectory(Directory);
            File.AppendAllText(path, line + Environment.NewLine, new UTF8Encoding(false));
        }
    }
}
