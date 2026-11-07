using System.Runtime.InteropServices;

namespace CredsForDevs.Tests.Leftovers;

/// <summary>
/// What creds adds to the copied helper (E2.3.S2): the SHORT root a socket folder lives under, and the canonical form of a path, which decides whether two
/// roots are one. A socket path has a hard byte limit (104 on macOS, 108 on Linux), and macOS's per-user temp root alone is longer than half of it, so a
/// folder that holds a socket is made under <c>/tmp</c> there. This file is creds' own: the copied files stay byte for byte.
/// </summary>
internal static partial class OwnedCreds
{
    /// <summary><c>/tmp</c> on Linux and macOS; on Windows the temp root (a pipe, not a path, carries the socket there).</summary>
    internal static string ShortSocketRoot => OperatingSystem.IsWindows() ? Owned.TempRoot() : ShortPosixRoot;

    // testsToDelete-exempt: raw-temp — the ONE short root a socket folder lives under: the owned folder is made beneath it by OwnedDir, and this fixture sweeps and audits it
    private const string ShortPosixRoot = "/tmp";

    /// <summary>True when the two paths name two different folders once EVERY link is followed. A decision on <c>Path.GetFullPath</c> would be wrong on macOS,
    /// where <c>/tmp</c> is a link to <c>/private/tmp</c> and <c>$TMPDIR</c> lies under <c>/var</c>, a link to <c>/private/var</c>.</summary>
    internal static bool RootsDiffer(string first, string second) =>
        !string.Equals(Canonical(first), Canonical(second), OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal);

    /// <summary>
    /// The path with every link of every component followed (realpath(3) on POSIX; the final path of the open entry on Windows), without a trailing
    /// separator. Not <c>Path.GetFullPath</c>, which follows no link. A path that does not exist yet is the canonical form of its nearest existing folder
    /// with the missing names after it.
    /// </summary>
    internal static string Canonical(string path)
    {
        var current = TrimEnd(Path.GetFullPath(path));
        var missing = new Stack<string>();
        while (true)
        {
            if (Resolve(current) is { } resolved) return missing.Aggregate(TrimEnd(resolved), Path.Combine);
            if (Path.GetDirectoryName(current) is not { } parent) return missing.Aggregate(current, Path.Combine);
            missing.Push(Path.GetFileName(current));
            current = parent;
        }
    }

    private static string TrimEnd(string path) => Path.TrimEndingDirectorySeparator(path);

    private static string? Resolve(string path)
    {
        if (OperatingSystem.IsWindows()) return Native.FinalPathOfFollowing(path);
        var pointer = RealPath(path, IntPtr.Zero);
        if (pointer == IntPtr.Zero) return null;
        try
        {
            return Marshal.PtrToStringUTF8(pointer);
        }
        finally
        {
            Free(pointer);
        }
    }

    [LibraryImport("libc", EntryPoint = "realpath", StringMarshalling = StringMarshalling.Utf8, SetLastError = true)]
    private static partial IntPtr RealPath(string path, IntPtr resolved);

    [LibraryImport("libc", EntryPoint = "free")]
    private static partial void Free(IntPtr pointer);
}
