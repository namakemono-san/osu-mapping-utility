using Microsoft.AspNetCore.SignalR;
using MappingUtility.Parser;
using MappingUtility.Parser.Objects.Events;
using MappingUtility.Parser.Settings;
using System.Text.Json;

namespace MappingUtility.Server.Hubs;

public class BeatmapHub : Hub
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public async Task RequestParse(string filePath)
    {
        try
        {
            var content = await File.ReadAllTextAsync(filePath);
            var fileName = Path.GetFileName(filePath);
            var beatmap = OsuParser.Parse(content, fileName);
            var json = JsonSerializer.Serialize(beatmap, JsonOptions);
            await Clients.Caller.SendAsync("UpdateBeatmap", json);
        }
        catch (Exception ex)
        {
            await Clients.Caller.SendAsync("ParseError", ex.Message);
        }
    }

    public async Task RequestParseBatch(string folderPath, string[] fileNames)
    {
        try
        {
            var files = fileNames.Length > 0
                ? fileNames
                : Directory.GetFiles(folderPath, "*.osu")
                           .Select(Path.GetFileName)
                           .Where(f => f != null)
                           .Cast<string>()
                           .ToArray();

            var results = new List<object>();
            foreach (var fileName in files)
            {
                var filePath = Path.Combine(folderPath, fileName);
                var content = await File.ReadAllTextAsync(filePath);
                var beatmap = OsuParser.Parse(content, fileName);
                results.Add(beatmap);
            }
            var json = JsonSerializer.Serialize(results, JsonOptions);
            await Clients.Caller.SendAsync("UpdateBeatmapset", json);
        }
        catch (Exception ex)
        {
            await Clients.Caller.SendAsync("ParseError", ex.Message);
        }
    }

    public async Task RequestFixUnsnaps(string filePath)
    {
        try
        {
            var content = await File.ReadAllTextAsync(filePath);
            var fileName = Path.GetFileName(filePath);
            var beatmap = OsuParser.Parse(content, fileName);
            var (newContent, fixedCount) = OsuSerializer.FixUnsnaps(content, beatmap);
            await File.WriteAllTextAsync(filePath, newContent);
            await Clients.Caller.SendAsync("FixUnsnapsComplete", fixedCount);
        }
        catch (Exception ex)
        {
            await Clients.Caller.SendAsync("ParseError", ex.Message);
        }
    }

    public async Task RequestApplyMetadata(string filePath, MetadataSettings metadata, Background? background)
    {
        try
        {
            var content = await File.ReadAllTextAsync(filePath);
            var newContent = OsuSerializer.ApplyMetadata(content, metadata, background);
            await File.WriteAllTextAsync(filePath, newContent);
            await Clients.Caller.SendAsync("ApplyMetadataComplete", filePath);
        }
        catch (Exception ex)
        {
            await Clients.Caller.SendAsync("ParseError", ex.Message);
        }
    }
}
