namespace MappingUtility.Parser.Internal;

internal static class KvExtensions
{
    internal static int TryGetInt(this Dictionary<string, string> kv, string key, int fallback = 0)
        => kv.TryGetValue(key, out var v) && int.TryParse(v, out var r) ? r : fallback;

    internal static float TryGetFloat(this Dictionary<string, string> kv, string key, float fallback = 0f)
        => kv.TryGetValue(key, out var v) && float.TryParse(v, System.Globalization.NumberStyles.Float,
               System.Globalization.CultureInfo.InvariantCulture, out var r) ? r : fallback;

    internal static bool TryGetBool(this Dictionary<string, string> kv, string key, bool fallback = false)
        => kv.TryGetValue(key, out var v) && int.TryParse(v, out var r) ? r != 0 : fallback;
}
