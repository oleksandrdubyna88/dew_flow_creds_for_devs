using System.ComponentModel;
using System.Diagnostics;

namespace CredsForDevs.ServiceDefaults;

/// <summary>
/// A child this process started, as <see cref="ChildLifetime"/> stops it: end-of-stream first, its whole tree
/// when that is not enough.
/// </summary>
/// <remarks>
/// An interface so the stop order, the grace and the idempotence are unit tests over fakes
/// (<c>ChildLifetimeTests</c>); <see cref="ManagedProcess"/> is the one production adapter over
/// <see cref="Process"/>.
/// </remarks>
public interface IManagedChild
{
    /// <summary>The child's process id — for the log, never for a lookup by name.</summary>
    int Id { get; }

    /// <summary>Whether it has already ended.</summary>
    bool HasExited { get; }

    /// <summary>Close the child's stdin: the end-of-stream every creds child ends on by itself.</summary>
    void CloseStdin();

    /// <summary>Completes when the child has ended.</summary>
    Task WaitForExitAsync(CancellationToken ct);

    /// <summary>End the child and everything it started.</summary>
    void KillTree();
}

/// <summary>
/// The production <see cref="IManagedChild"/>: a <see cref="Process"/> started with its stdin redirected.
/// </summary>
/// <remarks>
/// <para><b>Why <see cref="CloseStdin"/> is explicit.</b> <see cref="Process.Close"/> (and so <c>using var child</c>)
/// deliberately does not close a <c>StandardInput</c> the caller has accessed, and a pending copy keeps the stream
/// reachable, so finalisation never closes it either — the whole of defect C in
/// PLAN_wsl_bridge_outlives_its_client.md: 27 <c>relay-pipe</c> children waiting for an EOF nobody sent. The close
/// is a named step here, and the lifetime takes it before any kill.</para>
/// <para>A stdin the owner already disposed (the pump closes the child's stdin itself when the client hangs up)
/// throws on the writer's final flush; that is a second close of the same end and is swallowed.</para>
/// <para><b>The owner may dispose the <see cref="Process"/> while a stop is still running</b> — the relay's connection
/// ends and lets go of its child while the shutdown's stop of every child is on the same one. Every member of a
/// disposed <see cref="Process"/> throws <see cref="InvalidOperationException"/>, the pid for a log line included, so
/// the pid is read ONCE while the child is alive and a disposed child reads as exited. Found by the relay's in-process
/// test on Linux: the stop threw out of its own catch and took the whole shutdown down.</para>
/// </remarks>
public sealed class ManagedProcess : IManagedChild
{
    private readonly Process _process;

    public ManagedProcess(Process process)
    {
        _process = process;
        Id = process.Id;
    }

    public int Id { get; }

    public bool HasExited
    {
        get
        {
            try
            {
                return _process.HasExited;
            }
            catch (InvalidOperationException)
            {
                // Disposed by its owner: nobody holds it, so nothing is left to stop.
                return true;
            }
        }
    }

    public void CloseStdin()
    {
        try
        {
            _process.StandardInput.Close();
        }
        catch (Exception e) when (e is IOException or ObjectDisposedException or InvalidOperationException)
        {
            // Already closed by the owner, or the child closed its end first — either way the EOF was delivered.
        }
    }

    public Task WaitForExitAsync(CancellationToken ct) => _process.WaitForExitAsync(ct);

    public void KillTree() => _process.Kill(entireProcessTree: true);

    /// <summary>What a child that already left throws at a stop — the ordinary race, not a failure.</summary>
    internal static bool IsAlreadyGone(Exception e) =>
        e is InvalidOperationException or NotSupportedException or Win32Exception;
}
