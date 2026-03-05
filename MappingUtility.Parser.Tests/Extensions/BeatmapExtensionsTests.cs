using MappingUtility.Parser.Extensions;
using MappingUtility.Parser.Objects;
using MappingUtility.Parser.Objects.HitObjects;
using MappingUtility.Parser.Objects.TimingLines;
using Xunit;

namespace MappingUtility.Parser.Tests.Extensions;

public class BeatmapExtensionsTests
{
    private static Beatmap BuildBeatmap(
        IEnumerable<TimingLine>? timingLines = null,
        IEnumerable<HitObject>? hitObjects = null,
        double bpm = 120.0)
    {
        return new Beatmap
        {
            TimingLines = timingLines?.ToList() ?? [],
            HitObjects = hitObjects?.ToList() ?? [],
            Bpm = bpm,
        };
    }

    private static UninheritedLine Uninherited(double offset, double beatLength = 500, bool kiai = false) =>
        new() { Offset = offset, BeatLength = beatLength, Uninherited = true, SvMult = 1f, Kiai = kiai };

    private static InheritedLine Inherited(double offset, float svMult) =>
        new() { Offset = offset, BeatLength = -100.0 / svMult, Uninherited = false, SvMult = svMult };

    private static Circle CircleAt(int time) =>
        new() { Time = time, EndTime = time };

    // ── GetTimingLine ─────────────────────────────────────────────────────────

    [Fact]
    public void GetTimingLine_EmptyList_ReturnsNull()
    {
        var beatmap = BuildBeatmap();
        Assert.Null(beatmap.GetTimingLine(0));
    }

    [Fact]
    public void GetTimingLine_BeforeFirst_ReturnsNull()
    {
        var beatmap = BuildBeatmap(timingLines: [Uninherited(1000)]);
        Assert.Null(beatmap.GetTimingLine(500));
    }

    [Fact]
    public void GetTimingLine_AtExactOffset_ReturnsLine()
    {
        var line = Uninherited(1000);
        var beatmap = BuildBeatmap(timingLines: [line]);
        Assert.Same(line, beatmap.GetTimingLine(1000));
    }

    [Fact]
    public void GetTimingLine_ReturnsLastBeforeTime()
    {
        var a = Uninherited(0);
        var b = Uninherited(1000);
        var c = Uninherited(2000);
        var beatmap = BuildBeatmap(timingLines: [a, b, c]);
        Assert.Same(b, beatmap.GetTimingLine(1500));
    }

    // ── GetUninheritedLine ────────────────────────────────────────────────────

    [Fact]
    public void GetUninheritedLine_SkipsInherited()
    {
        var red = Uninherited(0);
        var green = Inherited(500, 0.75f);
        var beatmap = BuildBeatmap(timingLines: [red, green]);
        Assert.Same(red, beatmap.GetUninheritedLine(1000));
    }

    [Fact]
    public void GetUninheritedLine_ReturnsLatestUninheritedBeforeTime()
    {
        var a = Uninherited(0);
        var b = Uninherited(1000);
        var beatmap = BuildBeatmap(timingLines: [a, b]);
        Assert.Same(b, beatmap.GetUninheritedLine(2000));
        Assert.Same(a, beatmap.GetUninheritedLine(999));
    }

    [Fact]
    public void GetUninheritedLine_NoUninheritedBeforeTime_ReturnsNull()
    {
        var line = Uninherited(1000);
        var beatmap = BuildBeatmap(timingLines: [line]);
        Assert.Null(beatmap.GetUninheritedLine(500));
    }

    // ── GetNextTimingLine ─────────────────────────────────────────────────────

    [Fact]
    public void GetNextTimingLine_ReturnsLineAfterTime()
    {
        var a = Uninherited(0);
        var b = Uninherited(1000);
        var beatmap = BuildBeatmap(timingLines: [a, b]);
        Assert.Same(b, beatmap.GetNextTimingLine(0));
    }

    [Fact]
    public void GetNextTimingLine_AfterLast_ReturnsNull()
    {
        var beatmap = BuildBeatmap(timingLines: [Uninherited(0)]);
        Assert.Null(beatmap.GetNextTimingLine(0));
    }

    // ── GetHitObject ──────────────────────────────────────────────────────────

    [Fact]
    public void GetHitObject_ReturnsLastAtOrBefore()
    {
        var a = CircleAt(1000);
        var b = CircleAt(2000);
        var beatmap = BuildBeatmap(hitObjects: [a, b]);
        Assert.Same(a, beatmap.GetHitObject(1500));
        Assert.Same(b, beatmap.GetHitObject(2000));
    }

    [Fact]
    public void GetHitObject_BeforeFirst_ReturnsNull()
    {
        var beatmap = BuildBeatmap(hitObjects: [CircleAt(1000)]);
        Assert.Null(beatmap.GetHitObject(500));
    }

    // ── GetNextHitObject ──────────────────────────────────────────────────────

    [Fact]
    public void GetNextHitObject_ReturnsNextAfterTime()
    {
        var a = CircleAt(1000);
        var b = CircleAt(2000);
        var beatmap = BuildBeatmap(hitObjects: [a, b]);
        Assert.Same(b, beatmap.GetNextHitObject(1000));
    }

    [Fact]
    public void GetNextHitObject_AfterLast_ReturnsNull()
    {
        var beatmap = BuildBeatmap(hitObjects: [CircleAt(1000)]);
        Assert.Null(beatmap.GetNextHitObject(1000));
    }

    // ── GetBpm ────────────────────────────────────────────────────────────────

    [Fact]
    public void GetBpm_ReturnsActiveUninheritedBpm()
    {
        var a = Uninherited(0, beatLength: 500);   // 120 BPM
        var b = Uninherited(1000, beatLength: 300); // 200 BPM
        var beatmap = BuildBeatmap(timingLines: [a, b], bpm: 120.0);
        Assert.Equal(60000.0 / 300.0, beatmap.GetBpm(2000), precision: 5);
        Assert.Equal(60000.0 / 500.0, beatmap.GetBpm(500), precision: 5);
    }

    [Fact]
    public void GetBpm_FallsBackToBeatmapBpm_WhenNoUninherited()
    {
        var beatmap = BuildBeatmap(bpm: 180.0);
        Assert.Equal(180.0, beatmap.GetBpm(0));
    }

    // ── GetSvMultiplier ───────────────────────────────────────────────────────

    [Fact]
    public void GetSvMultiplier_ReturnsActiveSvMult()
    {
        var red = Uninherited(0);
        var green = Inherited(500, 0.5f);
        var beatmap = BuildBeatmap(timingLines: [red, green]);
        Assert.Equal(1.0, beatmap.GetSvMultiplier(499));
        Assert.Equal(0.5, beatmap.GetSvMultiplier(500), precision: 5);
    }

    [Fact]
    public void GetSvMultiplier_FallsBackToOne_WhenNoTimingLine()
    {
        var beatmap = BuildBeatmap();
        Assert.Equal(1.0, beatmap.GetSvMultiplier(0));
    }

    // ── GetDrainTime ──────────────────────────────────────────────────────────

    [Fact]
    public void GetDrainTime_ReturnsDrainTimeMs()
    {
        var beatmap = BuildBeatmap();
        beatmap.DrainTimeMs = 12345L;
        Assert.Equal(12345L, beatmap.GetDrainTime());
    }
}
