namespace MappingUtility.Parser.Statics;

public static class ParserStatic
{
    public static IEnumerable<string> ParseSection(string[] lines, string section)
    {
        var read = false;

        foreach (var line in lines)
        {
            if (line.StartsWith('['))
                read = false;

            if (read && line.Trim().Length != 0)
                yield return line.Replace("\r", "");

            if (line.Contains('[' + section + ']'))
                read = true;
        }
    }

    public static (string key, string value)? ParseKeyValue(string line)
    {
        var idx = line.IndexOf(':');
        if (idx < 0)
            return null;

        var key = line[..idx].Trim();
        var value = line[(idx + 1)..].Trim();

        if (key.Length == 0)
            return null;

        return (key, value);
    }

    public static T GetSettings<T>(string[] lines, string section, Func<string[], T> func)
    {
        var parsedLines = ParseSection(lines, section);
        return func(parsedLines.ToArray());
    }
}
