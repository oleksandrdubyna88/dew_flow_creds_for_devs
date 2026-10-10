using System.Diagnostics;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;
using CredsBroker;
using CredsCli;
using CredsForDevs.ServiceDefaults;
using CredsForDevs.ServiceDefaults.Tests.Support;
using FluentAssertions;

namespace CredsCli.Tests;

/// <summary>
/// Defect C of PLAN_wsl_bridge_outlives_its_client.md at the process boundary (E3.S3): the BUILT <c>creds relay</c>
/// against a script standing in for <c>creds.exe relay-pipe</c>. Twenty connections leave no child behind; a signal
/// stops every child and removes the socket.
/// </summary>
/// <remarks>
/// <para>Before E3 the relay only <c>Dispose</c>d a connection's child, and <c>Process.Close</c> never closes a stdin the
/// caller accessed — so the child never saw EOF and lived as long as the relay: 27 of them under a relay with no
/// connections, measured. The echo child here (<c>cat</c>) leaves on end-of-stream exactly as <c>relay-pipe</c> does,
/// and so stays alive exactly as long as the relay forgets to send one.</para>
/// <para>Unix only, as the relay is: it refuses to run on Windows by design.</para>
/// </remarks>
public sealed class AgentRelayHostTests : IDisposable
{
    private static readonly TimeSpan Bound = TimeSpan.FromSeconds(10);

    private readonly string _root = HostProcess.TempDirectory("creds-relay-e3");

    public void Dispose() => HostProcess.Remove(_root);

    /// <summary>Short, under /tmp: a unix socket path is capped near a hundred bytes, and macOS's temp folder is long.</summary>
    private static string SocketPath() => Path.Combine("/tmp", $"cr-{Guid.NewGuid():N}"[..12] + ".sock");

    private Dictionary<string, string> Env(string windowsHalf, string socket) => new()
    {
        [CredsLogging.DirectoryVariable] = _root,
        [WslInterop.BinaryOverrideVariable] = windowsHalf,
        [AgentRelay.SocketOverrideVariable] = socket,
        [Endpoints.DirectoryOverrideVariable] = Path.Combine(_root, "no-windows"),
    };

    [Fact]
    public async Task Twenty_connections_leave_no_relay_pipe_child_behind()
    {
        Assert.SkipWhen(OperatingSystem.IsWindows(), "the relay runs inside WSL by design and refuses Windows");
        var ct = TestContext.Current.CancellationToken;
        var socket = SocketPath();
        using var relay = HostProcess.Start("creds", ["relay"], Env(FakeChild.Echo(_root), socket));
        using var reaper = HostProcess.KillOnDispose(relay);
        _ = relay.StandardError.ReadToEndAsync(ct);
        try
        {
            (await relay.StandardOutput.ReadLineAsync(ct).AsTask().WaitAsync(TimeSpan.FromSeconds(30), ct)).Should().Be($"export SSH_AUTH_SOCK={socket}");

            for (var i = 1; i <= 20; i++)
            {
                (await EchoOnceAsync(socket, $"hello {i}\n", ct)).Should().Be($"hello {i}\n", "the echo child answers through the relay");
            }

            var children = await ChildrenEndedAsync(relay.Id, 20, ct);
            var alive = children.Where(Posix.Alive).ToList();
            foreach (var pid in alive)
            {
                Posix.KillHard(pid);
            }
            alive.Should().BeEmpty("every relay-pipe child must be gone once its connection ended, but these still run");
            HostProcess.Read(LogFile(relay.Id)).Should().NotContain("still running: True");
        }
        finally
        {
            relay.Kill(entireProcessTree: true);
            await relay.WaitForExitAsync(ct);
            File.Delete(socket);
        }
    }

    [Theory]
    [InlineData(PosixSignal.SIGTERM, 143)]
    [InlineData(PosixSignal.SIGHUP, 129)]
    public async Task A_signal_stops_every_child_and_removes_the_socket(PosixSignal signal, int code)
    {
        // SIGHUP is what a killed wsl.exe delivers (measured): the extension stops the relay that way.
        Assert.SkipWhen(OperatingSystem.IsWindows(), "the relay runs inside WSL by design and refuses Windows");
        var ct = TestContext.Current.CancellationToken;
        var socket = SocketPath();
        using var relay = HostProcess.Start("creds", ["relay"], Env(FakeChild.Stubborn(_root), socket));
        using var reaper = HostProcess.KillOnDispose(relay);
        _ = relay.StandardError.ReadToEndAsync(ct);
        (await relay.StandardOutput.ReadLineAsync(ct).AsTask().WaitAsync(TimeSpan.FromSeconds(30), ct)).Should().Be($"export SSH_AUTH_SOCK={socket}");

        // One connection held open: its child ignores end-of-stream, so only the relay's kill can end it.
        using var held = new Socket(AddressFamily.Unix, SocketType.Stream, ProtocolType.Unspecified);
        await held.ConnectAsync(new UnixDomainSocketEndPoint(socket), ct);
        var child = await ChildOpenedAsync(relay.Id, ct);
        using var childReaper = Posix.ReapOnDispose(child);

        Posix.Ignores(relay.Id, signal).Should().BeFalse();
        Posix.Send(relay.Id, signal).Should().BeTrue();

        (await HostProcess.ExitsWithinAsync(relay, Bound, ct)).Should().BeTrue("the relay must end within 10 s of {0}, but it is still running", signal);
        relay.ExitCode.Should().Be(code, "a handled signal exits with the shell's 128 + n");
        File.Exists(socket).Should().BeFalse("the relay removes its socket on the way out — a corpse is what the next relay has to dial first");
        (await Posix.GoneWithinAsync(child, Bound, ct)).Should().BeTrue("the relay-pipe child (pid {0}) must be stopped by the relay, but it is still running", child);
        HostProcess.Read(LogFile(relay.Id)).Should().Contain($"exited: code {code}, reason signalled");
    }

    private static async Task<string> EchoOnceAsync(string socket, string text, CancellationToken ct)
    {
        using var client = new Socket(AddressFamily.Unix, SocketType.Stream, ProtocolType.Unspecified);
        await client.ConnectAsync(new UnixDomainSocketEndPoint(socket), ct);
        await client.SendAsync(Encoding.ASCII.GetBytes(text), ct);
        var buffer = new byte[256];
        var read = await client.ReceiveAsync(buffer, ct).AsTask().WaitAsync(TimeSpan.FromSeconds(30), ct);
        return Encoding.ASCII.GetString(buffer, 0, read);
    }

    /// <summary>The pids of the children whose connections ended, once <paramref name="expected"/> lines are in the log.</summary>
    private async Task<IReadOnlyList<int>> ChildrenEndedAsync(int relayPid, int expected, CancellationToken ct)
    {
        var clock = Stopwatch.StartNew();
        while (clock.Elapsed < TimeSpan.FromSeconds(60))
        {
            var pids = Lines(relayPid).Where(l => l.Contains(" ended (", StringComparison.Ordinal)).Select(PidOf).ToList();
            if (pids.Count >= expected)
            {
                return pids;
            }
            await Task.Delay(100, ct);
        }
        throw new TimeoutException("the relay never logged the end of every connection");
    }

    /// <summary>The pid of the child the first connection started, from the relay's "opened" line.</summary>
    private async Task<int> ChildOpenedAsync(int relayPid, CancellationToken ct)
    {
        var clock = Stopwatch.StartNew();
        while (clock.Elapsed < TimeSpan.FromSeconds(30))
        {
            var line = Lines(relayPid).FirstOrDefault(l => l.Contains(" opened; relay-pipe pid ", StringComparison.Ordinal));
            if (line is not null)
            {
                return PidOf(line);
            }
            await Task.Delay(100, ct);
        }
        throw new TimeoutException("the relay never logged the child of the held connection");
    }

    private string[] Lines(int relayPid) =>
        Directory.GetFiles(_root, $"{AgentRelay.AppName}-*-{relayPid}.log", SearchOption.AllDirectories) is [var file]
            ? HostProcess.Read(file).Split('\n')
            : [];

    /// <summary>The number after "relay-pipe pid " on a connection line.</summary>
    private static int PidOf(string line)
    {
        const string marker = "relay-pipe pid ";
        var start = line.IndexOf(marker, StringComparison.Ordinal) + marker.Length;
        var end = line.IndexOfAny([',', ' ', '\r'], start);
        return int.Parse(line[start..(end < 0 ? line.Length : end)], System.Globalization.CultureInfo.InvariantCulture);
    }

    private string LogFile(int relayPid) => HostProcess.LogFileOf(_root, AgentRelay.AppName, relayPid);
}
