using System.Diagnostics;
using System.Text;

namespace MappingUtility.Logging;

public sealed class FileTraceListener(string component) : TraceListener
{
    private readonly object _lock = new();

    public override void Write(string? message) => WriteLine(message ?? "");

    public override void WriteLine(string? message)
    {
        if (message is null) return;
        lock (_lock)
        {
            Directory.CreateDirectory(LogPaths.Directory);
            var line = $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff}] [Trace] {message}";
            File.AppendAllText(LogPaths.FileFor(component), line + Environment.NewLine, new UTF8Encoding(false));
        }
    }
}
