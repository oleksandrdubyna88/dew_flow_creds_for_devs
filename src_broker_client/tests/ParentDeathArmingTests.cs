using System.Diagnostics;
using CredsBroker;
using FluentAssertions;

namespace CredsBroker.Tests;

/// <summary>
/// The live parent-death arming path of <see cref="WindowsBridge.StartPiped"/> (defect D, §5.11), exercised
/// IN-PROCESS so the resolver, the capability probe and the dedicated launcher thread are covered — the process
/// tests that drive the real bridge run the built binary out of process, where a coverage collector cannot see them
/// (the E1 lesson). Uses a benign stand-in binary (`/bin/sleep` on Linux, `cmd.exe` on Windows), killed at once.
/// </summary>
public sealed class ParentDeathArmingTests
{
    [Fact]
    public void The_guard_resolution_is_internally_consistent()
    {
        // ParentDeathArmed (a path resolved) and GuardStatus() (its reason) must agree, and resolving must never
        // throw. On the Linux coverage runner this runs the setpriv capability probe once, in-process.
        var armed = WslInterop.ParentDeathArmed;
        var status = WslInterop.GuardStatus();

        (status == WslInterop.ParentDeathGuard.Available).Should().Be(armed, "Available is exactly the armable state");
        if (!OperatingSystem.IsLinux())
        {
            armed.Should().BeFalse("the guard is the Linux half's; it never arms off Linux");
            status.Should().Be(WslInterop.ParentDeathGuard.NotApplicable);
        }
    }

    [Fact]
    public void StartPiped_starts_the_process_through_whichever_launch_path_applies()
    {
        // Linux + setpriv: the armed path (GuardedLauncher forks `setpriv --pdeathsig KILL -- /bin/sleep` on the
        // dedicated thread). Elsewhere: the un-armed direct Process.Start. Either way a live, killable process
        // comes back — the launch path itself, covered in-process.
        var bridge = new WindowsBridge(
            OperatingSystem.IsWindows() ? "cmd.exe" : "/bin/sleep",
            "CREDS_TEST_PDEATH_ARMING_UNSET");
        IReadOnlyList<string> args = OperatingSystem.IsWindows() ? ["/c", "exit", "0"] : ["30"];

        using var child = bridge.StartPiped(args);
        try
        {
            child.Should().NotBeNull();
            child.Id.Should().BeGreaterThan(0);
        }
        finally
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
                // best effort — a benign stand-in may already have exited
            }
        }
    }
}
