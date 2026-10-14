using System.Diagnostics;
using CredsBroker;
using FluentAssertions;

namespace CredsMcp.Tests;

/// <summary>
/// Defect D, the thread-scope backstop (E6/5.11 of PLAN_wsl_bridge_outlives_its_client.md). setpriv --pdeathsig KILL
/// arms PR_SET_PDEATHSIG(SIGKILL) on the interop proxy, and the kernel sends that signal when the proxy's PARENT
/// THREAD - the one that forked it - exits, not only when the whole process does (measured: a .NET-forked guarded
/// child dies the instant its forking thread exits, research/RESULTS_wsl_bridge_orphans.md, Defect D).
/// Process.Start forks on the calling thread, and the pump/relay reach it on a thread-pool worker that retires after
/// a few idle seconds - which would have the kernel SIGKILL the Windows half under a LIVE client. So
/// WindowsBridge.StartPiped forks every guarded child on one dedicated long-lived thread.
/// </summary>
/// <remarks>
/// Linux only, and only where setpriv is present and supports --pdeathsig (the guard's platform). Uses /bin/sleep as
/// a resolvable stand-in binary, so the launcher mechanism is exercised without a Windows half. The thread-exit kill
/// is a RACE, so the test SELF-CALIBRATES: it forks several probe children on exiting threads and only asserts the
/// launcher's value on a run where the race actually bit at least one of them - otherwise it skips, having asserted
/// nothing false. Death is detected through the Process handle (HasExited reaps the zombie a killed child becomes;
/// a kill(pid,0) check would read a zombie as alive and false-skip). The GREEN assertion is deterministic with the
/// fix: the launcher thread is not the calling thread, so the child outlives the caller's exit regardless of the race.
/// </remarks>
public sealed class ParentDeathLauncherTests
{
    private static readonly TimeSpan Settle = TimeSpan.FromSeconds(2);
    private const int Probes = 6;

    [Fact]
    public async Task A_guarded_child_forked_through_StartPiped_outlives_the_exit_of_the_thread_that_called_it()
    {
        Assert.SkipWhen(OperatingSystem.IsWindows(), "the parent-death guard is the Linux half's; setpriv is a Linux tool");
        Assert.SkipUnless(WslInterop.ParentDeathArmed, "setpriv is not available here (missing, or lacks --pdeathsig), so the guard cannot be armed");
        var setpriv = WslInterop.ParentDeathArmer.Value!;
        var ct = TestContext.Current.CancellationToken;

        // RED, on THIS kernel: a guarded child forked on a throwaway thread that then exits can be SIGKILLed by the
        // kernel. The kill is racy, so probe with several and stop at the first death; if NONE died this run the race
        // did not bite and the launcher's value cannot be shown here - skip, having asserted nothing false. Death is
        // read through the Process handle, which reaps the zombie a killed child becomes.
        using var probes = new Probed(setpriv, Probes);
        var anyDied = await probes.AnyDiedWithin(Settle, ct);
        Assert.SkipUnless(anyDied, "this kernel/run did not exhibit the thread-scoped pdeathsig race; the launcher's value cannot be shown here");

        // GREEN: StartPiped forks the guarded child on its dedicated long-lived thread, so even though the thread that
        // CALLED StartPiped exits (as a retiring pool worker would), the child outlives it. Deterministic with the fix.
        var bridge = new WindowsBridge("/bin/sleep", "CREDS_TEST_PDEATH_UNSET");
        Process? started = null;
        OnThatExits(() => started = bridge.StartPiped(["120"]));
        started.Should().NotBeNull("StartPiped returns the child or throws");
        using var child = started;
        try
        {
            await Task.Delay(Settle, ct);
            child.HasExited
                .Should().BeFalse("the dedicated launcher thread lives for the process, so pdeathsig does not fire when the calling thread exits (pid {0})", child.Id);
        }
        finally
        {
            if (!child.HasExited)
            {
                child.Kill(entireProcessTree: true);
            }
        }
    }

    /// <summary>Run <paramref name="work"/> on a dedicated thread and join it, so the forking thread exits — and a throw on it fails the test rather than the host.</summary>
    private static void OnThatExits(Action work)
    {
        Exception? failure = null;
        var thread = new Thread(() =>
        {
            try
            {
                work();
            }
            catch (Exception e)
            {
                failure = e;
            }
        });
        thread.Start();
        thread.Join();
        if (failure is not null)
        {
            throw new InvalidOperationException("the forking thread threw", failure);
        }
    }

    /// <summary>Several guarded children, each forked on a thread that then exits; their deaths read through the Process handles.</summary>
    private sealed class Probed : IDisposable
    {
        private readonly Process[] _children;

        internal Probed(string setpriv, int count)
        {
            _children = new Process[count];
            for (var i = 0; i < count; i++)
            {
                var index = i;
                OnThatExits(() =>
                {
                    var start = new ProcessStartInfo(setpriv) { UseShellExecute = false };
                    string[] arguments = ["--pdeathsig", "KILL", "--", "/bin/sleep", "120"];
                    foreach (var argument in arguments)
                    {
                        start.ArgumentList.Add(argument);
                    }
                    _children[index] = Process.Start(start)!;
                });
            }
        }

        /// <summary>Whether any probe child has exited within <paramref name="window"/>, polled through the Process handle (which reaps).</summary>
        internal async Task<bool> AnyDiedWithin(TimeSpan window, CancellationToken ct)
        {
            var clock = Stopwatch.StartNew();
            while (clock.Elapsed < window)
            {
                if (_children.Any(c => c.HasExited))
                {
                    return true;
                }
                await Task.Delay(50, ct);
            }
            return _children.Any(c => c.HasExited);
        }

        public void Dispose()
        {
            foreach (var child in _children)
            {
                try
                {
                    if (!child.HasExited)
                    {
                        child.Kill(entireProcessTree: true);
                    }
                }
                catch (Exception)
                {
                    // best effort — the child may already be gone
                }
                child.Dispose();
            }
        }
    }
}
