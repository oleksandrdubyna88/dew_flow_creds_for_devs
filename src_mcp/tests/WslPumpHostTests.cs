using System.Diagnostics;
using System.Runtime.InteropServices;
using CredsBroker;
using CredsForDevs.ServiceDefaults;
using CredsForDevs.ServiceDefaults.Tests.Support;
using CredsMcp;
using FluentAssertions;

namespace CredsMcp.Tests;

/// <summary>
/// Defect B of PLAN_wsl_bridge_outlives_its_client.md at the process boundary (E3.S2): the BUILT <c>creds-mcp</c>, run as
/// the Linux half of the bridge against a script standing in for <c>creds-mcp.exe</c>, stops that child when a signal
/// ends it, and does not wait forever for a child that never closes its stdout after the client hung up.
/// </summary>
/// <remarks>
/// <para>No WSL anywhere: <c>WSL_DISTRO_NAME</c> alone makes the binary take the pump path (<c>ShouldRelay</c>), and
/// <c>CREDS_MCP_WINDOWS_BINARY</c> names the script. The child is the stubborn one — it never reads stdin, never closes
/// stdout and ignores TERM, HUP and INT — so only the pump's own kill can end it, which is what is under test.</para>
/// <para>Before E3 the wrapper died from Claude Code's SIGINT by the default disposition and its <c>ProcessExit</c> hook,
/// the only stop it had, never ran — the child outlived it, every session. The SigIgn check comes first, because a
/// host that had SIGINT ignored at birth would "survive" the signal for a reason that has nothing to do with the
/// handler (the RESULTS record's second trap).</para>
/// <para>Unix only, as the pump is: <c>ShouldRelay</c> is false on Windows by design.</para>
/// </remarks>
public sealed class WslPumpHostTests : IDisposable
{
    private static readonly TimeSpan Bound = TimeSpan.FromSeconds(10);

    private readonly string _root = HostProcess.TempDirectory("creds-mcp-e3");

    public void Dispose() => HostProcess.Remove(_root);

    private Dictionary<string, string> Env(string windowsHalf) => new()
    {
        [CredsLogging.DirectoryVariable] = _root,
        // The pump path, with no distribution anywhere: the two signals ShouldRelay reads are a distribution
        // name and /proc/version, and either suffices.
        ["WSL_DISTRO_NAME"] = "e3-no-wsl",
        [WslInterop.McpBinaryOverrideVariable] = windowsHalf,
        [Endpoints.DirectoryOverrideVariable] = Path.Combine(_root, "no-windows"),
    };

    [Theory]
    [InlineData(PosixSignal.SIGINT, 130)]
    [InlineData(PosixSignal.SIGTERM, 143)]
    [InlineData(PosixSignal.SIGHUP, 129)]
    public async Task A_signal_to_the_pump_stops_the_Windows_half_it_started(PosixSignal signal, int code)
    {
        Assert.SkipWhen(OperatingSystem.IsWindows(), "the pump is the Linux half of the bridge; ShouldRelay is false on Windows by design");
        var ct = TestContext.Current.CancellationToken;
        using var host = HostProcess.Start("creds-mcp", [], Env(FakeChild.Stubborn(_root)));
        using var reaper = HostProcess.KillOnDispose(host);
        _ = host.StandardError.ReadToEndAsync(ct);
        _ = host.StandardOutput.ReadToEndAsync(ct);
        var child = await ChildPidAsync(host.Id, ct);
        using var childReaper = Posix.ReapOnDispose(child);

        Posix.Ignores(host.Id, signal).Should().BeFalse("a host that ignores {0} would survive it for the wrong reason", signal);
        Posix.Send(host.Id, signal).Should().BeTrue();

        (await HostProcess.ExitsWithinAsync(host, Bound, ct)).Should().BeTrue("the pump must end within 10 s of {0}, but it is still running", signal);
        host.ExitCode.Should().Be(code, "a handled signal exits with the shell's 128 + n");
        (await Posix.GoneWithinAsync(child, Bound, ct)).Should().BeTrue("the Windows half (pid {0}) must be stopped by the pump, but it is still running", child);
        HostProcess.Read(LogFile(host.Id)).Should().Contain($"exited: code {code}, reason signalled");
    }

    [Fact]
    public async Task A_client_that_hangs_up_on_a_Windows_half_that_never_closes_stdout_still_ends_the_pump()
    {
        // The second half of defect B: after end-of-stream the pump waited for the child's stdout without a bound,
        // so a Windows half stuck in defect A held the wrapper — and the client waiting on it — forever.
        Assert.SkipWhen(OperatingSystem.IsWindows(), "the pump is the Linux half of the bridge; ShouldRelay is false on Windows by design");
        var ct = TestContext.Current.CancellationToken;
        using var host = HostProcess.Start("creds-mcp", [], Env(FakeChild.Stubborn(_root)));
        using var reaper = HostProcess.KillOnDispose(host);
        _ = host.StandardError.ReadToEndAsync(ct);
        _ = host.StandardOutput.ReadToEndAsync(ct);
        var child = await ChildPidAsync(host.Id, ct);
        using var childReaper = Posix.ReapOnDispose(child);

        host.StandardInput.Close();

        // The bound after a hang-up, the grace, the kill — and a slow runner.
        var within = WslPump.HangUpBound + ChildLifetime.DefaultGrace + Bound;
        (await HostProcess.ExitsWithinAsync(host, within, ct)).Should().BeTrue("the pump must end within {0} of the client hanging up, but it is still running", within);
        (await Posix.GoneWithinAsync(child, Bound, ct)).Should().BeTrue("the Windows half (pid {0}) must be stopped, but it is still running", child);
        HostProcess.Read(LogFile(host.Id)).Should().Contain("reason clientClosed");
    }

    /// <summary>The child's pid, from the pump's own "started the Windows half" line.</summary>
    private async Task<int> ChildPidAsync(int hostPid, CancellationToken ct)
    {
        var clock = Stopwatch.StartNew();
        while (clock.Elapsed < TimeSpan.FromSeconds(30))
        {
            var files = Directory.GetFiles(_root, $"{Program.WslAppName}-*-{hostPid}.log", SearchOption.AllDirectories);
            var line = files.Length == 1
                ? HostProcess.Read(files[0]).Split('\n').FirstOrDefault(l => l.Contains("started the Windows half, pid ", StringComparison.Ordinal))
                : null;
            if (line is not null)
            {
                return PidOf(line);
            }
            await Task.Delay(100, ct);
        }
        throw new TimeoutException("the pump never logged the child it started");
    }

    /// <summary>The number after "pid " on the line — the properties the file sink appends follow it.</summary>
    private static int PidOf(string line)
    {
        const string marker = "started the Windows half, pid ";
        var digits = line[(line.IndexOf(marker, StringComparison.Ordinal) + marker.Length)..].TakeWhile(char.IsAsciiDigit).ToArray();
        return int.Parse(digits, System.Globalization.CultureInfo.InvariantCulture);
    }

    private string LogFile(int hostPid) => HostProcess.LogFileOf(_root, Program.WslAppName, hostPid);
}
