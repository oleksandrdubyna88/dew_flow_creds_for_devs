using System.Buffers.Binary;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using System.Security.Principal;
using Microsoft.Win32.SafeHandles;

namespace CredsForDevs.Tests.Leftovers;

/// <summary>What a directory entry IS at one moment, read from the entry itself — a link is never followed.
/// <c>Dev</c> and <c>Ino</c> are the identity (Linux and macOS: device and inode; Windows: volume serial and the 128-bit
/// file id, which ReFS needs); <c>Uid</c> is the kernel owner on Linux and macOS and null on Windows, where the owner is a
/// SID (<see cref="Native.OwnerSidOf"/>).</summary>
public readonly record struct Identity(
    ulong Dev, UInt128 Ino, bool IsDirectory, bool IsLink, bool IsRegular, uint? Uid, DateTimeOffset ChangeTime, DateTimeOffset WriteTime);

/// <summary>Every call to the OS that the leftovers contract needs and .NET does not have: an entry's identity
/// without following a link, who owns it, a directory made EXCLUSIVELY, a rename that does not replace (<see cref="RenameExclusively"/>), the real
/// uid, and the process probe. Nothing else in this folder calls the OS by hand.
///
/// <para>.NET has no exclusive <c>mkdir</c> (<c>Directory.CreateDirectory</c> succeeds on an existing folder), no
/// inode or file-id API, no uid and no <c>kill(pid, 0)</c>. Linux goes through libc (<c>statx</c> needs glibc 2.28
/// or later; musl is not measured), Windows through kernel32 and advapi32, macOS through libSystem
/// (<c>NativeDarwin.cs</c>: <c>lstat</c> with Darwin's own 144-byte layout, <c>renamex_np</c> for the exclusive rename; Arm64 is measured on CI,
/// X64 is not).</para>
///
/// <para>Failure is closed: an identity that cannot be read is an exception here and "changed" or "not mine" to
/// the caller — never an answer that could authorise a removal.</para></summary>
internal static partial class Native
{
    private const int AtFdcwd = -100, AtSymlinkNofollow = 0x100, AtEmptyPath = 0x1000;
    private const uint RenameNoreplace = 1;
    private const uint StatxBasicStats = 0x7ff;

    // STATX_TYPE | STATX_MODE | STATX_UID | STATX_MTIME | STATX_CTIME | STATX_INO — a file system that answers without
    // one of them gives no identity, and an identity that is guessed could authorise a removal.
    private const uint StatxRequired = 0x1 | 0x2 | 0x8 | 0x40 | 0x80 | 0x100;

    /// <summary>Linux or macOS: the systems with a uid, <c>mkdir(2)</c>, <c>kill(2)</c> and an inode — the ones the POSIX branches serve. What only
    /// Linux has (<c>statx</c>, <c>/proc</c>, a pid namespace, <c>hidepid</c>) is asked of <see cref="OperatingSystem.IsLinux"/> alone.</summary>
    internal static bool IsPosix => OperatingSystem.IsLinux() || OperatingSystem.IsMacOS();

    private const uint FileTypeDisk = 1; // FILE_TYPE_DISK
    private const uint ErrorFileNotFound = 2, ErrorPathNotFound = 3, ErrorAlreadyExists = 183;

    /// <summary>The caller's REAL uid — never the effective one.</summary>
    internal static uint GetUid() =>
        OperatingSystem.IsLinux() ? Libc.GetUid()
        : OperatingSystem.IsMacOS() ? Darwin.GetUid()
        : throw new PlatformNotSupportedException("getuid is POSIX only");

    /// <summary>The entry ITSELF, a link never followed; null when it is not there; an exception for anything unreadable.</summary>
    internal static Identity? IdentityOf(string path)
    {
        if (OperatingSystem.IsLinux()) return LinuxIdentityOf(path);
        if (OperatingSystem.IsMacOS()) return DarwinIdentityOf(path);
        if (OperatingSystem.IsWindows()) return WindowsIdentityOf(path);
        throw new PlatformNotSupportedException("the leftovers helper supports Linux, macOS and Windows only");
    }

    /// <summary>The kernel's fixed <c>struct statx</c> layout: <c>stx_mask</c> u32 @0, <c>stx_uid</c> u32 @20,
    /// <c>stx_mode</c> u16 @28, <c>stx_ino</c> u64 @32, <c>stx_ctime</c> @96 and <c>stx_mtime</c> @112 as
    /// <c>{ i64 sec, u32 nsec }</c>, <c>stx_dev_major</c> u32 @136, <c>stx_dev_minor</c> u32 @140.</summary>
    internal static Identity ParseStatx(ReadOnlySpan<byte> buffer)
    {
        if (buffer.Length < 144) throw new InvalidOperationException($"statx answered {buffer.Length} bytes, fewer than the 144 this reads");
        var mask = BinaryPrimitives.ReadUInt32LittleEndian(buffer);
        if ((mask & StatxRequired) != StatxRequired)
        {
            throw new InvalidOperationException($"statx mask 0x{mask:x} lacks 0x{StatxRequired & ~mask:x}: the file system gave no identity");
        }

        var mode = BinaryPrimitives.ReadUInt16LittleEndian(buffer[28..]);
        var kind = mode & 0xF000;
        return new Identity(
            Dev: ((ulong)BinaryPrimitives.ReadUInt32LittleEndian(buffer[136..]) << 32) | BinaryPrimitives.ReadUInt32LittleEndian(buffer[140..]),
            Ino: BinaryPrimitives.ReadUInt64LittleEndian(buffer[32..]),
            IsDirectory: kind == 0x4000,
            IsLink: kind == 0xA000,
            IsRegular: kind == 0x8000,
            Uid: BinaryPrimitives.ReadUInt32LittleEndian(buffer[20..]),
            ChangeTime: UnixTime(buffer[96..]),
            WriteTime: UnixTime(buffer[112..]));
    }

    /// <summary>Make <paramref name="path"/> with <c>mkdir</c> (mode 0700 on Linux and macOS: only the caller's processes read a
    /// scratch folder) or <c>CreateDirectoryW</c>. False = it already exists, so it is somebody else's and is never
    /// adopted; any other failure throws.</summary>
    internal static bool MakeDirectoryExclusively(string path)
    {
        if (OperatingSystem.IsLinux())
        {
            if (Libc.Mkdir(path, 0x1C0) == 0) return true; // 0o700 — C# has no octal literal; 0700 would be decimal
            var errno = Marshal.GetLastPInvokeError();
            return errno == Errno.Linux.Eexist ? false : throw Failure($"mkdir {path}", errno);
        }

        if (OperatingSystem.IsMacOS())
        {
            if (Darwin.Mkdir(path, 0x1C0) == 0) return true;
            var errno = Marshal.GetLastPInvokeError();
            return errno == Errno.Darwin.Eexist ? false : throw Failure($"mkdir {path}", errno);
        }

        if (OperatingSystem.IsWindows())
        {
            if (Kernel32.CreateDirectory(path, IntPtr.Zero)) return true;
            var error = Marshal.GetLastPInvokeError();
            return error == ErrorAlreadyExists ? false : throw Failure($"CreateDirectoryW {path}", error);
        }

        throw new PlatformNotSupportedException("the leftovers helper supports Linux, macOS and Windows only");
    }

    /// <summary>Linux and macOS <c>rename(2)</c> (atomic, and onto an EMPTY directory too); Windows <c>Directory.Move</c>, which
    /// refuses an existing target and so is exclusive by itself.</summary>
    internal static void RenameOnto(string from, string to)
    {
        if (OperatingSystem.IsLinux())
        {
            if (Libc.Rename(from, to) != 0) throw Failure($"rename {from} to {to}", Marshal.GetLastPInvokeError());
            return;
        }

        if (OperatingSystem.IsMacOS())
        {
            if (Darwin.Rename(from, to) != 0) throw Failure($"rename {from} to {to}", Marshal.GetLastPInvokeError());
            return;
        }

        Directory.Move(from, to);
    }

    /// <summary>Rename <paramref name="from"/> to <paramref name="to"/> ONLY if nothing is at <paramref name="to"/>; false = something is
    /// (it is untouched, <paramref name="from"/> stays where it was), any other failure throws. Linux: <c>renameat2(RENAME_NOREPLACE)</c>
    /// — atomic, where <c>rename(2)</c> replaces an empty folder and .NET's <c>Directory.Move</c> only checks first and then renames; a file
    /// system that does not take the flag (EINVAL, ENOSYS, or a libc without the call) falls back to reserving the name with an
    /// exclusive <c>mkdir</c> and renaming over that placeholder. Windows: <c>Directory.Move</c>, which refuses an existing target
    /// itself. macOS: <c>renamex_np(RENAME_EXCL)</c>, with NO fallback — a volume that does not take the flag throws, and the folder is kept
    /// (<see cref="DarwinExclusiveRenameOutcome"/>).</summary>
    internal static bool RenameExclusively(string from, string to)
    {
        if (OperatingSystem.IsLinux()) return LinuxRenameExclusively(from, to);
        if (OperatingSystem.IsMacOS()) return DarwinRenameExclusively(from, to);
        try
        {
            Directory.Move(from, to);
            return true;
        }
        catch (IOException) when (IdentityOf(to) is not null)
        {
            return false; // the target was there: untouched
        }
    }

    [SupportedOSPlatform("linux")]
    private static bool LinuxRenameExclusively(string from, string to)
    {
        int errno;
        try
        {
            if (Libc.Renameat2(AtFdcwd, from, AtFdcwd, to, RenameNoreplace) == 0) return true;
            errno = Marshal.GetLastPInvokeError();
        }
        catch (EntryPointNotFoundException)
        {
            errno = Errno.Linux.Enosys; // a libc older than 2.28
        }

        if (errno == Errno.Linux.Eexist) return false;
        if (errno != Errno.Linux.Einval && errno != Errno.Linux.Enosys) throw Failure($"renameat2 {from} to {to}", errno);
        return RenameByReservation(from, to);
    }

    /// <summary>The fallback of <see cref="RenameExclusively"/>: reserve the name with an exclusive <c>mkdir</c>, then rename over our own
    /// placeholder. False = the name is taken. When the rename fails the placeholder is cleaned up and the rename's failure is thrown.
    /// <paramref name="afterFailedRename"/> is the test seam: it runs once the rename failed, before the placeholder is looked at.</summary>
    [SupportedOSPlatform("linux")]
    internal static bool RenameByReservation(string from, string to, Action? afterFailedRename = null)
    {
        if (!MakeDirectoryExclusively(to)) return false; // the reservation: the name is taken, or now is
        var reserved = ReservedIdentity(to);
        if (Libc.Rename(from, to) == 0) return true;
        var failure = Failure($"rename {from} to {to}", Marshal.GetLastPInvokeError());
        try
        {
            afterFailedRename?.Invoke();
            if (reserved is { } placeholder && IdentityOf(to) is { IsDirectory: true, IsLink: false } now && now.Uid == GetUid() && now.Dev == placeholder.Dev && now.Ino == placeholder.Ino)
            {
                _ = Libc.Rmdir(to); // rmdir(2) takes an EMPTY folder only and never follows a link; a failure (not empty, gone) is not ours to chase
            }
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or InvalidOperationException)
        {
            // Gone, not empty, not readable (the native failure is an IOException, an unreadable identity an InvalidOperationException): not ours to chase.
            // Anything else is a bug and propagates.
        }

        throw failure;
    }

    /// <summary>The identity of the placeholder just made, kept so the clean-up removes THAT folder and no other; null when it cannot be read (nothing is then removed).</summary>
    [SupportedOSPlatform("linux")]
    private static Identity? ReservedIdentity(string path)
    {
        try
        {
            return IdentityOf(path);
        }
        catch (Exception ex) when (ex is IOException or InvalidOperationException)
        {
            return null;
        }
    }

    /// <summary><c>kill(pid, 0)</c>: 0 when the process exists and may be signalled, else the errno.</summary>
    internal static int Kill(int pid) =>
        OperatingSystem.IsLinux() ? (Libc.Kill(pid, 0) == 0 ? 0 : Marshal.GetLastPInvokeError())
        : OperatingSystem.IsMacOS() ? (Darwin.Kill(pid, 0) == 0 ? 0 : Marshal.GetLastPInvokeError())
        : throw new PlatformNotSupportedException("kill(2) is POSIX only");

    private static IOException Failure(string what, int code) => new($"{what} failed: {new Win32Exception(code).Message} ({code})", new Win32Exception(code));

    private static DateTimeOffset UnixTime(ReadOnlySpan<byte> timestamp) =>
        DateTimeOffset.FromUnixTimeSeconds(BinaryPrimitives.ReadInt64LittleEndian(timestamp)).AddTicks(BinaryPrimitives.ReadUInt32LittleEndian(timestamp[8..]) / 100);

    [SupportedOSPlatform("linux")]
    private static Identity? LinuxIdentityOf(string path)
    {
        Span<byte> buffer = stackalloc byte[256];
        if (Libc.Statx(AtFdcwd, path, AtSymlinkNofollow, StatxBasicStats, buffer) == 0) return ParseStatx(buffer);
        var errno = Marshal.GetLastPInvokeError();
        return errno == Errno.Linux.Enoent ? null : throw Failure($"statx {path}", errno);
    }

    /// <summary>The entry's final path (its parents resolved, the entry itself a link when it is one) and its owner SID,
    /// both read from ONE handle opened on the entry itself. Null on ANY failure.</summary>
    [SupportedOSPlatform("windows")]
    internal static WindowsEntry? WindowsEntryOf(string path)
    {
        try
        {
            using var handle = OpenEntry(path, followLinks: false, out _);
            if (handle is null) return null;
            var finalPath = FinalPathOf(handle);
            var owner = OwnerOf(handle);
            return finalPath is null || owner is null ? null : new WindowsEntry(finalPath, owner);
        }
        catch (Exception ex) when (ex is Win32Exception or ArgumentException or InvalidOperationException)
        {
            return null; // fail closed: no answer is "not the caller's"
        }
    }

    /// <summary>The owner SID of the OPEN entry (a link's own owner, never its target's), or null on ANY failure.</summary>
    internal static SecurityIdentifier? OwnerSidOf(string path) =>
        OperatingSystem.IsWindows() ? WindowsEntryOf(path)?.Owner : null;

    /// <summary>The final path of <paramref name="path"/> with every link followed — the profile's real folder.</summary>
    [SupportedOSPlatform("windows")]
    internal static string? FinalPathOfFollowing(string path)
    {
        using var handle = OpenEntry(path, followLinks: true, out _);
        return handle is null ? null : FinalPathOf(handle);
    }

    /// <summary>How a probed process stands: the query shape of libuv's <c>uv__kill</c> with signal 0.</summary>
    [SupportedOSPlatform("windows")]
    internal static ProbeState WindowsProcessState(uint pid)
    {
        // PROCESS_QUERY_LIMITED_INFORMATION 0x1000 | SYNCHRONIZE 0x00100000
        using var process = Kernel32.OpenProcess(0x1000 | 0x00100000, false, pid);
        if (process.IsInvalid)
        {
            // ERROR_INVALID_PARAMETER: no such process — the only dead there is. Access denied or anything else: unknown.
            return Marshal.GetLastPInvokeError() == 87 ? ProbeState.Dead : ProbeState.Unknown;
        }

        if (!Kernel32.GetExitCodeProcess(process, out var code)) return ProbeState.Unknown;
        if (code != 259) return ProbeState.Dead; // not STILL_ACTIVE
        // 259 may be a real exit code: a process that exited with it is signalled.
        return Kernel32.WaitForSingleObject(process, 0) switch
        {
            0 => ProbeState.Dead,
            0x102 => ProbeState.Live,
            _ => ProbeState.Unknown,
        };
    }

    [SupportedOSPlatform("windows")]
    private static Identity? WindowsIdentityOf(string path)
    {
        using var handle = OpenEntry(path, followLinks: false, out var error);
        if (handle is null)
        {
            return error is ErrorFileNotFound or ErrorPathNotFound ? null : throw Failure($"CreateFileW {path}", (int)error);
        }

        return WindowsIdentityOfHandle(handle, path);
    }

    /// <summary>The identity of an OPEN handle: the volume serial and the 128-bit file id (<c>FileIdInfo</c>, which ReFS needs — the
    /// 64-bit index of <c>GetFileInformationByHandle</c> is not unique there), and the attributes.</summary>
    [SupportedOSPlatform("windows")]
    private static Identity WindowsIdentityOfHandle(SafeFileHandle handle, string path)
    {
        var id = new byte[24]; // FILE_ID_INFO: VolumeSerialNumber u64, FileId 128 bits
        var basic = new byte[40]; // FILE_BASIC_INFO: four FILETIMEs (creation, access, write, change), attributes u32
        if (!Kernel32.GetFileInformationByHandleEx(handle, 18, id, (uint)id.Length)) throw Failure($"FileIdInfo {path}", Marshal.GetLastPInvokeError());
        if (!Kernel32.GetFileInformationByHandleEx(handle, 0, basic, (uint)basic.Length)) throw Failure($"FileBasicInfo {path}", Marshal.GetLastPInvokeError());

        var attributes = BinaryPrimitives.ReadUInt32LittleEndian(basic.AsSpan(32));
        var isDirectory = (attributes & 0x10) != 0;
        var isLink = (attributes & 0x400) != 0; // any reparse point — a junction, a symlink, a placeholder: never followed, never removed
        return new Identity(
            Dev: BinaryPrimitives.ReadUInt64LittleEndian(id),
            Ino: new UInt128(BinaryPrimitives.ReadUInt64LittleEndian(id.AsSpan(16)), BinaryPrimitives.ReadUInt64LittleEndian(id.AsSpan(8))),
            IsDirectory: isDirectory,
            IsLink: isLink,
            IsRegular: !isDirectory && !isLink,
            Uid: null,
            ChangeTime: FileTime(basic.AsSpan(24)),
            WriteTime: FileTime(basic.AsSpan(16)));
    }

    /// <summary>At most <paramref name="limit"/> bytes of the file at <paramref name="path"/>, through ONE open handle that is checked
    /// before any byte is read, so an entry swapped in since the caller looked cannot block the read or stand in for the claim. Windows: the
    /// handle must be a disk file (<c>GetFileType</c> = <c>FILE_TYPE_DISK</c>), a regular file (no folder, no reparse point; the open does
    /// not follow a link) and the very file <paramref name="expected"/> names (volume serial and 128-bit file id). Linux: <c>open(2)</c> with
    /// <c>O_RDONLY | O_NONBLOCK | O_NOFOLLOW | O_CLOEXEC</c> (a FIFO opens at once instead of waiting for a writer; a link is refused), then
    /// <c>statx</c> on the descriptor itself (<c>AT_EMPTY_PATH</c>): a regular file with the (device, inode) judged. macOS: the same with Darwin's flag
    /// numbers (<c>O_NONBLOCK</c> 0x4, <c>O_NOFOLLOW</c> 0x100, <c>O_CLOEXEC</c> 0x1000000) and <c>fstat</c>. Null when any of that fails
    /// or the file cannot be opened: an unreadable claim, never a guess.</summary>
    internal static byte[]? ReadVerifiedRegular(string path, Identity expected, int limit)
    {
        try
        {
            if (OperatingSystem.IsWindows()) return WindowsReadVerifiedRegular(path, expected, limit);
            if (OperatingSystem.IsLinux()) return LinuxReadVerifiedRegular(path, expected, limit);
            if (OperatingSystem.IsMacOS()) return DarwinReadVerifiedRegular(path, expected, limit);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or InvalidOperationException)
        {
            return null;
        }

        throw new PlatformNotSupportedException("the leftovers helper supports Linux, macOS and Windows only");
    }

    [SupportedOSPlatform("linux")]
    private static byte[]? LinuxReadVerifiedRegular(string path, Identity expected, int limit)
    {
        // O_NONBLOCK 0x800 and O_CLOEXEC 0x80000 are the same on every Linux; O_NOFOLLOW is 0x20000 on x86 and 0x8000 on ARM.
        var noFollow = RuntimeInformation.ProcessArchitecture is Architecture.Arm or Architecture.Arm64 ? 0x8000 : 0x20000;
        var descriptor = Libc.Open(path, 0x800 | noFollow | 0x80000); // O_RDONLY is 0
        if (descriptor < 0) return null;
        using var handle = new SafeFileHandle(descriptor, ownsHandle: true); // closed on every path from here
        Span<byte> buffer = stackalloc byte[256];
        if (Libc.Statx(descriptor, string.Empty, AtEmptyPath, StatxBasicStats, buffer) != 0) return null;
        var now = ParseStatx(buffer);
        if (!now.IsRegular || now.Dev != expected.Dev || now.Ino != expected.Ino) return null;
        return ReadAll(handle, limit);
    }

    private static byte[] ReadAll(SafeFileHandle handle, int limit)
    {
        var buffer = new byte[limit];
        var read = 0;
        while (read < buffer.Length && RandomAccess.Read(handle, buffer.AsSpan(read), read) is var n and > 0) read += n;
        return buffer[..read];
    }

    [SupportedOSPlatform("windows")]
    private static byte[]? WindowsReadVerifiedRegular(string path, Identity expected, int limit)
    {
        // GENERIC_READ 0x80000000; share READ|WRITE|DELETE = 7; OPEN_EXISTING = 3; FILE_FLAG_OPEN_REPARSE_POINT 0x00200000 (a link is the entry itself)
        using var handle = Kernel32.CreateFile(path, 0x80000000u, 7, IntPtr.Zero, 3, 0x00200000u, IntPtr.Zero);
        if (handle.IsInvalid || Kernel32.GetFileType(handle) != FileTypeDisk) return null;
        var now = WindowsIdentityOfHandle(handle, path);
        if (!now.IsRegular || now.Dev != expected.Dev || now.Ino != expected.Ino) return null;
        return ReadAll(handle, limit);
    }

    private static DateTimeOffset FileTime(ReadOnlySpan<byte> field) =>
        new(DateTime.FromFileTimeUtc(BinaryPrimitives.ReadInt64LittleEndian(field)), TimeSpan.Zero);

    /// <summary>Open the entry for attribute and security reads. Without <paramref name="followLinks"/> a junction or
    /// symlink is the entry itself (<c>FILE_FLAG_OPEN_REPARSE_POINT</c>) while its PARENTS still resolve.</summary>
    [SupportedOSPlatform("windows")]
    private static SafeFileHandle? OpenEntry(string path, bool followLinks, out uint error)
    {
        // FILE_READ_ATTRIBUTES 0x80 | READ_CONTROL 0x20000; share READ|WRITE|DELETE = 7; OPEN_EXISTING = 3;
        // FILE_FLAG_BACKUP_SEMANTICS 0x02000000 (a directory opens at all) | FILE_FLAG_OPEN_REPARSE_POINT 0x00200000
        var handle = Kernel32.CreateFile(path, 0x80 | 0x20000, 7, IntPtr.Zero, 3, 0x02000000u | (followLinks ? 0u : 0x00200000u), IntPtr.Zero);
        if (!handle.IsInvalid)
        {
            error = 0;
            return handle;
        }

        error = (uint)Marshal.GetLastPInvokeError();
        handle.Dispose();
        return null;
    }

    [SupportedOSPlatform("windows")]
    private static string? FinalPathOf(SafeFileHandle handle)
    {
        var buffer = new char[512];
        while (true)
        {
            var length = Kernel32.GetFinalPathNameByHandle(handle, buffer, (uint)buffer.Length, 0); // VOLUME_NAME_DOS
            if (length == 0) return null;
            if (length < buffer.Length) return WithoutDevicePrefix(new string(buffer, 0, (int)length));
            buffer = new char[length + 1];
        }
    }

    private static string WithoutDevicePrefix(string path) =>
        path.StartsWith(@"\\?\UNC\", StringComparison.Ordinal) ? @"\\" + path[8..]
        : path.StartsWith(@"\\?\", StringComparison.Ordinal) ? path[4..]
        : path;

    [SupportedOSPlatform("windows")]
    private static SecurityIdentifier? OwnerOf(SafeFileHandle handle)
    {
        // SE_FILE_OBJECT = 1, OWNER_SECURITY_INFORMATION = 0x1: the owner of the OPEN entry. The SID points into the
        // descriptor, so it is copied into a managed SecurityIdentifier before the descriptor is freed.
        var status = Advapi32.GetSecurityInfo(handle, 1, 1, out var owner, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, out var descriptor);
        try
        {
            return status == 0 && owner != IntPtr.Zero ? new SecurityIdentifier(owner) : null;
        }
        finally
        {
            if (descriptor != IntPtr.Zero) Kernel32.LocalFree(descriptor);
        }
    }

    internal sealed record WindowsEntry(string FinalPath, SecurityIdentifier Owner);

    [SupportedOSPlatform("windows")]
    private static partial class Kernel32
    {
        [LibraryImport("kernel32", EntryPoint = "CreateDirectoryW", SetLastError = true, StringMarshalling = StringMarshalling.Utf16)]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static partial bool CreateDirectory(string path, IntPtr security);

        [LibraryImport("kernel32", EntryPoint = "CreateFileW", SetLastError = true, StringMarshalling = StringMarshalling.Utf16)]
        internal static partial SafeFileHandle CreateFile(string path, uint access, uint share, IntPtr security, uint disposition, uint flags, IntPtr template);

        [LibraryImport("kernel32")]
        internal static partial uint GetFileType(SafeFileHandle handle);

        [LibraryImport("kernel32", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static partial bool GetFileInformationByHandleEx(SafeFileHandle handle, int infoClass, Span<byte> buffer, uint size);

        [LibraryImport("kernel32", EntryPoint = "GetFinalPathNameByHandleW", SetLastError = true, StringMarshalling = StringMarshalling.Utf16)]
        internal static partial uint GetFinalPathNameByHandle(SafeFileHandle handle, Span<char> buffer, uint length, uint flags);

        [LibraryImport("kernel32", SetLastError = true)]
        internal static partial SafeProcessHandle OpenProcess(uint access, [MarshalAs(UnmanagedType.Bool)] bool inherit, uint pid);

        [LibraryImport("kernel32", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static partial bool GetExitCodeProcess(SafeProcessHandle process, out uint code);

        [LibraryImport("kernel32", SetLastError = true)]
        internal static partial uint WaitForSingleObject(SafeProcessHandle handle, uint milliseconds);

        [LibraryImport("kernel32")]
        internal static partial IntPtr LocalFree(IntPtr memory);
    }

    [SupportedOSPlatform("windows")]
    private static partial class Advapi32
    {
        [LibraryImport("advapi32")]
        internal static partial uint GetSecurityInfo(
            SafeFileHandle handle, int objectType, uint information, out IntPtr owner, IntPtr group, IntPtr dacl, IntPtr sacl, out IntPtr descriptor);
    }

    [SupportedOSPlatform("linux")]
    private static partial class Libc
    {
        [LibraryImport("libc", EntryPoint = "getuid")]
        internal static partial uint GetUid();

        [LibraryImport("libc", EntryPoint = "kill", SetLastError = true)]
        internal static partial int Kill(int pid, int signal);

        [LibraryImport("libc", EntryPoint = "mkdir", SetLastError = true, StringMarshalling = StringMarshalling.Utf8)]
        internal static partial int Mkdir(string path, uint mode);

        [LibraryImport("libc", EntryPoint = "statx", SetLastError = true, StringMarshalling = StringMarshalling.Utf8)]
        internal static partial int Statx(int dirfd, string path, int flags, uint mask, Span<byte> buffer);

        [LibraryImport("libc", EntryPoint = "open", SetLastError = true, StringMarshalling = StringMarshalling.Utf8)]
        internal static partial int Open(string path, int flags);

        [LibraryImport("libc", EntryPoint = "rmdir", SetLastError = true, StringMarshalling = StringMarshalling.Utf8)]
        internal static partial int Rmdir(string path);

        [LibraryImport("libc", EntryPoint = "rename", SetLastError = true, StringMarshalling = StringMarshalling.Utf8)]
        internal static partial int Rename(string from, string to);

        [LibraryImport("libc", EntryPoint = "renameat2", SetLastError = true, StringMarshalling = StringMarshalling.Utf8)]
        internal static partial int Renameat2(int fromDirFd, string from, int toDirFd, string to, uint flags);
    }
}
