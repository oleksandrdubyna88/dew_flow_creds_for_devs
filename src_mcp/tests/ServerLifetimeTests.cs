using System.Runtime.InteropServices;
using CredsForDevs.ServiceDefaults;
using CredsForDevs.ServiceDefaults.Tests.Support;
using CredsMcp;
using FluentAssertions;

namespace CredsMcp.Tests;

/// <summary>
/// Every branch of <see cref="ServerLifetime"/> (E2.S2): end-of-stream then drain, a signal, the parent, the
/// deadline, and a run that finishes on its own.
/// </summary>
/// <remarks>
/// The run is a fake that either honours its token or ignores it; the three session-ending signals are
/// completion sources the test completes. Durations are real but chosen so the asserted branch cannot be
/// reached by the other one's clock: a drain of an hour proves that a signal did not wait for it.
/// </remarks>
public sealed class ServerLifetimeTests
{
    private static readonly TimeSpan Hour = TimeSpan.FromHours(1);
    private static readonly TimeSpan Bound = TimeSpan.FromSeconds(10);

    private readonly TaskCompletionSource _client = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly TaskCompletionSource _parent = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly TaskCompletionSource<PosixSignal> _signal = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly TaskCompletionSource<HostEnding> _forced = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly CollectingSink _sink = new();

    private LifetimeSignals Signals => new(_client.Task, _parent.Task, _signal.Task);

    private Task<HostEnding> Run(Func<CancellationToken, Task> run, LifetimeTimings timings) =>
        ServerLifetime.RunAsync(run, Signals, timings, _sink.Logger(), ending => _forced.TrySetResult(ending), TimeProvider.System);

    /// <summary>A server that stops only when told to — the listen handler's shape.</summary>
    private static async Task UntilCancelled(CancellationToken ct) => await Task.Delay(Timeout.Infinite, ct);

    [Fact]
    public async Task A_run_that_finishes_on_its_own_ends_as_client_closed_and_never_exits_the_process()
    {
        var ending = await Run(_ => Task.CompletedTask, new LifetimeTimings(Hour, Hour)).WaitAsync(Bound, TestContext.Current.CancellationToken);

        ending.Should().Be(new HostEnding(0, ExitReason.ClientClosed));
        _forced.Task.IsCompleted.Should().BeFalse("a normal return is what flushes the log; the exit path is for a hang");
        _sink.Messages.Should().NotContain(m => m.Contains("stopping"), "nothing had to be stopped");
    }

    [Fact]
    public async Task End_of_stream_waits_for_in_flight_work_to_finish_within_the_drain()
    {
        var finish = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var cancelled = false;
        var running = Run(
            async ct =>
            {
                using var _ = ct.Register(() => cancelled = true);
                await finish.Task;
            },
            new LifetimeTimings(Hour, Hour));

        _client.SetResult();
        await Task.Delay(50, TestContext.Current.CancellationToken);
        finish.SetResult();

        (await running.WaitAsync(Bound, TestContext.Current.CancellationToken)).Should().Be(new HostEnding(0, ExitReason.ClientClosed));
        cancelled.Should().BeFalse("the last reply to a half-closed client is still delivered");
    }

    [Fact]
    public async Task End_of_stream_cancels_what_is_still_running_when_the_drain_runs_out()
    {
        var running = Run(UntilCancelled, new LifetimeTimings(TimeSpan.FromMilliseconds(50), Hour));

        _client.SetResult();

        (await running.WaitAsync(Bound, TestContext.Current.CancellationToken)).Should().Be(new HostEnding(0, ExitReason.ClientClosed));
        _forced.Task.IsCompleted.Should().BeFalse("the cancelled run stopped by itself, inside the deadline");
        _sink.Messages.Should().Contain("stopping the server: clientClosed");
    }

    [Fact]
    public async Task A_signal_cancels_at_once_and_exits_128_plus_its_number()
    {
        var running = Run(UntilCancelled, new LifetimeTimings(Hour, Hour));

        _signal.SetResult(PosixSignal.SIGTERM);

        (await running.WaitAsync(Bound, TestContext.Current.CancellationToken)).Should().Be(new HostEnding(143, ExitReason.Signalled), "no drain: nobody is left to read a reply");
    }

    [Fact]
    public async Task A_signal_during_the_drain_cuts_it_short_and_its_code_is_the_exit_code()
    {
        // Code round finding 2: whoever sent the signal reads 128 + n; a drain the signal cut short must not
        // turn its SIGINT into a clean end-of-stream exit.
        var running = Run(UntilCancelled, new LifetimeTimings(Hour, Hour));

        _client.SetResult();
        await Task.Delay(50, TestContext.Current.CancellationToken);
        _signal.SetResult(PosixSignal.SIGINT);

        (await running.WaitAsync(Bound, TestContext.Current.CancellationToken)).Should().Be(new HostEnding(130, ExitReason.Signalled));
    }

    [Fact]
    public async Task A_parent_lost_during_the_drain_is_the_reason_recorded()
    {
        var running = Run(UntilCancelled, new LifetimeTimings(Hour, Hour));

        _client.SetResult();
        await Task.Delay(50, TestContext.Current.CancellationToken);
        _parent.SetResult();

        (await running.WaitAsync(Bound, TestContext.Current.CancellationToken)).Should().Be(new HostEnding(0, ExitReason.ParentGone));
    }

    [Fact]
    public async Task A_drain_that_runs_out_keeps_end_of_stream_as_the_reason()
    {
        var running = Run(UntilCancelled, new LifetimeTimings(TimeSpan.FromMilliseconds(30), Hour));

        _client.SetResult();

        (await running.WaitAsync(Bound, TestContext.Current.CancellationToken)).Should().Be(new HostEnding(0, ExitReason.ClientClosed));
    }

    [Fact]
    public async Task A_parent_that_is_gone_cancels_at_once_and_exits_zero()
    {
        var running = Run(UntilCancelled, new LifetimeTimings(Hour, Hour));

        _parent.SetResult();

        (await running.WaitAsync(Bound, TestContext.Current.CancellationToken)).Should().Be(new HostEnding(0, ExitReason.ParentGone));
        _sink.Messages.Should().Contain("stopping the server: parentGone");
    }

    [Fact]
    public async Task A_run_that_ignores_cancellation_is_ended_by_the_deadline_with_the_reason_that_began_it()
    {
        _ = Run(_ => Task.Delay(Timeout.Infinite, TestContext.Current.CancellationToken), new LifetimeTimings(TimeSpan.Zero, TimeSpan.FromMilliseconds(100)));

        _signal.SetResult(PosixSignal.SIGHUP);

        (await _forced.Task.WaitAsync(Bound, TestContext.Current.CancellationToken)).Should().Be(new HostEnding(129, ExitReason.Signalled));
        _sink.Messages.Should().Contain(m => m.Contains("did not stop within 0.1 s") && m.Contains("signalled"));
    }

    [Fact]
    public async Task A_cancellation_callback_that_blocks_is_still_ended_by_the_deadline()
    {
        // Final code round, finding 0: the deadline must be armed BEFORE cancelling — a callback registered on
        // the run token that never returns would otherwise hold the cancel, and the timer would never exist.
        using var blocker = new ManualResetEventSlim(false);
        try
        {
            _ = Run(
                ct =>
                {
                    ct.Register(() => blocker.Wait());
                    return Task.Delay(Timeout.Infinite, TestContext.Current.CancellationToken);
                },
                new LifetimeTimings(Hour, TimeSpan.FromMilliseconds(100)));

            _signal.SetResult(PosixSignal.SIGTERM);

            (await _forced.Task.WaitAsync(Bound, TestContext.Current.CancellationToken)).Should().Be(new HostEnding(143, ExitReason.Signalled));
        }
        finally
        {
            blocker.Set();
        }
    }

    [Fact]
    public async Task A_failing_run_is_not_swallowed()
    {
        // A broken stream is the caller's to name (clientDisconnected); this class must not hide it.
        var running = Run(_ => Task.FromException(new IOException("pipe broke")), new LifetimeTimings(Hour, Hour));

        await running.Invoking(r => r.WaitAsync(Bound, TestContext.Current.CancellationToken)).Should().ThrowAsync<IOException>();
    }

    [Theory]
    [InlineData(PosixSignal.SIGHUP, 129)]
    [InlineData(PosixSignal.SIGINT, 130)]
    [InlineData(PosixSignal.SIGQUIT, 131)]
    [InlineData(PosixSignal.SIGTERM, 143)]
    public void The_exit_code_of_a_signal_is_the_shells_convention(PosixSignal signal, int code) =>
        ShutdownSignals.ExitCode(signal).Should().Be(code);
}
