using System.Diagnostics;
using CredsBroker;
using CredsForDevs.ServiceDefaults;
using CredsForDevs.ServiceDefaults.Tests.Support;
using CredsMcp;
using FluentAssertions;

namespace CredsMcp.Tests;

/// <summary>
/// The native server ends when the process that started it is gone, even though its stdin is still open
/// (E2.S4, plan §5.9) — and does NOT when it is the Windows half of the WSL bridge, or the switch is off.
/// </summary>
/// <remarks>
/// <para>The server is started THROUGH an intermediary — <c>cmd /c</c> on Windows, <c>sh -c</c> elsewhere — and
/// the intermediary is then killed, alone, by its own handle. The server's stdin is a pipe this test still
/// holds open, so end-of-stream never comes: only the parent watch can end it. Its pid is read from the name of
/// the log file its run wrote, and it is waited on — and, if a test fails, killed — by that pid only.</para>
/// <para>The bounds: 10 s to exit (Windows waits on a handle; elsewhere a 2 s poll), and 5 s of staying alive
/// for the cases that must not exit — longer than two polls.</para>
/// </remarks>
public sealed class ParentWatchProcessTests : IDisposable
{
    private readonly string _root = HostProcess.TempDirectory("creds-mcp-e2s4");

    public void Dispose() => HostProcess.Remove(_root);

    [Fact]
    public async Task The_server_ends_when_its_parent_is_killed_while_stdin_stays_open()
    {
        var ct = TestContext.Current.CancellationToken;
        using var launcher = StartThroughIntermediary(new Dictionary<string, string>());
        using var reaper = HostProcess.KillOnDispose(launcher);
        using var server = await ServerOfAsync(ct);
        using var serverReaper = HostProcess.KillOnDispose(server);

        launcher.Kill(entireProcessTree: false);

        var exited = await ExitsWithinAsync(server, TimeSpan.FromSeconds(10), ct);
        exited.Should().BeTrue("creds-mcp must exit once its parent is gone, but it is still running");
        HostProcess.Read(LogFile()).Should().Contain("exited: code 0, reason parentGone");
    }

    [Theory]
    [InlineData(WslInterop.RelayedVariable, "1")]
    [InlineData(Program.NoParentWatchVariable, "1")]
    public async Task The_server_keeps_serving_when_the_watch_is_off(string variable, string value)
    {
        var ct = TestContext.Current.CancellationToken;
        using var launcher = StartThroughIntermediary(new Dictionary<string, string> { [variable] = value });
        using var reaper = HostProcess.KillOnDispose(launcher);
        using var server = await ServerOfAsync(ct);
        using var serverReaper = HostProcess.KillOnDispose(server);

        launcher.Kill(entireProcessTree: false);

        (await ExitsWithinAsync(server, TimeSpan.FromSeconds(5), ct)).Should().BeFalse(
            "under the WSL relay the parent is the distribution's wsl.exe, and the kill switch is for launchers that start it as a child and exit");
        HostProcess.Read(LogFile()).Should().Contain("parent watch off:", "the positive control: this run's file, and it says why");
    }

    private Process StartThroughIntermediary(IReadOnlyDictionary<string, string> extra)
    {
        var binary = HostProcess.Binary("creds-mcp");
        var start = OperatingSystem.IsWindows()
            ? new ProcessStartInfo("cmd.exe") { ArgumentList = { "/c", binary } }
            : new ProcessStartInfo("/bin/sh") { ArgumentList = { "-c", "\"$0\"; exit $?", binary } };
        start.RedirectStandardInput = true;
        start.RedirectStandardOutput = true;
        start.RedirectStandardError = true;
        start.UseShellExecute = false;
        start.CreateNoWindow = true;
        start.Environment[CredsLogging.DirectoryVariable] = _root;
        start.Environment[Endpoints.DirectoryOverrideVariable] = Path.Combine(_root, "no-windows");
        foreach (var (name, value) in extra)
        {
            start.Environment[name] = value;
        }
        var launcher = Process.Start(start) ?? throw new InvalidOperationException("the intermediary did not start");
        _ = launcher.StandardError.ReadToEndAsync(TestContext.Current.CancellationToken);
        _ = launcher.StandardOutput.ReadToEndAsync(TestContext.Current.CancellationToken);
        return launcher;
    }

    /// <summary>The server's own process, found by the pid in the name of the one log file its run wrote.</summary>
    private async Task<Process> ServerOfAsync(CancellationToken ct)
    {
        var deadline = Stopwatch.StartNew();
        while (deadline.Elapsed < TimeSpan.FromSeconds(30))
        {
            var files = Directory.GetFiles(_root, $"{Program.AppName}-*.log", SearchOption.AllDirectories);
            if (files.Length == 1 && HostProcess.Read(files[0]).Contains("started:", StringComparison.Ordinal))
            {
                await WatchDecidedAsync(files[0], ct);
                var name = Path.GetFileNameWithoutExtension(files[0]);
                return Process.GetProcessById(int.Parse(name[(name.LastIndexOf('-') + 1)..], System.Globalization.CultureInfo.InvariantCulture));
            }
            await Task.Delay(100, ct);
        }
        throw new TimeoutException("the server never wrote its log file");
    }

    /// <summary>
    /// Give the server up to 5 s to say whether it watches its parent, so the kill cannot overtake the watch's
    /// own start; a server that never says so (one without the watch) is killed under anyway.
    /// </summary>
    private static async Task WatchDecidedAsync(string file, CancellationToken ct)
    {
        var deadline = Stopwatch.StartNew();
        while (deadline.Elapsed < TimeSpan.FromSeconds(5) && !HostProcess.Read(file).Contains("watch", StringComparison.Ordinal))
        {
            await Task.Delay(50, ct);
        }
    }

    private string LogFile() =>
        Directory.GetFiles(_root, $"{Program.AppName}-*.log", SearchOption.AllDirectories).Single();

    private static async Task<bool> ExitsWithinAsync(Process process, TimeSpan bound, CancellationToken ct)
    {
        try
        {
            await process.WaitForExitAsync(ct).WaitAsync(bound, ct);
            return true;
        }
        catch (TimeoutException)
        {
            return false;
        }
    }
}
