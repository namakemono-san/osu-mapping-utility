using Microsoft.AspNetCore.SignalR;
using MappingUtility.Parser;
using System.Text.Json;

namespace MappingUtility.Server.Hubs;

public class BeatmapHub : Hub
{
    public async Task RequestParse(string filePath)
    {
        try
        {
            var content = await File.ReadAllTextAsync(filePath);
            var fileName = Path.GetFileName(filePath);
            var beatmap = OsuParser.Parse(content, fileName);
            var json = JsonSerializer.Serialize(beatmap, new JsonSerializerOptions
            {
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase
            });
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
            var results = new List<object>();
            foreach (var fileName in fileNames)
            {
                var filePath = Path.Combine(folderPath, fileName);
                var content = await File.ReadAllTextAsync(filePath);
                var beatmap = OsuParser.Parse(content, fileName);
                results.Add(beatmap);
            }
            var json = JsonSerializer.Serialize(results, new JsonSerializerOptions
            {
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase
            });
            await Clients.Caller.SendAsync("UpdateBeatmapset", json);
        }
        catch (Exception ex)
        {
            await Clients.Caller.SendAsync("ParseError", ex.Message);
        }
    }
}