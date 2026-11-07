using System.Runtime.InteropServices;
using System.Runtime.Versioning;

namespace CredsForDevs.Tests.Leftovers;

/// <summary>A named pipe on Linux and macOS, made by <c>mkfifo(3)</c> through P/Invoke (no child process): the entry that blocks a plain
/// <c>open</c> for reading until a writer comes. Only the tests use it. The two systems differ in <c>O_NONBLOCK</c> (Linux 0x800,
/// Darwin 0x4) and in the library that holds the calls (libc, and libSystem on macOS, by its full path as <see cref="Native"/> does).</summary>
[SupportedOSPlatform("linux")]
[SupportedOSPlatform("macos")]
internal static partial class PosixFifo
{
    private const int OWriteOnly = 1;

    /// <summary>Make a FIFO at <paramref name="path"/> (mode 0600); the path must not exist.</summary>
    internal static void Make(string path)
    {
        var made = OperatingSystem.IsMacOS() ? DarwinMkfifo(path, 0x180) : Mkfifo(path, 0x180);
        if (made != 0) throw new IOException($"mkfifo {path} failed ({Marshal.GetLastPInvokeError()})");
    }

    /// <summary>Let a reader that is blocked in <c>open</c> go: a writer's non-blocking open of the same FIFO completes it. Best effort — the
    /// FIFO may be gone, or nobody may be waiting (ENXIO).</summary>
    internal static void ReleaseReaders(string path)
    {
        var fd = OperatingSystem.IsMacOS() ? DarwinOpen(path, OWriteOnly | 0x4) : Open(path, OWriteOnly | 0x800);
        if (fd < 0) return;
        _ = OperatingSystem.IsMacOS() ? DarwinClose(fd) : Close(fd);
    }

    [LibraryImport("libc", EntryPoint = "mkfifo", SetLastError = true, StringMarshalling = StringMarshalling.Utf8)]
    private static partial int Mkfifo(string path, uint mode);

    [LibraryImport("libc", EntryPoint = "open", SetLastError = true, StringMarshalling = StringMarshalling.Utf8)]
    private static partial int Open(string path, int flags);

    [LibraryImport("libc", EntryPoint = "close")]
    private static partial int Close(int fd);

    [LibraryImport("/usr/lib/libSystem.dylib", EntryPoint = "mkfifo", SetLastError = true, StringMarshalling = StringMarshalling.Utf8)]
    private static partial int DarwinMkfifo(string path, uint mode);

    [LibraryImport("/usr/lib/libSystem.dylib", EntryPoint = "open", SetLastError = true, StringMarshalling = StringMarshalling.Utf8)]
    private static partial int DarwinOpen(string path, int flags);

    [LibraryImport("/usr/lib/libSystem.dylib", EntryPoint = "close")]
    private static partial int DarwinClose(int fd);
}
