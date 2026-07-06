using MappingUtility.Parser.HitObjects;
using MappingUtility.Parser.Primitives;
using MappingUtility.Parser.TimingPoints;

namespace MappingUtility.Parser.Transforms;

public static class Transforms
{
    public static void Apply(string id, Beatmap beatmap)
    {
        switch (id)
        {
            case "center":         Center(beatmap);         break;
            case "rm_bookmarks":   RemoveBookmarks(beatmap); break;
            case "rm_new_combo":   RemoveNewCombos(beatmap); break;
            case "whistle_to_clap": WhistleToClap(beatmap); break;
            case "fix_unsnaps":       FixUnsnaps(beatmap);       break;
            case "add_new_combo":     AddNewCombos(beatmap);     break;
            case "reset_hit_samples": ResetHitSamples(beatmap);  break;
            default: throw new ArgumentException($"Unknown transform: {id}");
        }
    }

    public static void ShiftOffset(Beatmap b, int deltaMs) => b.ShiftTiming(deltaMs);

    public static void Center(Beatmap b)
    {
        foreach (var obj in b.HitObjects)
        {
            var dx = 256 - obj.X;
            var dy = 192 - obj.Y;
            if (dx == 0 && dy == 0) continue;

            obj.X = 256;
            obj.Y = 192;

            if (obj is Slider slider)
            {
                for (var i = 0; i < slider.CurvePoints.Count; i++)
                {
                    var cp = slider.CurvePoints[i];
                    slider.CurvePoints[i] = new CurvePoint(cp.X + dx, cp.Y + dy);
                }
            }

            obj.IsDirty = true;
        }
    }

    public static void RemoveBookmarks(Beatmap b)
        => b.Editor.Bookmarks.Clear();

    public static void RemoveNewCombos(Beatmap b)
    {
        const HitObjectType comboMask = HitObjectType.NewCombo
            | HitObjectType.ComboSkip1 | HitObjectType.ComboSkip2 | HitObjectType.ComboSkip3;

        for (var i = 1; i < b.HitObjects.Count; i++)
        {
            var obj = b.HitObjects[i];
            if ((obj.Type & comboMask) != 0)
            {
                obj.Type    &= ~comboMask;
                obj.IsDirty  = true;
            }
        }
    }

    public static void AddNewCombos(Beatmap b)
    {
        foreach (var obj in b.HitObjects)
        {
            if ((obj.Type & HitObjectType.NewCombo) == 0)
            {
                obj.Type    |= HitObjectType.NewCombo;
                obj.IsDirty  = true;
            }
        }
    }

    public static void WhistleToClap(Beatmap b)
    {
        foreach (var obj in b.HitObjects)
        {
            var changed = false;

            if ((obj.HitSound & HitSound.Whistle) != 0)
            {
                obj.HitSound = (obj.HitSound & ~HitSound.Whistle) | HitSound.Clap;
                changed = true;
            }

            if (obj is Slider slider)
            {
                for (var i = 0; i < slider.EdgeSounds.Count; i++)
                {
                    if ((slider.EdgeSounds[i] & HitSound.Whistle) != 0)
                    {
                        slider.EdgeSounds[i] = (slider.EdgeSounds[i] & ~HitSound.Whistle) | HitSound.Clap;
                        changed = true;
                    }
                }
            }

            if (changed) obj.IsDirty = true;
        }
    }

    public static void FixUnsnaps(Beatmap b)
    {
        var uninheritedPoints = b.TimingPoints.OfType<UninheritedPoint>().ToList();

        foreach (var obj in b.HitObjects)
        {
            var snappedTime = SnapTime(obj.Time, uninheritedPoints);
            if (snappedTime != obj.Time)
            {
                obj.Time    = snappedTime;
                obj.IsDirty = true;
            }

            if (obj is Spinner spinner)
            {
                var snappedEnd = SnapTime(spinner.EndTime, uninheritedPoints);
                if (snappedEnd != spinner.EndTime)
                {
                    spinner.EndTime = snappedEnd;
                    spinner.IsDirty = true;
                }
            }
            else if (obj is HoldNote holdNote)
            {
                var snappedEnd = SnapTime(holdNote.EndTime, uninheritedPoints);
                if (snappedEnd != holdNote.EndTime)
                {
                    holdNote.EndTime = snappedEnd;
                    holdNote.IsDirty = true;
                }
            }
        }
    }

    public static void ResetHitSamples(Beatmap b)
    {
        foreach (var obj in b.HitObjects)
        {
            obj.HitSample = HitSample.Default;

            if (obj is Slider slider)
            {
                for (var i = 0; i < slider.EdgeSamples.Count; i++)
                    slider.EdgeSamples[i] = HitSample.Default;
            }

            obj.IsDirty = true;
        }
    }

    private static readonly int[] SnapDivisors = [5, 7, 9, 12, 16];

    private static double GetTheoreticalUnsnap(double time, int divisor, UninheritedPoint line)
    {
        var msOffset      = time - line.Time;
        var division      = msOffset / line.BeatLength;
        var fraction      = division - Math.Floor(division);
        var desired       = Math.Round(fraction * divisor) / divisor;
        return (fraction - desired) * line.BeatLength;
    }

    private static double GetPracticalUnsnap(double time, int divisor, UninheritedPoint line)
        => time - (int)(time - GetTheoreticalUnsnap(time, divisor, line));

    private static int SnapTime(int time, IReadOnlyList<UninheritedPoint> uninheritedPoints)
    {
        UninheritedPoint? active = null;
        for (var i = uninheritedPoints.Count - 1; i >= 0; i--)
        {
            if (uninheritedPoints[i].Time <= time)
            {
                active = uninheritedPoints[i];
                break;
            }
        }
        active ??= uninheritedPoints.Count > 0 ? uninheritedPoints[0] : null;

        if (active == null) return time;

        var bestDivisor = SnapDivisors.MinBy(d => Math.Abs(GetPracticalUnsnap(time, d, active)));

        return (int)(time - GetTheoreticalUnsnap(time, bestDivisor, active));
    }
}
