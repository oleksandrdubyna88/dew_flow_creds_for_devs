using System.Runtime.Versioning;
using System.Security.Principal;
using Xunit;

namespace CredsForDevs.Tests.Leftovers;

/// <summary>Scenario 0 of the leftovers plan: what the machine running the tests IS, measured and printed
/// before any helper code is trusted. It asserts nothing about the helper and never fails — it RECORDS.
///
/// <para>The question it answers first: who owns a file a test makes? On a hosted Windows runner the job runs
/// elevated, and an elevated process's new files are likely owned by <c>BUILTIN\Administrators</c>, not by the
/// user's own SID. The kernel-owner key of the sweep (rule §3, "scope evidence") compares that owner with the
/// caller, so every Windows assertion later in this folder is written against the answer printed here, never
/// against a guess. The reads are the helper's own (<see cref="Native.OwnerSidOf"/>, <see cref="Scope.IsMine"/>,
/// <see cref="Liveness.ClockTicksPerSecond"/>), so what is printed is what the helper will see.</para>
///
/// <para>The lines go out as test warnings (<see cref="TestContext.AddWarning"/>), which the runner prints
/// under the test even when it passes.</para></summary>
public sealed class RunnerFactsTests
{
    [Fact]
    public void The_runner_facts_are_recorded()
    {
        Record($"runner facts: os={System.Runtime.InteropServices.RuntimeInformation.OSDescription}, arch={System.Runtime.InteropServices.RuntimeInformation.ProcessArchitecture}, pid={Environment.ProcessId}");
        if (OperatingSystem.IsWindows()) WindowsFacts();
        else if (OperatingSystem.IsLinux()) LinuxFacts();
        else if (OperatingSystem.IsMacOS()) MacFacts();
        else Record("runner facts: this platform is not one the leftovers helper supports (Linux, macOS and Windows are)");
    }

    private static void Record(string line) => TestContext.Current.AddWarning(line);

    [SupportedOSPlatform("windows")]
    private static void WindowsFacts()
    {
        var user = WindowsIdentity.GetCurrent();
        var elevated = new WindowsPrincipal(user).IsInRole(WindowsBuiltInRole.Administrator);

        // The probe file lives INSIDE an OwnedDir (claimed first, removed by this test); the temp root is that folder's parent.
        using var scratch = OwnedDir.Create("runner-facts");
        var temp = Path.GetDirectoryName(scratch.Path)!;
        var file = Path.Combine(scratch.Path, "probe.txt");
        File.WriteAllText(file, "runner facts");
        var owner = Native.OwnerSidOf(file);
        Record($"runner facts: new file owner SID = {owner?.Value ?? "(unreadable)"}");
        Record($"runner facts: Scope.IsMine of the new file = {Scope.IsMine(file)}");
        Record($"runner facts: token user SID = {user.User?.Value}; token owner SID = {user.Owner?.Value}");
        Record($"runner facts: file owner equals token user SID = {user.User is not null && owner is not null && owner.Equals(user.User)}");

        Record($"runner facts: token is elevated (Administrators) = {elevated}");
        var profile = FinalPath(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile));
        var finalTemp = FinalPath(temp);
        Record($"runner facts: temp = {finalTemp}; profile = {profile}; temp is inside the profile = {IsInside(finalTemp, profile)}");
    }

    private static string FinalPath(string path)
    {
        var info = new DirectoryInfo(path);
        return (info.ResolveLinkTarget(returnFinalTarget: true) ?? info).FullName.TrimEnd(Path.DirectorySeparatorChar);
    }

    private static bool IsInside(string child, string parent) =>
        child.Length > parent.Length
        && child.StartsWith(parent, StringComparison.OrdinalIgnoreCase)
        && child[parent.Length] == Path.DirectorySeparatorChar;

    [SupportedOSPlatform("macos")]
    private static void MacFacts()
    {
        Record($"runner facts: real uid = {Native.GetUid()}");
        Record($"runner facts: Liveness.HidepidActive = {Liveness.HidepidActive()} (Linux only; false on macOS by definition)");
        Record("runner facts: no start and no pid namespace are read on macOS (no /proc, and a child per test process is forbidden)");
    }

    private static void LinuxFacts()
    {
        Record($"runner facts: real uid = {Native.GetUid()}");
        Record($"runner facts: /proc/1 visible = {Directory.Exists("/proc/1")} (false would mean hidepid)");
        Record($"runner facts: AT_CLKTCK from /proc/self/auxv = {Liveness.ClockTicksPerSecond()?.ToString() ?? "(unreadable)"}");
    }
}
