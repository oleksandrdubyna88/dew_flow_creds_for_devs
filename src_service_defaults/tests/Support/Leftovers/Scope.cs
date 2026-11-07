using System.Runtime.Versioning;
using System.Security.Principal;
using System.Text;

namespace CredsForDevs.Tests.Leftovers;

/// <summary>What <see cref="Scope.ReadClaimText"/> found: no file, a file that must not be trusted (with the reason
/// when the scope key refused it), or its text. A closed set — a caller cannot forget a case.</summary>
public abstract record ClaimRead
{
    private ClaimRead()
    {
    }

    public sealed record Missing : ClaimRead;

    public sealed record Unreadable(string? Reason = null) : ClaimRead;

    public sealed record Text(string Value) : ClaimRead;
}

/// <summary>Rule §3, "scope evidence": the name selects, the kernel authorises. A folder, a claim — anything the file
/// system owns — must belong to the caller, and a claim another user wrote is unreadable (a stranger wrote it).
///
/// <para>POSIX (Linux and macOS alike): the entry's own uid is the caller's REAL uid. Windows has no uid, and a shared temp root would erase
/// the key, so BOTH keys must hold on one handle that opens the entry itself: it lies strictly inside the caller's
/// profile AND its owner SID is the caller's user SID. Either unreadable fails closed. An elevated run's files are
/// owned by <c>BUILTIN\Administrators</c>, so they fail closed and are kept for a person to look at.</para></summary>
public static class Scope
{
    /// <summary>The longest claim is 512 bytes; one byte more is read so a longer one is SEEN as too long.</summary>
    private const int ReadLimit = 513;

    public static bool IsMine(string path)
    {
        try
        {
            if (OperatingSystem.IsWindows()) return WindowsIsMine(path);
            if (!Native.IsPosix) return false; // a system the helper does not serve: no evidence
            return Native.IdentityOf(path)?.Uid == Native.GetUid(); // Linux and macOS: ONE comparison, the entry's own uid against the real uid
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or InvalidOperationException or PlatformNotSupportedException)
        {
            return false; // any failure on the path to the kernel's answer is "not mine"
        }
    }

    /// <summary>The ONE safe read of a claim: missing; unreadable when it is no regular file (a FIFO would block, a link is
    /// not followed) or cannot be read; unreadable as <c>foreign-uid</c> when <paramref name="mine"/> (default
    /// <see cref="IsMine"/>) says the caller does not own it; else at most 513 bytes as text.</summary>
    public static ClaimRead ReadClaimText(string file, Func<string, bool>? mine = null)
    {
        Identity? identity;
        try
        {
            identity = Native.IdentityOf(file);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or InvalidOperationException)
        {
            return new ClaimRead.Unreadable();
        }

        if (identity is null) return new ClaimRead.Missing();
        if (identity.Value.IsLink || !identity.Value.IsRegular) return new ClaimRead.Unreadable();
        if (!(mine ?? IsMine)(file)) return new ClaimRead.Unreadable("foreign-uid");
        // ONE handle, checked before any byte is read: a regular file, the very file judged above. A named pipe, a device or another file
        // swapped in since cannot block this read (POSIX opens O_NONBLOCK | O_NOFOLLOW and asks the descriptor; Windows asks the handle).
        var bytes = Native.ReadVerifiedRegular(file, identity.Value, ReadLimit);
        return bytes is null ? new ClaimRead.Unreadable() : new ClaimRead.Text(Encoding.UTF8.GetString(bytes));
    }

    [SupportedOSPlatform("windows")]
    private static bool WindowsIsMine(string path)
    {
        var entry = Native.WindowsEntryOf(path);
        var profile = Native.FinalPathOfFollowing(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile));
        if (entry is null || profile is null || !IsStrictlyInside(entry.FinalPath, profile)) return false;
        using var caller = WindowsIdentity.GetCurrent();
        return caller.User is not null && entry.Owner.Equals(caller.User);
    }

    /// <summary>Strictly inside, compared ordinal-ignore-case by path segments: a longer sibling name is not a child.</summary>
    private static bool IsStrictlyInside(string child, string parent)
    {
        var root = parent.TrimEnd('\\');
        return child.Length > root.Length + 1
            && child.StartsWith(root, StringComparison.OrdinalIgnoreCase)
            && child[root.Length] == '\\';
    }
}
