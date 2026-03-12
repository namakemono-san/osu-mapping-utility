namespace MappingUtility.Parser.Objects.HitObjects;

public class Slider : HitObject
{
    public string SliderType { get; set; } = "L";
    public int Slides { get; set; } = 1;
    public double Length { get; set; } = 100.0;
}
