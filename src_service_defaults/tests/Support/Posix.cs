using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;

namespace CredsForDevs.ServiceDefaults.Tests.Support;

/// <summary>
/// The POSIX side of a process test: send a real signal to a process THIS test started, ask whether a pid is still
/// alive, and — on Linux — read whether a process ignores a signal before sending it.
/// </summary>
/// <remarks>
/// <para><b>Why the ignore check exists.</b> A non-interactive shell starts background jobs with SIGINT set to
/// ignore, so "SIGINT to a wrapper started with <c>&amp;</c>" measures nothing (research/RESULTS_wsl_bridge_orphans.md,
/// the second trap). A test that sends SIGINT first proves, from <c>/proc/&lt;pid&gt;/status</c>, that the host it
/// spawned would not ignore it — otherwise a pass says nothing about the handler.</para>
/// <para>Only ever a pid the test obtained from a process it started itself; nothing here looks anything up by name.</para>
/// </remarks>
internal static partial class Posix
{
    [LibraryImport("libc", EntryPoint = "kill", SetLastError = true)]
    private static partial int Kill(int pid, int signal);

    /// <summary>SIGKILL, which <see cref="PosixSignal"/> deliberately has no name for: a process cannot handle it.</summary>
    private const int SigKill = 9;

    /// <summary>Send <paramref name="signal"/> to <paramref name="pid"/>; true when the kernel took it.</summary>
    internal static bool Send(int pid, PosixSignal signal) => Kill(pid, ShutdownSignals.Number(signal)) == 0;

    /// <summary>End a process this test started, or a child one of its hosts left behind, without appeal.</summary>
    internal static void KillHard(int pid) => _ = Kill(pid, SigKill);

    /// <summary>Whether a process with this pid still exists (a zombie counts, until its parent reaps it).</summary>
    internal static bool Alive(int pid) => Kill(pid, 0) == 0;

    /// <summary>True once the pid is gone, polled every 50 ms up to <paramref name="bound"/>.</summary>
    internal static async Task<bool> GoneWithinAsync(int pid, TimeSpan bound, CancellationToken ct)
    {
        var clock = Stopwatch.StartNew();
        while (Alive(pid))
        {
            if (clock.Elapsed > bound)
            {
                return false;
            }
            await Task.Delay(50, ct);
        }
        return true;
    }

    /// <summary>
    /// On Linux, whether the process ignores <paramref name="signal"/> (<c>SigIgn</c> in <c>/proc/&lt;pid&gt;/status</c>);
    /// false elsewhere, where there is no <c>/proc</c> to ask.
    /// </summary>
    internal static bool Ignores(int pid, PosixSignal signal)
    {
        if (!OperatingSystem.IsLinux())
        {
            return false;
        }
        var line = File.ReadLines($"/proc/{pid}/status").First(l => l.StartsWith("SigIgn:", StringComparison.Ordinal));
        var mask = ulong.Parse(line["SigIgn:".Length..].Trim(), NumberStyles.HexNumber, CultureInfo.InvariantCulture);
        return (mask & (1UL << (ShutdownSignals.Number(signal) - 1))) != 0;
    }

    /// <summary>Kill a child of a host this test started, by its pid, if the host left it behind — so a red run leaves nothing.</summary>
    internal static IDisposable ReapOnDispose(int pid) => new Reaper(pid);

    private sealed class Reaper(int pid) : IDisposable
    {
        public void Dispose()
        {
            if (Alive(pid))
            {
                KillHard(pid);
            }
        }
    }
}
