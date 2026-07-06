using System.Diagnostics;
using System.Globalization;
using System.Text;
using MappingUtility.Parser.Events;
using MappingUtility.Parser.HitObjects;
using MappingUtility.Parser.Sections;
using MappingUtility.Parser.TimingPoints;

namespace MappingUtility.Parser;

public sealed class Beatmap
{
    public int FormatVersion { get; private init; }
    public General General { get; private set; } = new();
    public Editor Editor { get; set; } = new();
    public Metadata Metadata { get; private init; } = new();
    public Difficulty Difficulty { get; private init; } = new();
    public Colours Colours { get; private init; } = new();
    public Background? Background { get; private init; }
    public Video? Video { get; private init; }
    public IReadOnlyList<Break> Breaks { get; private set; } = [];
    public IReadOnlyList<TimingPoint> TimingPoints { get; private set; } = [];
    public List<HitObject> HitObjects { get; set; } = [];

    private Dictionary<string, List<string>> _rawSections = new(StringComparer.OrdinalIgnoreCase);

    public static Beatmap FromFile(string path)
        => FromContent(File.ReadAllText(path, new UTF8Encoding(false)));

    public static Beatmap FromContent(string content)
    {
        using var reader = new StringReader(content);
        return Parse(reader);
    }

    public string Serialize()
    {
        var sb = new StringBuilder();
        sb.Append($"osu file format v{FormatVersion}\r\n");
        WriteRawSection(sb, "General");
        WriteEditorSection(sb);
        WriteRawSection(sb, "Metadata");
        WriteRawSection(sb, "Difficulty");
        WriteRawSection(sb, "Events");
        WriteRawSection(sb, "TimingPoints");
        if (_rawSections.ContainsKey("Colours"))
            WriteRawSection(sb, "Colours");
        WriteHitObjectsSection(sb);
        return sb.ToString();
    }

    private void WriteRawSection(StringBuilder sb, string name)
    {
        if (!_rawSections.TryGetValue(name, out var lines)) return;
        sb.Append($"\r\n[{name}]\r\n");
        foreach (var line in lines)
            sb.Append(line).Append("\r\n");
    }

    private void WriteEditorSection(StringBuilder sb)
    {
        sb.Append("\r\n[Editor]\r\n");
        if (Editor.Bookmarks.Count > 0)
            sb.Append($"Bookmarks: {string.Join(",", Editor.Bookmarks)}\r\n");
        sb.Append($"DistanceSpacing: {Editor.DistanceSpacing.ToString("G", CultureInfo.InvariantCulture)}\r\n");
        sb.Append($"BeatDivisor: {Editor.BeatDivisor}\r\n");
        sb.Append($"GridSize: {Editor.GridSize}\r\n");
        if (Editor.TimelineZoom.HasValue)
            sb.Append($"TimelineZoom: {Editor.TimelineZoom.Value.ToString("G", CultureInfo.InvariantCulture)}\r\n");
    }

    public void ApplyMetadata(string title, string titleUnicode, string artist, string artistUnicode,
        string source, string tags)
    {
        if (!_rawSections.TryGetValue("Metadata", out var existing)) return;

        var replacements = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["Title"]         = title,
            ["TitleUnicode"]  = titleUnicode,
            ["Artist"]        = artist,
            ["ArtistUnicode"] = artistUnicode,
            ["Source"]        = source,
            ["Tags"]          = tags,
        };

        _rawSections["Metadata"] = existing
            .Select(line =>
            {
                var idx = line.IndexOf(':');
                if (idx < 0) return line;
                var key = line[..idx].Trim();
                return replacements.TryGetValue(key, out var val) ? $"{key}:{val}" : line;
            })
            .ToList();
    }

    public void ApplyBackground(string filename, int offsetX, int offsetY)
    {
        if (!_rawSections.TryGetValue("Events", out var events)) return;
        var bgLine = $"0,0,\"{filename}\",{offsetX},{offsetY}";
        var newEvents = new List<string>(events.Count);
        var replaced = false;
        foreach (var line in events)
        {
            var t = line.TrimStart();
            if (!replaced && (t.StartsWith("0,0,") || t.StartsWith("Background,", StringComparison.OrdinalIgnoreCase)))
            {
                newEvents.Add(bgLine);
                replaced = true;
            }
            else
            {
                newEvents.Add(line);
            }
        }
        if (!replaced) newEvents.Insert(0, bgLine);
        _rawSections["Events"] = newEvents;
    }

    private void WriteHitObjectsSection(StringBuilder sb)
    {
        sb.Append("\r\n\r\n[HitObjects]\r\n");
        foreach (var obj in HitObjects)
            sb.Append(obj.IsDirty ? obj.Serialize() : obj.RawLine).Append("\r\n");
    }

    private static Beatmap Parse(StringReader reader)
    {
        var formatVersion = 14;
        var firstLine = reader.ReadLine();
        if (firstLine?.StartsWith("osu file format v") == true &&
            int.TryParse(firstLine["osu file format v".Length..], out var v))
            formatVersion = v;

        var sections    = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
        var rawSections = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
        string? currentSection = null;

        string? line;
        while ((line = reader.ReadLine()) != null)
        {
            var trimmed = line.Trim();
            if (trimmed.StartsWith('[') && trimmed.EndsWith(']'))
            {
                currentSection = trimmed[1..^1];
                sections[currentSection]    = [];
                rawSections[currentSection] = [];
                continue;
            }
            if (currentSection != null)
            {
                rawSections[currentSection].Add(line);
                if (!string.IsNullOrEmpty(trimmed) && !trimmed.StartsWith("//"))
                    sections[currentSection].Add(trimmed);
            }
        }

        foreach (var key in rawSections.Keys.ToList())
        {
            var raw = rawSections[key];
            while (raw.Count > 0 && string.IsNullOrWhiteSpace(raw[^1]))
                raw.RemoveAt(raw.Count - 1);
        }

        var general    = ParseKv(sections, "General",    Sections.General.Parse);
        var editor     = ParseKv(sections, "Editor",     Sections.Editor.Parse);
        var metadata   = ParseKv(sections, "Metadata",   Sections.Metadata.Parse);
        var difficulty = ParseKv(sections, "Difficulty", Sections.Difficulty.Parse);
        var colours    = ParseKv(sections, "Colours",    Sections.Colours.Parse);

        var (background, video, breaks) = ParseEvents(sections);
        var timingPoints = ParseTimingPoints(sections);
        var hitObjects   = ParseHitObjects(sections, difficulty.CircleSize);

        return new Beatmap
        {
            FormatVersion = formatVersion,
            General       = general,
            Editor        = editor,
            Metadata      = metadata,
            Difficulty    = difficulty,
            Colours       = colours,
            Background    = background,
            Video         = video,
            Breaks        = breaks,
            TimingPoints  = timingPoints,
            HitObjects    = hitObjects,
            _rawSections  = rawSections,
        };
    }

    private static Dictionary<string, string> BuildKv(List<string> lines)
    {
        var kv = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var line in lines)
        {
            var idx = line.IndexOf(':');
            if (idx < 0) continue;
            var key = line[..idx].Trim();
            var val = line[(idx + 1)..].Trim();
            kv[key] = val;
        }
        return kv;
    }

    private static T ParseKv<T>(
        Dictionary<string, List<string>> sections,
        string sectionName,
        Func<Dictionary<string, string>, T> factory) where T : new()
    {
        if (!sections.TryGetValue(sectionName, out var lines)) return new T();
        return factory(BuildKv(lines));
    }

    private static (Background? bg, Video? vid, IReadOnlyList<Break> breaks) ParseEvents(
        Dictionary<string, List<string>> sections)
    {
        Background? bg    = null;
        Video?      vid   = null;
        var         brks  = new List<Break>();

        if (!sections.TryGetValue("Events", out var lines)) return (bg, vid, brks);

        foreach (var line in lines)
        {
            if (line.StartsWith("//")) continue;
            var p = SplitEventLine(line);
            if (p.Length < 1) continue;

            var eventType = p[0].Trim();

            if ((eventType == "0" || eventType == "Background") && p.Length >= 3)
            {
                bg = new Background
                {
                    Filename = p[2].Trim('"'),
                    OffsetX  = p.Length > 3 && int.TryParse(p[3], out var ox) ? ox : 0,
                    OffsetY  = p.Length > 4 && int.TryParse(p[4], out var oy) ? oy : 0,
                };
                continue;
            }

            if ((eventType == "1" || eventType == "Video") && p.Length >= 3)
            {
                vid = new Video
                {
                    StartTime = p.Length > 1 && int.TryParse(p[1], out var st) ? st : 0,
                    Filename  = p[2].Trim('"'),
                    OffsetX   = p.Length > 3 && int.TryParse(p[3], out var ox) ? ox : 0,
                    OffsetY   = p.Length > 4 && int.TryParse(p[4], out var oy) ? oy : 0,
                };
                continue;
            }

            if ((eventType == "2" || eventType == "Break") && p.Length >= 3)
            {
                if (int.TryParse(p[1], out var bst) && int.TryParse(p[2], out var bet))
                    brks.Add(new Break { StartTime = bst, EndTime = bet });
            }
        }

        return (bg, vid, brks);
    }

    private static string[] SplitEventLine(string line) => line.Split(',');

    private static List<Break> ParseBreakLines(List<string> eventLines)
    {
        var brks = new List<Break>();
        foreach (var line in eventLines)
        {
            if (line.StartsWith("//")) continue;
            var p = SplitEventLine(line);
            if (p.Length < 3) continue;
            var eventType = p[0].Trim();
            if ((eventType == "2" || eventType == "Break") &&
                int.TryParse(p[1], out var bst) && int.TryParse(p[2], out var bet))
                brks.Add(new Break { StartTime = bst, EndTime = bet });
        }
        return brks;
    }

    private static IReadOnlyList<TimingPoint> ParseTimingPointLines(List<string> lines)
    {
        var list = new List<TimingPoint>(lines.Count);
        foreach (var line in lines)
        {
            try { list.Add(TimingPoint.Parse(line)); }
            catch (Exception ex) { Trace.TraceWarning($"Skipped malformed timing point '{line}': {ex.Message}"); }
        }
        return list;
    }

    private static IReadOnlyList<TimingPoint> ParseTimingPoints(Dictionary<string, List<string>> sections)
        => sections.TryGetValue("TimingPoints", out var lines) ? ParseTimingPointLines(lines) : [];

    private static List<HitObject> ParseHitObjects(
        Dictionary<string, List<string>> sections, float circleSize)
    {
        if (!sections.TryGetValue("HitObjects", out var lines)) return [];
        var list = new List<HitObject>(lines.Count);
        foreach (var line in lines)
        {
            try { list.Add(HitObject.Parse(line, circleSize)); }
            catch (Exception ex) { Trace.TraceWarning($"Skipped malformed hit object '{line}': {ex.Message}"); }
        }
        return list;
    }

    internal void ShiftTiming(int deltaMs)
    {
        if (deltaMs == 0) return;

        if (_rawSections.TryGetValue("TimingPoints", out var tpLines))
        {
            for (var i = 0; i < tpLines.Count; i++)
            {
                var line = tpLines[i];
                var comma = line.IndexOf(',');
                if (comma < 0) continue;
                if (!double.TryParse(line[..comma].Trim(),
                    System.Globalization.NumberStyles.Float,
                    System.Globalization.CultureInfo.InvariantCulture, out var t)) continue;
                tpLines[i] = $"{(int)Math.Round(t + deltaMs)}{line[comma..]}";
            }
            TimingPoints = ParseTimingPointLines(tpLines);
        }

        foreach (var obj in HitObjects)
        {
            obj.Time += deltaMs;
            switch (obj)
            {
                case Spinner spinner: spinner.EndTime += deltaMs; break;
                case HoldNote holdNote: holdNote.EndTime += deltaMs; break;
            }
            obj.IsDirty = true;
        }

        if (_rawSections.TryGetValue("Events", out var evLines))
        {
            for (var i = 0; i < evLines.Count; i++)
            {
                var line = evLines[i];
                var t = line.TrimStart();

                if (!t.StartsWith("2,") && !t.StartsWith("Break,", StringComparison.OrdinalIgnoreCase)) continue;
                var parts = line.Split(',');
                if (parts.Length < 3) continue;
                if (int.TryParse(parts[1].Trim(), out var start) && int.TryParse(parts[2].Trim(), out var end))
                    evLines[i] = $"{parts[0]},{start + deltaMs},{end + deltaMs}"
                        + (parts.Length > 3 ? "," + string.Join(",", parts[3..]) : "");
            }
            Breaks = ParseBreakLines(evLines);
        }

        if (_rawSections.TryGetValue("General", out var genLines))
        {
            for (var i = 0; i < genLines.Count; i++)
            {
                var line = genLines[i];
                var idx = line.IndexOf(':');
                if (idx < 0) continue;
                var key = line[..idx].Trim();
                if (!string.Equals(key, "PreviewTime", StringComparison.OrdinalIgnoreCase)) continue;
                if (!int.TryParse(line[(idx + 1)..].Trim(), out var previewTime) || previewTime < 0) continue;
                genLines[i] = $"{key}:{Math.Max(0, previewTime + deltaMs)}";
            }
            General = Sections.General.Parse(BuildKv(genLines));
        }

        for (var i = 0; i < Editor.Bookmarks.Count; i++)
            Editor.Bookmarks[i] += deltaMs;
    }
}
