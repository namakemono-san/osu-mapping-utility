using System.Diagnostics;

namespace MappingUtility.Logging;

public sealed class FileTraceListener(string component) : TraceListener
{
    public override void Write(string? message) => WriteLine(message ?? "");

    public override void WriteLine(string? message)
    {
        if (message is null) return;
        var line = $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff}] [Trace] {message}";
        LogPaths.AppendLine(component, line);
    }
}
