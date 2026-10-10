using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using CredsBroker;
using CredsForDevs.ServiceDefaults;
using CredsForDevs.ServiceDefaults.Tests.Support;
using CredsMcp;
using FluentAssertions;

namespace CredsMcp.Tests;

/// <summary>
/// The whole pump in-process (E3.S2): a real child from a script standing in for <c>creds-mcp.exe</c>, the three
/// endings, and the child's fate after each — where the coverage tool can see it.
/// </summary>
/// <remarks>
/// The signal and the parent are completion sources the test completes; the Windows half is a
/// <see cref="WindowsBridge"/> pointed at the script, so no WSL and no Windows binary are involved. On Windows the
/// script is a <c>.cmd</c>; the built binary itself takes the pump path only inside WSL, which <c>WslPumpHostTests</c>
/// drives on Linux and macOS.
/// </remarks>
public sealed class WslPumpRunTests : IDisposable
{
    private static readonly TimeSpan Bound = TimeSpan.FromSeconds(30);
    private static readonly TimeSpan Hour = TimeSpan.FromHours(1);

    private readonly string _root = HostProcess.TempDirectory("creds-mcp-pump");
    private readonly TaskCompletionSource<PosixSignal> _signal = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly TaskCompletionSource _parent = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly CollectingSink _sink = new();
    private readonly Serilog.Core.Logger _log;

    public WslPumpRunTests() => _log = _sink.Logger();

    public void Dispose()
    {
        _log.Dispose();
        HostProcess.Remove(_root);
    }

    private ChildLifetime Lifetime() =>
        new(_signal.Task, _parent.Task, TimeSpan.FromMilliseconds(500), Hour, _log, TimeProvider.System, _ => throw new InvalidOperationException("the backstop must not fire"));

    /// <summary>A bridge to the script, under a variable nobody sets.</summary>
    private static WindowsBridge Half(string script) => new(script, "CREDS_E3_TEST_UNSET");

    [Theory]
    [InlineData(PosixSignal.SIGINT, 130)]
    [InlineData(PosixSignal.SIGHUP, 129)]
    public async Task A_signal_during_the_session_ends_the_pump_and_stops_the_child(PosixSignal signal, int code)
    {
        var ct = TestContext.Current.CancellationToken;
        using var lifetime = Lifetime();
        var fromClient = new HeldStream(string.Empty);
        var toClient = new MemoryStream();

        var run = WslPump.RunAsync(Half(FakeChild.Stubborn(_root)), [], fromClient, toClient, lifetime, _log);
        var child = await StartedChildAsync(ct);

        _signal.SetResult(signal);

        var ending = await run.WaitAsync(Bound, ct);
        ending.Should().Be(new HostEnding(code, ExitReason.Signalled));
        await ChildGoneAsync(child, ct);
        _sink.Messages.Should().Contain(m => m.StartsWith("the session ended: Interrupted", StringComparison.Ordinal));
        _sink.Messages.Should().Contain(m => m.Contains($"child {child} did not exit within 0 s") && m.Contains("stopping its process tree"), "a signalled session gives no grace: the client kills this wrapper within about half a second");
    }

    [Fact]
    public async Task A_signalled_session_gets_no_grace_a_lost_parent_or_a_hang_up_the_lifetimes_and_a_child_that_left_the_longer_one()
    {
        // Measured 2026-10-10: Claude Code sends SIGINT, SIGTERM 100 ms later and SIGKILL about half a second after
        // that, so any grace at all on a signal is a grace that never ends in a kill.
        var ct = TestContext.Current.CancellationToken;
        using var signalled = Lifetime();
        _signal.SetResult(PosixSignal.SIGINT);
        await signalled.Ended.WaitAsync(Bound, ct);

        WslPump.GraceFor(WslPump.Ending.Interrupted, signalled).Should().Be(TimeSpan.Zero);
        // Whatever the pump's own ending: a signal the lifetime recorded a moment after the pump returned means the
        // client's SIGKILL is on its way, and a grace would never end in a kill (SonarCloud round, finding 0).
        WslPump.GraceFor(WslPump.Ending.ClientClosed, signalled).Should().Be(TimeSpan.Zero);
        WslPump.GraceFor(WslPump.Ending.WindowsHalfClosed, signalled).Should().Be(TimeSpan.Zero);

        // Its own, unfired signal: the fixture's was set above and would make this one signalled too.
        using var quiet = new ChildLifetime(new TaskCompletionSource<PosixSignal>().Task, new TaskCompletionSource().Task, TimeSpan.FromMilliseconds(500), Hour, _log, TimeProvider.System, _ => { });
        WslPump.GraceFor(WslPump.Ending.ClientClosed, quiet).Should().Be(quiet.Grace);
        WslPump.GraceFor(WslPump.Ending.WindowsHalfClosed, quiet).Should().Be(TimeSpan.FromSeconds(5));

        var lostParent = new TaskCompletionSource<PosixSignal>();
        using var parentGone = new ChildLifetime(lostParent.Task, Task.CompletedTask, TimeSpan.FromMilliseconds(500), Hour, _log, TimeProvider.System, _ => { });
        await parentGone.Ended.WaitAsync(Bound, ct);
        WslPump.GraceFor(WslPump.Ending.Interrupted, parentGone).Should().Be(parentGone.Grace, "nobody is about to kill the wrapper when its parent died; the Windows half may leave on its own");
    }

    [Fact]
    public async Task A_lost_parent_ends_the_pump_as_parent_gone_with_code_0()
    {
        var ct = TestContext.Current.CancellationToken;
        using var lifetime = Lifetime();
        var fromClient = new HeldStream(string.Empty);
        var toClient = new MemoryStream();

        var run = WslPump.RunAsync(Half(FakeChild.Stubborn(_root)), [], fromClient, toClient, lifetime, _log);
        var child = await StartedChildAsync(ct);

        _parent.SetResult();

        (await run.WaitAsync(Bound, ct)).Should().Be(new HostEnding(0, ExitReason.ParentGone));
        await ChildGoneAsync(child, ct);
    }

    [Fact]
    public async Task A_client_that_hangs_up_on_a_child_that_never_closes_stdout_still_ends_the_pump()
    {
        // The second half of defect B, in-process: the hang-up bound, then the grace, then the kill — and the ending
        // is the client's, because the client is what ended the session.
        var ct = TestContext.Current.CancellationToken;
        using var lifetime = Lifetime();
        var fromClient = new MemoryStream(Encoding.UTF8.GetBytes("{}\n"));
        var toClient = new MemoryStream();

        var run = WslPump.RunAsync(Half(FakeChild.Stubborn(_root)), [], fromClient, toClient, lifetime, _log);
        var child = await StartedChildAsync(ct);

        var ending = await run.WaitAsync(WslPump.HangUpBound + Bound, ct);
        ending.Reason.Should().Be(ExitReason.ClientClosed);
        await ChildGoneAsync(child, ct);
        _sink.Messages.Should().Contain(m => m.StartsWith("the session ended: ClientClosed", StringComparison.Ordinal));
        _sink.Messages.Should().Contain(m => m.StartsWith("the client hung up; waiting up to ", StringComparison.Ordinal), "a wrapper seen waiting is a wrapper draining, and its log says so (code round 1, finding 1)");
    }

    /// <summary>A child the lifetime could not end: its stop was refused and it is still there.</summary>
    private sealed class SurvivingChild : IManagedChild
    {
        public int Id => 4242;

        public bool HasExited => false;

        public int ExitCode => throw new InvalidOperationException("Process must exit before requested information can be determined.");

        public void CloseStdin()
        {
            // Ignored.
        }

        public Task WaitForExitAsync(CancellationToken ct) => Task.Delay(Timeout.Infinite, ct);

        public void KillTree()
        {
            // Refused.
        }
    }

    [Fact]
    public void A_child_that_could_not_be_ended_yields_a_code_of_its_own_rather_than_an_exception()
    {
        // Process.ExitCode throws for a process that has not exited; thrown from here it ended the pump without its
        // exit line and was read by RelayAsync as a missing Windows binary (own review, code round 1).
        var code = WslPump.ExitCodeOf(new SurvivingChild(), _log);

        code.Should().Be(WslPump.ChildStillRunning);
        _sink.Messages.Should().Contain(m => m.Contains("pid 4242") && m.Contains("still running"));
    }

    /// <summary>A child that ended, with a code of its own.</summary>
    private sealed class EndedChild : IManagedChild
    {
        public int Id => 4243;

        public bool HasExited => true;

        public int ExitCode => 7;

        public void CloseStdin()
        {
            // Already gone.
        }

        public Task WaitForExitAsync(CancellationToken ct) => Task.CompletedTask;

        public void KillTree()
        {
            // Already gone.
        }
    }

    [Fact]
    public void An_ended_child_answers_with_its_own_code_through_the_interface()
    {
        // Final code round, finding 1: the exit code reaches the pump through IManagedChild, not a concrete Process.
        WslPump.ExitCodeOf(new EndedChild(), _log).Should().Be(7);
        _sink.Messages.Should().BeEmpty("nothing to warn about");
    }

    [Fact]
    public async Task A_child_that_answers_and_leaves_ends_the_session_as_the_Windows_half_closing_with_its_code()
    {
        var ct = TestContext.Current.CancellationToken;
        using var lifetime = Lifetime();
        var fromClient = new HeldStream("hello\n");
        var toClient = new MemoryStream();

        var ending = await WslPump.RunAsync(Half(FakeChild.Oneshot(_root)), [], fromClient, toClient, lifetime, _log).WaitAsync(Bound, ct);

        ending.Should().Be(new HostEnding(0, ExitReason.WindowsHalfClosed));
        Encoding.UTF8.GetString(toClient.ToArray()).Trim().Should().Be("hello", "the child's one answer crossed the pump");
        _sink.Messages.Should().Contain(m => m.Contains("ended on its own"), "a child that closed its stdout and left was not killed");
    }

    [Fact]
    public async Task A_client_that_hangs_up_on_a_child_that_leaves_on_end_of_stream_ends_cleanly()
    {
        var ct = TestContext.Current.CancellationToken;
        using var lifetime = Lifetime();
        var fromClient = new MemoryStream(Encoding.UTF8.GetBytes("ping\n"));
        var toClient = new MemoryStream();

        var ending = await WslPump.RunAsync(Half(FakeChild.Echo(_root)), [], fromClient, toClient, lifetime, _log).WaitAsync(Bound, ct);

        ending.Should().Be(new HostEnding(0, ExitReason.ClientClosed));
        Encoding.UTF8.GetString(toClient.ToArray()).Trim().Should().Be("ping", "the echo of the last request still reached the client");
        _sink.Messages.Should().NotContain(m => m.Contains("stopping its process tree"), "the child left on end-of-stream; nothing was killed");
    }

    /// <summary>The child's pid from the pump's own line, once it is written.</summary>
    private async Task<int> StartedChildAsync(CancellationToken ct)
    {
        var clock = Stopwatch.StartNew();
        while (clock.Elapsed < Bound)
        {
            var line = _sink.Messages.FirstOrDefault(m => m.StartsWith("started the Windows half, pid ", StringComparison.Ordinal));
            if (line is not null)
            {
                return int.Parse(line[(line.LastIndexOf(' ') + 1)..], System.Globalization.CultureInfo.InvariantCulture);
            }
            await Task.Delay(50, ct);
        }
        throw new TimeoutException("the pump never logged the child it started");
    }

    private static async Task ChildGoneAsync(int pid, CancellationToken ct)
    {
        var clock = Stopwatch.StartNew();
        while (clock.Elapsed < Bound && Running(pid))
        {
            await Task.Delay(50, ct);
        }
        Running(pid).Should().BeFalse("the child (pid {0}) must be stopped by the pump, but it is still running", pid);
    }

    private static bool Running(int pid)
    {
        try
        {
            using var process = Process.GetProcessById(pid);
            return !process.HasExited;
        }
        catch (ArgumentException)
        {
            return false;
        }
    }
}
