using System.Runtime.InteropServices;

namespace CredsForDevs.ServiceDefaults;

/// <summary>
/// The termination signals a serving process handles instead of dying by the default disposition — the first
/// one to arrive, as a task.
/// </summary>
/// <remarks>
/// <para><b>Why handle them at all.</b> A process that dies by a signal's default disposition skips everything
/// a normal return runs: its exit line is never written, its children are never stopped (defect B of
/// PLAN_wsl_bridge_outlives_its_client.md — Claude Code ends an MCP server with SIGINT), its log is never
/// flushed. So every one of the four is registered with <c>Cancel = true</c>, and the owner decides what
/// shutting down means and exits itself, with a code that still says which signal it was: <c>128 + n</c>.</para>
/// <para>SIGINT, SIGTERM, SIGHUP, SIGQUIT — the set the family's precedent registers
/// (<c>wsl_care · ShutdownSignals.cs</c>). On Windows .NET maps them onto console control events (Ctrl-C,
/// Ctrl-Break, the console closing, log-off and shutdown); a platform that refuses one is simply not
/// watched for it — the end-of-stream and parent signals still stand.</para>
/// <para>Shared here, not in one binary, because two kinds of host need it: the server ending when its client
/// is gone (E2) and the processes that hold children (E3's <c>ChildLifetime</c>). One registration, one
/// mapping to exit codes.</para>
/// </remarks>
public sealed class ShutdownSignals : IDisposable
{
    /// <summary>The four, in the order they are registered.</summary>
    public static readonly IReadOnlyList<PosixSignal> Handled =
        [PosixSignal.SIGINT, PosixSignal.SIGTERM, PosixSignal.SIGHUP, PosixSignal.SIGQUIT];

    private readonly TaskCompletionSource<PosixSignal> _received = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly List<PosixSignalRegistration> _registrations = [];

    /// <summary>For tests: nothing registered with the OS; <see cref="Deliver"/> plays the signal.</summary>
    internal ShutdownSignals()
    {
    }

    /// <summary>Completes with the FIRST signal received; later ones change nothing.</summary>
    public Task<PosixSignal> Received => _received.Task;

    /// <summary>Register all four with the OS.</summary>
    public static ShutdownSignals Register()
    {
        var signals = new ShutdownSignals();
        foreach (var signal in Handled)
        {
            signals.TryRegister(signal);
        }
        return signals;
    }

    /// <summary>The process exit code for a handled signal: 128 + its number, the shell's convention.</summary>
    public static int ExitCode(PosixSignal signal) => 128 + Number(signal);

    /// <summary>The POSIX number — the same on Linux and macOS for these four; .NET's enum values are not them.</summary>
    public static int Number(PosixSignal signal) =>
        signal switch
        {
            PosixSignal.SIGHUP => 1,
            PosixSignal.SIGINT => 2,
            PosixSignal.SIGQUIT => 3,
            PosixSignal.SIGTERM => 15,
            _ => 0,
        };

    /// <summary>Record a signal: the first one wins. Internal so tests can deliver one without the OS.</summary>
    internal bool Deliver(PosixSignal signal) => _received.TrySetResult(signal);

    private void TryRegister(PosixSignal signal)
    {
        try
        {
            _registrations.Add(PosixSignalRegistration.Create(signal, context =>
            {
                context.Cancel = true;
                Deliver(context.Signal);
            }));
        }
        catch (PlatformNotSupportedException)
        {
            // Not watchable here; the other ends of a session still are.
        }
    }

    public void Dispose()
    {
        foreach (var registration in _registrations)
        {
            registration.Dispose();
        }
        _registrations.Clear();
    }
}
