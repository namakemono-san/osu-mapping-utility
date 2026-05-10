using MappingUtility.Checks.Framework;
using MappingUtility.Parser.Objects;

namespace MappingUtility.Checks.Checks.Metadata;

[Check]
public class CheckMetadataSymbols : GeneralCheck
{
    private static readonly Dictionary<char, string[]> SymbolRules = new()
    {
        ['★'] = ["*"], ['☆'] = ["*"], ['⚝'] = ["*"], ['✪'] = ["*"], ['✻'] = ["*"],
        ['♥'] = ["<3"], ['♡'] = ["<3"],
        ['「'] = ["\""], ['」'] = ["\""], ['『'] = ["\""], ['』'] = ["\""],
        ['…'] = ["..."], ['。'] = ["."],
        ['→'] = ["->", "-->"], ['←'] = ["<-", "<--"],
        ['《'] = ["<", "<<", "\""], ['》'] = [">", ">>", "\""],
        ['【'] = ["\"", "(", "["], ['】'] = ["\"", ")", "]"],
        ['≠'] = ["=/=", "!="],
        ['・'] = [".", ","],
        ['×'] = ["x"],
        ['～'] = ["~"], ['〜'] = ["~"],
        ['−'] = ["-"], ['–'] = ["-"], ['—'] = ["-"], ['―'] = ["-"],
        ['／'] = ["/"], ['＆'] = ["&"], ['＋'] = ["+"], ['＝'] = ["="],
        ['！'] = ["!"], ['？'] = ["?"], ['：'] = [":"], ['；'] = [";"],
        ['（'] = ["("], ['）'] = [")"],
        ['［'] = ["["], ['］'] = ["]"],
        ['｛'] = ["{"], ['｝'] = ["}"],
        ['＜'] = ["<"], ['＞'] = [">"],
        ['“'] = ["\""], ['”'] = ["\""],
        ['※'] = ["*"],
    };

    public override CheckMetadata GetMetadata() => new()
    {
        CheckId = "metadata.symbols",
        Category = "Metadata",
        Message = "Special symbol not properly romanised.",
    };

    public override Dictionary<string, IssueTemplate> GetTemplates() => new()
    {
        ["Warning"] = new IssueTemplate(Issue.Level.Warning,
            "{0}: '{1}' should be romanised as '{2}'.", "", "", ""),
    };

    public override IEnumerable<Issue> GetIssues(IReadOnlyList<Beatmap> beatmaps)
    {
        if (beatmaps.Count == 0) yield break;
        var meta = beatmaps[0].Metadata;

        foreach (var issue in CheckField(meta.TitleUnicode, meta.Title, "Title"))
            yield return new Issue(GetTemplate("Warning"), null, issue.field, issue.symbol, issue.expected);

        foreach (var issue in CheckField(meta.ArtistUnicode, meta.Artist, "Artist"))
            yield return new Issue(GetTemplate("Warning"), null, issue.field, issue.symbol, issue.expected);
    }

    private static IEnumerable<(string field, string symbol, string expected)> CheckField(
        string? unicode, string? romanised, string fieldName)
    {
        if (string.IsNullOrEmpty(unicode)) yield break;

        var symbolsInUnicode = unicode
            .Where(c => SymbolRules.ContainsKey(c))
            .GroupBy(c => c)
            .ToList();

        if (symbolsInUnicode.Count == 0) yield break;

        var romanisedText = romanised ?? "";

        foreach (var group in symbolsInUnicode)
        {
            var ch = group.Key;
            var replacements = SymbolRules[ch];
            var expectedCount = group.Count();

            var found = replacements.Sum(r =>
                CountOccurrences(romanisedText, r));

            if (found < expectedCount)
                yield return (fieldName, ch.ToString(), replacements[0]);
        }
    }

    private static int CountOccurrences(string text, string pattern)
    {
        var count = 0;
        var index = 0;
        while ((index = text.IndexOf(pattern, index, StringComparison.Ordinal)) >= 0)
        {
            count++;
            index += pattern.Length;
        }
        return count;
    }
}
