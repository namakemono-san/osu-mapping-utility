namespace MappingUtility.Parser.Settings;

public class GeneralSettings
{
    public string AudioFilename { get; set; } = "audio.mp3";
    public int AudioLeadIn { get; set; } = 0;
    public int PreviewTime { get; set; } = -1;
    public int Mode { get; set; } = 0;
    public float StackLeniency { get; set; } = 0.7f;
    public bool EpilepsyWarning { get; set; } = false;
    public string SampleSet { get; set; } = "Normal";
}
