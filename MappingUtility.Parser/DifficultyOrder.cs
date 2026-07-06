using MappingUtility.Parser.Primitives;
using System.Text.RegularExpressions;

namespace MappingUtility.Parser;

public enum DifficultyLevel { Easy, Normal, Hard, Insane, Expert, Ultra, Unknown }

public static class DifficultyOrder
{
    private static readonly Dictionary<GameMode, List<(string[] Words, DifficultyLevel Level)>> Index;

    static DifficultyOrder()
    {
        var pairs = new Dictionary<GameMode, Dictionary<DifficultyLevel, string[]>>
        {
            [GameMode.Osu] = new()
            {
                [DifficultyLevel.Easy]   = ["Beginner", "Easy", "Novice"],
                [DifficultyLevel.Normal] = ["Basic", "Normal", "Medium", "Intermediate"],
                [DifficultyLevel.Hard]   = ["Advanced", "Hard"],
                [DifficultyLevel.Insane] = ["Hyper", "Insane"],
                [DifficultyLevel.Expert] = ["Expert", "Extra", "Extreme"],
            },
            [GameMode.Taiko] = new()
            {
                [DifficultyLevel.Easy]   = ["Kantan"],
                [DifficultyLevel.Normal] = ["Futsuu"],
                [DifficultyLevel.Hard]   = ["Muzukashii"],
                [DifficultyLevel.Insane] = ["Oni"],
                [DifficultyLevel.Expert] = ["Inner Oni", "Ura Oni"],
                [DifficultyLevel.Ultra]  = ["Hell Oni"],
            },
            [GameMode.Catch] = new()
            {
                [DifficultyLevel.Easy]   = ["Cup"],
                [DifficultyLevel.Normal] = ["Salad"],
                [DifficultyLevel.Hard]   = ["Platter"],
                [DifficultyLevel.Insane] = ["Rain"],
                [DifficultyLevel.Expert] = ["Overdose", "Deluge"],
            },
            [GameMode.Mania] = new()
            {
                [DifficultyLevel.Easy]   = ["EZ", "Beginner", "Beginning", "Basic", "Easy"],
                [DifficultyLevel.Normal] = ["NM", "Normal", "Novice"],
                [DifficultyLevel.Hard]   = ["HD", "Hard", "Advanced", "Hyper"],
                [DifficultyLevel.Insane] = ["MX", "SC", "Another", "Exhaust", "Insane", "Lunatic"],
                [DifficultyLevel.Expert] =
                [
                    "SHD", "EX", "Black Another", "Infinite", "Gravity",
                    "Heavenly", "Maximum", "Extra", "White Another", "Vivid", "Exceed",
                ],
            },
        };

        Index = [];
        foreach (var (mode, modePairs) in pairs)
        {
            var entries = new List<(string[] Words, DifficultyLevel Level)>();
            foreach (var (level, names) in modePairs)
                foreach (var name in names)
                {
                    var words = Clean(name).Split(' ', StringSplitOptions.RemoveEmptyEntries);
                    if (words.Length > 0)
                        entries.Add((words, level));
                }
            Index[mode] = entries.OrderByDescending(e => e.Words.Length).ToList();
        }
    }

    public static DifficultyLevel GetLevel(GameMode mode, string version)
    {
        var words = Clean(version).Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (!Index.TryGetValue(mode, out var entries)) return DifficultyLevel.Unknown;

        foreach (var (keywordWords, level) in entries)
            if (ContainsSubsequence(words, keywordWords))
                return level;

        return DifficultyLevel.Unknown;
    }

    private static bool ContainsSubsequence(string[] haystack, string[] needle)
    {
        if (needle.Length == 0 || needle.Length > haystack.Length) return false;
        for (var i = 0; i <= haystack.Length - needle.Length; i++)
        {
            var matched = true;
            for (var j = 0; j < needle.Length; j++)
            {
                if (haystack[i + j] != needle[j]) { matched = false; break; }
            }
            if (matched) return true;
        }
        return false;
    }

    private static readonly Regex OwnerPrefix  = new(@"^\s*.+?['’]s\s+", RegexOptions.Compiled);
    private static readonly Regex KeyCountPrefix = new(@"^\s*\d+\s*k\s+", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex Collab       = new(@"\bcollab\b", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex SpecialChars = new(@"[^a-z0-9\s]", RegexOptions.Compiled);
    private static readonly Regex Whitespace   = new(@"\s+", RegexOptions.Compiled);

    private static string Clean(string input)
    {
        input = input.ToLowerInvariant();
        input = OwnerPrefix.Replace(input, "");
        input = KeyCountPrefix.Replace(input, "");
        input = Collab.Replace(input, "");
        input = SpecialChars.Replace(input, " ");
        input = Whitespace.Replace(input, " ").Trim();
        return input;
    }
}
