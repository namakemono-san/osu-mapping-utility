using MappingUtility.Parser;
using MappingUtility.Parser.Objects;
using MappingUtility.Parser.Objects.Events;
using MappingUtility.Parser.Settings;
using Xunit;

namespace MappingUtility.Parser.Tests;

public class OsuSerializerTests
{
    [Fact]
    public void ApplyMetadata_ReplacesTitle()
    {
        var content = "[Metadata]\nTitle:Old\nArtist:Old Artist\n[General]\n";
        var meta = new MetadataSettings { Title = "New Title", Artist = "Old Artist" };
        var result = OsuSerializer.ApplyMetadata(content, meta, null);
        Assert.Contains("Title:New Title", result);
    }

    [Fact]
    public void ApplyMetadata_ReplacesAllMetadataFields()
    {
        var content = string.Join("\n",
            "[Metadata]",
            "Title:Old",
            "TitleUnicode:Old",
            "Artist:Old",
            "ArtistUnicode:Old",
            "Creator:Old",
            "Source:Old",
            "Tags:Old",
            "[General]");
        var meta = new MetadataSettings
        {
            Title = "New Title",
            TitleUnicode = "新タイトル",
            Artist = "New Artist",
            ArtistUnicode = "新アーティスト",
            Creator = "NewMapper",
            Source = "New Source",
            Tags = "tag1 tag2",
        };
        var result = OsuSerializer.ApplyMetadata(content, meta, null);
        Assert.Contains("Title:New Title", result);
        Assert.Contains("TitleUnicode:新タイトル", result);
        Assert.Contains("Artist:New Artist", result);
        Assert.Contains("ArtistUnicode:新アーティスト", result);
        Assert.Contains("Creator:NewMapper", result);
        Assert.Contains("Source:New Source", result);
        Assert.Contains("Tags:tag1 tag2", result);
    }

    [Fact]
    public void ApplyMetadata_PreservesLf()
    {
        var content = "[Metadata]\nTitle:Old\n[General]\n";
        var result = OsuSerializer.ApplyMetadata(content, new MetadataSettings { Title = "New" }, null);
        Assert.Contains("\n", result);
        Assert.DoesNotContain("\r\n", result);
    }

    [Fact]
    public void ApplyMetadata_PreservesCrLf()
    {
        var content = "[Metadata]\r\nTitle:Old\r\n[General]\r\n";
        var result = OsuSerializer.ApplyMetadata(content, new MetadataSettings { Title = "New" }, null);
        Assert.Contains("\r\n", result);
    }

    [Fact]
    public void ApplyMetadata_ReplacesBackground()
    {
        var content = "[Events]\n0,0,\"old.jpg\",0,0\n[General]\n";
        var bg = new Background { Filename = "new.jpg", XOffset = 10, YOffset = 20 };
        var result = OsuSerializer.ApplyMetadata(content, new MetadataSettings(), bg);
        Assert.Contains("\"new.jpg\"", result);
        Assert.Contains(",10,20", result);
        Assert.DoesNotContain("\"old.jpg\"", result);
    }

    [Fact]
    public void ApplyMetadata_NullBackground_DoesNotReplaceBackgroundLine()
    {
        var content = "[Events]\n0,0,\"old.jpg\",0,0\n[General]\n";
        var result = OsuSerializer.ApplyMetadata(content, new MetadataSettings(), null);
        Assert.Contains("\"old.jpg\"", result);
    }

    [Fact]
    public void ApplyMetadata_DoesNotTouchNonMetadataKeys()
    {
        var content = "[Metadata]\nTitle:Old\nBeatmapID:99\n[General]\n";
        var result = OsuSerializer.ApplyMetadata(content, new MetadataSettings { Title = "New" }, null);
        Assert.Contains("BeatmapID:99", result);
    }

    [Fact]
    public void Serialize_ContainsAllSections()
    {
        var beatmap = new Beatmap();
        var result = OsuSerializer.Serialize(beatmap);
        Assert.Contains("[General]", result);
        Assert.Contains("[Metadata]", result);
        Assert.Contains("[Difficulty]", result);
        Assert.Contains("[Events]", result);
        Assert.Contains("[TimingPoints]", result);
        Assert.Contains("[HitObjects]", result);
    }

    [Fact]
    public void Serialize_ContainsFormatVersion()
    {
        var beatmap = new Beatmap { FormatVersion = 14 };
        var result = OsuSerializer.Serialize(beatmap);
        Assert.Contains("osu file format v14", result);
    }

    [Fact]
    public void Serialize_ContainsMetadata()
    {
        var beatmap = new Beatmap
        {
            Metadata = new MetadataSettings { Title = "My Map", Creator = "Me" }
        };
        var result = OsuSerializer.Serialize(beatmap);
        Assert.Contains("Title:My Map", result);
        Assert.Contains("Creator:Me", result);
    }
}
