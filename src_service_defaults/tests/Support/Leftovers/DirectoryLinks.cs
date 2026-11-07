using System.Diagnostics;
using Xunit;

namespace CredsForDevs.Tests;

internal static class DirectoryLinks
{
    /// <summary>What the junction tool may take before it is given up on and killed with everything it started.</summary>
    internal static readonly TimeSpan ToolTimeout = TimeSpan.FromSeconds(30);

    /// <summary>The characters <c>cmd.exe</c> reads as syntax even inside quotes — a path with one is never handed to it.</summary>
    private static readonly char[] CmdSyntax = ['%', '^', '&', '!', '|', '<', '>'];

    /// <summary>A DIRECTORY link falls back to an NTFS junction where symlinks need a privilege this
    /// run does not hold: a junction needs none, the reader follows it exactly as transparently, and a
    /// cloned repository can carry one — so the escape the guard exists for stays testable on a stock
    /// Windows box instead of skipping there forever.</summary>
    public static void CreateOrSkip(string link, string target)
    {
        try
        {
            Directory.CreateSymbolicLink(link, target);
            return;
        }
        catch (Exception ex) when (ex is UnauthorizedAccessException or IOException)
        {
            if (!OperatingSystem.IsWindows())
            {
                Assert.Skip($"cannot create directory links here ({ex.Message})");
            }
        }

        if (link.IndexOfAny(CmdSyntax) >= 0 || target.IndexOfAny(CmdSyntax) >= 0) Assert.Skip("a path with a command-interpreter character cannot be given to mklink");
        var made = Run("cmd.exe", ["/c", "mklink", "/J", link, target], ToolTimeout);
        if (made.TimedOut || made.ExitCode != 0 || !Directory.Exists(link))
        {
            Assert.Skip("cannot create a directory symlink or a junction here");
        }
    }

    /// <summary>How a tool run ended: killed for taking too long, or its exit code; the process id it had.</summary>
    internal sealed record ToolRun(bool TimedOut, int ExitCode, int Pid, string Output = "");

    /// <summary>The program <paramref name="exe"/> with each of <paramref name="arguments"/> as ONE argument — no shell, no command line
    /// assembled by hand, and <paramref name="environment"/> added to the child's environment. Past <paramref name="timeout"/> the process and
    /// everything it started are killed and reaped.</summary>
    internal static ToolRun Run(string exe, IReadOnlyList<string> arguments, TimeSpan timeout, IReadOnlyDictionary<string, string>? environment = null)
    {
        var start = new ProcessStartInfo(exe) { UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true, CreateNoWindow = true };
        foreach (var argument in arguments) start.ArgumentList.Add(argument);
        foreach (var (name, value) in environment ?? new Dictionary<string, string>()) start.Environment[name] = value;
        using var process = Process.Start(start) ?? throw new InvalidOperationException($"{exe} did not start");
        var pid = process.Id;
        var output = process.StandardOutput.ReadToEndAsync(); // drained, so a full pipe cannot hold the tool
        _ = process.StandardError.ReadToEndAsync();
        if (process.WaitForExit(timeout))
        {
            process.WaitForExit();
            return new ToolRun(false, process.ExitCode, pid, output.Wait(TimeSpan.FromSeconds(5)) ? output.Result : "");
        }

        process.Kill(entireProcessTree: true);
        process.WaitForExit();
        return new ToolRun(true, -1, pid);
    }
}
