using System.Text.Json;

namespace MappingUtility.Server.Utilities;

internal static class Json
{
    public static readonly JsonSerializerOptions CamelCase = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public static string Serialize<T>(T value) => JsonSerializer.Serialize(value, CamelCase);
}
