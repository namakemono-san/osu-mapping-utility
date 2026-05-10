using MappingUtility.Checks.Framework;
using MappingUtility.Checks.Utils;
using MappingUtility.Parser.Objects;

namespace MappingUtility.Checks.Checks.Timing;

[Check]
public class CheckVolumeConsistency : BeatmapSetCheck
{
    private const int ThresholdPercent = 5;
    private const int MinDurationMs = 50;

    public override CheckMetadata GetMetadata() => new()
    {
        CheckId = "timing.volume_consistency",
        Category = "Timing",
        Message = "Volume differs significantly across difficulties.",
    };

    public override Dictionary<string, IssueTemplate> GetTemplates() => new()
    {
        ["Warning"] = new IssueTemplate(Issue.Level.Warning,
            "Volume mismatch at {0} – {1} ({2}%) vs others ({3}%)", "", "", "", ""),
    };

    public override IEnumerable<Issue> GetIssues(IReadOnlyList<Beatmap> beatmaps)
    {
        if (beatmaps.Count < 2) yield break;

        var lastTime = beatmaps
            .SelectMany(b => b.HitObjects)
            .Select(h => (double)h.Time)
            .DefaultIfEmpty(0)
            .Max();

        var boundaries = beatmaps
            .SelectMany(b => b.TimingLines)
            .Where(t => !t.Uninherited)
            .Select(t => t.Offset)
            .Append(0)
            .Append(lastTime + 1)
            .Distinct()
            .OrderBy(x => x)
            .ToList();

        Region? current = null;
        var regions = new List<Region>();

        for (var i = 0; i < boundaries.Count - 1; i++)
        {
            var start = boundaries[i];
            var end = boundaries[i + 1];
            if (end - start < MinDurationMs) continue;

            var vols = beatmaps
                .Select(b => (
                    Version: b.Metadata.Version ?? "",
                    Volume: b.TimingLines.Where(t => t.Offset <= start).LastOrDefault()?.Volume ?? 100
                ))
                .ToList();

            var minVol = vols.Min(v => v.Volume);
            var maxVol = vols.Max(v => v.Volume);
            if (maxVol - minVol < ThresholdPercent) continue;

            var (outlierVersion, isAbove, outlierVol, othersMin, othersMax) = GetOutlierInfo(vols);
            if (outlierVersion == null) continue;

            if (current != null && current.CanMerge(outlierVersion, isAbove, start))
            {
                current.Extend(end, outlierVol, othersMin, othersMax);
            }
            else
            {
                if (current != null) regions.Add(current);
                current = new Region(start, end, outlierVersion, isAbove,
                    outlierVol, othersMin, othersMax);
            }
        }

        if (current != null) regions.Add(current);

        foreach (var r in regions)
        {
            var range = $"{RcUtils.FormatMs(r.Start)} ~ {RcUtils.FormatMs(r.End)}";
            var outlierRange = r.OutlierMin == r.OutlierMax
                ? $"{r.OutlierMin}"
                : $"{r.OutlierMin}–{r.OutlierMax}";
            var othersRange = r.OthersMin == r.OthersMax
                ? $"~{r.OthersMin}"
                : $"~{r.OthersMin}–{r.OthersMax}";

            yield return new Issue(GetTemplate("Warning"), null,
                range, r.Outlier, outlierRange, othersRange);
        }
    }

    private static (string? Version, bool IsAbove, int OutlierVol, int OthersMin, int OthersMax)
        GetOutlierInfo(List<(string Version, int Volume)> vols)
    {
        if (vols.Count < 2) return (null, false, 0, 0, 0);

        var sorted = vols.OrderBy(v => v.Volume).ToList();
        var median = sorted[sorted.Count / 2].Volume;

        var outlier = vols.OrderByDescending(v => Math.Abs(v.Volume - median)).First();
        var isAbove = outlier.Volume > median;

        var others = vols.Where(v => v.Version != outlier.Version).ToList();
        return (outlier.Version, isAbove, outlier.Volume,
            others.Min(v => v.Volume), others.Max(v => v.Volume));
    }

    private sealed class Region(
        double start, double end, string outlier, bool isAbove,
        int outlierVol, int othersMin, int othersMax)
    {
        public double Start = start;
        public double End = end;
        public readonly string Outlier = outlier;
        public readonly bool IsAbove = isAbove;
        public int OutlierMin = outlierVol;
        public int OutlierMax = outlierVol;
        public int OthersMin = othersMin;
        public int OthersMax = othersMax;

        public bool CanMerge(string outlier, bool isAbove, double segStart) =>
            Outlier == outlier && IsAbove == isAbove && Math.Abs(End - segStart) < 1;

        public void Extend(double end, int outlierVol, int othersMin, int othersMax)
        {
            End = end;
            OutlierMin = Math.Min(OutlierMin, outlierVol);
            OutlierMax = Math.Max(OutlierMax, outlierVol);
            OthersMin = Math.Min(OthersMin, othersMin);
            OthersMax = Math.Max(OthersMax, othersMax);
        }
    }
}
