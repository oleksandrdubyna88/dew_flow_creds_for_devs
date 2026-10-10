using System.Text.RegularExpressions;
using CredsBroker;
using CredsCli;
using CredsForDevs.ServiceDefaults;
using CredsForDevs.ServiceDefaults.Tests.Support;
using FluentAssertions;

namespace CredsCli.Tests;

/// <summary>
/// What the relay and its per-connection child write about themselves, through the BUILT binary
/// (PLAN_wsl_bridge_outlives_its_client.md, E1.S2).
/// </summary>
public sealed partial class RelayLogTests : IDisposable
{
    private readonly string _root = HostProcess.TempDirectory("creds-relay-log");
    private readonly string _marker = "MARKER" + Guid.NewGuid().ToString("N");

    public void Dispose() => HostProcess.Remove(_root);

    /// <summary><c>socketFromBusyLine</c> in wslRelay.ts, verbatim.</summary>
    [GeneratedRegex(@"(\S+) is already served by a live relay")]
    private static partial Regex BusyLine();

    private Dictionary<string, string> Env(params (string Name, string Value)[] extra)
    {
        var env = new Dictionary<string, string>
        {
            [CredsLogging.DirectoryVariable] = _root,
            [CredsLogging.LevelVariable] = "verbose",
            ["CREDS_ENDPOINT_DIR"] = Path.Combine(_root, "endpoints-" + _marker),
            ["CREDS_TEST_SECRET"] = _marker,
        };
        foreach (var (name, value) in extra)
        {
            env[name] = value;
        }
        return env;
    }

    [Fact]
    public async Task A_relay_pipe_with_no_agent_logs_why_it_ended_keeps_stdout_clean_and_logs_no_secret()
    {
        var ct = TestContext.Current.CancellationToken;
        using var pipe = HostProcess.Start("creds", ["relay-pipe"], Env());
        pipe.StandardInput.Close();
        var stdout = await pipe.StandardOutput.ReadToEndAsync(ct);
        var stderr = await pipe.StandardError.ReadToEndAsync(ct);
        await pipe.WaitForExitAsync(ct).WaitAsync(TimeSpan.FromSeconds(30), ct);

        pipe.ExitCode.Should().Be(BrokerContract.Current.Exit("brokerUnreachable"));
        stdout.Should().BeEmpty("stdout carries the SSH agent protocol and nothing else");

        var file = HostProcess.Read(HostProcess.LogFileOf(_root, RelayPipe.AppName, pipe.Id));
        // Positive controls before the grep, or "no marker" could mean "no file".
        file.Should().Contain("started: relay-pipe");
        file.Should().Contain($"parent {Environment.ProcessId}", "this test started it, so it IS the parent");
        file.Should().Contain("no VS Code window is serving an SSH agent");
        file.Should().Contain($"exited: code {pipe.ExitCode}, reason noAgentAnnounced");
        stderr.Should().Contain("no VS Code window is serving an SSH agent", "the person still reads the sentence on stderr");
        file.Should().NotContain(_marker, "environment values are never logged");
        stderr.Should().NotContain(_marker);
    }

    /// <summary>
    /// The refusal the extension adopts a working relay from must survive the logger — at any floor.
    /// </summary>
    /// <remarks>
    /// The cadence consultation's catch: <c>wslRelayManager.ts</c> reads this sentence off stderr with
    /// <c>socketFromBusyLine</c>, so a <c>CREDS_LOG_LEVEL</c> that hid it would make a working relay look
    /// broken. Run against the REAL rendered line, with the extension's own pattern. Unix only: on Windows
    /// <c>creds relay</c> refuses before it reaches a socket, by design.
    /// </remarks>
    [Fact]
    public async Task The_busy_refusal_still_reaches_stderr_in_the_shape_the_extension_parses_even_at_a_fatal_floor()
    {
        if (OperatingSystem.IsWindows())
        {
            return;
        }
        var ct = TestContext.Current.CancellationToken;
        // Short: a unix socket path is capped near a hundred bytes, and macOS's temp folder is long.
        var socket = Path.Combine("/tmp", $"cr-{Guid.NewGuid():N}"[..12] + ".sock");
        var env = Env((AgentRelay.SocketOverrideVariable, socket));
        using var first = HostProcess.Start("creds", ["relay"], env);
        try
        {
            var export = await first.StandardOutput.ReadLineAsync(ct).AsTask().WaitAsync(TimeSpan.FromSeconds(30), ct);
            export.Should().Be($"export SSH_AUTH_SOCK={socket}", "the first relay is serving before the second asks");

            using var second = HostProcess.Start("creds", ["relay"], Env((AgentRelay.SocketOverrideVariable, socket), (CredsLogging.LevelVariable, "fatal")));
            var stderr = await second.StandardError.ReadToEndAsync(ct);
            await second.WaitForExitAsync(ct).WaitAsync(TimeSpan.FromSeconds(30), ct);

            second.ExitCode.Should().Be(BrokerContract.Current.Exit("busy"));
            // wslRelay.ts socketFromBusyLine, verbatim.
            var busy = stderr.Split('\n').Select(line => BusyLine().Match(line.Trim()))
                .FirstOrDefault(match => match.Success);
            busy.Should().NotBeNull("the refusal is on stderr at a floor of fatal: {0}", stderr);
            busy!.Groups[1].Value.Should().Be(socket, "the extension adopts exactly the socket named");
            // And the file still says why the run ended: "fatal" is capped at Information, so the exit line
            // survives (the first CI run caught a Warning cap dropping it — CodeRabbit on #201).
            var file = HostProcess.Read(HostProcess.LogFileOf(_root, AgentRelay.AppName, second.Id));
            file.Should().Contain("is already served by a live relay");
            file.Should().Contain("reason busy");
        }
        finally
        {
            // Only the process this test started, by its own handle — never by name.
            first.Kill(entireProcessTree: true);
            await first.WaitForExitAsync(ct);
            File.Delete(socket);
        }
    }
}
