using MappingUtility.Parser.Statics;
using Xunit;

namespace MappingUtility.Parser.Tests.Statics;

public class ParserStaticTests
{
    [Fact]
    public void ParseSection_ReturnsLinesInSection()
    {
        var lines = new[]
        {
            "[General]",
            "AudioFilename: audio.mp3",
            "Mode: 0",
            "[Metadata]",
            "Title:Test",
        };
        var result = ParserStatic.ParseSection(lines, "General").ToList();
        Assert.Equal(2, result.Count);
        Assert.Equal("AudioFilename: audio.mp3", result[0]);
        Assert.Equal("Mode: 0", result[1]);
    }

    [Fact]
    public void ParseSection_StopsAtNextSection()
    {
        var lines = new[]
        {
            "[General]",
            "Line1",
            "[Metadata]",
            "Line2",
        };
        var result = ParserStatic.ParseSection(lines, "General").ToList();
        Assert.Single(result);
        Assert.Equal("Line1", result[0]);
    }

    [Fact]
    public void ParseSection_EmptySection_ReturnsEmpty()
    {
        var lines = new[]
        {
            "[General]",
            "[Metadata]",
            "Title:Test",
        };
        var result = ParserStatic.ParseSection(lines, "General").ToList();
        Assert.Empty(result);
    }

    [Fact]
    public void ParseSection_SkipsBlankLines()
    {
        var lines = new[]
        {
            "[General]",
            "Line1",
            "   ",
            "Line2",
        };
        var result = ParserStatic.ParseSection(lines, "General").ToList();
        Assert.Equal(2, result.Count);
    }

    [Fact]
    public void ParseSection_StripsCr()
    {
        var lines = new[] { "[General]", "Line1\r" };
        var result = ParserStatic.ParseSection(lines, "General").ToList();
        Assert.Equal("Line1", result[0]);
    }

    [Fact]
    public void ParseKeyValue_ColonWithSpace()
    {
        var kv = ParserStatic.ParseKeyValue("AudioFilename: audio.mp3");
        Assert.NotNull(kv);
        Assert.Equal("AudioFilename", kv!.Value.key);
        Assert.Equal("audio.mp3", kv!.Value.value);
    }

    [Fact]
    public void ParseKeyValue_ColonNoSpace()
    {
        var kv = ParserStatic.ParseKeyValue("Title:My Title");
        Assert.NotNull(kv);
        Assert.Equal("Title", kv!.Value.key);
        Assert.Equal("My Title", kv!.Value.value);
    }

    [Fact]
    public void ParseKeyValue_NoColon_ReturnsNull()
    {
        var kv = ParserStatic.ParseKeyValue("no colon here");
        Assert.Null(kv);
    }

    [Fact]
    public void ParseKeyValue_EmptyKey_ReturnsNull()
    {
        var kv = ParserStatic.ParseKeyValue(":value");
        Assert.Null(kv);
    }

    [Fact]
    public void ParseKeyValue_ValueWithColon()
    {
        var kv = ParserStatic.ParseKeyValue("Tags:a:b:c");
        Assert.NotNull(kv);
        Assert.Equal("Tags", kv!.Value.key);
        Assert.Equal("a:b:c", kv!.Value.value);
    }

    [Fact]
    public void GetSettings_PassesLinesToFunc()
    {
        var lines = new[]
        {
            "[Difficulty]",
            "HPDrainRate:5",
            "CircleSize:4",
            "[General]",
        };
        var result = ParserStatic.GetSettings(lines, "Difficulty", sectionLines =>
        {
            Assert.Equal(2, sectionLines.Length);
            return sectionLines.Length;
        });
        Assert.Equal(2, result);
    }
}
