using System.Diagnostics;
using System.Runtime.InteropServices;
using CredsForDevs.ServiceDefaults.Tests.Support;
using FluentAssertions;

namespace CredsForDevs.ServiceDefaults.Tests;

/// <summary>
/// Every rule of <see cref="ChildLifetime"/> over fakes (E3.S1): the stop order, the grace, idempotence, the first
/// reason winning, 128 + n, a throwing child not stopping the others, the parent's death, the backstop — and the
/// production adapter against a real child.
/// </summary>
public sealed class ChildLifetimeTests : IDisposable
{
    private static readonly TimeSpan Bound = TimeSpan.FromSeconds(10);
    private static readonly TimeSpan Hour = TimeSpan.FromHours(1);
    private static readonly TimeSpan Short = TimeSpan.FromMilliseconds(150);

    private readonly TaskCompletionSource<PosixSignal> _signal = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly TaskCompletionSource _parent = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly TaskCompletionSource<HostEnding> _exited = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly CollectingSink _sink = new();
    private readonly Serilog.Core.Logger _log;

    public ChildLifetimeTests() => _log = _sink.Logger();

    public void Dispose() => _log.Dispose();

    /// <summary>A child that remembers the order it was asked to leave in, and leaves when the test says.</summary>
    private sealed class FakeChild(int id, bool leavesOnEof) : IManagedChild
    {
        private readonly TaskCompletionSource _exited = new(TaskCreationOptions.RunContinuationsAsynchronously);

        internal List<string> Steps { get; } = [];

        public int Id => id;

        public bool HasExited => _exited.Task.IsCompleted;

        public void CloseStdin()
        {
            Steps.Add("stdin closed");
            if (leavesOnEof)
            {
                _exited.TrySetResult();
            }
        }

        public Task WaitForExitAsync(CancellationToken ct) => _exited.Task.WaitAsync(ct);

        public void KillTree()
        {
            Steps.Add("tree killed");
            _exited.TrySetResult();
        }
    }

    /// <summary>A child whose every step throws what a process that already left throws.</summary>
    private sealed class GoneChild : IManagedChild
    {
        public int Id => 404;

        public bool HasExited => true;

        public void CloseStdin() => throw new InvalidOperationException("No process is associated with this object.");

        public Task WaitForExitAsync(CancellationToken ct) => throw new InvalidOperationException("No process is associated with this object.");

        public void KillTree() => throw new InvalidOperationException("No process is associated with this object.");
    }

    private ChildLifetime Lifetime(TimeSpan grace, TimeSpan backstop) =>
        new(_signal.Task, _parent.Task, grace, backstop, _log, TimeProvider.System, ending => _exited.TrySetResult(ending));

    [Fact]
    public async Task A_child_that_leaves_on_end_of_stream_is_never_killed()
    {
        using var lifetime = Lifetime(Hour, Hour);
        var child = new FakeChild(1, leavesOnEof: true);
        lifetime.Track(child);

        await lifetime.StopAllAsync().WaitAsync(Bound, TestContext.Current.CancellationToken);

        child.Steps.Should().Equal("stdin closed");
    }

    [Fact]
    public async Task A_child_that_ignores_end_of_stream_has_its_tree_killed_after_the_grace()
    {
        using var lifetime = Lifetime(Short, Hour);
        var child = new FakeChild(2, leavesOnEof: false);
        lifetime.Track(child);

        var clock = Stopwatch.StartNew();
        await lifetime.StopAllAsync().WaitAsync(Bound, TestContext.Current.CancellationToken);

        child.Steps.Should().Equal(["stdin closed", "tree killed"], "the gentle step first, the tree only when it did not take");
        clock.Elapsed.Should().BeGreaterThanOrEqualTo(Short, "the grace was waited out before the kill");
        _sink.Messages.Should().Contain(m => m.Contains("did not exit within") && m.Contains("stopping its process tree"));
    }

    [Fact]
    public async Task Stopping_everything_twice_runs_once_and_a_child_tracked_late_is_stopped_at_once()
    {
        using var lifetime = Lifetime(Hour, Hour);
        var first = new FakeChild(3, leavesOnEof: true);
        lifetime.Track(first);

        var stop = lifetime.StopAllAsync();
        lifetime.StopAllAsync().Should().BeSameAs(stop, "one shared task, whoever asks");
        await stop.WaitAsync(Bound, TestContext.Current.CancellationToken);
        first.Steps.Should().Equal("stdin closed");

        var late = new FakeChild(4, leavesOnEof: true);
        lifetime.Track(late);
        await WaitUntilAsync(() => late.Steps.Count > 0);
        late.Steps.Should().Equal(["stdin closed"], "a child that arrives after the stop began is not left running");
    }

    [Fact]
    public async Task A_child_that_throws_does_not_stop_the_others_from_being_stopped()
    {
        using var lifetime = Lifetime(Hour, Hour);
        var gone = new GoneChild();
        var alive = new FakeChild(5, leavesOnEof: true);
        lifetime.Track(gone);
        lifetime.Track(alive);

        await lifetime.StopAllAsync().WaitAsync(Bound, TestContext.Current.CancellationToken);

        alive.Steps.Should().Equal("stdin closed");
        _sink.Exceptions.Should().ContainSingle().Which.Should().BeOfType<InvalidOperationException>("the race is logged at Debug, not thrown");
    }

    [Theory]
    [InlineData(PosixSignal.SIGINT, 130)]
    [InlineData(PosixSignal.SIGTERM, 143)]
    [InlineData(PosixSignal.SIGHUP, 129)]
    [InlineData(PosixSignal.SIGQUIT, 131)]
    public async Task A_signal_fires_the_shutdown_token_and_is_the_ending_with_the_shell_exit_code(PosixSignal signal, int code)
    {
        using var lifetime = Lifetime(Hour, Hour);
        lifetime.ShuttingDown.Should().BeFalse();
        lifetime.EndingOr(new HostEnding(0, ExitReason.ListenerClosed)).Should().Be(new HostEnding(0, ExitReason.ListenerClosed), "nothing has ended the session yet");

        _signal.SetResult(signal);

        var ending = await lifetime.Ended.WaitAsync(Bound, TestContext.Current.CancellationToken);
        ending.Should().Be(new HostEnding(code, ExitReason.Signalled));
        await WaitUntilAsync(() => lifetime.Shutdown.IsCancellationRequested);
        lifetime.EndingOr(new HostEnding(0, ExitReason.ClientClosed)).Should().Be(ending, "a signal that arrived wins over the loop's own reason");
        _sink.Messages.Should().Contain($"shutting down: signalled, exit code {code}");
    }

    [Fact]
    public async Task A_parent_that_is_gone_ends_the_session_with_code_0()
    {
        using var lifetime = Lifetime(Hour, Hour);

        _parent.SetResult();

        (await lifetime.Ended.WaitAsync(Bound, TestContext.Current.CancellationToken)).Should().Be(new HostEnding(0, ExitReason.ParentGone));
        await WaitUntilAsync(() => lifetime.Shutdown.IsCancellationRequested);
    }

    [Fact]
    public async Task The_first_reason_wins()
    {
        using var lifetime = Lifetime(Hour, Hour);

        _parent.SetResult();
        await lifetime.Ended.WaitAsync(Bound, TestContext.Current.CancellationToken);
        _signal.SetResult(PosixSignal.SIGTERM);
        await Task.Delay(50, TestContext.Current.CancellationToken);

        (await lifetime.Ended).Should().Be(new HostEnding(0, ExitReason.ParentGone), "a later signal changes nothing");
        _sink.Messages.Should().ContainSingle(m => m.StartsWith("shutting down:"));
    }

    [Fact]
    public async Task The_backstop_exits_the_process_when_the_owner_does_not_end_in_time()
    {
        using var lifetime = Lifetime(Short, Short);

        _signal.SetResult(PosixSignal.SIGINT);

        var forced = await _exited.Task.WaitAsync(Bound, TestContext.Current.CancellationToken);
        forced.Should().Be(new HostEnding(130, ExitReason.Signalled), "the exit carries the reason that began the shutdown");
        _sink.Messages.Should().Contain(m => m.Contains("did not end within") && m.Contains("exiting without it"));
    }

    [Fact]
    public async Task A_session_that_ends_in_time_never_reaches_the_backstop()
    {
        var lifetime = Lifetime(Short, Short);
        _signal.SetResult(PosixSignal.SIGINT);
        await lifetime.Ended.WaitAsync(Bound, TestContext.Current.CancellationToken);

        lifetime.Dispose();
        await Task.Delay(Short + Short + Short, TestContext.Current.CancellationToken);

        _exited.Task.IsCompleted.Should().BeFalse("a disposed lifetime is an owner that returned normally; its exit line is written by the return");
    }

    [Fact]
    public async Task Stopping_one_child_forgets_it_so_a_later_stop_of_everything_does_not_stop_it_again()
    {
        using var lifetime = Lifetime(Hour, Hour);
        var child = new FakeChild(6, leavesOnEof: true);
        lifetime.Track(child);

        await lifetime.StopAsync(child).WaitAsync(Bound, TestContext.Current.CancellationToken);
        await lifetime.StopAllAsync().WaitAsync(Bound, TestContext.Current.CancellationToken);

        child.Steps.Should().Equal(["stdin closed"], "once — the relay stops a connection's child, then later every child it still holds");
    }

    [Fact]
    public async Task The_production_adapter_closes_a_real_child_stdin_and_the_child_leaves_without_a_kill()
    {
        // A child that reads its stdin and leaves on end-of-stream: `cat`, or `cmd` reading its commands.
        using var process = Process.Start(Reader())!;
        using var lifetime = Lifetime(Bound, Hour);
        var child = lifetime.Track(process);

        await lifetime.StopAllAsync().WaitAsync(Bound, TestContext.Current.CancellationToken);

        process.HasExited.Should().BeTrue();
        child.HasExited.Should().BeTrue();
        _sink.Messages.Should().Contain(m => m.Contains("ended on its own after its stdin closed"));
    }

    [Fact]
    public async Task The_production_adapter_kills_a_real_child_that_ignores_end_of_stream()
    {
        // A child that never reads stdin: `sleep`, or `ping` counting down. Only its tree being killed ends it.
        using var process = Process.Start(Sleeper())!;
        using var lifetime = Lifetime(Short, Hour);
        lifetime.Track(process);

        await lifetime.StopAllAsync().WaitAsync(Bound, TestContext.Current.CancellationToken);

        process.HasExited.Should().BeTrue("the tree was killed after the grace");
        _sink.Messages.Should().Contain(m => m.Contains($"child {process.Id} did not exit within"));
    }

    [Fact]
    public async Task The_production_adapter_treats_a_child_that_already_left_as_the_ordinary_race()
    {
        using var process = Process.Start(Reader())!;
        process.StandardInput.Close();
        await process.WaitForExitAsync(TestContext.Current.CancellationToken);
        using var lifetime = Lifetime(Short, Hour);
        var child = lifetime.Track(process);

        var stop = () => lifetime.StopAsync(child).WaitAsync(Bound, TestContext.Current.CancellationToken);

        await stop.Should().NotThrowAsync("a second close and a kill of an exited process are swallowed");
    }

    [Fact]
    public async Task A_child_its_owner_already_disposed_is_the_ordinary_race_not_a_crash_of_the_stop()
    {
        // The relay's race, found by its in-process test: a connection ends and disposes its Process while the
        // shutdown's StopAllAsync is still stopping the same child. Every member of a disposed Process throws
        // InvalidOperationException — the pid for the log line included — and a stop that throws out of its own
        // catch takes the whole shutdown down with it.
        var process = Process.Start(Reader())!;
        using var lifetime = Lifetime(Short, Hour);
        var child = lifetime.Track(process);
        var id = process.Id;
        process.Dispose();

        var stop = () => lifetime.StopAsync(child).WaitAsync(Bound, TestContext.Current.CancellationToken);

        await stop.Should().NotThrowAsync("the owner let go first; nothing is left for the lifetime to do");
        child.Id.Should().Be(id, "the pid is remembered from when the child was alive, so a log line can still name it");
        child.HasExited.Should().BeTrue("a child nobody holds any more is over as far as a stop is concerned");
        await lifetime.StopAllAsync().WaitAsync(Bound, TestContext.Current.CancellationToken);
    }

    [Fact]
    public void Start_registers_with_the_OS_and_hooks_process_exit_without_ending_anything()
    {
        using var lifetime = ChildLifetime.Start(_log, ParentWatch.Off("a test", _log), ChildLifetime.DefaultGrace, _ => throw new InvalidOperationException("never"));

        lifetime.ShuttingDown.Should().BeFalse();
        lifetime.Shutdown.IsCancellationRequested.Should().BeFalse();
        lifetime.Grace.Should().Be(ChildLifetime.DefaultGrace);
    }

    private static ProcessStartInfo Reader() =>
        new(OperatingSystem.IsWindows() ? "cmd.exe" : "cat") { RedirectStandardInput = true, RedirectStandardOutput = true, UseShellExecute = false, CreateNoWindow = true };

    private static ProcessStartInfo Sleeper() =>
        OperatingSystem.IsWindows()
            ? new("ping.exe") { ArgumentList = { "-n", "60", "127.0.0.1" }, RedirectStandardInput = true, RedirectStandardOutput = true, UseShellExecute = false, CreateNoWindow = true }
            : new("sleep") { ArgumentList = { "60" }, RedirectStandardInput = true, UseShellExecute = false };

    private static async Task WaitUntilAsync(Func<bool> condition)
    {
        var clock = Stopwatch.StartNew();
        while (!condition() && clock.Elapsed < Bound)
        {
            await Task.Delay(20, TestContext.Current.CancellationToken);
        }
        condition().Should().BeTrue("the condition did not hold within {0}", Bound);
    }
}
