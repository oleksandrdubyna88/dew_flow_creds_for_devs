using System.Runtime.InteropServices;

namespace CredsForDevs.ServiceDefaults;

/// <summary>
/// This process's parent id, for the start line — the first thing anybody asks of an orphan is who
/// started it.
/// </summary>
/// <remarks>
/// <para>.NET has no managed answer, so each platform is asked directly: <c>getppid()</c> on Linux and
/// macOS, <c>NtQueryInformationProcess(ProcessBasicInformation)</c> on Windows. Both are
/// <c>DllImport</c> rather than <c>LibraryImport</c> for the reason <c>AgentRelay.SetUmask</c> gives:
/// the source-generated form needs <c>AllowUnsafeBlocks</c> for the whole project, a large guarantee to
/// give up for one call — and every type crossing here is blittable, so Native AOT generates the stub.</para>
/// <para>0 means "unknown" and is never an error: a log line that cannot name a parent still has to be
/// written. The parent WATCH that ends a server whose parent died (§5.4, §5.9 of
/// <c>todo/PLAN_wsl_bridge_outlives_its_client.md</c>) is built on this in later epics; this is only the
/// observation.</para>
/// </remarks>
public static class ParentProcess
{
    /// <summary>The parent's pid, or 0 when the platform would not say.</summary>
    public static int Id()
    {
        try
        {
            return OperatingSystem.IsWindows() ? FromWindows() : GetParentPid();
        }
        catch (Exception e) when (e is DllNotFoundException or EntryPointNotFoundException)
        {
            return 0;
        }
    }

    [DllImport("libc", EntryPoint = "getppid")]
    private static extern int GetParentPid();

    /// <summary><c>ProcessBasicInformation</c>, the class whose answer carries the parent.</summary>
    private const int ProcessBasicInformation = 0;

    /// <summary>The pseudo-handle every Windows process has for itself; never closed.</summary>
    private static readonly IntPtr CurrentProcess = new(-1);

    private static int FromWindows() =>
        NtQueryInformationProcess(CurrentProcess, ProcessBasicInformation, out var info,
            Marshal.SizeOf<BasicInformation>(), out _) == 0
            ? (int)info.InheritedFromUniqueProcessId
            : 0;

    [DllImport("ntdll.dll")]
    private static extern int NtQueryInformationProcess(
        IntPtr process, int informationClass, out BasicInformation information, int length, out int returned);

    /// <summary><c>PROCESS_BASIC_INFORMATION</c>, laid out as ntdll writes it.</summary>
    [StructLayout(LayoutKind.Sequential)]
    private readonly struct BasicInformation
    {
        public readonly IntPtr ExitStatus;
        public readonly IntPtr PebBaseAddress;
        public readonly IntPtr AffinityMask;
        public readonly IntPtr BasePriority;
        public readonly IntPtr UniqueProcessId;
        public readonly IntPtr InheritedFromUniqueProcessId;
    }
}
