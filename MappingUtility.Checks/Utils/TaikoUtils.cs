using System.Text.RegularExpressions;

namespace MappingUtility.Checks.Utils;

public static class TaikoUtils
{
    public static readonly string[] DifficultyOrder =
        ["Kantan", "Futsuu", "Muzukashii", "Oni", "Inner Oni", "Ura Oni"];

    private static readonly (string Name, Regex Pattern)[] Patterns =
    [
        ("Ura Oni",      new Regex(@"ura.*oni|hell.*oni",              RegexOptions.IgnoreCase)),
        ("Inner Oni",    new Regex(@"inner.*oni",                      RegexOptions.IgnoreCase)),
        ("Oni",          new Regex(@"^(?!.*(inner|ura|hell)).*oni",    RegexOptions.IgnoreCase)),
        ("Muzukashii",   new Regex(@"muzukashii",                      RegexOptions.IgnoreCase)),
        ("Futsuu",       new Regex(@"futsuu",                          RegexOptions.IgnoreCase)),
        ("Kantan",       new Regex(@"kantan",                          RegexOptions.IgnoreCase)),
    ];

    public static string ClassifyDifficulty(string version)
    {
        foreach (var (name, pattern) in Patterns)
            if (pattern.IsMatch(version)) return name;
        return "Custom";
    }

    public static int DifficultyIndex(string version)
    {
        var category = ClassifyDifficulty(version);
        var idx = Array.IndexOf(DifficultyOrder, category);
        return idx == -1 ? DifficultyOrder.Length : idx;
    }
}
