using Microsoft.Extensions.Logging;

namespace MappingUtility.Logging;

public sealed class FileLoggerProvider(string component) : ILoggerProvider
{
    public ILogger CreateLogger(string categoryName) => new FileLogger(component, categoryName);

    public void Dispose()
    {
    }
}

internal sealed class FileLogger(string component, string categoryName) : ILogger
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
        LogPaths.AppendLine(component, line);
    }
}
