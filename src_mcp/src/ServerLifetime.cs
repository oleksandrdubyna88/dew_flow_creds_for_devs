using System.Runtime.InteropServices;
using CredsForDevs.ServiceDefaults;
using Serilog;

namespace CredsMcp;

/// <summary>The three ways a session can be over, as tasks: the client's stream, the parent, a signal.</summary>
/// <param name="ClientGone">Completes at end-of-stream — the transport's <c>MessageReader.Completion</c>.</param>
/// <param name="ParentGone">Completes when the process that started this one is gone; never, when not watched.</param>
/// <param name="Signal">Completes with the first handled termination signal.</param>
internal sealed record LifetimeSignals(Task ClientGone, Task ParentGone, Task<PosixSignal> Signal);

/// <summary>How long an ending may take.</summary>
/// <param name="Drain">After end-of-stream, how long in-flight work may finish on its own before it is cancelled.</param>
/// <param name="Deadline">After cancellation, how long the server may take to stop before the process exits anyway.</param>
internal sealed record LifetimeTimings(TimeSpan Drain, TimeSpan Deadline)
{
    /// <summary>1 s drain, 5 s deadline — plan §3.2, the question consultant's numbers.</summary>
    internal static readonly LifetimeTimings Default = new(TimeSpan.FromSeconds(1), TimeSpan.FromSeconds(5));
}

/// <summary>
/// Runs the MCP server until its client is gone, and makes sure it then ENDS — defect A of
/// PLAN_wsl_bridge_outlives_its_client.md (§5.2).
/// </summary>
/// <remarks>
/// <para><b>Why this exists.</b> ModelContextProtocol 2.2.0 answers end-of-stream by waiting for every in-flight
/// handler without cancelling one (<c>McpSessionHandler.ProcessMessagesCoreAsync</c>), and the
/// <c>subscriptions/listen</c> handler every Claude Code session opens completes only on cancellation. So
/// <c>server.RunAsync()</c> without a token never returned, and every closed session left its server behind —
/// 51 of them on one machine in a day. The only lever the SDK offers is <c>RunAsync</c>'s token: cancelling
/// it cancels every handler, the listen included, and reaches the SDK's own disposal.</para>
/// <para><b>The order.</b> End-of-stream first gets a <see cref="LifetimeTimings.Drain"/>: a client that
/// half-closes still deserves the reply to what it already sent. A signal or a dead parent cancels at once —
/// nobody is left to read a reply. After cancelling, the server gets <see cref="LifetimeTimings.Deadline"/> to
/// stop; past it the process exits anyway, through <c>forceExit</c>, on a dedicated timer rather than a
/// continuation queued behind whatever is hanging. A run that finishes on its own never reaches the exit
/// path: a normal return is what flushes the log.</para>
/// <para><b>Pure orchestration over injected tasks</b>, so every branch is a unit test
/// (<c>ServerLifetimeTests</c>); <see cref="Program"/> supplies the real transport, signals and parent.</para>
/// </remarks>
internal static class ServerLifetime
{
    /// <summary>Run <paramref name="run"/> until it ends or one of <paramref name="signals"/> ends the session.</summary>
    /// <returns>How the run ended: code 0 for end-of-stream and parent loss, 128 + n for a handled signal.</returns>
    internal static async Task<HostEnding> RunAsync(
        Func<CancellationToken, Task> run,
        LifetimeSignals signals,
        LifetimeTimings timings,
        ILogger log,
        Action<HostEnding> forceExit,
        TimeProvider time)
    {
        using var stop = new CancellationTokenSource();
        var running = run(stop.Token);
        var ending = EndingOf(await Task.WhenAny(running, signals.ClientGone, signals.ParentGone, signals.Signal), signals);
        if (ending.Reason == ExitReason.ClientClosed)
        {
            // A signal or a lost parent that cuts the drain short is the reason recorded — whoever sent a
            // SIGINT reads 130, not a clean end-of-stream (code round, finding 2).
            ending = EndingOf(await DrainAsync(running, signals, timings.Drain, time), signals);
        }
        if (running.IsCompleted)
        {
            await running;
            return ending;
        }

        log.Information("stopping the server: {Reason:l}", HostRun.Word(ending.Reason));
        // Armed BEFORE cancelling: a callback on the run token that never returns would otherwise hold the
        // cancel itself, and the deadline would never exist (final code round, finding 0).
        using var deadline = time.CreateTimer(
            _ => DeadlinePassed(log, ending, timings.Deadline, forceExit), null, timings.Deadline, Timeout.InfiniteTimeSpan);
        await stop.CancelAsync();
        await StoppedAsync(running);
        return ending;
    }

    /// <summary>Which ending the first completed task stands for. The run finishing on its own is end-of-stream.</summary>
    internal static HostEnding EndingOf(Task first, LifetimeSignals signals) =>
        first switch
        {
            _ when first == signals.Signal => new HostEnding(ShutdownSignals.ExitCode(signals.Signal.Result), ExitReason.Signalled),
            _ when first == signals.ParentGone => new HostEnding(0, ExitReason.ParentGone),
            _ => new HostEnding(0, ExitReason.ClientClosed),
        };

    /// <summary>
    /// Give in-flight work up to <paramref name="drain"/> — ended early by the run finishing, a signal or the parent.
    /// </summary>
    /// <returns>The task that ended the drain, for <see cref="EndingOf"/>.</returns>
    private static async Task<Task> DrainAsync(Task running, LifetimeSignals signals, TimeSpan drain, TimeProvider time)
    {
        using var cut = new CancellationTokenSource();
        var window = Task.Delay(drain, time, cut.Token);
        var first = await Task.WhenAny(running, window, signals.ParentGone, signals.Signal);
        await cut.CancelAsync();
        return first;
    }

    /// <summary>Wait for a cancelled run; its cancellation is the expected ending, not a failure.</summary>
    private static async Task StoppedAsync(Task running)
    {
        try
        {
            await running;
        }
        catch (OperationCanceledException)
        {
            // The run token was cancelled by us; that is how the server was asked to stop.
        }
    }

    /// <summary>The deadline fired: say so, with the reason the shutdown began, and leave.</summary>
    private static void DeadlinePassed(ILogger log, HostEnding ending, TimeSpan deadline, Action<HostEnding> forceExit)
    {
        log.Warning(
            "the server did not stop within {DeadlineSeconds} s of the shutdown ({Reason:l}); exiting without it",
            deadline.TotalSeconds,
            HostRun.Word(ending.Reason));
        forceExit(ending);
    }
}
