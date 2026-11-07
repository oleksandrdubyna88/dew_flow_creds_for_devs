using System.Collections.Concurrent;
using System.Text;

namespace CredsForDevs.Tests.Leftovers;

/// <summary>One scratch folder <c>testsToDelete-&lt;owner&gt;-mcp-&lt;what&gt;-&lt;id&gt;</c>, made the way rule §2 orders it: the claim
/// FIRST, beside the folder, with an exclusive create; the cleanup is the caller's very next statement
/// (<c>using var dir = OwnedDir.Create("x");</c>, or <see cref="OwnedScope.Dir"/>); then the folder, made EXCLUSIVELY
/// (<c>mkdir</c>, never a create that succeeds on an existing folder). A name already taken is somebody else's: never
/// adopted, never removed. Nothing is ever written inside the folder — the owner lives beside it.</summary>
public sealed class OwnedDir : IDisposable
{
    /// <summary>The process-wide registry of folders not yet reclaimed: created and never disposed, AND disposed but not
    /// removed. An entry leaves only when folder AND claim are both gone, so the end-of-run audit still sees a disposal
    /// that gave up — under ANY parent, which a scan of the temp root cannot.</summary>
    private static readonly ConcurrentDictionary<OwnedDir, byte> Registry = new();

    private readonly Action<string> _warn;
    private readonly Action _requireLayout;
    private volatile bool _disposeAttempted;
    private volatile bool _removed;

    private OwnedDir(string path, Action<string> warn, Action requireLayout)
    {
        Path = path;
        _warn = warn;
        _requireLayout = requireLayout;
    }

    public string Path { get; }

    /// <summary><see cref="Dispose"/> ran at least once (it may have given up).</summary>
    public bool DisposeAttempted => _disposeAttempted;

    public static OwnedDir Create(string what, string? parent = null, Action<string>? warn = null) => Create(what, parent, warn, null);

    /// <summary>The same, with the seams the tests need: the names to try, a step between the claim's exclusive create and
    /// its write, a step between the claim and the folder, and the layout requirement (default <see cref="DarwinLayout.Require"/>; only
    /// the layout measurement itself passes a no-op, since it runs INSIDE that requirement).</summary>
    internal static OwnedDir Create(string what, string? parent, Action<string>? warn, Func<string>? nextName, Action<string>? beforeClaimWrite = null, Action<string>? afterClaim = null, Action? requireLayout = null)
    {
        requireLayout ??= DarwinLayout.Require;
        requireLayout(); // before anything exists: on macOS no folder is made on an identity read that is not trusted
        Owned.CheckWhat(what); // before anything exists
        parent ??= Owned.TempRoot();
        warn ??= Owned.DefaultWarn;
        nextName ??= () => Owned.NameFor(what);
        var written = Owner.RunRecord(warn: warn).Format() + "\n";
        for (var draw = 0; draw < Owned.MaxDraws; draw++)
        {
            var dir = System.IO.Path.Combine(parent, nextName());
            if (TryClaim(dir, written, beforeClaimWrite) is not { } ours) continue; // somebody else's claim on this name
            if (!MakeFolder(dir, written, ours, warn, afterClaim)) continue;
            var made = new OwnedDir(dir, warn, requireLayout);
            Registry[made] = 0;
            return made;
        }

        throw new InvalidOperationException($"owned: no free name for {what} in {parent} after {Owned.MaxDraws} draws");
    }

    /// <summary>The one call that tears down: never throws. The entry stays in the registry unless folder AND claim are
    /// both gone, so a removal that gave up (a held handle on Windows, a read-only subfolder on Linux) is still seen by
    /// the audit; a later call tries again.</summary>
    public void Dispose()
    {
        _disposeAttempted = true;
        if (_removed) return;
        if (!Removal.Quietly(Path, _warn, _requireLayout)) return;
        _removed = true;
        Registry.TryRemove(this, out _);
    }

    /// <summary>A snapshot of the registry: never disposed, and disposed but not removed — told apart by
    /// <see cref="DisposeAttempted"/>.</summary>
    internal static IReadOnlyList<OwnedDir> Unreclaimed() => [.. Registry.Keys];

    /// <summary>Step 2: the exclusive create of the claim, then its content. Null = the name is taken (a claim already there); the
    /// identity of the claim just made otherwise. Any other failure — an I/O error or not — is "could not claim": the stream is
    /// closed, the claim is removed while it is still the file created here, and the failure goes on.</summary>
    private static Identity? TryClaim(string dir, string written, Action<string>? beforeClaimWrite)
    {
        var claim = dir + ".owner";
        FileStream stream;
        try
        {
            stream = new FileStream(claim, FileMode.CreateNew, FileAccess.Write, FileShare.None);
        }
        catch (IOException ex) when (NameIsTaken(ex, claim))
        {
            return null; // never File.Exists, which follows a link
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            throw new InvalidOperationException($"owned: could not claim {dir}: {ex.Message}", ex);
        }

        // Captured right after the exclusive create: a failure now must remove only THIS file.
        Identity? ours = null;
        try
        {
            ours = Native.IdentityOf(claim);
            beforeClaimWrite?.Invoke(claim);
            stream.Write(Encoding.UTF8.GetBytes(written));
            stream.Flush(flushToDisk: true);
            stream.Dispose();
            var now = Native.IdentityOf(claim);
            if (ours is null || now is null || now.Value.Dev != ours.Value.Dev || now.Value.Ino != ours.Value.Ino)
            {
                // Another identity under the name: what was written went to a file that is no longer there.
                throw new IOException("the claim was replaced by another file after it was created");
            }

            return ours;
        }
        catch (Exception ex)
        {
            stream.Dispose();
            RemoveClaimIfOurs(claim, ours, written);
            if (IsFailureOfTheFileSystem(ex)) throw new InvalidOperationException($"owned: could not claim {dir}: {ex.Message}", ex);
            throw;
        }
    }

    /// <summary>An I/O or access failure becomes the helper's own <see cref="InvalidOperationException"/> (with the cause inside); any other
    /// exception goes on as it is.</summary>
    private static bool IsFailureOfTheFileSystem(Exception ex) => ex is IOException or UnauthorizedAccessException or InvalidOperationException;

    /// <summary>Step 3: the folder, exclusively. False = it already exists under the claimed name: a squatter's, left alone, with ONE
    /// warning and this run's claim removed again (only while it is still the file created here and holds exactly what was written).
    /// Any failure — an I/O error or not, including the seam's — removes the claim the same way and goes on.</summary>
    private static bool MakeFolder(string dir, string written, Identity ours, Action<string> warn, Action<string>? afterClaim)
    {
        try
        {
            afterClaim?.Invoke(dir + ".owner");
            if (Native.MakeDirectoryExclusively(dir)) return true;
        }
        catch (Exception ex)
        {
            Removal.ClaimIfOurs(dir, ours, written, warn); // inside its own handling: it never throws
            if (IsFailureOfTheFileSystem(ex)) throw new InvalidOperationException($"owned: could not create {dir}: {ex.Message}", ex);
            throw;
        }

        warn($"owned: {dir} already exists under the name this run claimed — it is not this run's and is left alone; drawing another name");
        Removal.ClaimIfOurs(dir, ours, written, warn);
        return false;
    }

    /// <summary>The create refused because the name is taken: Windows says so with <c>ERROR_FILE_EXISTS</c>; on Linux the
    /// test is whether an entry is there now, read by identity.</summary>
    private static bool NameIsTaken(IOException ex, string claim)
    {
        if (OperatingSystem.IsWindows()) return ex.HResult == unchecked((int)0x80070050);
        return Native.IdentityOf(claim) is not null;
    }

    /// <summary>Remove a claim after a failed write only while it is still ours: its identity is the one captured, or its
    /// content is what was to be written. A claim another run put under that name since is not ours.</summary>
    private static void RemoveClaimIfOurs(string claim, Identity? ours, string written)
    {
        try
        {
            var now = Native.IdentityOf(claim);
            if (now is null) return;
            var sameFile = ours is not null && now.Value.Dev == ours.Value.Dev && now.Value.Ino == ours.Value.Ino;
            if (sameFile || File.ReadAllText(claim) == written) File.Delete(claim);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or InvalidOperationException)
        {
            // The claim stays, prefixed, for the start-of-run sweep to judge by its owner; the caller's exception says why.
        }
    }
}
