using System.Buffers.Binary;
using System.Globalization;
using System.Text.RegularExpressions;

namespace CredsForDevs.Tests.Leftovers;

/// <summary>What a probe of one pid found. Three NAMED answers, never a flag with an invisible third value:
/// <c>Dead</c> is "no such process" and the ONE answer that can mean gone; <c>Unknown</c> is "the query was
/// refused or failed, or the pid is not a process id at all"; <c>Live</c> carries <c>Start</c> on Linux only.</summary>
public enum ProbeState { Live, Dead, Unknown }

public sealed record Probe(ProbeState State, long? Start);

/// <summary>The reads a liveness verdict is built from (rule §3): the process probe, the start of a process, the
/// clock-tick rate and the pid namespace. Nothing here spawns a process — a `/proc` read, a native process API —
/// and nothing here uses <c>Process.GetProcessById</c>, whose Linux answer under <c>hidepid</c> and whose Windows
/// access rules are .NET's own and not the contract's.</summary>
/// <summary>Rule §3's three answers for a record: <c>Gone</c> is the ONLY one that lets a resource be removed.</summary>
public enum OwnerState { Live, Gone, Unknown }

/// <summary>What a verdict needs beyond the record: the caller's token (default: this process's), the owner segment of
/// the resource's NAME, whether the kernel owner of the resource is the caller, and whether the process list may hide
/// other users' processes.</summary>
public sealed record Facts(string? CallerOwner = null, string? NameOwner = null, bool? KernelMine = null, bool? Hidepid = null);

public static partial class Liveness
{

    private const long MaxSafeInteger = (1L << 53) - 1;
    private const int AtClktck = 17;

    private static readonly Lazy<long?> Ticks = new(ReadClockTicks);

    /// <summary>Is <paramref name="pid"/> alive on this machine? Bounds first, never an unchecked cast: a pid below 1
    /// addresses a process GROUP, a pid past what the OS call takes addresses nothing.</summary>
    public static Probe ProbeProcess(long pid)
    {
        if (!Askable(pid)) return new Probe(ProbeState.Unknown, null);
        if (OperatingSystem.IsLinux()) return ProbeLinux((int)pid);
        if (OperatingSystem.IsMacOS()) return ProbeDarwin((int)pid);
        return OperatingSystem.IsWindows() ? new Probe(Native.WindowsProcessState((uint)pid), null) : new Probe(ProbeState.Unknown, null); // any other system: nobody was asked
    }

    /// <summary>May the probe be asked about this number at all? 1 to 2^53-1; on Linux and macOS no more than what <c>kill(2)</c> takes (a signed
    /// 32-bit int); on Windows no more than a DWORD and never 1 (Windows has no pid 1: a bash started by a native process reports it
    /// for itself); on any other system never.</summary>
    internal static bool Askable(long pid)
    {
        if (pid < 1 || pid > MaxSafeInteger) return false;
        if (Native.IsPosix) return pid <= int.MaxValue;
        return OperatingSystem.IsWindows() && pid <= uint.MaxValue && pid != 1;
    }

    /// <summary>The pid that a text spells — a quarantine's name carries one — when it is a pid the probe may be asked about, else null
    /// (⇒ unknown, before any question is asked): ASCII digits only, written canonically (a leading zero is not how a reader writes a
    /// number, and <c>007</c> could be a real process), and <see cref="Askable"/>.</summary>
    internal static long? AskablePid(string digits)
    {
        if (digits.Length == 0 || digits.Any(c => c is < '0' or > '9') || (digits.Length > 1 && digits[0] == '0')) return null;
        return long.TryParse(digits, NumberStyles.None, CultureInfo.InvariantCulture, out var pid) && Askable(pid) ? pid : null;
    }

    /// <summary>Rule §3's order, exactly: an unreadable or non-canonical record, an owner that is not the name's or the
    /// caller's, a kernel owner that is not the caller, another host, another namespace on a Linux reader, a pid no
    /// process can have — all <c>Unknown</c>, before any question is asked. Then ONE question: no process is <c>Gone</c>,
    /// the only one (unless the process list may hide others). A refused or failed query is <c>Unknown</c>; a live process
    /// is <c>Live</c>, or <c>Unknown</c> when both starts are known and differ by more than two seconds — a reused pid
    /// or a stepped clock. A mismatch delays reclamation and never deletes something live.</summary>
    public static OwnerState State(Owner? owner, Func<long, Probe> probe, Facts? facts = null)
    {
        facts ??= new Facts();
        if (owner is null || owner.NonCanonical) return OwnerState.Unknown;
        if (owner.Token != (facts.CallerOwner ?? OwnerToken.This)) return OwnerState.Unknown;
        if (facts.NameOwner is not null && facts.NameOwner != owner.Token) return OwnerState.Unknown;
        if (facts.KernelMine == false) return OwnerState.Unknown;
        var me = Owner.This;
        if (!string.Equals(owner.Host, me.Host, StringComparison.OrdinalIgnoreCase)) return OwnerState.Unknown;
        // Two namespaces can share a host name, never a pid space: the reader's own namespace missing makes every record unknown.
        if (me.Host.EndsWith("@linux", StringComparison.OrdinalIgnoreCase) && (owner.Ns is null || owner.Ns != me.Ns)) return OwnerState.Unknown;
        if (owner.Pid < 1 || owner.Pid > MaxSafeInteger) return OwnerState.Unknown;
        if (owner.Pid == 1 && owner.Host.EndsWith("@windows", StringComparison.OrdinalIgnoreCase)) return OwnerState.Unknown;
        Probe seen;
        try
        {
            seen = probe(owner.Pid);
        }
        catch (Exception ex) when (ex is not OutOfMemoryException)
        {
            return OwnerState.Unknown; // a probe that cannot answer is no answer
        }

        if (seen.State == ProbeState.Dead) return (facts.Hidepid ?? HidepidActive()) ? OwnerState.Unknown : OwnerState.Gone;
        if (seen.State != ProbeState.Live) return OwnerState.Unknown;
        if (owner.Start is null || seen.Start is null) return OwnerState.Live; // pid reuse then PRESERVES
        return Math.Abs(owner.Start.Value - seen.Start.Value) <= Owned.StartToleranceSeconds ? OwnerState.Live : OwnerState.Unknown;
    }

    /// <summary>On Linux, is process 1 invisible? Then a missing process proves nothing (`hidepid`).</summary>
    public static bool HidepidActive() => OperatingSystem.IsLinux() && !Directory.Exists("/proc/1");

    /// <summary>The kernel's clock-tick rate, read ONCE from the auxiliary vector (<c>AT_CLKTCK</c>); null where it
    /// cannot be read — never a guessed 100.</summary>
    public static long? ClockTicksPerSecond() => Ticks.Value;

    /// <summary>The pure form: <c>AT_CLKTCK</c> from pairs of machine words, found before the <c>AT_NULL</c> that ends
    /// the vector. A vector that never reaches it, an odd length, an unusual word width or a rate of zero gives null.</summary>
    public static long? ClockTicksFromAuxv(ReadOnlySpan<byte> auxv, int wordBytes, bool littleEndian)
    {
        if (wordBytes is not (4 or 8) || auxv.Length == 0 || auxv.Length % (2 * wordBytes) != 0) return null;
        long? rate = null;
        for (var at = 0; at < auxv.Length; at += 2 * wordBytes)
        {
            var type = ReadWord(auxv[at..], wordBytes, littleEndian);
            if (type == 0) return rate;
            if (type != AtClktck || rate is not null) continue;
            var value = ReadWord(auxv[(at + wordBytes)..], wordBytes, littleEndian);
            if (value == 0 || value > MaxSafeInteger) return null;
            rate = (long)value;
        }

        return null;
    }

    /// <summary><c>floor(btime + field22 / ticks)</c> of a <c>/proc/&lt;pid&gt;/stat</c> text: integer Unix seconds. The
    /// command name (field 2) may hold spaces and parentheses, so the fields are counted after the LAST closing one.</summary>
    public static long? StartFromProcStat(string statText, long btime, long? ticks)
    {
        if (ticks is not > 0) return null;
        var close = statText.LastIndexOf(')');
        if (close < 0) return null;
        // Field 3 is index 0 here, so field 22 is index 19.
        var fields = statText[(close + 1)..].Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (fields.Length < 20 || !ulong.TryParse(fields[19], NumberStyles.None, CultureInfo.InvariantCulture, out var field)) return null;
        return (long)Math.Floor(btime + (double)field / ticks.Value);
    }

    /// <summary>This process's pid namespace: the decimal inode of <c>/proc/self/ns/pid</c>; null off Linux.</summary>
    public static long? ReadPidNamespace()
    {
        if (!OperatingSystem.IsLinux()) return null;
        try
        {
            var link = new FileInfo("/proc/self/ns/pid").LinkTarget;
            var match = link is null ? null : PidNamespace().Match(link);
            return match is { Success: true } && long.TryParse(match.Groups[1].Value, NumberStyles.None, CultureInfo.InvariantCulture, out var inode) ? inode : null;
        }
        catch (IOException)
        {
            return null;
        }
    }

    /// <summary>The start of a LIVE process on Linux from its <c>stat</c> and the boot time, or null when unreadable.</summary>
    internal static long? ReadLinuxStart(long pid)
    {
        try
        {
            var btime = BootTime().Match(File.ReadAllText("/proc/stat"));
            return btime.Success && long.TryParse(btime.Groups[1].Value, NumberStyles.None, CultureInfo.InvariantCulture, out var boot)
                ? StartFromProcStat(File.ReadAllText($"/proc/{pid}/stat"), boot, ClockTicksPerSecond())
                : null;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            return null;
        }
    }

    private static Probe ProbeLinux(int pid) => ProbeByKill(pid, () => ReadLinuxStart(pid));

    /// <summary>macOS: the same question, <c>kill(pid, 0)</c>; no start (it would need a child per test process, which the rule forbids), so a live
    /// pid is <c>Live</c> without a start comparison — a reused pid then PRESERVES, it never deletes.</summary>
    private static Probe ProbeDarwin(int pid) => ProbeByKill(pid, () => null);

    /// <summary>ESRCH is the one <c>Dead</c> there is; 0 is <c>Live</c> with the start the platform can read; EPERM or any other errno is
    /// <c>Unknown</c> (the process may be there, nothing is known). The code is read from the table of the system this runs on.</summary>
    private static Probe ProbeByKill(int pid, Func<long?> start)
    {
        var answer = Native.Kill(pid);
        if (answer == 0) return new Probe(ProbeState.Live, start());
        return answer == Errno.Current.Esrch ? new Probe(ProbeState.Dead, null) : new Probe(ProbeState.Unknown, null);
    }

    private static long? ReadClockTicks()
    {
        if (!OperatingSystem.IsLinux()) return null;
        try
        {
            return ClockTicksFromAuxv(File.ReadAllBytes("/proc/self/auxv"), IntPtr.Size, BitConverter.IsLittleEndian);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            return null;
        }
    }

    private static ulong ReadWord(ReadOnlySpan<byte> bytes, int wordBytes, bool littleEndian) => (wordBytes, littleEndian) switch
    {
        (8, true) => BinaryPrimitives.ReadUInt64LittleEndian(bytes),
        (8, false) => BinaryPrimitives.ReadUInt64BigEndian(bytes),
        (_, true) => BinaryPrimitives.ReadUInt32LittleEndian(bytes),
        _ => BinaryPrimitives.ReadUInt32BigEndian(bytes),
    };

    [GeneratedRegex(@"^pid:\[([0-9]+)\]\z")]
    private static partial Regex PidNamespace();

    [GeneratedRegex(@"^btime[ \t]+([0-9]+)[ \t]*$", RegexOptions.Multiline)]
    private static partial Regex BootTime();
}
