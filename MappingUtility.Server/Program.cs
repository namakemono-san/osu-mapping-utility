using MappingUtility.Server.Hubs;
using System.Diagnostics;

WatchParentProcess(args);

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSignalR();
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.SetIsOriginAllowed(_ => true)
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

var app = builder.Build();
app.UseCors();
app.MapHub<BeatmapHub>("/beatmap");
app.Run("http://localhost:7001");

static void WatchParentProcess(string[] args)
{
    var idx = Array.IndexOf(args, "--parent-pid");
    if (idx < 0 || idx + 1 >= args.Length) return;
    if (!int.TryParse(args[idx + 1], out var pid)) return;

    _ = Task.Run(async () =>
    {
        try
        {
            var parent = Process.GetProcessById(pid);
            await parent.WaitForExitAsync();
        }
        catch { }
        Environment.Exit(0);
    });
}