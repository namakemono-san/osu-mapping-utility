using System.Collections.Concurrent;
using System.Diagnostics;
using System.Net.Http;
using System.Text.RegularExpressions;
using MappingUtility.Server.Utilities;
using Microsoft.AspNetCore.SignalR;

namespace MappingUtility.Server.Hubs;

public record MediaDownloadRequest(
    string Url,
    string OutDir,
    bool AudioEnabled,
    string AudioFormat,
    bool VideoEnabled,
    string VideoMode
);

public record ImageDownloadRequest(
    string Input,
    string OutDir,
    bool UseWaifu2x
);

public class DownloaderHub : Hub
{
    private static readonly ConcurrentDictionary<Guid, (string ConnectionId, CancellationTokenSource Cts)> _running = new();

    private Func<string, string, Task> Progress =>
        (tag, msg) => Clients.Caller.SendAsync("DownloadProgress", tag, msg);

    public async Task StartMediaDownload(MediaDownloadRequest request)
    {
        var opId = Guid.NewGuid();
        var cts = new CancellationTokenSource();
        _running[opId] = (Context.ConnectionId, cts);
        try
        {
            await DownloaderCore.DownloadMediaAsync(request, Progress, cts.Token);
        }
        catch (OperationCanceledException)
        {
            await Clients.Caller.SendAsync("DownloadProgress", "[cancelled]", "");
        }
        catch (Exception ex)
        {
            await Clients.Caller.SendAsync("DownloadProgress", "[error]", ex.Message);
        }
        finally
        {
            _running.TryRemove(opId, out _);
            cts.Dispose();
        }
    }

    public async Task StartImageDownload(ImageDownloadRequest request)
    {
        var opId = Guid.NewGuid();
        var cts = new CancellationTokenSource();
        _running[opId] = (Context.ConnectionId, cts);
        try
        {
            await DownloaderCore.ProcessImageAsync(request, Progress, cts.Token);
        }
        catch (OperationCanceledException)
        {
            await Clients.Caller.SendAsync("DownloadProgress", "[cancelled]", "");
        }
        catch (Exception ex)
        {
            await Clients.Caller.SendAsync("DownloadProgress", "[error]", ex.Message);
        }
        finally
        {
            _running.TryRemove(opId, out _);
            cts.Dispose();
        }
    }

    public void CancelDownload()
    {
        foreach (var (_, entry) in _running)
            if (entry.ConnectionId == Context.ConnectionId)
                entry.Cts.Cancel();
    }

    public override Task OnDisconnectedAsync(Exception? exception)
    {
        foreach (var (_, entry) in _running)
            if (entry.ConnectionId == Context.ConnectionId)
                entry.Cts.Cancel();
        return base.OnDisconnectedAsync(exception);
    }
}

internal static class DownloaderCore
{
    private static readonly HttpClient Http = new();

    private static readonly string CacheBase = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "osu-mapping-utility", "caches");

    private static string Quote(string s) =>
        s.Any(c => char.IsWhiteSpace(c) || c == '"' || c == '\'' || c == '\\')
            ? "\"" + s.Replace("\"", "\\\"") + "\""
            : s;

    private static readonly IReadOnlyDictionary<string, string> YtDlpEnv =
        new Dictionary<string, string> { ["PYTHONUNBUFFERED"] = "1" };

    public static async Task DownloadMediaAsync(
        MediaDownloadRequest req,
        Func<string, string, Task> progress,
        CancellationToken ct)
    {
        var tasks = new List<Task>();

        if (req.AudioEnabled)
            tasks.Add(DownloadAudioAsync(req, progress, ct));
        else
            await progress("[audio][skip]", "audio download disabled");

        if (req.VideoEnabled)
            tasks.Add(DownloadVideoAsync(req, progress, ct));

        await Task.WhenAll(tasks);
    }

    private static async Task DownloadAudioAsync(
        MediaDownloadRequest req,
        Func<string, string, Task> progress,
        CancellationToken ct)
    {
        var cacheDir = GetCacheDir("downloads");

        var ytArgs = new List<string>
        {
            "--js-runtimes", "deno",
            "--newline", "--no-color", "--encoding", "utf-8",
            "-f", "bestaudio[video=none]/bestaudio",
            "-S", "acodec:opus,abr",
            "--no-playlist", "--windows-filenames", "--trim-filenames", "200",
            "--path", cacheDir,
            "--output", "%(title)s-audio-src.%(ext)s",
            "--print", "after_move:filepath",
            req.Url
        };

        await progress("[audio][spawn]", "sidecar:yt-dlp " + string.Join(" ", ytArgs.Select(Quote)));

        var (exitCode, srcPath) = await RunYtDlpAsync(ytArgs, progress, "[audio]", l => l.Contains("-audio-src."), ct);
        await progress("[audio][yt-dlp-done]", $"code={exitCode}");

        if (exitCode != 0)
        {
            await progress("[audio][fail]", $"yt-dlp failed: code={exitCode}");
            return;
        }

        if (srcPath is null || !File.Exists(srcPath))
        {
            await progress("[audio][fail]", "could not detect downloaded audio path");
            return;
        }

        await ConvertAudioAsync(srcPath, req.OutDir, req.AudioFormat, progress, ct);
    }

    private static async Task ConvertAudioAsync(
        string srcPath,
        string outDir,
        string audioFormat,
        Func<string, string, Task> progress,
        CancellationToken ct)
    {
        await progress("[audio][probe]", "analyzing source (duration, sample_rate, avg bitrate, cutoff)...");

        double durationSeconds;
        {
            var (code, stdout, stderr) = await ProcessRunner.RunCaptureAsync(BinsHelper.Ffprobe, new[]
            {
                "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=nk=1:nw=1",
                srcPath
            }, ct);

            if (code != 0)
            {
                await progress("[audio][probe-error]", $"ffprobe(duration) failed: code={code}, err={stderr.Trim()}");
                await progress("[audio][fail]", $"ffprobe(duration) failed: code={code}");
                return;
            }

            if (!double.TryParse(stdout.Trim(), System.Globalization.NumberStyles.Any,
                    System.Globalization.CultureInfo.InvariantCulture, out durationSeconds)
                || durationSeconds <= 0.0)
            {
                await progress("[audio][fail]", $"invalid duration: {durationSeconds}");
                return;
            }
        }

        int sampleRateHz;
        {
            var (code, stdout, stderr) = await ProcessRunner.RunCaptureAsync(BinsHelper.Ffprobe, new[]
            {
                "-v", "error",
                "-select_streams", "a:0",
                "-show_entries", "stream=sample_rate",
                "-of", "default=nk=1:nw=1",
                srcPath
            }, ct);

            if (code != 0)
            {
                await progress("[audio][probe-error]", $"ffprobe(sample_rate) failed: code={code}, err={stderr.Trim()}");
                await progress("[audio][fail]", "could not detect sample rate (cannot guarantee no upsampling)");
                return;
            }

            var t = stdout.Trim();
            if (string.IsNullOrEmpty(t) || t.Equals("n/a", StringComparison.OrdinalIgnoreCase))
            {
                await progress("[audio][fail]", "could not detect sample rate (cannot guarantee no upsampling)");
                return;
            }

            if (!int.TryParse(t, out sampleRateHz))
            {
                await progress("[audio][fail]", $"failed to parse sample_rate '{t}'");
                return;
            }
        }

        var fileSizeBytes = new FileInfo(srcPath).Length;
        var sourceAvgKbps = fileSizeBytes * 8.0 / durationSeconds / 1000.0;
        var targetSampleRate = Math.Min(sampleRateHz, 44100);
        var maxBitrateKbps = audioFormat == "ogg" ? 208 : 192;

        await progress("[audio][probe]", "estimating cutoff (fft)...");

        var pcmArgs = new[]
        {
            "-v", "error",
            "-t", "30",
            "-i", srcPath,
            "-vn", "-ac", "1",
            "-ar", targetSampleRate.ToString(),
            "-f", "f32le",
            "pipe:1"
        };
        await progress("[audio][probe]", "sidecar:ffmpeg " + string.Join(" ", pcmArgs.Select(Quote)));

        float[]? samples = null;
        try { samples = await ProcessRunner.RunPcmPipeAsync(BinsHelper.Ffmpeg, pcmArgs, ct); }
        catch (Exception ex) { await progress("[audio][probe-error]", $"pcm extraction failed: {ex.Message}"); }

        double? cutoffHz = null;
        if (samples is { Length: >= 2048 })
            cutoffHz = SpectralAnalysis.EstimateCutoffHz(samples, targetSampleRate);

        await progress("[audio][probe]",
            $"source_avg={sourceAvgKbps:F2}k, sr={sampleRateHz}Hz, target_sr={targetSampleRate}Hz");

        int targetBitrate;
        if (cutoffHz.HasValue)
        {
            var classified = ClassifyTargetBitrateKbps(cutoffHz.Value);
            targetBitrate = classified == int.MaxValue ? maxBitrateKbps : Math.Min(classified, maxBitrateKbps);
            await progress("[audio][probe]",
                $"cutoff≈{cutoffHz.Value / 1000.0:F1}kHz => target={targetBitrate}k (format_max={maxBitrateKbps}k)");
        }
        else
        {
            targetBitrate = maxBitrateKbps;
            await progress("[audio][probe]",
                $"cutoff=unknown => target={targetBitrate}k (format_max={maxBitrateKbps}k)");
        }

        await progress("[audio][convert]", $"target bitrate: {targetBitrate}k");

        var stem = Path.GetFileNameWithoutExtension(srcPath).Replace("-audio-src", "-audio");
        var ext = audioFormat == "ogg" ? "ogg" : "mp3";
        var codec = audioFormat == "ogg" ? "libvorbis" : "libmp3lame";
        var outPath = Path.Combine(outDir, $"{stem}.{ext}");

        Directory.CreateDirectory(outDir);

        var convertArgs = new[]
        {
            "-y", "-i", srcPath,
            "-vn", "-ar", targetSampleRate.ToString(),
            "-c:a", codec,
            "-b:a", $"{targetBitrate}k",
            outPath
        };
        await progress("[audio][convert]", "sidecar:ffmpeg " + string.Join(" ", convertArgs.Select(Quote)));

        var convertExit = await ProcessRunner.RunStreamedAsync(
            BinsHelper.Ffmpeg, convertArgs,
            _ => { },
            line => { if (!string.IsNullOrWhiteSpace(line)) _ = progress("[audio][ffmpeg]", line); },
            ct);

        if (convertExit == 0)
        {
            await progress("[audio][done]", $"code=0, output={outPath}");
            try { File.Delete(srcPath); } catch { }
        }
        else
        {
            await progress("[audio][fail]", $"ffmpeg failed: code={convertExit}, output={outPath}");
        }
    }

    private static async Task DownloadVideoAsync(
        MediaDownloadRequest req,
        Func<string, string, Task> progress,
        CancellationToken ct)
    {
        var isTaiko = req.VideoMode == "taiko";
        var dlDir = isTaiko ? GetCacheDir("downloads") : req.OutDir;
        Directory.CreateDirectory(dlDir);

        var ytArgs = new List<string>
        {
            "--js-runtimes", "deno",
            "--newline", "--no-color", "--encoding", "utf-8",
            "--no-playlist", "--windows-filenames", "--trim-filenames", "200",
            "-f", "bestvideo[ext=mp4]/bestvideo",
            "--path", dlDir,
            "--output", "%(title)s-background.%(ext)s",
            "--print", "after_move:filepath",
            req.Url
        };

        await progress("[video][spawn]", "sidecar:yt-dlp " + string.Join(" ", ytArgs.Select(Quote)));

        var (exitCode, dlPath) = await RunYtDlpAsync(ytArgs, progress, "[video]", l => l.Contains("-background."), ct);

        if (exitCode != 0)
        {
            await progress("[video][fail]", $"yt-dlp failed: code={exitCode}");
            await progress("[video][done]", "");
            return;
        }

        if (isTaiko && dlPath is not null && File.Exists(dlPath))
        {
            await ConvertTaikoVideoAsync(dlPath, req.OutDir, progress, ct);
        }
        else if (isTaiko)
        {
            await progress("[taiko][skip]", "could not detect downloaded video path");
        }

        await progress("[video][done]", "");
    }

    private static async Task ConvertTaikoVideoAsync(
        string srcPath,
        string outDir,
        Func<string, string, Task> progress,
        CancellationToken ct)
    {
        var stem = Path.GetFileNameWithoutExtension(srcPath);
        var baseName = stem.EndsWith("-background") ? stem : stem + "-background";
        var outPath = Path.Combine(outDir, baseName + ".mp4");

        await progress("[taiko][spawn]", $"sidecar:ffmpeg -i {Quote(srcPath)} -> {Quote(outPath)}");

        var blankPng = await EnsureBlankPngAsync(ct);

        const string filter =
            "[0]split=3[blur][scale][output];" +
            "[output]scale=1280:720[output];" +
            "[scale]scale=-1:340[scale];" +
            "[blur]scale=1280:-1,boxblur=10,crop=1280:340[blur];" +
            "[output][1]overlay=0:0[output];" +
            "[output][blur]overlay=0:387[output];" +
            "[output][scale]overlay=(W-w)/2:387[output]";

        var ffmpegArgs = new[]
        {
            "-y", "-i", srcPath, "-i", blankPng,
            "-filter_complex", filter,
            "-map", "[output]",
            "-aspect", "1280:720",
            "-b:v", "800K",
            outPath
        };

        var taikoExit = await ProcessRunner.RunStreamedAsync(
            BinsHelper.Ffmpeg, ffmpegArgs,
            line => { _ = progress("[taiko][out]", line); },
            line => { _ = progress("[taiko][ffmpeg]", line); },
            ct);

        await progress("[taiko][done]", $"code={taikoExit}, output={outPath}");

        if (taikoExit == 0)
            try { File.Delete(srcPath); } catch { }
    }

    public static async Task ProcessImageAsync(
        ImageDownloadRequest req,
        Func<string, string, Task> progress,
        CancellationToken ct)
    {
        var cacheDir = GetCacheDir("thumbnails");
        Directory.CreateDirectory(req.OutDir);

        string identifier;
        string rawPath;

        if (File.Exists(req.Input))
        {
            identifier = Path.GetFileNameWithoutExtension(req.Input);
            rawPath = Path.Combine(cacheDir, $"{identifier}_raw{Path.GetExtension(req.Input)}");
            File.Copy(req.Input, rawPath, overwrite: true);
            await progress("[image][info]", $"Using local file: {req.Input}");
        }
        else
        {
            var ytId = ExtractYouTubeId(req.Input);
            if (ytId is not null)
            {
                identifier = ytId;
                rawPath = Path.Combine(cacheDir, $"{identifier}_raw.jpg");
                await progress("[image][info]", $"Fetching YouTube thumbnail: {ytId}");

                bool fetched = false;
                foreach (var quality in new[] { "maxresdefault", "hqdefault" })
                {
                    try
                    {
                        var thumbUrl = $"https://img.youtube.com/vi/{ytId}/{quality}.jpg";
                        await DownloadFileAsync(thumbUrl, rawPath, ct);
                        if (new FileInfo(rawPath).Length > 1000) { fetched = true; break; }
                    }
                    catch { }
                }
                if (!fetched) throw new Exception("Failed to fetch YouTube thumbnail");
            }
            else if (req.Input.StartsWith("http", StringComparison.OrdinalIgnoreCase))
            {
                identifier = "url";
                var ext = Path.HasExtension(req.Input.Split('?')[0])
                    ? Path.GetExtension(req.Input.Split('?')[0]) : ".jpg";
                rawPath = Path.Combine(cacheDir, $"{identifier}_raw{ext}");
                await progress("[image][info]", $"Downloading: {req.Input}");
                await DownloadFileAsync(req.Input, rawPath, ct);
            }
            else
            {
                throw new Exception("Invalid input: expected a file path, YouTube URL, or image URL");
            }
        }

        string processPath = rawPath;

        if (req.UseWaifu2x && File.Exists(BinsHelper.Waifu2x))
        {
            var upscaledPath = Path.Combine(cacheDir, $"{identifier}_upscaled.png");
            await progress("[image][info]", "Running waifu2x upscale...");
            await ProcessRunner.RunStreamedAsync(BinsHelper.Waifu2x, new[]
            {
                "-i", rawPath, "-o", upscaledPath, "-n", "2", "-s", "2"
            },
            _ => { },
            line => { _ = progress("[image][waifu2x]", line); },
            ct, BinsHelper.Waifu2xDir);
            if (File.Exists(upscaledPath))
                processPath = upscaledPath;
        }

        await progress("[image][info]", "Resizing to thumbnail...");
        var outPath = Path.Combine(req.OutDir, $"{identifier}-thumbnail.jpg");
        var ok = await EnsureUnderSizeAsync(processPath, outPath,
            msg => progress("[image][info]", msg), ct);

        if (!ok) throw new Exception("Failed to create thumbnail within 2.5 MB");

        if (processPath != rawPath) try { File.Delete(processPath); } catch { }
        try { File.Delete(rawPath); } catch { }

        await progress("[image][done]", $"Output: {outPath}");
    }

    private static string GetCacheDir(string sub)
    {
        var dir = Path.Combine(CacheBase, sub);
        Directory.CreateDirectory(dir);
        return dir;
    }

    private static string? ExtractYouTubeId(string url)
    {
        var m = Regex.Match(url, @"(?:youtu\.be/|youtube\.com/.*[?&]v=)([^&\s]+)");
        return m.Success ? m.Groups[1].Value : null;
    }

    private static int ClassifyTargetBitrateKbps(double cutoffHz)
    {
        if (cutoffHz <= 16_500.0) return 128;
        if (cutoffHz <= 18_000.0) return 160;
        return int.MaxValue;
    }

    private static readonly int[] ResWidths = [1920, 1600, 1280, 960, 854];
    private static readonly int[] ResHeights = [1080, 900, 720, 540, 480];
    private static readonly int[] JpegQualities = [3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31];
    private const long MaxThumbnailBytes = 2_621_440;

    private static async Task<bool> EnsureUnderSizeAsync(
        string inputPath, string outputPath,
        Func<string, Task> report, CancellationToken ct)
    {
        for (int r = 0; r < ResWidths.Length; r++)
        {
            foreach (var q in JpegQualities)
            {
                var exit = await ProcessRunner.RunStreamedAsync(BinsHelper.Ffmpeg, new[]
                {
                    "-y", "-i", inputPath,
                    "-vf", $"scale={ResWidths[r]}:{ResHeights[r]}:force_original_aspect_ratio=decrease",
                    "-q:v", q.ToString(),
                    outputPath
                }, _ => { }, _ => { }, ct);

                if (exit != 0 || !File.Exists(outputPath)) continue;

                var size = new FileInfo(outputPath).Length;
                await report($"{ResWidths[r]}x{ResHeights[r]} q={q} → {size / 1024}KB");

                if (size <= MaxThumbnailBytes) return true;
            }
        }
        return false;
    }

    private static async Task<string> EnsureBlankPngAsync(CancellationToken ct)
    {
        var path = Path.Combine(GetCacheDir("taiko"), "blank_1280x387.png");
        if (!File.Exists(path))
            await ProcessRunner.RunStreamedAsync(BinsHelper.Ffmpeg, new[]
            {
                "-y", "-f", "lavfi",
                "-i", "color=black:s=1280x387",
                "-frames:v", "1",
                path
            }, _ => { }, _ => { }, ct);
        return path;
    }

    private static async Task<(int exitCode, string? path)> RunYtDlpAsync(
        IReadOnlyList<string> args,
        Func<string, string, Task> progress,
        string tag,
        Func<string, bool> pathMatcher,
        CancellationToken ct)
    {
        string? foundPath = null;

        var exit = await ProcessRunner.RunStreamedAsync(
            BinsHelper.YtDlp, args,
            line =>
            {
                var trimmed = line.Trim();
                _ = progress($"{tag}[out]", trimmed);
                if (pathMatcher(trimmed)) foundPath = trimmed;
            },
            line => { _ = progress($"{tag}[err]", line); },
            ct, extraEnv: YtDlpEnv);

        ct.ThrowIfCancellationRequested();
        return (exit, foundPath);
    }

    private static async Task DownloadFileAsync(string url, string dest, CancellationToken ct)
    {
        var resp = await Http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, ct);
        resp.EnsureSuccessStatusCode();
        await using var stream = await resp.Content.ReadAsStreamAsync(ct);
        await using var file = File.Create(dest);
        await stream.CopyToAsync(file, ct);
    }
}
