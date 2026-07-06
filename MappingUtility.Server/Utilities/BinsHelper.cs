namespace MappingUtility.Server.Utilities;

public static class BinsHelper
{
    public static string BasePath =>
        Environment.GetEnvironmentVariable("BINS_PATH")
        ?? Path.Combine(AppContext.BaseDirectory, "bin");

    public static string Ffmpeg   => Path.Combine(BasePath, "ffmpeg.exe");
    public static string Ffprobe  => Path.Combine(BasePath, "ffprobe.exe");
    public static string YtDlp    => Path.Combine(BasePath, "yt-dlp.exe");
    public static string Deno     => Path.Combine(BasePath, "deno.exe");
    public static string Waifu2xDir => Path.Combine(BasePath, "waifu2x");
    public static string Waifu2x  => Path.Combine(BasePath, "waifu2x", "waifu2x-ncnn-vulkan.exe");
}
