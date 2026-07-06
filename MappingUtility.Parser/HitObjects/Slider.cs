using System.Globalization;
using MappingUtility.Parser.Primitives;

namespace MappingUtility.Parser.HitObjects;

public enum CurveType { Bezier, CentripetalCatmullRom, Linear, PerfectCircle }

public readonly record struct CurvePoint(int X, int Y);

public sealed class Slider : HitObject
{
    public CurveType CurveType { get; init; }
    public List<CurvePoint> CurvePoints { get; set; } = [];
    public int Slides { get; init; } = 1;
    public double Length { get; init; }
    public List<HitSound> EdgeSounds { get; set; } = [];
    public List<HitSample> EdgeSamples { get; set; } = [];

    public override string Serialize()
    {
        var curveChar = CurveType switch
        {
            CurveType.CentripetalCatmullRom => 'C',
            CurveType.Linear                => 'L',
            CurveType.PerfectCircle         => 'P',
            _                               => 'B',
        };
        var curveStr     = curveChar + string.Concat(CurvePoints.Skip(1).Select(p => $"|{p.X}:{p.Y}"));
        var edgeSoundsStr  = string.Join("|", EdgeSounds.Select(s => (int)s));
        var edgeSamplesStr = string.Join("|", EdgeSamples.Select(s => s.Serialize()));
        var lengthStr    = Length.ToString("G", CultureInfo.InvariantCulture);
        return $"{Header},{curveStr},{Slides},{lengthStr},{edgeSoundsStr},{edgeSamplesStr},{HitSample.Serialize()}";
    }

    internal static Slider ParseSlider(int x, int y, int time, HitObjectType type, HitSound hitSound, string[] p)
    {
        var curveType   = CurveType.Bezier;
        var curvePoints = new List<CurvePoint>();
        curvePoints.Add(new CurvePoint(x, y));

        if (p.Length > 5)
        {
            var curveParts = p[5].Split('|');
            if (curveParts.Length > 0)
            {
                curveType = curveParts[0].Trim() switch
                {
                    "B" => CurveType.Bezier,
                    "C" => CurveType.CentripetalCatmullRom,
                    "L" => CurveType.Linear,
                    "P" => CurveType.PerfectCircle,
                    _   => CurveType.Bezier,
                };
                for (var i = 1; i < curveParts.Length; i++)
                {
                    var coords = curveParts[i].Split(':');
                    if (coords.Length == 2 && int.TryParse(coords[0], out var cx) && int.TryParse(coords[1], out var cy))
                        curvePoints.Add(new CurvePoint(cx, cy));
                }
            }
        }

        var slides = p.Length > 6 && int.TryParse(p[6], out var sl) ? sl : 1;
        var length = p.Length > 7 && double.TryParse(p[7], NumberStyles.Float, CultureInfo.InvariantCulture, out var len) ? len : 0.0;

        var edgeSounds  = new List<HitSound>();
        var edgeSamples = new List<HitSample>();

        if (p.Length > 8 && !string.IsNullOrEmpty(p[8]))
        {
            edgeSounds.AddRange(p[8].Split('|')
                .Select(s => int.TryParse(s, out var v) ? (HitSound)v : HitSound.None));
        }

        if (p.Length > 9 && !string.IsNullOrEmpty(p[9]))
        {
            edgeSamples.AddRange(p[9].Split('|').Select(HitSample.Parse));
        }

        var sample = p.Length > 10 ? HitSample.Parse(p[10]) : HitSample.Default;

        return new Slider
        {
            X           = x,
            Y           = y,
            Time        = time,
            Type        = type,
            HitSound    = hitSound,
            HitSample   = sample,
            CurveType   = curveType,
            CurvePoints = curvePoints,
            Slides      = slides,
            Length      = length,
            EdgeSounds  = edgeSounds,
            EdgeSamples = edgeSamples,
        };
    }
}
