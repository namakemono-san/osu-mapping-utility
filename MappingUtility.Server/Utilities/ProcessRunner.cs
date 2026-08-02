using System.Diagnostics;
using System.Text;

namespace MappingUtility.Server.Utilities;

internal static class ProcessRunner
{
    public static void SetupEnv(ProcessStartInfo psi)
    {
        var existing = Environment.GetEnvironmentVariable("PATH") ?? "";
        psi.Environment["PATH"] = BinsHelper.BasePath + Path.PathSeparator + existing;
    }

    private static ProcessStartInfo CreateStartInfo(
        string exe, IReadOnlyList<string> args, string? workingDir = null,
        IReadOnlyDictionary<string, string>? extraEnv = null)
    {
        var psi = new ProcessStartInfo(exe)
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8,
        };
        if (workingDir is not null) psi.WorkingDirectory = workingDir;
        foreach (var a in args) psi.ArgumentList.Add(a);
        SetupEnv(psi);
        if (extraEnv is not null)
            foreach (var (key, value) in extraEnv)
                psi.Environment[key] = value;
        return psi;
    }

    private static (Process Process, IDisposable Registration) StartTracked(ProcessStartInfo psi, CancellationToken ct)
    {
        if (!File.Exists(psi.FileName))
            throw new FileNotFoundException(
                $"Required executable not found: {psi.FileName}. Try reinstalling the app.", psi.FileName);

        var proc = new Process { StartInfo = psi };
        try
        {
            proc.Start();
        }
        catch
        {
            proc.Dispose();
            throw;
        }

        var registration = ct.Register(() =>
        {
            try { if (!proc.HasExited) proc.Kill(entireProcessTree: true); } catch { }
        });
        return (proc, registration);
    }

    public static async Task<(int ExitCode, string Stdout, string Stderr)> RunCaptureAsync(
        string exe, IReadOnlyList<string> args, CancellationToken ct, string? workingDir = null)
    {
        var psi = CreateStartInfo(exe, args, workingDir);
        var (proc, registration) = StartTracked(psi, ct);
        using var _ = proc;
        using var __ = registration;

        var outTask = proc.StandardOutput.ReadToEndAsync(ct);
        var errTask = proc.StandardError.ReadToEndAsync(ct);
        await Task.WhenAll(outTask, errTask);
        try { await proc.WaitForExitAsync(ct); }
        catch (OperationCanceledException) { return (-1, "", ""); }

        return (proc.ExitCode, await outTask, await errTask);
    }

    public static async Task<float[]> RunPcmPipeAsync(
        string exe, IReadOnlyList<string> args, CancellationToken ct)
    {
        var psi = CreateStartInfo(exe, args);
        var (proc, registration) = StartTracked(psi, ct);
        using var _ = proc;
        using var __ = registration;

        using var ms = new MemoryStream();
        var outTask = proc.StandardOutput.BaseStream.CopyToAsync(ms, ct);
        var errTask = proc.StandardError.ReadToEndAsync(ct);
        await Task.WhenAll(outTask, errTask);
        try { await proc.WaitForExitAsync(ct); }
        catch (OperationCanceledException) { return []; }

        if (proc.ExitCode != 0) return [];
        var bytes = ms.ToArray();
        if (bytes.Length % 4 != 0) return [];
        var floats = new float[bytes.Length / 4];
        Buffer.BlockCopy(bytes, 0, floats, 0, bytes.Length);
        return floats;
    }

    public static async Task<int> RunStreamedAsync(
        string exe, IReadOnlyList<string> args,
        Action<string> onStdout, Action<string> onStderr,
        CancellationToken ct, string? workingDir = null,
        IReadOnlyDictionary<string, string>? extraEnv = null)
    {
        var psi = CreateStartInfo(exe, args, workingDir, extraEnv);
        var (proc, registration) = StartTracked(psi, ct);
        using var _ = proc;
        using var __ = registration;

        var outTask = ReadLinesAsync(proc.StandardOutput, onStdout, ct);
        var errTask = ReadLinesAsync(proc.StandardError, onStderr, ct);
        try { await Task.WhenAll(outTask, errTask); }
        catch (OperationCanceledException) { return -1; }
        try { await proc.WaitForExitAsync(ct); }
        catch (OperationCanceledException) { return -1; }
        return proc.ExitCode;
    }

    private static async Task ReadLinesAsync(StreamReader reader, Action<string> onLine, CancellationToken ct)
    {
        while (await reader.ReadLineAsync(ct) is { } line)
            onLine(line);
    }
}
