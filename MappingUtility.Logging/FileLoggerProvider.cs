using System.Text;
using Microsoft.Extensions.Logging;

namespace MappingUtility.Logging;

public sealed class FileLoggerProvider(string component) : ILoggerProvider
{
    private readonly object _lock = new();

    public ILogger CreateLogger(string categoryName) => new FileLogger(this, categoryName);

    internal void Write(string line)
    {
        lock (_lock)
        {
            System.IO.Directory.CreateDirectory(LogPaths.Directory);
            File.AppendAllText(LogPaths.FileFor(component), line + Environment.NewLine, new UTF8Encoding(false));
        }
    }

    public void Dispose()
    {
    }
}

internal sealed class FileLogger(FileLoggerProvider provider, string categoryName) : ILogger
{
    public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

    public bool IsEnabled(LogLevel logLevel) => logLevel != LogLevel.None;

    public void Log<TState>(
        LogLevel logLevel, EventId eventId, TState state, Exception? exception,
        Func<TState, Exception?, string> formatter)
    {
        if (!IsEnabled(logLevel)) return;

        var message = formatter(state, exception);
        var line = $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff}] [{logLevel}] [{categoryName}] {message}";
        if (exception is not null) line += Environment.NewLine + exception;
        provider.Write(line);
    }
}
