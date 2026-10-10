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
/// Defect C in-process (E3.S3): what <see cref="AgentRelay.CarryConnectionAsync"/> does once a connection ends — the
/// child's stdin closed, the child stopped, its stdout disposed — over fakes; and the whole relay, bind to signal,
/// over a real socket against a script standing in for <c>creds.exe relay-pipe</c>.
/// </summary>
public sealed class AgentRelayConnectionTests : IDisposable
{
    private static readonly TimeSpan Bound = TimeSpan.FromSeconds(30);
    private static readonly TimeSpan Hour = TimeSpan.FromHours(1);

    private readonly string _root = HostProcess.TempDirectory("creds-relay-carry");
    private readonly TaskCompletionSource<PosixSignal> _signal = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly TaskCompletionSource _parent = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly CollectingSink _sink = new();
    private readonly Serilog.Core.Logger _log;

    public AgentRelayConnectionTests() => _log = _sink.Logger();

    public void Dispose()
    {
        _log.Dispose();
        HostProcess.Remove(_root);
    }

    /// <summary>A child that remembers what it was asked, and leaves when its stdin closes.</summary>
    private sealed class FakeRelayPipe : IManagedChild
    {
        private readonly TaskCompletionSource _exited = new(TaskCreationOptions.RunContinuationsAsynchronously);

        internal List<string> Steps { get; } = [];

        public int Id => 4242;

        public bool HasExited => _exited.Task.IsCompleted;

        public int ExitCode => 0;

        public void CloseStdin()
        {
            Steps.Add("stdin closed");
            _exited.TrySetResult();
        }

        public Task WaitForExitAsync(CancellationToken ct) => _exited.Task.WaitAsync(ct);

        public void KillTree() => Steps.Add("tree killed");
    }

    private ChildLifetime Lifetime() =>
        new(_signal.Task, _parent.Task, TimeSpan.FromMilliseconds(500), Hour, _log, TimeProvider.System, _ => throw new InvalidOperationException("the backstop must not fire"));

    [Fact]
    public async Task When_ssh_closes_the_child_stdin_is_closed_the_child_is_stopped_and_its_stdout_disposed()
    {
        // The whole of defect C: `using var child` never closed a stdin the relay had accessed, so relay-pipe
        // never saw end-of-stream and lived as long as the relay — 27 of them, measured.
        using var lifetime = Lifetime();
        var client = new MemoryStream(Encoding.ASCII.GetBytes("hello"));
        var toChild = new ClosingStream();
        var fromChild = new HeldStream(string.Empty);
        var child = new FakeRelayPipe();
        lifetime.Track(child);

        var ending = await AgentRelay.CarryConnectionAsync(client, toChild, fromChild, child, lifetime).WaitAsync(Bound, TestContext.Current.CancellationToken);

        ending.Should().Be(new AgentRelay.ConnectionEnding(AgentRelay.ConnectionEnd.SshClosed, []));
        toChild.Written.Should().Be("hello", "what ssh sent reached the child first");
        toChild.Closed.Should().BeTrue("the child's stdin is closed by name — the EOF Process.Close never sends");
        child.Steps.Should().Equal(["stdin closed"], "the child left on end-of-stream, so its tree was not killed");
        fromChild.Disposed.Should().BeTrue("its stdout is disposed, so the pending copy ends rather than waiting on a pipe nobody writes to");
    }

    [Fact]
    public async Task When_the_Windows_side_closes_first_that_is_the_ending_and_the_child_is_still_stopped()
    {
        using var lifetime = Lifetime();
        var client = new HeldStream(string.Empty);
        var toChild = new ClosingStream();
        var fromChild = new MemoryStream(Encoding.ASCII.GetBytes("bye"));
        var child = new FakeRelayPipe();
        lifetime.Track(child);

        var ending = await AgentRelay.CarryConnectionAsync(client, toChild, fromChild, child, lifetime).WaitAsync(Bound, TestContext.Current.CancellationToken);

        ending.End.Should().Be(AgentRelay.ConnectionEnd.WindowsSideClosed);
        client.Written.Should().Be("bye", "what the Windows side said reached ssh before the close");
        toChild.Closed.Should().BeTrue();
        child.Steps.Should().Equal(["stdin closed"]);
        client.Dispose();
    }

    [Fact]
    public async Task A_copy_that_fails_is_reported_as_a_failure_in_either_direction_not_as_an_orderly_close()
    {
        // The plan round's finding: a broken pipe must not read as "ssh closed" in the one line somebody opens the
        // log for. Both directions, because each is a different stream.
        using var lifetime = Lifetime();
        var fromSsh = await AgentRelay.CarryConnectionAsync(new BrokenStream(), new ClosingStream(), new HeldStream(string.Empty), new FakeRelayPipe(), lifetime).WaitAsync(Bound, TestContext.Current.CancellationToken);
        var fromWindows = await AgentRelay.CarryConnectionAsync(new HeldStream(string.Empty), new ClosingStream(), new BrokenStream(), new FakeRelayPipe(), lifetime).WaitAsync(Bound, TestContext.Current.CancellationToken);

        fromSsh.End.Should().Be(AgentRelay.ConnectionEnd.CopyFailed);
        fromSsh.Failures.Should().ContainSingle().Which.Should().BeOfType<IOException>().Which.Message.Should().Be("Broken pipe");
        fromWindows.End.Should().Be(AgentRelay.ConnectionEnd.CopyFailed);
        fromWindows.Failures.Should().ContainSingle().Which.Should().BeOfType<IOException>();
    }

    [Fact]
    public async Task A_signal_ends_a_held_connection_as_interrupted_without_waiting_for_either_side()
    {
        // SonarCloud S8949 on the two copies, judged by behaviour: they are the data path, not the cleanup, so they
        // take the lifetime's token — a relay ended by a signal must not wait for ssh or the Windows side to close a
        // connection nobody will finish. Before: the carry waited on both streams for ever.
        using var lifetime = Lifetime();
        var client = new HeldStream(string.Empty);
        var toChild = new ClosingStream();
        var fromChild = new HeldStream(string.Empty);
        var child = new FakeRelayPipe();
        lifetime.Track(child);
        var carry = AgentRelay.CarryConnectionAsync(client, toChild, fromChild, child, lifetime);
        await Task.Delay(50, TestContext.Current.CancellationToken);
        carry.IsCompleted.Should().BeFalse("both sides are open and nothing has ended the relay");

        _signal.SetResult(PosixSignal.SIGTERM);

        var ending = await carry.WaitAsync(TimeSpan.FromSeconds(5), TestContext.Current.CancellationToken);
        ending.Should().Be(new AgentRelay.ConnectionEnding(AgentRelay.ConnectionEnd.Interrupted, []));
        toChild.Closed.Should().BeTrue("the child's stdin is still closed by name");
        child.Steps.Should().Equal(["stdin closed"], "and the child stopped through the one killer");
        client.Dispose();
    }

    [Fact]
    public void The_ending_of_a_copy_that_completed_is_the_side_that_closed()
    {
        var toWindows = Task.CompletedTask;
        var pending = new TaskCompletionSource().Task;

        AgentRelay.EndingOf(toWindows, toWindows).Should().Be(new AgentRelay.ConnectionEnding(AgentRelay.ConnectionEnd.SshClosed, []));
        AgentRelay.EndingOf(Task.CompletedTask, pending).Should().Be(new AgentRelay.ConnectionEnding(AgentRelay.ConnectionEnd.WindowsSideClosed, []));
    }

    [Fact]
    [System.Runtime.Versioning.UnsupportedOSPlatform("windows")]
    public async Task The_relay_in_process_serves_connections_and_a_signal_stops_every_child_and_removes_the_socket()
    {
        // The real thing minus the process boundary: a unix socket, a real child per connection (the echo script),
        // and the lifetime's signal task completed by hand. Unix only, as the relay is.
        Assert.SkipWhen(OperatingSystem.IsWindows(), "the relay runs inside WSL by design and refuses Windows");
        var ct = TestContext.Current.CancellationToken;
        var socket = Path.Combine("/tmp", $"cr-{Guid.NewGuid():N}"[..12] + ".sock");
        using var lifetime = Lifetime();
        var serving = AgentRelay.ListenAsync(socket, BrokerContract.Current, new WindowsBridge(FakeChild.Echo(_root), "CREDS_E3_TEST_UNSET"), lifetime, _log);
        await WaitUntilAsync(() => _sink.Messages.Any(m => m.StartsWith("relay listening on ", StringComparison.Ordinal)), ct);

        (await EchoOnceAsync(socket, "one\n", ct)).Should().Be("one\n");
        await WaitUntilAsync(() => _sink.Messages.Any(m => m.Contains("connection 1 ended (ssh closed)", StringComparison.Ordinal)), ct);
        // A second connection held open across the signal: its child must be stopped by the relay, not by ssh leaving.
        using var held = new Socket(AddressFamily.Unix, SocketType.Stream, ProtocolType.Unspecified);
        await held.ConnectAsync(new UnixDomainSocketEndPoint(socket), ct);
        await WaitUntilAsync(() => _sink.Messages.Any(m => m.StartsWith("connection 2 opened; relay-pipe pid ", StringComparison.Ordinal)), ct);
        var heldChild = PidOf(_sink.Messages.Single(m => m.StartsWith("connection 2 opened; relay-pipe pid ", StringComparison.Ordinal)));

        _signal.SetResult(PosixSignal.SIGTERM);

        var ending = await serving.WaitAsync(Bound, ct);
        ending.Should().Be(new HostEnding(143, ExitReason.Signalled));
        File.Exists(socket).Should().BeFalse("the socket is removed after every child is stopped");
        (await Posix.GoneWithinAsync(heldChild, Bound, ct)).Should().BeTrue("the held connection's child (pid {0}) must be stopped by the relay", heldChild);
        _sink.Messages.Should().Contain("shutting down: signalled, exit code 143");
    }

    private static async Task<string> EchoOnceAsync(string socket, string text, CancellationToken ct)
    {
        using var client = new Socket(AddressFamily.Unix, SocketType.Stream, ProtocolType.Unspecified);
        await client.ConnectAsync(new UnixDomainSocketEndPoint(socket), ct);
        await client.SendAsync(Encoding.ASCII.GetBytes(text), ct);
        var buffer = new byte[256];
        var read = await client.ReceiveAsync(buffer, ct).AsTask().WaitAsync(Bound, ct);
        return Encoding.ASCII.GetString(buffer, 0, read);
    }

    private static int PidOf(string line) =>
        int.Parse(line[(line.LastIndexOf(' ') + 1)..], System.Globalization.CultureInfo.InvariantCulture);

    private static async Task WaitUntilAsync(Func<bool> condition, CancellationToken ct)
    {
        var clock = Stopwatch.StartNew();
        while (!condition() && clock.Elapsed < Bound)
        {
            await Task.Delay(50, ct);
        }
        condition().Should().BeTrue("the condition did not hold within {0}", Bound);
    }
}
