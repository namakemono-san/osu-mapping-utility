namespace MappingUtility.Server.Utilities;

internal static class PathGuard
{
    public static string? ResolveWithinRoot(string rootDir, string? relativePath)
    {
        if (string.IsNullOrWhiteSpace(relativePath)) return null;
        if (Path.IsPathRooted(relativePath)) return null;

        string rootFull, full;
        try
        {
            rootFull = Path.GetFullPath(rootDir);
            full = Path.GetFullPath(Path.Combine(rootFull, relativePath));
        }
        catch
        {
            return null;
        }

        var rootWithSep = rootFull.EndsWith(Path.DirectorySeparatorChar)
            ? rootFull
            : rootFull + Path.DirectorySeparatorChar;

        return full.StartsWith(rootWithSep, StringComparison.OrdinalIgnoreCase)
            ? full
            : null;
    }
}
