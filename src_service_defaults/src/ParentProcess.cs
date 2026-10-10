using System.Runtime.InteropServices;

namespace CredsForDevs.ServiceDefaults;

/// <summary>
/// This process's parent id, for the start line — the first thing anybody asks of an orphan is who
/// started it.
/// </summary>
/// <remarks>
/// <para>.NET has no managed answer, so each platform is asked directly: <c>getppid()</c> on Linux and
/// macOS, <c>NtQueryInformationProcess(ProcessBasicInformation)</c> on Windows. Both are
/// <c>LibraryImport</c> — marshalling generated at compile time, the AOT-friendly form — which needs
/// <c>AllowUnsafeBlocks</c>; this library takes it (the project file says why), where <c>creds</c> itself
/// keeps <c>DllImport</c> for its one <c>umask</c> call rather than give the guarantee up project-wide.</para>
/// <para>0 means "unknown" and is never an error: a log line that cannot name a parent still has to be
/// written. The parent WATCH that ends a server whose parent died (§5.4, §5.9 of
/// <c>PLAN_wsl_bridge_outlives_its_client.md</c>) is built on this in later epics; this is only the
/// observation.</para>
/// </remarks>
public static partial class ParentProcess
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

    [LibraryImport("libc", EntryPoint = "getppid")]
    private static partial int GetParentPid();

    /// <summary><c>ProcessBasicInformation</c>, the class whose answer carries the parent.</summary>
    private const int ProcessBasicInformation = 0;

    /// <summary>The pseudo-handle every Windows process has for itself; never closed.</summary>
    private static readonly IntPtr CurrentProcess = new(-1);

    private static int FromWindows() =>
        NtQueryInformationProcess(CurrentProcess, ProcessBasicInformation, out var info,
            Marshal.SizeOf<BasicInformation>(), out _) == 0
            ? (int)info.InheritedFromUniqueProcessId.ToInt64()
            : 0;

    [LibraryImport("ntdll.dll")]
    private static partial int NtQueryInformationProcess(
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
