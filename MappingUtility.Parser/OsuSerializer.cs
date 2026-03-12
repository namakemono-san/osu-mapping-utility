using System.Globalization;
using System.Text;
using MappingUtility.Parser.Checks;
using MappingUtility.Parser.Objects;
using MappingUtility.Parser.Objects.Events;
using MappingUtility.Parser.Objects.HitObjects;
using MappingUtility.Parser.Objects.TimingLines;
using MappingUtility.Parser.Settings;

namespace MappingUtility.Parser;

public static class OsuSerializer
{
    private static readonly IFormatProvider Inv = CultureInfo.InvariantCulture;

    public static string Serialize(Beatmap beatmap)
    {
        var sb = new StringBuilder();

        sb.AppendLine($"osu file format v{beatmap.FormatVersion}");
        sb.AppendLine();

        sb.AppendLine("[General]");
        var g = beatmap.General;
        sb.AppendLine($"AudioFilename: {g.AudioFilename}");
        sb.AppendLine($"AudioLeadIn: {g.AudioLeadIn}");
        sb.AppendLine($"PreviewTime: {g.PreviewTime}");
        sb.AppendLine($"SampleSet: {g.SampleSet}");
        sb.AppendLine($"StackLeniency: {g.StackLeniency.ToString(Inv)}");
        sb.AppendLine($"Mode: {g.Mode}");
        sb.AppendLine($"EpilepsyWarning: {(g.EpilepsyWarning ? 1 : 0)}");
        sb.AppendLine();

        sb.AppendLine("[Metadata]");
        var m = beatmap.Metadata;
        sb.AppendLine($"Title:{m.Title}");
        sb.AppendLine($"TitleUnicode:{m.TitleUnicode}");
        sb.AppendLine($"Artist:{m.Artist}");
        sb.AppendLine($"ArtistUnicode:{m.ArtistUnicode}");
        sb.AppendLine($"Creator:{m.Creator}");
        sb.AppendLine($"Version:{m.Version}");
        sb.AppendLine($"Source:{m.Source}");
        sb.AppendLine($"Tags:{m.Tags}");
        sb.AppendLine($"BeatmapID:{m.BeatmapId}");
        sb.AppendLine($"BeatmapSetID:{m.BeatmapSetId}");
        sb.AppendLine();

        sb.AppendLine("[Difficulty]");
        var d = beatmap.Difficulty;
        sb.AppendLine($"HPDrainRate:{d.HpDrainRate.ToString(Inv)}");
        sb.AppendLine($"CircleSize:{d.CircleSize.ToString(Inv)}");
        sb.AppendLine($"OverallDifficulty:{d.OverallDifficulty.ToString(Inv)}");
        sb.AppendLine($"ApproachRate:{d.ApproachRate.ToString(Inv)}");
        sb.AppendLine($"SliderMultiplier:{d.SliderMultiplier.ToString(Inv)}");
        sb.AppendLine($"SliderTickRate:{d.SliderTickRate.ToString(Inv)}");
        sb.AppendLine();

        sb.AppendLine("[Events]");
        sb.AppendLine("//Background and Video events");
        if (beatmap.Background is { } bg)
            sb.AppendLine($"0,0,\"{bg.Filename}\",{bg.XOffset},{bg.YOffset}");
        if (beatmap.Video is { } vid)
            sb.AppendLine($"1,{vid.Offset},\"{vid.Filename}\"");
        sb.AppendLine("//Break Periods");
        foreach (var br in beatmap.Breaks)
            sb.AppendLine($"2,{br.StartTime},{br.EndTime}");
        sb.AppendLine();

        sb.AppendLine("[TimingPoints]");
        foreach (var tp in beatmap.TimingLines)
        {
            var effects = (tp.Kiai ? 1 : 0) | (tp.OmitsBarLine ? 8 : 0);
            sb.AppendLine(string.Join(",",
                tp.Offset.ToString(Inv),
                tp.BeatLength.ToString(Inv),
                tp.Meter,
                tp.SampleSet,
                tp.SampleIndex,
                tp.Volume,
                tp.Uninherited ? 1 : 0,
                effects));
        }
        sb.AppendLine();

        sb.AppendLine("[HitObjects]");
        foreach (var ho in beatmap.HitObjects)
        {
            var x = 256;
            var y = 192;
            switch (ho)
            {
                case Circle c:
                    sb.AppendLine($"{x},{y},{c.Time},{(int)c.TypeFlags},{(int)c.HitSoundFlags},0:0:0:0:");
                    break;
                case Slider s:
                    sb.AppendLine($"{x},{y},{s.Time},{(int)s.TypeFlags},{(int)s.HitSoundFlags},{s.SliderType}|,{s.Slides},{s.Length.ToString(Inv)}");
                    break;
                case Spinner sp:
                    sb.AppendLine($"{x},{y},{sp.Time},{(int)sp.TypeFlags},{(int)sp.HitSoundFlags},{sp.EndTime},0:0:0:0:");
                    break;
                case HoldNote hn:
                    sb.AppendLine($"{x},{y},{hn.Time},{(int)hn.TypeFlags},{(int)hn.HitSoundFlags},{hn.EndTime}:0:0:0:0:");
                    break;
            }
        }

        return sb.ToString();
    }

    public static string ApplyMetadata(string content, MetadataSettings metadata, Background? background)
    {
        var eol = content.Contains("\r\n") ? "\r\n" : "\n";
        var lines = content.Split(eol);

        var inMetadata = false;
        var inEvents   = false;
        var output     = new List<string>(lines.Length);

        foreach (var line in lines)
        {
            var trimmed = line.Trim();

            if (trimmed.Equals("[Metadata]", StringComparison.OrdinalIgnoreCase))
            {
                inMetadata = true;
                inEvents   = false;
                output.Add(line);
                continue;
            }

            if (trimmed.Equals("[Events]", StringComparison.OrdinalIgnoreCase))
            {
                inEvents   = true;
                inMetadata = false;
                output.Add(line);
                continue;
            }

            if (trimmed.StartsWith('[') && trimmed.EndsWith(']'))
            {
                inMetadata = false;
                inEvents   = false;
                output.Add(line);
                continue;
            }

            if (inMetadata && trimmed.Length > 0 && !trimmed.StartsWith("//"))
            {
                var colon = trimmed.IndexOf(':');
                if (colon >= 0)
                {
                    var key = trimmed[..colon].Trim();
                    var replacement = key switch
                    {
                        "Title"        => $"Title:{metadata.Title}",
                        "TitleUnicode" => $"TitleUnicode:{metadata.TitleUnicode}",
                        "Artist"       => $"Artist:{metadata.Artist}",
                        "ArtistUnicode"=> $"ArtistUnicode:{metadata.ArtistUnicode}",
                        "Creator"      => $"Creator:{metadata.Creator}",
                        "Source"       => $"Source:{metadata.Source}",
                        "Tags"         => $"Tags:{metadata.Tags}",
                        _              => (string?)null,
                    };
                    if (replacement != null)
                    {
                        output.Add(replacement);
                        continue;
                    }
                }
            }

            if (inEvents && background != null)
            {
                var isBgLine = trimmed.StartsWith("0,0,")
                    || trimmed.StartsWith("Background,", StringComparison.OrdinalIgnoreCase);
                if (isBgLine)
                {
                    output.Add($"0,0,\"{background.Filename}\",{background.XOffset},{background.YOffset}");
                    continue;
                }
            }

            output.Add(line);
        }

        return string.Join(eol, output);
    }

    public static (string Content, int FixedCount) FixUnsnaps(string content, Beatmap beatmap)
    {
        var results = UnsnapChecker.Check(beatmap).ToList();
        if (results.Count == 0) return (content, 0);

        var headTimesToFix = new HashSet<int>();
        var endTimesToFix = new HashSet<int>();

        foreach (var r in results)
        {
            switch (r.ObjectType)
            {
                case "Circle":
                case "Slider head":
                case "Hold note head":
                    headTimesToFix.Add((int)r.Time);
                    break;
                case "Hold note tail":
                    endTimesToFix.Add((int)r.Time);
                    break;
            }
        }

        var eol = content.Contains("\r\n") ? "\r\n" : "\n";
        var lines = content.Split(eol);
        var output = new List<string>(lines.Length);
        var inHitObjects = false;
        var fixedCount = 0;

        foreach (var line in lines)
        {
            var trimmed = line.Trim();

            if (trimmed.Equals("[HitObjects]", StringComparison.OrdinalIgnoreCase))
            {
                inHitObjects = true;
                output.Add(line);
                continue;
            }

            if (trimmed.StartsWith('[') && trimmed.EndsWith(']'))
            {
                inHitObjects = false;
                output.Add(line);
                continue;
            }

            if (!inHitObjects || trimmed.Length == 0 || trimmed.StartsWith("//"))
            {
                output.Add(line);
                continue;
            }

            var fields = trimmed.Split(',');
            if (fields.Length < 5 ||
                !int.TryParse(fields[2], out var time) ||
                !int.TryParse(fields[3], out var typeFlags))
            {
                output.Add(line);
                continue;
            }

            var modified = false;

            if (headTimesToFix.Contains(time))
            {
                fields[2] = UnsnapChecker.GetCorrectedTime(time, beatmap).ToString();
                fixedCount++;
                modified = true;
            }

            var isSpinner  = (typeFlags & (int)HitObjectType.Spinner) != 0;
            var isHoldNote = (typeFlags & (int)HitObjectType.ManiaHoldNote) != 0;

            if (fields.Length > 5 && isHoldNote)
            {
                var colonIdx = fields[5].IndexOf(':');
                if (colonIdx > 0 &&
                    int.TryParse(fields[5][..colonIdx], out var holdEnd) &&
                    endTimesToFix.Contains(holdEnd))
                {
                    fields[5] = UnsnapChecker.GetCorrectedTime(holdEnd, beatmap) + fields[5][colonIdx..];
                    fixedCount++;
                    modified = true;
                }
            }

            output.Add(modified ? string.Join(",", fields) : line);
        }

        return (string.Join(eol, output), fixedCount);
    }
}
