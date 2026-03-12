namespace MappingUtility.Parser.Checks;

public enum UnsnapLevel { Minor, Problem, AiModFalsePositive }

public record UnsnapResult(
    double Time,
    string ObjectType,
    double Unsnap,
    UnsnapLevel Level
);
