using System.Globalization;
using MappingUtility.Parser.Objects;
using MappingUtility.Parser.Objects.Events;
using MappingUtility.Parser.Objects.HitObjects;
using MappingUtility.Parser.Objects.TimingLines;
using MappingUtility.Parser.Settings;

namespace MappingUtility.Parser;

public static class OsuParser
{
    private static readonly IFormatProvider Inv = CultureInfo.InvariantCulture;

    public static Beatmap Parse(string content, string fileName)
    {
        content = content.TrimStart('\uFEFF');
        var lines = content.Split('\n');

        var formatVersion = 14;
        var section = "";

        var general = new GeneralSettings();
        var metadata = new MetadataSettings();
        var difficulty = new DifficultySettings();
        double? approachRate = null;

        Background? background = null;
        Video? video = null;
        var breaks = new List<Break>();
        var timingLines = new List<TimingLine>();
        var hitObjects = new List<HitObject>();

        for (var i = 0; i < lines.Length; i++)
        {
            var trimmed = lines[i].Trim();

            if (i == 0 && trimmed.StartsWith("osu file format"))
            {
                formatVersion = ParseFormatVersion(trimmed);
                continue;
            }

            if (trimmed.StartsWith('[') && trimmed.EndsWith(']'))
            {
                section = trimmed;
                continue;
            }

            if (trimmed.Length == 0 || trimmed.StartsWith("//"))
                continue;

            switch (section)
            {
                case "[General]":
                    ParseGeneralLine(trimmed, general);
                    break;

                case "[Metadata]":
                    ParseMetadataLine(trimmed, metadata);
                    break;

                case "[Difficulty]":
                    ParseDifficultyLine(trimmed, difficulty, ref approachRate);
                    break;

                case "[Events]":
                    ParseEventLine(trimmed, ref background, ref video, breaks);
                    break;

                case "[TimingPoints]":
                    ParseTimingPoint(trimmed, timingLines);
                    break;

                case "[HitObjects]":
                    ParseHitObject(trimmed, hitObjects, timingLines, difficulty.SliderMultiplier);
                    break;
            }
        }

        difficulty.ApproachRate = approachRate ?? difficulty.OverallDifficulty;

        var bpm = ComputeBpm(timingLines);
        var (totalLength, drainTime) = ComputeLengths(hitObjects, breaks);

        return new Beatmap
        {
            FileName = fileName,
            FormatVersion = formatVersion,
            General = general,
            Metadata = metadata,
            Difficulty = difficulty,
            Background = background,
            Video = video,
            Breaks = breaks,
            TimingLines = timingLines,
            HitObjects = hitObjects,
            Bpm = bpm,
            TotalLengthMs = totalLength,
            DrainTimeMs = drainTime,
        };
    }

    public static Beatmap ParseHeader(string content, string fileName)
    {
        content = content.TrimStart('\uFEFF');
        var section = "";

        var general = new GeneralSettings();
        var metadata = new MetadataSettings();
        Background? background = null;

        foreach (var rawLine in content.Split('\n'))
        {
            var trimmed = rawLine.Trim();

            if (trimmed.StartsWith('[') && trimmed.EndsWith(']'))
            {
                section = trimmed;
                if (section == "[TimingPoints]" || section == "[HitObjects]")
                    break;
                continue;
            }

            if (trimmed.Length == 0 || trimmed.StartsWith("//"))
                continue;

            switch (section)
            {
                case "[General]":
                    if (trimmed.StartsWith("AudioFilename:"))
                        general.AudioFilename = trimmed["AudioFilename:".Length..].Trim();
                    break;

                case "[Metadata]":
                {
                    var kv = Statics.ParserStatic.ParseKeyValue(trimmed);
                    if (kv is { } p)
                    {
                        switch (p.key)
                        {
                            case "Title":
                                metadata.Title = p.value;
                                break;
                            case "Artist":
                                metadata.Artist = p.value;
                                break;
                            case "Creator":
                                metadata.Creator = p.value;
                                break;
                            case "BeatmapID":
                                metadata.BeatmapId = long.TryParse(p.value, out var bid) ? bid : 0;
                                break;
                            case "BeatmapSetID":
                                metadata.BeatmapSetId = long.TryParse(p.value, out var bsid) ? bsid : -1;
                                break;
                        }
                    }
                    break;
                }

                case "[Events]":
                    if (background == null)
                    {
                        var isBg = trimmed.StartsWith("0,0,") || trimmed.StartsWith("Background,");
                        if (isBg)
                        {
                            var fieldIdx = trimmed.StartsWith("Background,") ? 3 : 2;
                            var fname = FirstQuotedOrField(trimmed, fieldIdx);
                            if (fname != null)
                                background = new Background { Filename = fname };
                        }
                    }
                    break;
            }
        }

        return new Beatmap
        {
            FileName = fileName,
            General = general,
            Metadata = metadata,
            Background = background,
        };
    }

    private static int ParseFormatVersion(string line)
    {
        var idx = line.LastIndexOf('v');
        if (idx < 0) return 14;
        return int.TryParse(line[(idx + 1)..].Trim(), out var v) ? v : 14;
    }

    private static void ParseGeneralLine(string line, GeneralSettings g)
    {
        var kv = Statics.ParserStatic.ParseKeyValue(line);
        if (kv is not { } p) return;

        switch (p.key)
        {
            case "AudioFilename":    g.AudioFilename    = p.value; break;
            case "AudioLeadIn":      g.AudioLeadIn      = int.TryParse(p.value, out var ali) ? ali : 0; break;
            case "PreviewTime":      g.PreviewTime      = int.TryParse(p.value, out var pt) ? pt : -1; break;
            case "Mode":             g.Mode             = int.TryParse(p.value, out var m) ? m : 0; break;
            case "StackLeniency":    g.StackLeniency    = float.TryParse(p.value, NumberStyles.Float, Inv, out var sl) ? sl : 0.7f; break;
            case "EpilepsyWarning":  g.EpilepsyWarning  = p.value == "1"; break;
            case "SampleSet":        g.SampleSet        = p.value; break;
        }
    }

    private static void ParseMetadataLine(string line, MetadataSettings m)
    {
        var kv = Statics.ParserStatic.ParseKeyValue(line);
        if (kv is not { } p) return;

        switch (p.key)
        {
            case "Title":        m.Title        = p.value; break;
            case "TitleUnicode": m.TitleUnicode = p.value; break;
            case "Artist":       m.Artist       = p.value; break;
            case "ArtistUnicode":m.ArtistUnicode= p.value; break;
            case "Creator":      m.Creator      = p.value; break;
            case "Version":      m.Version      = p.value; break;
            case "Source":       m.Source       = p.value; break;
            case "Tags":         m.Tags         = p.value; break;
            case "BeatmapID":    m.BeatmapId    = long.TryParse(p.value, out var bid) ? bid : 0; break;
            case "BeatmapSetID": m.BeatmapSetId = long.TryParse(p.value, out var bsid) ? bsid : -1; break;
        }
    }

    private static void ParseDifficultyLine(string line, DifficultySettings d, ref double? ar)
    {
        var kv = Statics.ParserStatic.ParseKeyValue(line);
        if (kv is not { } p) return;

        switch (p.key)
        {
            case "HPDrainRate":      d.HpDrainRate       = double.TryParse(p.value, NumberStyles.Float, Inv, out var hp) ? hp : 5.0; break;
            case "CircleSize":       d.CircleSize        = double.TryParse(p.value, NumberStyles.Float, Inv, out var cs) ? cs : 5.0; break;
            case "OverallDifficulty":d.OverallDifficulty = double.TryParse(p.value, NumberStyles.Float, Inv, out var od) ? od : 5.0; break;
            case "ApproachRate":     ar                  = double.TryParse(p.value, NumberStyles.Float, Inv, out var arv) ? arv : (double?)null; break;
            case "SliderMultiplier": d.SliderMultiplier  = double.TryParse(p.value, NumberStyles.Float, Inv, out var sm) ? sm : 1.4; break;
            case "SliderTickRate":   d.SliderTickRate    = double.TryParse(p.value, NumberStyles.Float, Inv, out var st) ? st : 1.0; break;
        }
    }

    private static void ParseEventLine(string line, ref Background? bg, ref Video? video, List<Break> breaks)
    {
        var isBg    = line.StartsWith("0,0,") || line.StartsWith("Background,");
        var isVideo = line.StartsWith("1,")  || line.StartsWith("Video,");
        var isBreak = line.StartsWith("2,")  || line.StartsWith("Break,", StringComparison.OrdinalIgnoreCase);

        if (bg == null && isBg)
        {
            var fieldIdx = line.StartsWith("Background,") ? 3 : 2;
            var fname = FirstQuotedOrField(line, fieldIdx);
            if (fname != null)
            {
                var parts = line.Split(',');
                var xOff = parts.Length > fieldIdx + 1 && int.TryParse(parts[fieldIdx + 1].Trim(), out var x) ? x : 0;
                var yOff = parts.Length > fieldIdx + 2 && int.TryParse(parts[fieldIdx + 2].Trim(), out var y) ? y : 0;
                bg = new Background { Filename = fname, XOffset = xOff, YOffset = yOff };
            }
        }
        else if (video == null && isVideo)
        {
            var fname = FirstQuotedOrField(line, 2);
            if (fname != null)
            {
                var parts = line.Split(',');
                var off = parts.Length > 1 && int.TryParse(parts[1].Trim(), out var o) ? o : 0;
                video = new Video { Filename = fname, Offset = off };
            }
        }
        else if (isBreak)
        {
            var parts = line.Split(',');
            if (parts.Length >= 3
                && int.TryParse(parts[1].Trim(), out var st)
                && int.TryParse(parts[2].Trim(), out var et))
            {
                breaks.Add(new Break { StartTime = st, EndTime = et });
            }
        }
    }

    private static void ParseTimingPoint(string line, List<TimingLine> timingLines)
    {
        var parts = line.Split(',');
        if (parts.Length < 2) return;

        if (!double.TryParse(parts[0].Trim(), NumberStyles.Float, Inv, out var time)) return;
        if (!double.TryParse(parts[1].Trim(), NumberStyles.Float, Inv, out var beatLength)) return;

        var meter      = parts.Length > 2 && int.TryParse(parts[2].Trim(), out var m)   ? m   : 4;
        var sampleSet  = parts.Length > 3 && int.TryParse(parts[3].Trim(), out var ss)  ? ss  : 0;
        var sampleIdx  = parts.Length > 4 && int.TryParse(parts[4].Trim(), out var si)  ? si  : 0;
        var volume     = parts.Length > 5 && int.TryParse(parts[5].Trim(), out var vol) ? vol : 100;

        var uninherited = parts.Length >= 7
            ? parts[6].Trim() == "1"
            : beatLength > 0.0;

        var effects    = parts.Length > 7 && int.TryParse(parts[7].Trim(), out var eff) ? eff : 0;
        var kiai       = (effects & 1) != 0;
        var omitsBar   = (effects & 8) != 0;

        if (uninherited)
        {
            timingLines.Add(new UninheritedLine
            {
                Offset       = time,
                BeatLength   = beatLength,
                Meter        = meter,
                SampleSet    = sampleSet,
                SampleIndex  = sampleIdx,
                Volume       = volume,
                Uninherited  = true,
                Kiai         = kiai,
                OmitsBarLine = omitsBar,
                SvMult       = 1f,
            });
        }
        else
        {
            var svMult = beatLength < 0.0
                ? (float)Math.Clamp(-100.0 / beatLength, 0.1, 10.0)
                : 1f;

            timingLines.Add(new InheritedLine
            {
                Offset       = time,
                BeatLength   = beatLength,
                Meter        = meter,
                SampleSet    = sampleSet,
                SampleIndex  = sampleIdx,
                Volume       = volume,
                Uninherited  = false,
                Kiai         = kiai,
                OmitsBarLine = omitsBar,
                SvMult       = svMult,
            });
        }
    }

    private static void ParseHitObject(string line, List<HitObject> hitObjects,
        List<TimingLine> timingLines, double sliderMultiplier)
    {
        var parts = line.Split(',');
        if (parts.Length < 5) return;

        if (!int.TryParse(parts[2].Trim(), out var time)) return;
        if (!int.TryParse(parts[3].Trim(), out var typeFlags)) return;
        if (!int.TryParse(parts[4].Trim(), out var hitSoundInt)) return;

        var isCircle   = (typeFlags & 1)   != 0;
        var isSlider   = (typeFlags & 2)   != 0;
        var isSpinner  = (typeFlags & 8)   != 0;
        var isHold     = (typeFlags & 128) != 0;

        var type      = (HitObjectType)typeFlags;
        var hitSound  = (HitSound)hitSoundInt;

        if (isCircle)
        {
            hitObjects.Add(new Circle
            {
                Time         = time,
                TypeFlags    = type,
                HitSoundFlags= hitSound,
                EndTime      = time,
            });
        }
        else if (isSlider)
        {
            var curveData   = parts.Length > 5 ? parts[5].Trim() : "";
            var sliderType  = curveData.Split('|').FirstOrDefault() ?? "L";
            var slides      = parts.Length > 6 && int.TryParse(parts[6].Trim(), out var sl)  ? sl  : 1;
            var pixelLength = parts.Length > 7 && double.TryParse(parts[7].Trim(), NumberStyles.Float, Inv, out var pl) ? pl : 100.0;

            var (beatLen, sv) = GetActiveTiming(time, timingLines);
            var duration = (pixelLength / (sliderMultiplier * 100.0 * sv)) * beatLen * slides;
            var endTime  = time + (int)Math.Round(duration);

            hitObjects.Add(new Slider
            {
                Time         = time,
                TypeFlags    = type,
                HitSoundFlags= hitSound,
                EndTime      = endTime,
                SliderType   = sliderType,
                Slides       = slides,
                Length       = pixelLength,
            });
        }
        else if (isSpinner)
        {
            var endTime = parts.Length > 5 && int.TryParse(parts[5].Trim(), out var et) ? et : time + 1000;
            hitObjects.Add(new Spinner
            {
                Time         = time,
                TypeFlags    = type,
                HitSoundFlags= hitSound,
                EndTime      = endTime,
            });
        }
        else if (isHold)
        {
            var endTime = time;
            if (parts.Length > 5)
            {
                var endStr = parts[5].Split(':').FirstOrDefault()?.Trim() ?? "";
                if (int.TryParse(endStr, out var et)) endTime = et;
            }
            hitObjects.Add(new HoldNote
            {
                Time         = time,
                TypeFlags    = type,
                HitSoundFlags= hitSound,
                EndTime      = endTime,
            });
        }
    }

    private static (double beatLength, double svMultiplier) GetActiveTiming(int time, List<TimingLine> timingLines)
    {
        var beatLength   = 500.0;
        var svMultiplier = 1.0;

        foreach (var tp in timingLines)
        {
            if (tp.Offset > time) break;

            if (tp.Uninherited)
            {
                beatLength   = tp.BeatLength;
                svMultiplier = 1.0;
            }
            else if (tp.BeatLength < 0.0)
            {
                svMultiplier = -100.0 / tp.BeatLength;
            }
        }

        return (beatLength, svMultiplier);
    }

    private static double ComputeBpm(List<TimingLine> timingLines)
    {
        var first = timingLines.OfType<UninheritedLine>().FirstOrDefault();
        if (first == null || first.BeatLength <= 0.0) return 120.0;
        return Math.Round(60000.0 / first.BeatLength, 2);
    }

    private static (long totalLength, long drainTime) ComputeLengths(List<HitObject> hitObjects, List<Break> breaks)
    {
        if (hitObjects.Count == 0) return (0L, 0L);

        var firstTime = (long)hitObjects[0].Time;
        var lastEnd   = hitObjects.Max(ho => Math.Max(ho.Time, ho.EndTime));
        var total     = (long)lastEnd - firstTime;
        var totalBreak= breaks.Sum(b => (long)(b.EndTime - b.StartTime));
        var drain     = Math.Max(0L, total - totalBreak);

        return (total, drain);
    }

    private static string? FirstQuotedOrField(string line, int fieldIndex)
    {
        var start = line.IndexOf('"');
        if (start >= 0)
        {
            var rest = line[(start + 1)..];
            var end  = rest.IndexOf('"');
            if (end >= 0)
            {
                var v = rest[..end].Trim();
                return v.Length > 0 ? v : null;
            }
        }

        var parts = line.Split(',');
        if (parts.Length <= fieldIndex) return null;

        var raw = parts[fieldIndex].Trim();
        raw = raw.Split("//").First().Trim();
        raw = raw.Trim('"').Trim();
        return raw.Length > 0 ? raw : null;
    }
}
