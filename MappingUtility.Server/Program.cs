using MappingUtility.Logging;
using MappingUtility.Parser;
using MappingUtility.Server.Hubs;
using Microsoft.AspNetCore.SignalR;
using System.Diagnostics;
using System.Text;

Console.OutputEncoding = Encoding.UTF8;
Console.InputEncoding = Encoding.UTF8;

Trace.Listeners.Add(new FileTraceListener("server"));
WatchParentProcess(args);

var builder = WebApplication.CreateBuilder(args);
builder.Logging.AddProvider(new FileLoggerProvider("server"));

builder.Services.AddSignalR(options =>
{
    options.ClientTimeoutInterval = TimeSpan.FromHours(1);
    options.KeepAliveInterval = TimeSpan.FromSeconds(15);
    options.MaximumParallelInvocationsPerClient = 4;
});
builder.Services.AddCors(options =>
    options.AddDefaultPolicy(policy =>
        policy.SetIsOriginAllowed(IsAllowedOrigin)
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials()));

var app = builder.Build();
BeatmapsetHub.Initialize(app.Services.GetRequiredService<IHubContext<BeatmapsetHub>>());
app.UseCors();
app.MapGet("/health", () => Results.Ok());
StarRatingCalculator.Warmup();
app.MapHub<BeatmapsetHub>("/beatmapset");
app.MapHub<DownloaderHub>("/downloader");
app.MapHub<AudioHub>("/audio");
app.Run("http://localhost:7002");

static bool IsAllowedOrigin(string origin)
{
    if (string.IsNullOrEmpty(origin) || origin == "null") return true;
    return Uri.TryCreate(origin, UriKind.Absolute, out var uri) && uri.IsLoopback;
}

static void WatchParentProcess(string[] args)
{
    var idx = Array.IndexOf(args, "--parent-pid");
    if (idx < 0 || idx + 1 >= args.Length) return;
    if (!int.TryParse(args[idx + 1], out var pid)) return;

    _ = Task.Run(async () =>
    {
        try { await Process.GetProcessById(pid).WaitForExitAsync(); }
        catch { }
        Environment.Exit(0);
    });
}
