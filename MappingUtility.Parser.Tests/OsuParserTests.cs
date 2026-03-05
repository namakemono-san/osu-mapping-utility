using MappingUtility.Parser;
using MappingUtility.Parser.Objects.HitObjects;
using MappingUtility.Parser.Objects.TimingLines;
using Xunit;

namespace MappingUtility.Parser.Tests;

public class OsuParserTests
{
    private static string BuildOsu(
        string timingPoints = "0,500,4,2,0,100,1,0",
        string hitObjects = "",
        string events = "0,0,\"bg.jpg\",0,0",
        string extraDifficulty = "") => string.Join("\n",
        "osu file format v14",
        "[General]",
        "AudioFilename: audio.mp3",
        "AudioLeadIn: 0",
        "PreviewTime: -1",
        "Mode: 0",
        "StackLeniency: 0.7",
        "[Metadata]",
        "Title:Test Title",
        "TitleUnicode:テスト",
        "Artist:Test Artist",
        "ArtistUnicode:テストアーティスト",
        "Creator:Mapper",
        "Version:Normal",
        "Source:",
        "Tags:",
        "BeatmapID:12345",
        "BeatmapSetID:6789",
        "[Difficulty]",
        "HPDrainRate:5",
        "CircleSize:4",
        "OverallDifficulty:6",
        "ApproachRate:8",
        "SliderMultiplier:1.4",
        "SliderTickRate:1",
        extraDifficulty,
        "[Events]",
        events,
        "[TimingPoints]",
        timingPoints,
        "[HitObjects]",
        hitObjects);

    [Fact]
    public void Parse_FormatVersion()
    {
        var beatmap = OsuParser.Parse(BuildOsu(), "test.osu");
        Assert.Equal(14, beatmap.FormatVersion);
    }

    [Fact]
    public void Parse_FileName()
    {
        var beatmap = OsuParser.Parse(BuildOsu(), "my_map.osu");
        Assert.Equal("my_map.osu", beatmap.FileName);
    }

    [Fact]
    public void Parse_GeneralSettings()
    {
        var beatmap = OsuParser.Parse(BuildOsu(), "test.osu");
        Assert.Equal("audio.mp3", beatmap.General.AudioFilename);
        Assert.Equal(0, beatmap.General.AudioLeadIn);
        Assert.Equal(-1, beatmap.General.PreviewTime);
        Assert.Equal(0, beatmap.General.Mode);
        Assert.Equal(0.7f, beatmap.General.StackLeniency);
    }

    [Fact]
    public void Parse_MetadataSettings()
    {
        var beatmap = OsuParser.Parse(BuildOsu(), "test.osu");
        Assert.Equal("Test Title", beatmap.Metadata.Title);
        Assert.Equal("テスト", beatmap.Metadata.TitleUnicode);
        Assert.Equal("Test Artist", beatmap.Metadata.Artist);
        Assert.Equal("テストアーティスト", beatmap.Metadata.ArtistUnicode);
        Assert.Equal("Mapper", beatmap.Metadata.Creator);
        Assert.Equal("Normal", beatmap.Metadata.Version);
        Assert.Equal(12345L, beatmap.Metadata.BeatmapId);
        Assert.Equal(6789L, beatmap.Metadata.BeatmapSetId);
    }

    [Fact]
    public void Parse_DifficultySettings()
    {
        var beatmap = OsuParser.Parse(BuildOsu(), "test.osu");
        Assert.Equal(5.0, beatmap.Difficulty.HpDrainRate);
        Assert.Equal(4.0, beatmap.Difficulty.CircleSize);
        Assert.Equal(6.0, beatmap.Difficulty.OverallDifficulty);
        Assert.Equal(8.0, beatmap.Difficulty.ApproachRate);
        Assert.Equal(1.4, beatmap.Difficulty.SliderMultiplier);
        Assert.Equal(1.0, beatmap.Difficulty.SliderTickRate);
    }

    [Fact]
    public void Parse_ApproachRate_FallsBackToOverallDifficulty()
    {
        var raw = string.Join("\n",
            "osu file format v14",
            "[Difficulty]",
            "OverallDifficulty:7",
            "SliderMultiplier:1.4",
            "SliderTickRate:1",
            "[TimingPoints]",
            "[HitObjects]");
        var beatmap = OsuParser.Parse(raw, "test.osu");
        Assert.Equal(7.0, beatmap.Difficulty.ApproachRate);
    }

    [Fact]
    public void Parse_Background()
    {
        var beatmap = OsuParser.Parse(BuildOsu(), "test.osu");
        Assert.NotNull(beatmap.Background);
        Assert.Equal("bg.jpg", beatmap.Background!.Filename);
    }

    [Fact]
    public void Parse_BomStripped()
    {
        var content = "\uFEFF" + BuildOsu();
        var beatmap = OsuParser.Parse(content, "test.osu");
        Assert.Equal(14, beatmap.FormatVersion);
        Assert.Equal("Test Title", beatmap.Metadata.Title);
    }

    [Fact]
    public void Parse_BreakEvent()
    {
        var beatmap = OsuParser.Parse(BuildOsu(events: "2,1000,3000"), "test.osu");
        Assert.Single(beatmap.Breaks);
        Assert.Equal(1000, beatmap.Breaks[0].StartTime);
        Assert.Equal(3000, beatmap.Breaks[0].EndTime);
        Assert.Equal(2000, beatmap.Breaks[0].Duration);
    }

    [Fact]
    public void Parse_UninheritedTimingPoint()
    {
        var beatmap = OsuParser.Parse(BuildOsu(), "test.osu");
        Assert.Single(beatmap.TimingLines);
        var line = Assert.IsType<UninheritedLine>(beatmap.TimingLines[0]);
        Assert.Equal(0.0, line.Offset);
        Assert.Equal(500.0, line.BeatLength);
        Assert.Equal(1f, line.SvMult);
        Assert.True(line.Uninherited);
    }

    [Fact]
    public void Parse_InheritedTimingPoint_SvMult()
    {
        var tp = "0,500,4,2,0,100,1,0\n1000,-200,4,2,0,100,0,0";
        var beatmap = OsuParser.Parse(BuildOsu(timingPoints: tp), "test.osu");
        Assert.Equal(2, beatmap.TimingLines.Count);
        var inherited = Assert.IsType<InheritedLine>(beatmap.TimingLines[1]);
        Assert.Equal(0.5f, inherited.SvMult);
        Assert.False(inherited.Uninherited);
    }

    [Fact]
    public void Parse_InheritedTimingPoint_SvMult_Clamped()
    {
        // beatLength = -0.5 → -100/-0.5 = 200 → clamp to 10
        var tp = "0,500,4,2,0,100,1,0\n1000,-0.5,4,2,0,100,0,0";
        var beatmap = OsuParser.Parse(BuildOsu(timingPoints: tp), "test.osu");
        var inherited = Assert.IsType<InheritedLine>(beatmap.TimingLines[1]);
        Assert.Equal(10f, inherited.SvMult);
    }

    [Fact]
    public void Parse_KiaiFlag()
    {
        // effects = 1 → kiai
        var tp = "0,500,4,2,0,100,1,1";
        var beatmap = OsuParser.Parse(BuildOsu(timingPoints: tp), "test.osu");
        Assert.True(beatmap.TimingLines[0].Kiai);
    }

    [Fact]
    public void Parse_Bpm_500msPerBeat()
    {
        var beatmap = OsuParser.Parse(BuildOsu(timingPoints: "0,500,4,2,0,100,1,0"), "test.osu");
        Assert.Equal(120.0, beatmap.Bpm);
    }

    [Fact]
    public void Parse_Bpm_RoundedToTwoDecimals()
    {
        // 60000 / 333 ≈ 180.18
        var beatmap = OsuParser.Parse(BuildOsu(timingPoints: "0,333,4,2,0,100,1,0"), "test.osu");
        Assert.Equal(Math.Round(60000.0 / 333.0, 2), beatmap.Bpm);
    }

    [Fact]
    public void Parse_Circle()
    {
        var beatmap = OsuParser.Parse(BuildOsu(hitObjects: "256,192,1000,1,0,0:0:0:0:"), "test.osu");
        Assert.Single(beatmap.HitObjects);
        var circle = Assert.IsType<Circle>(beatmap.HitObjects[0]);
        Assert.Equal(1000, circle.Time);
        Assert.Equal(1000, circle.EndTime);
        Assert.False(circle.IsNewCombo);
    }

    [Fact]
    public void Parse_Circle_NewCombo()
    {
        // typeFlags = 5 = Circle(1) | NewCombo(4)
        var beatmap = OsuParser.Parse(BuildOsu(hitObjects: "256,192,1000,5,0,0:0:0:0:"), "test.osu");
        var circle = Assert.IsType<Circle>(beatmap.HitObjects[0]);
        Assert.True(circle.IsNewCombo);
    }

    [Fact]
    public void Parse_Slider_EndTime()
    {
        // duration = (100 / (1.4 * 100 * 1.0)) * 500 * 1 ≈ 357.14 → round = 357
        var expectedDuration = (int)Math.Round((100.0 / (1.4 * 100.0 * 1.0)) * 500.0 * 1);
        var beatmap = OsuParser.Parse(BuildOsu(hitObjects: "256,192,1000,2,0,L|356:192,1,100"), "test.osu");
        var slider = Assert.IsType<Slider>(beatmap.HitObjects[0]);
        Assert.Equal(1000 + expectedDuration, slider.EndTime);
        Assert.Equal("L", slider.SliderType);
        Assert.Equal(1, slider.Slides);
        Assert.Equal(100.0, slider.Length);
    }

    [Fact]
    public void Parse_Slider_WithSv_EndTime()
    {
        // inherited SV = 0.5 (beatLength = -200), BPM line first
        var tp = "0,500,4,2,0,100,1,0\n0,-200,4,2,0,100,0,0";
        // duration = (100 / (1.4 * 100 * 0.5)) * 500 * 1
        var expectedDuration = (int)Math.Round((100.0 / (1.4 * 100.0 * 0.5)) * 500.0 * 1);
        var beatmap = OsuParser.Parse(BuildOsu(timingPoints: tp, hitObjects: "256,192,1000,2,0,L|356:192,1,100"), "test.osu");
        var slider = Assert.IsType<Slider>(beatmap.HitObjects[0]);
        Assert.Equal(1000 + expectedDuration, slider.EndTime);
    }

    [Fact]
    public void Parse_Spinner_EndTime()
    {
        var beatmap = OsuParser.Parse(BuildOsu(hitObjects: "256,192,1000,8,0,3000,0:0:0:0:"), "test.osu");
        var spinner = Assert.IsType<Spinner>(beatmap.HitObjects[0]);
        Assert.Equal(1000, spinner.Time);
        Assert.Equal(3000, spinner.EndTime);
    }

    [Fact]
    public void Parse_TotalLengthMs()
    {
        var ho = string.Join("\n",
            "256,192,1000,1,0,0:0:0:0:",
            "256,192,5000,1,0,0:0:0:0:");
        var beatmap = OsuParser.Parse(BuildOsu(hitObjects: ho), "test.osu");
        Assert.Equal(4000L, beatmap.TotalLengthMs);
    }

    [Fact]
    public void Parse_DrainTimeMs_WithBreak()
    {
        var ho = string.Join("\n",
            "256,192,1000,1,0,0:0:0:0:",
            "256,192,5000,1,0,0:0:0:0:");
        var beatmap = OsuParser.Parse(BuildOsu(events: "2,2000,3000", hitObjects: ho), "test.osu");
        Assert.Equal(4000L, beatmap.TotalLengthMs);
        Assert.Equal(3000L, beatmap.DrainTimeMs);
    }

    [Fact]
    public void Parse_EmptyHitObjects_LengthsAreZero()
    {
        var beatmap = OsuParser.Parse(BuildOsu(), "test.osu");
        Assert.Equal(0L, beatmap.TotalLengthMs);
        Assert.Equal(0L, beatmap.DrainTimeMs);
    }

    [Fact]
    public void ParseHeader_ReturnsMetadata()
    {
        var beatmap = OsuParser.ParseHeader(BuildOsu(), "test.osu");
        Assert.Equal("Test Title", beatmap.Metadata.Title);
        Assert.Equal("Test Artist", beatmap.Metadata.Artist);
        Assert.Equal("Mapper", beatmap.Metadata.Creator);
        Assert.Equal("audio.mp3", beatmap.General.AudioFilename);
        Assert.NotNull(beatmap.Background);
        Assert.Equal("bg.jpg", beatmap.Background!.Filename);
    }

    [Fact]
    public void ParseHeader_StopsBeforeTimingPoints()
    {
        var beatmap = OsuParser.ParseHeader(BuildOsu(hitObjects: "256,192,1000,1,0,0:0:0:0:"), "test.osu");
        Assert.Empty(beatmap.TimingLines);
        Assert.Empty(beatmap.HitObjects);
    }

    [Fact]
    public void ParseHeader_StopsBeforeHitObjects()
    {
        var raw = string.Join("\n",
            "osu file format v14",
            "[Metadata]",
            "Title:Fast",
            "[HitObjects]",
            "256,192,1000,1,0,0:0:0:0:");
        var beatmap = OsuParser.ParseHeader(raw, "test.osu");
        Assert.Equal("Fast", beatmap.Metadata.Title);
        Assert.Empty(beatmap.HitObjects);
    }
}
