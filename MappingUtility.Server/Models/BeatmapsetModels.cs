namespace MappingUtility.Server.Models;

public record BeatmapsetInfo(
    int Id,
    string Title,
    string Artist,
    string Creator,
    string FolderPath,
    string? BackgroundFile,
    IReadOnlyList<DifficultyInfo> Difficulties,
    int Mode
);

public record DifficultyInfo(string Version, int Mode);

public record MetadataUpdateDto(
    string Title,
    string TitleUnicode,
    string Artist,
    string ArtistUnicode,
    string Source,
    string Tags,
    DiffBackgroundDto[]? Backgrounds
);

public record DiffBackgroundDto(
    string Version,
    string Filename,
    int OffsetX,
    int OffsetY
);

public record CloneRequest(
    string FolderPath,
    string TemplateVersion,
    int GameMode,
    string Title,
    string TitleUnicode,
    string Artist,
    string ArtistUnicode,
    string Source,
    string Tags,
    bool ResetTimingPoints,
    bool RemoveSkinFiles,
    bool CopyPreviewTime,
    bool ResetDifficulty
);
