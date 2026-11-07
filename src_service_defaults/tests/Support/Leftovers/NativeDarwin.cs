using System.Buffers.Binary;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using Microsoft.Win32.SafeHandles;

namespace CredsForDevs.Tests.Leftovers;

/// <summary>What <c>lstat</c> answered on macOS, read at the fixed offsets of Darwin's 64-bit-inode <c>struct stat</c>. Kept whole (not only the
/// <see cref="Identity"/>) so the layout self-test can check every field this reads against something known.</summary>
internal readonly record struct DarwinStat(
    int Dev, ushort Mode, ushort Nlink, ulong Ino, uint Uid, uint Gid, int Rdev,
    DateTimeOffset Atime, DateTimeOffset Mtime, DateTimeOffset Ctime, DateTimeOffset Birthtime, long Size)
{
    /// <summary>The entry is a named pipe (<c>S_ISFIFO</c>).</summary>
    internal bool IsFifo => (Mode & 0xF000) == 0x1000;
}

/// <summary>The macOS (Darwin) half of <see cref="Native"/>: <c>lstat</c> and <c>fstat</c> for the identity, an exclusive <c>mkdir</c>, an exclusive
/// <c>renamex_np</c>, the verified claim read and <c>kill(pid, 0)</c>, all through libSystem by its full path (the name <c>libc</c> resolves there
/// only through a dyld alias that nothing here measured).
///
/// <para><b>What is measured and what is not.</b> The layout below is Darwin's <c>struct stat</c> of <c>sys/stat.h</c> with 64-bit inodes
/// (<c>__DARWIN_64_BIT_INO_T</c>), written from the header and checked on the runner by <see cref="DarwinLayout"/> on every macOS run. Arm64 (the
/// <c>macos-latest</c> runner) calls <c>lstat</c> and <c>fstat</c>, which on that CPU already answer with this layout. X64 calls
/// <c>lstat$INODE64</c> and <c>fstat$INODE64</c>, because the plain names there are the old 32-bit-inode calls with another layout —
/// <b>X64 is UNMEASURED</b>: no machine and no CI leg of this repository has run it, and the layout self-test is what will say so the day one does.</para>
///
/// <para>The exclusive rename has no fallback here: <c>renamex_np</c> with <c>RENAME_EXCL</c> answers <c>EEXIST</c> for a taken name, and a volume
/// that does not take the flag (<c>ENOTSUP</c>, <c>EINVAL</c>) FAILS CLOSED — the folder is kept with one error, never renamed over a placeholder.</para></summary>
internal static partial class Native
{
    /// <summary>Darwin's <c>struct stat</c> with 64-bit inodes is 144 bytes: <c>st_dev</c> i32 @0, <c>st_mode</c> u16 @4, <c>st_nlink</c> u16 @6,
    /// <c>st_ino</c> u64 @8, <c>st_uid</c> u32 @16, <c>st_gid</c> u32 @20, <c>st_rdev</c> i32 @24, <c>st_atimespec</c> @32, <c>st_mtimespec</c> @48,
    /// <c>st_ctimespec</c> @64, <c>st_birthtimespec</c> @80 (each <c>{ i64 sec, i64 nsec }</c>), <c>st_size</c> i64 @96, then blocks, block size, flags,
    /// generation and spare words up to 144.</summary>
    internal const int DarwinStatSize = 144;

    // The byte offset of each field the parser reads, as listed above: one name per number, so the layout is read in one place.
    private const int StDevAt = 0, StModeAt = 4, StNlinkAt = 6, StInoAt = 8, StUidAt = 16, StGidAt = 20, StRdevAt = 24;
    private const int StAtimeAt = 32, StMtimeAt = 48, StCtimeAt = 64, StBirthtimeAt = 80, StSizeAt = 96;

    private const int RenameExcl = 0x4;

    // open(2) on Darwin: O_NONBLOCK 0x4, O_NOFOLLOW 0x100, O_CLOEXEC 0x01000000 (Linux has other numbers for all three); O_RDONLY is 0.
    private const int DarwinONonblock = 0x4, DarwinONofollow = 0x100, DarwinOCloexec = 0x1000000;

    /// <summary>The fixed layout above as an identity and its companions; throws <see cref="InvalidOperationException"/> when the buffer is too short,
    /// a time cannot be one, or the inode is 0 — an answer that names nobody is no identity.</summary>
    internal static DarwinStat ParseDarwinStat(ReadOnlySpan<byte> buffer)
    {
        if (buffer.Length < DarwinStatSize) throw new InvalidOperationException($"stat answered {buffer.Length} bytes, fewer than the {DarwinStatSize} this reads");
        var inode = BinaryPrimitives.ReadUInt64LittleEndian(buffer[StInoAt..]);
        if (inode == 0) throw new InvalidOperationException("stat gave inode 0: the layout does not hold, or the file system gave no identity");
        return new DarwinStat(
            Dev: BinaryPrimitives.ReadInt32LittleEndian(buffer[StDevAt..]),
            Mode: BinaryPrimitives.ReadUInt16LittleEndian(buffer[StModeAt..]),
            Nlink: BinaryPrimitives.ReadUInt16LittleEndian(buffer[StNlinkAt..]),
            Ino: inode,
            Uid: BinaryPrimitives.ReadUInt32LittleEndian(buffer[StUidAt..]),
            Gid: BinaryPrimitives.ReadUInt32LittleEndian(buffer[StGidAt..]),
            Rdev: BinaryPrimitives.ReadInt32LittleEndian(buffer[StRdevAt..]),
            Atime: DarwinTime(buffer[StAtimeAt..]),
            Mtime: DarwinTime(buffer[StMtimeAt..]),
            Ctime: DarwinTime(buffer[StCtimeAt..]),
            Birthtime: DarwinTime(buffer[StBirthtimeAt..]),
            Size: BinaryPrimitives.ReadInt64LittleEndian(buffer[StSizeAt..]));
    }

    /// <summary>The entry ITSELF (<c>lstat</c>, a link never followed) with every field read; null when it is not there; an exception for anything else.</summary>
    [SupportedOSPlatform("macos")]
    internal static DarwinStat? DarwinLstat(string path)
    {
        Span<byte> buffer = stackalloc byte[256];
        var answered = DarwinUsesInode64Names ? Darwin.LstatInode64(path, buffer) : Darwin.Lstat(path, buffer);
        if (answered == 0) return ParseDarwinStat(buffer);
        var errno = Marshal.GetLastPInvokeError();
        return errno == Errno.Darwin.Enoent ? null : throw Failure($"lstat {path}", errno);
    }

    [SupportedOSPlatform("macos")]
    private static DarwinStat DarwinFstat(int descriptor)
    {
        Span<byte> buffer = stackalloc byte[256];
        var answered = DarwinUsesInode64Names ? Darwin.FstatInode64(descriptor, buffer) : Darwin.Fstat(descriptor, buffer);
        return answered == 0 ? ParseDarwinStat(buffer) : throw Failure("fstat", Marshal.GetLastPInvokeError());
    }

    /// <summary>X64 (and Rosetta) calls the <c>$INODE64</c> names; every other CPU the plain ones. UNMEASURED for X64.</summary>
    private static bool DarwinUsesInode64Names => RuntimeInformation.ProcessArchitecture == Architecture.X64;

    internal static Identity DarwinIdentity(DarwinStat stat)
    {
        var kind = stat.Mode & 0xF000;
        return new Identity(
            Dev: (uint)stat.Dev,
            Ino: stat.Ino,
            IsDirectory: kind == 0x4000,
            IsLink: kind == 0xA000,
            IsRegular: kind == 0x8000,
            Uid: stat.Uid,
            ChangeTime: stat.Ctime,
            WriteTime: stat.Mtime);
    }

    [SupportedOSPlatform("macos")]
    private static Identity? DarwinIdentityOf(string path) => DarwinLstat(path) is { } stat ? DarwinIdentity(stat) : null;

    /// <summary>The outcome of <c>renamex_np(…, RENAME_EXCL)</c> from its errno (0 = it renamed): true = renamed; false = the name is taken
    /// (<c>EEXIST</c>; nothing moved); anything else throws, and a volume that does not take the flag (<c>ENOTSUP</c>, <c>EINVAL</c>, or a libSystem
    /// without the call) throws with the words that say the folder is kept — a rename WITHOUT the flag could replace what is at the name, so there
    /// is no fallback. The table is a parameter so the outcomes are tested on every system.</summary>
    internal static bool DarwinExclusiveRenameOutcome(ErrnoTable errno, int code, string from, string to)
    {
        if (code == 0) return true;
        if (code == errno.Eexist) return false;
        if (code == errno.Enotsup || code == errno.Einval || code == errno.Enosys)
        {
            throw new IOException($"renamex_np {from} to {to} failed with errno {code}: this volume does not take RENAME_EXCL, so nothing was renamed — an exclusive rename is the only one the helper makes, and the folder is kept");
        }

        throw Failure($"renamex_np {from} to {to}", code);
    }

    [SupportedOSPlatform("macos")]
    private static bool DarwinRenameExclusively(string from, string to)
    {
        try
        {
            return DarwinExclusiveRenameOutcome(Errno.Darwin, Darwin.RenamexNp(from, to, RenameExcl) == 0 ? 0 : Marshal.GetLastPInvokeError(), from, to);
        }
        catch (EntryPointNotFoundException ex)
        {
            throw new IOException($"renamex_np is not in this libSystem (macOS before 10.12): nothing was renamed, and the folder is kept ({from})", ex);
        }
    }

    [SupportedOSPlatform("macos")]
    private static byte[]? DarwinReadVerifiedRegular(string path, Identity expected, int limit)
    {
        var descriptor = Darwin.Open(path, DarwinONonblock | DarwinONofollow | DarwinOCloexec); // O_RDONLY is 0: a FIFO opens at once, a link is refused
        if (descriptor < 0) return null;
        using var handle = new SafeFileHandle(descriptor, ownsHandle: true); // closed on every path from here
        var now = DarwinIdentity(DarwinFstat(descriptor));
        if (!now.IsRegular || now.Dev != expected.Dev || now.Ino != expected.Ino) return null;
        return ReadAll(handle, limit);
    }

    private static DateTimeOffset DarwinTime(ReadOnlySpan<byte> timespec)
    {
        var seconds = BinaryPrimitives.ReadInt64LittleEndian(timespec);
        var nanoseconds = BinaryPrimitives.ReadInt64LittleEndian(timespec[8..]);
        if (nanoseconds is < 0 or > 999_999_999) throw new InvalidOperationException($"stat gave {nanoseconds} nanoseconds: the layout does not hold");
        try
        {
            return DateTimeOffset.FromUnixTimeSeconds(seconds).AddTicks(nanoseconds / 100);
        }
        catch (ArgumentOutOfRangeException ex)
        {
            throw new InvalidOperationException($"stat gave {seconds} seconds: the layout does not hold", ex);
        }
    }

    [SupportedOSPlatform("macos")]
    private static partial class Darwin
    {
        private const string LibSystem = "/usr/lib/libSystem.dylib";

        [LibraryImport(LibSystem, EntryPoint = "getuid")]
        internal static partial uint GetUid();

        [LibraryImport(LibSystem, EntryPoint = "kill", SetLastError = true)]
        internal static partial int Kill(int pid, int signal);

        [LibraryImport(LibSystem, EntryPoint = "mkdir", SetLastError = true, StringMarshalling = StringMarshalling.Utf8)]
        internal static partial int Mkdir(string path, uint mode);

        [LibraryImport(LibSystem, EntryPoint = "rename", SetLastError = true, StringMarshalling = StringMarshalling.Utf8)]
        internal static partial int Rename(string from, string to);

        [LibraryImport(LibSystem, EntryPoint = "renamex_np", SetLastError = true, StringMarshalling = StringMarshalling.Utf8)]
        internal static partial int RenamexNp(string from, string to, uint flags);

        [LibraryImport(LibSystem, EntryPoint = "open", SetLastError = true, StringMarshalling = StringMarshalling.Utf8)]
        internal static partial int Open(string path, int flags);

        [LibraryImport(LibSystem, EntryPoint = "lstat", SetLastError = true, StringMarshalling = StringMarshalling.Utf8)]
        internal static partial int Lstat(string path, Span<byte> buffer);

        [LibraryImport(LibSystem, EntryPoint = "lstat$INODE64", SetLastError = true, StringMarshalling = StringMarshalling.Utf8)]
        internal static partial int LstatInode64(string path, Span<byte> buffer);

        [LibraryImport(LibSystem, EntryPoint = "fstat", SetLastError = true)]
        internal static partial int Fstat(int descriptor, Span<byte> buffer);

        [LibraryImport(LibSystem, EntryPoint = "fstat$INODE64", SetLastError = true)]
        internal static partial int FstatInode64(int descriptor, Span<byte> buffer);
    }
}
