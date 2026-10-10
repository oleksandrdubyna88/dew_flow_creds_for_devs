using System.Runtime.InteropServices;
using Serilog;

namespace CredsForDevs.ServiceDefaults;

/// <summary>
/// The lifetime of a process that holds children for a client: it ends within a bounded time of a termination
/// signal or its parent's death, and stops every child it started before it goes — defects B and C of
/// PLAN_wsl_bridge_outlives_its_client.md (§5.4).
/// </summary>
/// <remarks>
/// <para><b>Why one helper.</b> The Linux half of the WSL bridge (<c>WslPump</c>) and the SSH-agent relay
/// (<c>AgentRelay</c>) each hold Windows children for somebody else's session, and each had its own partial
/// ending: the pump a <c>ProcessExit</c> hook that a SIGINT never ran, the relay nothing at all. One stop routine,
/// one mapping from a signal to an exit code, one backstop — composed from the primitives E2 already shared here
/// (<see cref="ShutdownSignals"/>, <see cref="ParentWatch"/>) rather than a second implementation of either.</para>
/// <para><b>The stop order, per child:</b> close its stdin (the end-of-stream every creds child ends on by itself),
/// wait the grace, then kill its whole tree — killing the <c>/init</c> interop proxy is what ends a Windows half
/// (measured). A child that already left throws at one of those steps, and that is swallowed: it is the ordinary
/// race. One child's failure never stops the others.</para>
/// <para><b>What ends the session:</b> the first of a handled signal (exit 128 + n, <see cref="ExitReason.Signalled"/>)
/// and the parent's death (exit 0, <see cref="ExitReason.ParentGone"/>) — the first reason wins. <see cref="Shutdown"/>
/// fires for the owner's loops; the owner then stops its children and returns normally, which is what writes the
/// exit line and flushes the log. A <b>backstop</b> timer, armed the moment the shutdown begins, exits the process
/// through <c>forceExit</c> after <c>grace + 2 s</c> anyway: a blocking read of the client's stdin cannot be
/// cancelled, and with the signal's default disposition suppressed nothing else would end the process.</para>
/// <para><b><c>ProcessExit</c></b> stops every tracked child synchronously, with a bound — the path a forced exit
/// takes, and the one the pump's old hook was meant for.</para>
/// <para><b>One stop per child, shared.</b> A connection's own stop of its child and the shutdown's stop of every
/// child meet on the same process (the relay: a connection that ended just before the signal). Whoever asks second
/// gets the stop already in flight, and <see cref="StopAllAsync"/> waits for every stop in flight — not only the
/// children it found still tracked — so the relay cannot remove its socket and return while a child's grace is still
/// running (own review, code round 1). And a child tracked once the stop has BEGUN is stopped at once: the flag is set
/// under the lock before the snapshot, not published after it (code round 1, finding 0).</para>
/// </remarks>
public sealed class ChildLifetime : IDisposable
{
    /// <summary>How long a child is given to leave on its own after its stdin closes, before its tree is killed.</summary>
    /// <remarks>
    /// 2 s rather than the plan's 1 s for the pump: the Windows half's own end-of-stream drain is 1 s (E2), so a 1 s
    /// grace would kill it at the moment it was exiting on its own and cost its log the exit line every time.
    /// </remarks>
    public static readonly TimeSpan DefaultGrace = TimeSpan.FromSeconds(2);

    /// <summary>After the grace, how much longer the process may take to end before it is exited anyway.</summary>
    public static readonly TimeSpan BackstopAfterGrace = TimeSpan.FromSeconds(2);

    private readonly ILogger _log;
    private readonly TimeProvider _time;
    private readonly Action<HostEnding> _exit;
    private readonly TimeSpan _backstopAfterGrace;
    private readonly CancellationTokenSource _shutdown = new();
    private readonly TaskCompletionSource<HostEnding> _ended = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly HashSet<IManagedChild> _children = [];
    private readonly Dictionary<IManagedChild, Task> _stops = [];
    private readonly Lock _gate = new();
    private readonly Lazy<Task> _stopAll;
    private bool _stopping;
    private readonly List<IDisposable> _owned = [];
    private IDisposable _backstop = Nothing.Instance;
    private bool _disposed;

    /// <summary>The test seam: the two endings as tasks, every duration and the exit injectable.</summary>
    internal ChildLifetime(
        Task<PosixSignal> signal,
        Task parentGone,
        TimeSpan grace,
        TimeSpan backstopAfterGrace,
        ILogger log,
        TimeProvider time,
        Action<HostEnding> exit)
    {
        Grace = grace;
        _backstopAfterGrace = backstopAfterGrace;
        _log = log;
        _time = time;
        _exit = exit;
        _stopAll = new Lazy<Task>(StopEveryChildAsync);
        _ = WatchAsync(signal, parentGone);
    }

    /// <summary>How long a child is given to leave on its own.</summary>
    public TimeSpan Grace { get; }

    /// <summary>Fires when a signal or the parent ends the session — for the owner's accept and pump loops.</summary>
    public CancellationToken Shutdown => _shutdown.Token;

    /// <summary>Completes with the ending that began the shutdown; never, while the session is alive.</summary>
    public Task<HostEnding> Ended => _ended.Task;

    /// <summary>Whether a signal or the parent has ended the session.</summary>
    public bool ShuttingDown => _ended.Task.IsCompleted;

    /// <summary>Whether a handled SIGNAL ended the session — the client's kill of this process is then on its way.</summary>
    public bool Signalled => _ended.Task.IsCompletedSuccessfully && _ended.Task.Result.Reason == ExitReason.Signalled;

    /// <summary>
    /// Register the four termination signals and begin: the lifetime owns <paramref name="parent"/> and the
    /// registration, and hooks <c>ProcessExit</c> to stop every tracked child.
    /// </summary>
    /// <param name="log">The host's logger.</param>
    /// <param name="parent">The parent watch — started, or <see cref="ParentWatch.Off"/> with its reason logged.</param>
    /// <param name="grace">How long a child may take to leave on its own after its stdin closes.</param>
    /// <param name="forceExit">How the process ends when the backstop passes: the exit line, a flushed log, then exit.</param>
    public static ChildLifetime Start(ILogger log, ParentWatch parent, TimeSpan grace, Action<HostEnding> forceExit)
    {
        var signals = ShutdownSignals.Register();
        var lifetime = new ChildLifetime(signals.Received, parent.Gone, grace, BackstopAfterGrace, log, TimeProvider.System, forceExit);
        lifetime._owned.Add(signals);
        lifetime._owned.Add(parent);
        lifetime.HookProcessExit();
        return lifetime;
    }

    /// <summary>Hold a child this process started, so a shutdown stops it.</summary>
    public IManagedChild Track(System.Diagnostics.Process child)
    {
        var managed = new ManagedProcess(child);
        Track(managed);
        return managed;
    }

    /// <summary>The seam for tests: track a fake. A child tracked after the stop began is stopped at once.</summary>
    internal void Track(IManagedChild child)
    {
        lock (_gate)
        {
            _children.Add(child);
            // Started under the SAME lock (the lock is reentrant; the stop runs off it after its first yield), so the
            // stop is in _stops before InFlightAsync can take an empty snapshot (checkpoint round, finding 1).
            if (_stopping)
            {
                _ = StopAsync(child);
            }
        }
    }

    /// <summary>Stop every tracked child, in parallel — idempotent: one shared task, whoever asks first or last.</summary>
    public Task StopAllAsync() => _stopAll.Value;

    /// <summary>Stop one child with the lifetime's grace and forget it.</summary>
    public Task StopAsync(IManagedChild child) => StopAsync(child, Grace);

    /// <summary>
    /// Stop one child: close its stdin, wait <paramref name="grace"/> for it to leave, kill its tree if it has not.
    /// </summary>
    /// <remarks>
    /// The one killer. Nothing here is ever found by name: the child is the handle the owner started. A stop already
    /// in flight for this child is the task returned — the grace of the first caller stands.
    /// </remarks>
    public Task StopAsync(IManagedChild child, TimeSpan grace)
    {
        lock (_gate)
        {
            _children.Remove(child);
            if (_stops.TryGetValue(child, out var inFlight))
            {
                return inFlight;
            }
            var stop = StopGuardedAsync(child, grace);
            _stops[child] = stop;
            return stop;
        }
    }

    private async Task StopGuardedAsync(IManagedChild child, TimeSpan grace)
    {
        // Registered under the lock, run off it: a child's stdin close can block (a full pipe, a slow far end), and a
        // stop that ran its first step while holding the lock would stall every Track and every other stop with it.
        await Task.Yield();
        // Read before anything can throw: a stop must never fail in its own catch block.
        var pid = child.Id;
        try
        {
            await EndAsync(child, grace);
        }
        catch (Exception e) when (ManagedProcess.IsAlreadyGone(e))
        {
            Survived(child, pid, e);
        }
        finally
        {
            Forget(child);
        }
    }

    /// <summary>A step threw: the ordinary race when the child has left — and the one line a person must read when it has not.</summary>
    private void Survived(IManagedChild child, int pid, Exception e)
    {
        if (child.HasExited)
        {
            _log.Debug(e, "child {ChildPid} had already ended", pid);
            return;
        }
        _log.Warning(e, "child {ChildPid} is still running: its stop was refused, and nothing more can end it from here", pid);
    }

    private void Forget(IManagedChild child)
    {
        lock (_gate)
        {
            _stops.Remove(child);
        }
    }

    /// <summary>The ending that began the shutdown when one did; <paramref name="ordinary"/> otherwise.</summary>
    /// <remarks>
    /// So an owner whose loop ended for its own reason — the client closed, the listener closed — still reports a
    /// signal that arrived meanwhile as 128 + n, the way E2's drain does (its code round, finding 2).
    /// </remarks>
    public HostEnding EndingOr(HostEnding ordinary) =>
        _ended.Task.IsCompletedSuccessfully ? _ended.Task.Result : ordinary;

    /// <summary>Which ending the first completed task stands for.</summary>
    internal static HostEnding EndingOf(Task first, Task<PosixSignal> signal) =>
        first == signal
            ? new HostEnding(ShutdownSignals.ExitCode(signal.Result), ExitReason.Signalled)
            : new HostEnding(0, ExitReason.ParentGone);

    private async Task WatchAsync(Task<PosixSignal> signal, Task parentGone)
    {
        var first = await Task.WhenAny(signal, parentGone);
        await BeginAsync(EndingOf(first, signal));
    }

    /// <summary>The shutdown begins: the backstop is armed FIRST, then the owner's token fires.</summary>
    private async Task BeginAsync(HostEnding ending)
    {
        lock (_gate)
        {
            if (_disposed || !_ended.TrySetResult(ending))
            {
                return;
            }
            _log.Information("shutting down: {Reason:l}, exit code {ExitCode}", HostRun.Word(ending.Reason), ending.Code);
            // Armed before anything is cancelled (E2's lesson, its final code round): a continuation on the token
            // that blocks must not hold the timer from ever existing.
            _backstop = _time.CreateTimer(_ => BackstopPassed(ending), null, Grace + _backstopAfterGrace, Timeout.InfiniteTimeSpan);
        }
        try
        {
            await _shutdown.CancelAsync();
        }
        catch (ObjectDisposedException)
        {
            // Disposed between the lock and the cancel: the owner has already returned, and nothing is listening.
        }
    }

    private void BackstopPassed(HostEnding ending)
    {
        _log.Warning(
            "the process did not end within {BackstopSeconds} s of the shutdown ({Reason:l}); exiting without it",
            (Grace + _backstopAfterGrace).TotalSeconds,
            HostRun.Word(ending.Reason));
        _exit(ending);
    }

    private async Task StopEveryChildAsync()
    {
        Task[] stops;
        lock (_gate)
        {
            // The flag first, under the lock: from here a Track is a stop. Then every child still tracked, plus every
            // stop already in flight — a connection's own, a late Track's.
            _stopping = true;
            foreach (var child in _children.ToArray())
            {
                _ = StopAsync(child);
            }
            stops = [.. _stops.Values];
        }
        // Each stop swallows what a child that already left throws, so one child never holds up the rest.
        await Task.WhenAll(stops);
        // A child tracked while those ran started a stop of its own (Track, once the flag is set); stopping everything
        // is over only when no stop is in flight — never by the order a signal and an accept happened to interleave.
        await InFlightAsync();
    }

    private async Task InFlightAsync()
    {
        while (true)
        {
            Task[] pending;
            lock (_gate)
            {
                pending = [.. _stops.Values];
            }
            if (pending.Length == 0)
            {
                return;
            }
            await Task.WhenAll(pending);
        }
    }

    private async Task EndAsync(IManagedChild child, TimeSpan grace)
    {
        child.CloseStdin();
        if (await ExitedWithinAsync(child, grace))
        {
            _log.Debug("child {ChildPid} ended on its own after its stdin closed", child.Id);
            return;
        }
        _log.Information(
            "child {ChildPid} did not exit within {GraceSeconds} s of its stdin closing; stopping its process tree",
            child.Id,
            grace.TotalSeconds);
        child.KillTree();
        // A killed tree ends at once; bounded anyway, so a wait on a handle that will not signal cannot hold a shutdown.
        if (!await ExitedWithinAsync(child, _backstopAfterGrace))
        {
            _log.Warning("child {ChildPid} is still running after its tree was killed; nothing more can end it from here", child.Id);
        }
    }

    private async Task<bool> ExitedWithinAsync(IManagedChild child, TimeSpan bound)
    {
        using var window = new CancellationTokenSource(bound, _time);
        try
        {
            await child.WaitForExitAsync(window.Token);
            return true;
        }
        catch (OperationCanceledException)
        {
            return false;
        }
    }

    private void HookProcessExit()
    {
        // CancellationToken.None on purpose: the shutdown token has fired by now, and this IS the cleanup it must not cut short.
        EventHandler onExit = (_, _) => StopAllAsync().Wait(Grace + _backstopAfterGrace, CancellationToken.None);
        AppDomain.CurrentDomain.ProcessExit += onExit;
        _owned.Add(new Unhook(onExit));
    }

    public void Dispose()
    {
        lock (_gate)
        {
            _disposed = true;
        }
        _backstop.Dispose();
        foreach (var owned in _owned)
        {
            owned.Dispose();
        }
        _owned.Clear();
        _shutdown.Dispose();
    }

    /// <summary>What is armed before a shutdown begins: disposing it does nothing.</summary>
    private sealed class Nothing : IDisposable
    {
        internal static readonly Nothing Instance = new();

        public void Dispose()
        {
            // No timer was armed.
        }
    }

    private sealed class Unhook(EventHandler handler) : IDisposable
    {
        public void Dispose() => AppDomain.CurrentDomain.ProcessExit -= handler;
    }
}
