namespace CredsForDevs.Tests.Leftovers;

/// <summary>Teardown by the run's own EXACT path (never by the prefix), five tries 100 ms apart, never throwing: it runs in
/// <c>Dispose</c>, where a throw would hide the test's own failure. The folder goes first, its claim last, so what cannot
/// be removed stays prefixed AND claimed and ONE warning names it — the start-of-run sweep and the janitor can still judge
/// it by its owner. It never asks who owns what: the run removes its own exact path, whoever the kernel says owns it. On macOS it first
/// requires the layout self-test to hold (<see cref="DarwinLayout.Require"/>), because the entry is read by identity.</summary>
internal static class Removal
{
    private const int Tries = 5;
    private static readonly TimeSpan Backoff = TimeSpan.FromMilliseconds(100);

    /// <summary>The entry at <paramref name="dir"/> first, read as itself (<see cref="Native.IdentityOf"/>, never following a link): a
    /// link is unlinked and nothing it points at is visited; a folder has its top-level links unlinked, then is removed; what is
    /// neither is not the helper's to remove. The claim goes only when the entry is GONE — re-read by identity, since
    /// <c>Directory.Exists</c> follows links and says false for an error as it does for an absence. True only when BOTH are gone; a
    /// path already gone is success.</summary>
    internal static bool Quietly(string dir, Action<string> warn, Action? requireLayout = null)
    {
        try
        {
            (requireLayout ?? DarwinLayout.Require)(); // on macOS no removal by identity runs before the layout holds; it never throws, so it says so once
        }
        catch (Exception ex)
        {
            warn($"owned: {dir} is kept: {ex.Message}");
            return false;
        }

        var failure = Retry(() => RemoveEntry(dir));
        if (failure is not null)
        {
            warn($"owned: could not remove {dir} ({failure.GetType().Name}: {failure.Message}) — left for the start-of-run sweep");
            return false; // the claim stays with it
        }

        return Claim(dir, warn);
    }

    private static void RemoveEntry(string dir)
    {
        var entry = Native.IdentityOf(dir); // an unreadable entry throws: it is not "gone"
        if (entry is null) return;
        if (entry.Value.IsLink) Unlink(dir, entry.Value.IsDirectory);
        else if (entry.Value.IsDirectory) RemoveFolder(dir);
        else throw new IOException("the entry is not a folder");
        if (Native.IdentityOf(dir) is not null) throw new IOException("the entry is still there");
    }

    private static void RemoveFolder(string dir)
    {
        UnlinkTopLevelLinks(dir);
        Directory.Delete(dir, recursive: true);
    }

    /// <summary>Only the claim beside <paramref name="dir"/> (the helper's own, or one whose folder was never made).</summary>
    internal static bool Claim(string dir, Action<string> warn)
    {
        var claim = dir + ".owner";
        var failure = Retry(() => File.Delete(claim)); // File.Delete of a missing file is silence
        if (failure is null) return true;
        warn($"owned: could not remove {claim} ({failure.GetType().Name}: {failure.Message}) — left for the start-of-run sweep");
        return false;
    }

    /// <summary>Remove the claim beside <paramref name="dir"/> only while it is still the file created at <paramref name="ours"/> AND holds
    /// exactly <paramref name="written"/>: a claim another run put there since is not ours. A claim that is not there is silence.</summary>
    internal static void ClaimIfOurs(string dir, Identity ours, string written, Action<string> warn)
    {
        var claim = dir + ".owner";
        try
        {
            var now = Native.IdentityOf(claim);
            if (now is not null && now.Value.Dev == ours.Dev && now.Value.Ino == ours.Ino && File.ReadAllText(claim) == written) File.Delete(claim);
        }
        catch (Exception ex) when (ex is FileNotFoundException or DirectoryNotFoundException)
        {
            // Already gone: nothing to remove, nothing to say.
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or InvalidOperationException)
        {
            warn($"owned: could not remove the claim {claim} ({ex.GetType().Name}: {ex.Message}) — left for the start-of-run sweep");
        }
    }

    /// <summary>Every top-level entry that is a link (a symlink or a Windows junction) is removed AS a link — a directory
    /// link as a directory entry, a file link as a file — and never what it points at. Deeper links are left to
    /// <c>Directory.Delete(recursive)</c>, which does not follow them either.</summary>
    internal static void UnlinkTopLevelLinks(string dir)
    {
        foreach (var entry in new DirectoryInfo(dir).EnumerateFileSystemInfos())
        {
            if (entry.Attributes.HasFlag(FileAttributes.ReparsePoint)) Unlink(entry.FullName, entry is DirectoryInfo);
        }
    }

    /// <summary>Remove a link AS a link: a directory link on Windows as a directory entry, otherwise <c>unlink(2)</c> — a directory
    /// symlink too, never its target.</summary>
    private static void Unlink(string path, bool isDirectory)
    {
        if (isDirectory && OperatingSystem.IsWindows()) Directory.Delete(path, recursive: false);
        else File.Delete(path);
    }

    /// <summary>Five tries 100 ms apart; the last exception, or null once a try succeeds. Every exception is caught.</summary>
    private static Exception? Retry(Action step)
    {
        Exception? last = null;
        for (var attempt = 0; attempt < Tries; attempt++)
        {
            if (attempt > 0) Thread.Sleep(Backoff);
            try
            {
                step();
                return null;
            }
            catch (Exception ex)
            {
                last = ex; // teardown never throws: the next try, or the one warning
            }
        }

        return last;
    }
}
