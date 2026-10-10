using System.ComponentModel;
using System.Diagnostics;
using Serilog;

namespace CredsForDevs.ServiceDefaults;

/// <summary>
/// The parent process this one was started by, as seen from the outside: an open handle on Windows, an
/// unchanged <c>getppid()</c> elsewhere.
/// </summary>
internal interface IWatchedParent : IDisposable
{
    /// <summary>When that process started — later than this one means its pid was reused.</summary>
    DateTime StartTime { get; }

    /// <summary>Completes when that process exits.</summary>
    Task WaitForExitAsync(CancellationToken ct);
}

/// <summary>
/// Completes <see cref="Gone"/> when the process that started this one is gone — the second of the three ways a
/// serving process learns its client is over (PLAN_wsl_bridge_outlives_its_client.md §5.9, §5.4).
/// </summary>
/// <remarks>
/// <para><b>Windows.</b> The parent pid comes from <see cref="ParentProcess.Id"/>
/// (<c>NtQueryInformationProcess</c>). It is opened at once, and its start time is compared with ours: a
/// process holding that pid that started AFTER us is not our parent but a newcomer that inherited a reused
/// number — the parent is already gone. Otherwise the open handle is waited on; a handle pins the process
/// object, so a pid reused later cannot fool it. A parent this account may not open is logged and not
/// watched: end-of-stream stays the primary signal.</para>
/// <para><b>Linux and macOS.</b> <c>getppid()</c> polled every 2 s on a <see cref="PeriodicTimer"/>: when the
/// parent dies the process is re-parented — to init or to a subreaper — and the number changes. A process
/// that STARTED with ppid 1 has nothing to watch, so the watch is off.</para>
/// <para><b>Shared, not the server's own</b>, by the cadence consultation's fifth point (plan §14): the
/// relay and the WSL wrapper of E3 need the same primitive, and a second copy is the drift the reuse rule
/// forbids. Whether to watch at all is the host's decision — the server turns it off when it is the Windows
/// half of the WSL bridge, whose parent is the distribution's session-long <c>wsl.exe</c>.</para>
/// <para>It observes only. Ending the process is the owner's job (<c>ServerLifetime</c>), and nothing here ever
/// signals, kills or touches another process.</para>
/// </remarks>
public sealed class ParentWatch : IDisposable
{
    /// <summary>How often <c>getppid()</c> is asked — the plan's 2 s.</summary>
    public static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(2);

    private readonly TaskCompletionSource _gone = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly CancellationTokenSource _stop = new();
    private readonly ILogger _log;
    private IDisposable _held = Nothing.Instance;

    private ParentWatch(ILogger log) => _log = log;

    /// <summary>Completes when the parent is gone; never, when the parent is not watched.</summary>
    public Task Gone => _gone.Task;

    /// <summary>Whether a parent is being watched — false when the watch is off or could not start.</summary>
    public bool Watching { get; private set; }

    /// <summary>Watch this process's parent, the way this platform allows.</summary>
    public static ParentWatch Start(ILogger log)
    {
        var ppid = ParentProcess.Id();
        return OperatingSystem.IsWindows()
            ? ForWindows(ppid, Process.GetCurrentProcess().StartTime, OpenProcess, log)
            : ForUnix(ppid, ParentProcess.Id, PollInterval, TimeProvider.System, log);
    }

    /// <summary>Do not watch, and say why — a <see cref="Gone"/> that never completes.</summary>
    public static ParentWatch Off(string reason, ILogger log)
    {
        log.Information("parent watch off: {Reason:l}", reason);
        return new ParentWatch(log);
    }

    /// <summary>The Windows watch over an injectable opener, so the pid-reuse branch is a unit test.</summary>
    internal static ParentWatch ForWindows(int ppid, DateTime selfStart, Func<int, IWatchedParent> open, ILogger log)
    {
        if (ppid <= 0)
        {
            return Off("the parent's pid is unknown", log);
        }
        var watch = new ParentWatch(log);
        watch.Attach(ppid, selfStart, open);
        return watch;
    }

    /// <summary>The Linux/macOS watch over an injectable <c>getppid()</c>.</summary>
    internal static ParentWatch ForUnix(int startPpid, Func<int> currentPpid, TimeSpan interval, TimeProvider time, ILogger log)
    {
        if (startPpid <= 1)
        {
            return Off($"started with parent pid {startPpid}, so there is no parent to lose", log);
        }
        var watch = new ParentWatch(log) { Watching = true };
        log.Information("watching the parent {ParentPid} (getppid every {IntervalSeconds} s)", startPpid, interval.TotalSeconds);
        _ = watch.PollAsync(startPpid, currentPpid, interval, time);
        return watch;
    }

    private void Attach(int ppid, DateTime selfStart, Func<int, IWatchedParent> open)
    {
        try
        {
            Follow(ppid, selfStart, open(ppid));
        }
        catch (Exception e) when (IsAlreadyGone(e))
        {
            // No such process (ArgumentException), or it exited between the open and the read: gone already.
            Lost(ppid, "it had already exited");
        }
        catch (Exception e) when (IsNotOpenable(e))
        {
            _log.Warning(e, "cannot watch the parent {ParentPid}; running without the watch", ppid);
        }
    }

    /// <summary>Hold the opened parent; a holder of its pid younger than this process means the pid was reused.</summary>
    private void Follow(int ppid, DateTime selfStart, IWatchedParent parent)
    {
        _held = parent;
        if (parent.StartTime > selfStart)
        {
            Lost(ppid, "its pid now belongs to a process that started after this one");
            return;
        }
        Watching = true;
        _log.Information("watching the parent {ParentPid}", ppid);
        _ = WaitAsync(ppid, parent);
    }

    private static bool IsAlreadyGone(Exception e) => e is ArgumentException or InvalidOperationException;

    private static bool IsNotOpenable(Exception e) => e is Win32Exception or UnauthorizedAccessException or NotSupportedException;

    private async Task WaitAsync(int ppid, IWatchedParent parent)
    {
        var ct = _stop.Token;
        try
        {
            await parent.WaitForExitAsync(ct);
            Lost(ppid, "it exited");
        }
        catch (OperationCanceledException)
        {
            // Disposed: the owner is done with the watch.
        }
    }

    private async Task PollAsync(int startPpid, Func<int> currentPpid, TimeSpan interval, TimeProvider time)
    {
        // Read once: Dispose cancels and then disposes the source, and a token read after that would throw.
        var ct = _stop.Token;
        using var timer = new PeriodicTimer(interval, time);
        try
        {
            while (await timer.WaitForNextTickAsync(ct))
            {
                if (currentPpid() != startPpid)
                {
                    Lost(startPpid, "this process was re-parented");
                    return;
                }
            }
        }
        catch (OperationCanceledException)
        {
            // Disposed.
        }
    }

    private void Lost(int ppid, string how)
    {
        _log.Information("the parent {ParentPid} is gone: {How:l}", ppid, how);
        _gone.TrySetResult();
    }

    internal static IWatchedParent OpenProcess(int pid)
    {
        var process = Process.GetProcessById(pid);
        try
        {
            // Open the handle NOW: from here on it pins this process object, whatever the pid becomes.
            _ = process.SafeHandle;
            return new ProcessParent(process);
        }
        catch
        {
            process.Dispose();
            throw;
        }
    }

    public void Dispose()
    {
        _stop.Cancel();
        _stop.Dispose();
        _held.Dispose();
    }

    /// <summary>What is held before anything is: disposing it does nothing.</summary>
    private sealed class Nothing : IDisposable
    {
        internal static readonly Nothing Instance = new();

        public void Dispose()
        {
            // Nothing was opened.
        }
    }

    private sealed class ProcessParent(Process process) : IWatchedParent
    {
        public DateTime StartTime => process.StartTime;

        public Task WaitForExitAsync(CancellationToken ct) => process.WaitForExitAsync(ct);

        public void Dispose() => process.Dispose();
    }
}
