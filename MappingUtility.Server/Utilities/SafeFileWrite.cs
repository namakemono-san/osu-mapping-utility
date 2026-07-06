using System.Text;

namespace MappingUtility.Server.Utilities;

internal static class SafeFileWrite
{
    public static async Task WriteAllTextAtomicAsync(string path, string content, Encoding encoding)
    {
        var tempPath = TempPathFor(path);
        await File.WriteAllTextAsync(tempPath, content, encoding);
        Commit(tempPath, path);
    }

    public static void WriteAllTextAtomic(string path, string content, Encoding encoding)
    {
        var tempPath = TempPathFor(path);
        File.WriteAllText(tempPath, content, encoding);
        Commit(tempPath, path);
    }

    private static string TempPathFor(string path)
    {
        var dir = Path.GetDirectoryName(path);
        return Path.Combine(string.IsNullOrEmpty(dir) ? "." : dir, $".{Path.GetFileName(path)}.{Guid.NewGuid():N}.tmp");
    }

    private static void Commit(string tempPath, string path)
    {
        try
        {
            if (File.Exists(path))
                File.Replace(tempPath, path, null);
            else
                File.Move(tempPath, path);
        }
        catch
        {
            try { File.Delete(tempPath); } catch { }
            throw;
        }
    }
}
