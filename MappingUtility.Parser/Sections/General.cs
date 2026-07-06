using MappingUtility.Parser.Internal;
using MappingUtility.Parser.Primitives;

namespace MappingUtility.Parser.Sections;

public enum Countdown       { None = 0, Normal = 1, Half = 2, Double = 3 }
public enum OverlayPosition { NoChange, Below, Above }

public sealed class General
{
    public string AudioFilename { get; init; } = "";
    public int AudioLeadIn { get; init; }
    public int PreviewTime { get; init; } = -1;
    public Countdown Countdown { get; init; } = Countdown.Normal;
    public SampleSet SampleSet { get; init; } = SampleSet.Normal;
    public float StackLeniency { get; init; } = 0.7f;
    public GameMode Mode { get; init; }
    public bool LetterboxInBreaks { get; init; }
    public bool UseSkinSprites { get; init; }
    public OverlayPosition OverlayPosition { get; init; }
    public string? SkinPreference { get; init; }
    public bool EpilepsyWarning { get; init; }
    public int CountdownOffset { get; init; }
    public bool SpecialStyle { get; init; }
    public bool WidescreenStoryboard { get; init; }
    public bool SamplesMatchPlaybackRate { get; init; }

    [Obsolete("AudioHash is deprecated in the osu! file format.")]
    public string? AudioHash { get; init; }

    [Obsolete("StoryFireInFront is deprecated in the osu! file format.")]
    public bool StoryFireInFront { get; init; } = true;

    [Obsolete("AlwaysShowPlayfield is deprecated in the osu! file format.")]
    public bool AlwaysShowPlayfield { get; init; }

    internal static General Parse(Dictionary<string, string> kv)
    {
#pragma warning disable CS0618
        return new General
        {
            AudioFilename          = kv.GetValueOrDefault("AudioFilename", ""),
            AudioLeadIn            = kv.TryGetInt("AudioLeadIn"),
            PreviewTime            = kv.TryGetInt("PreviewTime", -1),
            Countdown              = (Countdown)kv.TryGetInt("Countdown", 1),
            SampleSet              = kv.GetValueOrDefault("SampleSet", "Normal") switch
                                     { "Soft" => SampleSet.Soft, "Drum" => SampleSet.Drum, _ => SampleSet.Normal },
            StackLeniency          = kv.TryGetFloat("StackLeniency", 0.7f),
            Mode                   = (GameMode)kv.TryGetInt("Mode"),
            LetterboxInBreaks      = kv.TryGetBool("LetterboxInBreaks"),
            UseSkinSprites         = kv.TryGetBool("UseSkinSprites"),
            OverlayPosition        = kv.GetValueOrDefault("OverlayPosition", "NoChange") switch
                                     { "Below" => OverlayPosition.Below, "Above" => OverlayPosition.Above, _ => OverlayPosition.NoChange },
            SkinPreference         = kv.GetValueOrDefault("SkinPreference"),
            EpilepsyWarning        = kv.TryGetBool("EpilepsyWarning"),
            CountdownOffset        = kv.TryGetInt("CountdownOffset"),
            SpecialStyle           = kv.TryGetBool("SpecialStyle"),
            WidescreenStoryboard   = kv.TryGetBool("WidescreenStoryboard"),
            SamplesMatchPlaybackRate = kv.TryGetBool("SamplesMatchPlaybackRate"),
            AudioHash              = kv.GetValueOrDefault("AudioHash"),
            StoryFireInFront       = kv.TryGetBool("StoryFireInFront", true),
            AlwaysShowPlayfield    = kv.TryGetBool("AlwaysShowPlayfield"),
        };
#pragma warning restore CS0618
    }
}
