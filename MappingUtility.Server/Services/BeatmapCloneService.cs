using MappingUtility.Parser;
using MappingUtility.Server.Models;
using MappingUtility.Server.Utilities;
using Microsoft.AspNetCore.SignalR;
using System.IO.Compression;
using System.Text;

namespace MappingUtility.Server.Services;

public static class BeatmapCloneService
{
    private static readonly HashSet<string> MediaExtensions = new(StringComparer.OrdinalIgnoreCase)
        { ".mp3", ".ogg", ".wav", ".jpg", ".jpeg", ".png", ".mp4", ".webm", ".avi", ".mkv" };

    private static readonly HashSet<string> ReservedNames = new(StringComparer.OrdinalIgnoreCase)
        { "con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5",
          "com6", "com7", "com8", "com9", "lpt1", "lpt2", "lpt3", "lpt4", "lpt5",
          "lpt6", "lpt7", "lpt8", "lpt9" };

    public static Task<string> CreateOszAsync(CloneRequest req)
    {
        if (!Directory.Exists(req.FolderPath))
            throw new HubException($"Beatmap folder not found: {req.FolderPath}");

        if (req.TemplateVersion.Contains('\\') || req.TemplateVersion.Contains('/'))
            throw new HubException("Invalid version string");

        var templatePath = BeatmapFiles.FindByVersion(req.FolderPath, req.TemplateVersion)
            ?? throw new HubException($"Template .osu not found for version: {req.TemplateVersion}");

        var templateContent = File.ReadAllText(templatePath, new UTF8Encoding(false));
        var beatmap = Beatmap.FromContent(templateContent);

        var audioFilename = beatmap.General.AudioFilename;
        if (string.IsNullOrEmpty(audioFilename))
            throw new HubException("AudioFilename not found in .osu");

        var audioRel = RequireExistingAsset(req.FolderPath, audioFilename, "audio");
        var bgFilename = OptionalAsset(req.FolderPath, beatmap.Background?.Filename, "background");
        var videoFilename = OptionalAsset(req.FolderPath, beatmap.Video?.Filename, "video");

        var audioNewName = "audio" + Path.GetExtension(audioRel).ToLowerInvariant();

        var newContent = ProcessOsuContent(
            templateContent, req.GameMode,
            req.Title, req.TitleUnicode, req.Artist, req.ArtistUnicode, req.Source, req.Tags,
            req.ResetTimingPoints, req.CopyPreviewTime, req.ResetDifficulty,
            audioNewName, bgFilename, videoFilename);

        var artistSan = Sanitize(req.Artist);
        var titleSan = Sanitize(req.Title);
        if (string.IsNullOrEmpty(artistSan)) artistSan = "Unknown";
        if (string.IsNullOrEmpty(titleSan)) titleSan = "Untitled";

        var outDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "osu-mapping-utility", "clone");
        Directory.CreateDirectory(outDir);

        var oszPath = NextAvailablePath(
            Path.Combine(outDir, $"beatmap-{DateTime.Now.Ticks}-{audioNewName}.osz"));
        var osuEntry = $"{artistSan} - {titleSan}.osu";

        var includeFiles = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { audioRel };
        if (!string.IsNullOrWhiteSpace(bgFilename)) includeFiles.Add(bgFilename);
        if (!string.IsNullOrWhiteSpace(videoFilename)) includeFiles.Add(videoFilename);

        if (!req.RemoveSkinFiles)
        {
            foreach (var f in Directory.EnumerateFiles(req.FolderPath))
                if (MediaExtensions.Contains(Path.GetExtension(f)))
                    includeFiles.Add(Path.GetFileName(f));
        }

        return Task.Run(() =>
        {
            using var fs = File.Create(oszPath);
            using var zip = new ZipArchive(fs, ZipArchiveMode.Create);

            var osuZipEntry = zip.CreateEntry(osuEntry, CompressionLevel.Optimal);
            using (var s = osuZipEntry.Open())
                s.Write(new UTF8Encoding(false).GetBytes(newContent));

            foreach (var rel in includeFiles)
            {
                var abs = Path.Combine(req.FolderPath, rel);
                if (!File.Exists(abs)) continue;
                var entryName = string.Equals(rel, audioRel, StringComparison.OrdinalIgnoreCase)
                    ? audioNewName
                    : rel.Replace('\\', '/');
                var e = zip.CreateEntry(entryName, CompressionLevel.Optimal);
                using var es = e.Open();
                using var fi = File.OpenRead(abs);
                fi.CopyTo(es);
            }

            return oszPath;
        });
    }

    private static string RequireExistingAsset(string folderPath, string filename, string label)
    {
        var rel = SafeRelPath(filename) ?? throw new HubException($"Invalid {label} filename");
        if (!File.Exists(Path.Combine(folderPath, rel)))
            throw new HubException($"{char.ToUpperInvariant(label[0])}{label[1..]} file not found: {rel}");
        return rel;
    }

    private static string? OptionalAsset(string folderPath, string? filename, string label)
    {
        if (string.IsNullOrWhiteSpace(filename)) return null;
        RequireExistingAsset(folderPath, filename, label);
        return filename;
    }

    private static string ProcessOsuContent(
        string content, int gameMode,
        string title, string titleUnicode, string artist, string artistUnicode, string source, string tags,
        bool resetTimingPoints, bool copyPreviewTime, bool resetDifficulty,
        string audioFilename, string? backgroundFile, string? videoFile)
    {
        var eol = content.Contains("\r\n") ? "\r\n" : "\n";
        var lines = content.Split([eol], StringSplitOptions.None);
        var output = new List<string>();

        var currentSection = "";
        var skipSection = false;
        var inEditorSection = false;
        var inTimingSection = false;
        var inEventsSection = false;
        var inHitObjects = false;
        var wrotePreviewTime = false;
        var timingLines = new List<string>();

        foreach (var line in lines)
        {
            var trimmed = line.Trim();

            if (trimmed.StartsWith('[') && trimmed.EndsWith(']'))
            {
                var leavingEvents = currentSection == "[Events]" && inEventsSection;
                var leavingTiming = currentSection == "[TimingPoints]" && inTimingSection;

                if (leavingEvents && (output.Count == 0 || output[^1].Length > 0))
                    output.Add("");

                if (leavingTiming && resetTimingPoints)
                {
                    output.AddRange(ResetTimingPoints(timingLines));
                    timingLines.Clear();
                }
                if (leavingTiming && (output.Count == 0 || output[^1].Length > 0))
                    output.Add("");

                currentSection = trimmed;
                skipSection = currentSection == "[Colours]";
                inEditorSection = currentSection == "[Editor]";
                inTimingSection = currentSection == "[TimingPoints]";
                inEventsSection = currentSection == "[Events]";
                inHitObjects = currentSection == "[HitObjects]";

                if (inTimingSection) timingLines.Clear();
                if (currentSection == "[General]") wrotePreviewTime = false;

                if (skipSection) continue;

                if (inEditorSection)
                {
                    output.Add(line);
                    output.Add("DistanceSpacing: 1");
                    output.Add("BeatDivisor: 4");
                    output.Add("GridSize: 32");
                    output.Add("TimelineZoom: 2");
                    continue;
                }
                output.Add(line);

                if (inEventsSection)
                {
                    output.Add("//Background and Video events");
                    if (!string.IsNullOrWhiteSpace(backgroundFile))
                        output.Add($"0,0,\"{backgroundFile}\",0,0");
                    if (!string.IsNullOrWhiteSpace(videoFile))
                        output.Add($"Video,0,\"{videoFile}\"");
                    output.Add("//Break Periods");
                    output.Add("//Storyboard Layer 0 (Background)");
                    output.Add("//Storyboard Layer 1 (Fail)");
                    output.Add("//Storyboard Layer 2 (Pass)");
                    output.Add("//Storyboard Layer 3 (Foreground)");
                    output.Add("//Storyboard Layer 4 (Overlay)");
                    output.Add("//Storyboard Sound Samples");
                }
                continue;
            }

            if (skipSection || inEditorSection || inEventsSection || inHitObjects) continue;

            if (inTimingSection && resetTimingPoints)
            {
                timingLines.Add(line);
                continue;
            }

            if (currentSection == "[General]")
            {
                if (trimmed.StartsWith("AudioFilename:")) { output.Add($"AudioFilename: {audioFilename}"); continue; }
                if (trimmed.StartsWith("Mode:")) { output.Add($"Mode: {gameMode}"); continue; }
                if (trimmed.StartsWith("PreviewTime:"))
                {
                    output.Add(copyPreviewTime ? line : "PreviewTime:-1");
                    wrotePreviewTime = true;
                    continue;
                }
                if (!copyPreviewTime && !wrotePreviewTime)
                {
                    output.Add("PreviewTime:-1");
                    wrotePreviewTime = true;
                }
                if (resetTimingPoints && trimmed.StartsWith("SampleSet:")) { output.Add("SampleSet: Normal"); continue; }
            }

            if (currentSection == "[Metadata]")
            {
                if (trimmed.StartsWith("Title:")) { output.Add($"Title:{title}"); continue; }
                if (trimmed.StartsWith("TitleUnicode:")) { output.Add($"TitleUnicode:{titleUnicode}"); continue; }
                if (trimmed.StartsWith("Artist:")) { output.Add($"Artist:{artist}"); continue; }
                if (trimmed.StartsWith("ArtistUnicode:")) { output.Add($"ArtistUnicode:{artistUnicode}"); continue; }
                if (trimmed.StartsWith("Creator:")) { output.Add("Creator:"); continue; }
                if (trimmed.StartsWith("Version:")) { output.Add("Version:"); continue; }
                if (trimmed.StartsWith("Source:")) { output.Add($"Source:{source}"); continue; }
                if (trimmed.StartsWith("Tags:")) { output.Add($"Tags:{tags}"); continue; }
                if (trimmed.StartsWith("BeatmapID:")) { output.Add("BeatmapID:0"); continue; }
                if (trimmed.StartsWith("BeatmapSetID:")) { output.Add("BeatmapSetID:-1"); continue; }
            }

            if (currentSection == "[Difficulty]" && resetDifficulty)
            {
                if (trimmed.StartsWith("HPDrainRate:")) { output.Add("HPDrainRate:5"); continue; }
                if (trimmed.StartsWith("CircleSize:")) { output.Add("CircleSize:5"); continue; }
                if (trimmed.StartsWith("OverallDifficulty:")) { output.Add("OverallDifficulty:5"); continue; }
                if (trimmed.StartsWith("ApproachRate:")) { output.Add("ApproachRate:5"); continue; }
                if (trimmed.StartsWith("SliderMultiplier:")) { output.Add("SliderMultiplier:1.4"); continue; }
                if (trimmed.StartsWith("SliderTickRate:")) { output.Add("SliderTickRate:1"); continue; }
            }

            output.Add(line);
        }

        if (currentSection == "[TimingPoints]" && inTimingSection && resetTimingPoints)
            output.AddRange(ResetTimingPoints(timingLines));

        return string.Join(eol, output);
    }

    private static List<string> ResetTimingPoints(IEnumerable<string> lines)
    {
        var result = new List<string>();

        foreach (var line in lines)
        {
            var t = line.Trim();
            if (string.IsNullOrEmpty(t) || t.StartsWith("//")) continue;

            var p = t.Split(',');
            if (p.Length < 8) continue;

            var uninherited = p[6].Trim();
            if (uninherited != "1") continue;

            var time = p[0].Trim();
            var beatLength = p[1].Trim();
            var meter = p[2].Trim();

            result.Add($"{time},{beatLength},{meter},1,0,100,{uninherited},0");
        }

        return result;
    }

    private static string Sanitize(string input)
    {
        const string forbidden = "<>:\"/\\|?*";
        var s = new string(input.Where(c => !char.IsControl(c) && !forbidden.Contains(c)).ToArray());
        s = s.TrimEnd(' ', '.');
        s = string.Join(" ", s.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries)).Trim();
        if (string.IsNullOrEmpty(s)) return "";
        if (ReservedNames.Contains(s.TrimEnd('.', ' '))) s = "_" + s;
        return s.TrimEnd(' ', '.');
    }

    private static string? SafeRelPath(string? rel)
    {
        if (string.IsNullOrWhiteSpace(rel)) return null;
        rel = rel.Trim();
        if (Path.IsPathRooted(rel)) return null;
        foreach (var part in rel.Replace('\\', '/').Split('/'))
            if (part == "..") return null;
        return rel;
    }

    private static string NextAvailablePath(string path)
    {
        if (!File.Exists(path)) return path;
        var dir = Path.GetDirectoryName(path) ?? "";
        var stem = Path.GetFileNameWithoutExtension(path);
        var ext = Path.GetExtension(path);
        for (var i = 1; i <= 9999; i++)
        {
            var candidate = Path.Combine(dir, $"{stem} ({i}){ext}");
            if (!File.Exists(candidate)) return candidate;
        }
        return path;
    }
}
