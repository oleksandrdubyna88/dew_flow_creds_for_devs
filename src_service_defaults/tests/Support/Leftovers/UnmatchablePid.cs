using Xunit;

namespace CredsForDevs.Tests.Leftovers;

/// <summary>A pid that no process can have — what a test uses when it needs a DEAD owner. A port of
/// <c>unmatchable-pid.mjs</c> of the conventions.
///
/// <para>Never the pid of a child that was started, killed and awaited: the OS hands that number to the next process
/// (measured on Windows by the Node helper, one run in fifteen). A pid the query can never match is dead for the
/// whole run, so the premise is CHECKED instead of hoped for: <see cref="AssertNoSuchProcess"/> runs before and after
/// the code under test.</para>
///
/// <para>Windows pids are handle-table indices and the kernel clears the two low tag bits, so <c>OpenProcess(4n + 2)</c>
/// opens process <c>4n</c>: that is why the premise is asked the way the probe asks (<c>Dead</c> for 777770 means
/// 777768 is not alive either).</para></summary>
public static class UnmatchablePid
{
    private const long LargestPidMax = 4_194_304;

    /// <summary>The <paramref name="i"/>-th pid that cannot exist: Windows <c>777770 + 4i</c> (2 mod 4); Linux
    /// <c>pid_max + 1 + i</c>, which the kernel never hands out.</summary>
    public static long Next(int i = 0) => OperatingSystem.IsWindows() ? 777_770L + (4L * i) : PidMax() + 1 + i;

    public static void AssertNoSuchProcess(long pid)
    {
        if (OperatingSystem.IsWindows()) Assert.True(pid % 4 == 2, $"pid {pid} is not 2 mod 4: Windows could hand it out");
        else Assert.True(pid > PidMax(), $"pid {pid} is within pid_max: the kernel could hand it out");
        Assert.True(Liveness.ProbeProcess(pid).State == ProbeState.Dead, $"pid {pid} does not read as dead: some process answers for it");
    }

    private static long PidMax()
    {
        try
        {
            return long.Parse(File.ReadAllText("/proc/sys/kernel/pid_max").Trim());
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or FormatException)
        {
            return LargestPidMax;
        }
    }
}
