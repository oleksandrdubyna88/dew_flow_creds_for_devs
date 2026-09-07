using Microsoft.Extensions.Logging;

namespace CredVaultServer;

/// <summary>
/// A run's claim on this deployment, held as an open file handle.
/// </summary>
/// <remarks>
/// <para>Disposing it releases the claim. So does dying: the operating system closes the handle when
/// the process goes, which is the whole reason the claim is a handle and not a timestamp.</para>
///
/// <para><b>The residual, stated here because this is where a caller reads it.</b> Every mutual
/// exclusion primitive leaves a window, and this one leaves two:</para>
/// <list type="bullet">
/// <item><description><b>It is only as strong as the filesystem underneath it.</b> On a local volume
/// and on a Docker bind mount it is enforced by the kernel. On <b>NFS</b> — and on some network
/// filesystems generally — mandatory locking is advisory at best, so two containers on one NFS export
/// can both believe they hold it. A deployment that keeps its data directory on NFS should run one
/// server, and this is why.</description></item>
/// <item><description><b>Taking the claim and reading the status are two operations.</b> A run that
/// finishes in the microseconds between them is not seen by the reader — which is harmless here,
/// because both callers of that pair either write a terminal status or leave the row alone, and
/// neither starts work on the strength of a stale read.</description></item>
/// </list>
/// <para>What it does NOT leave is the window a lock file has: there is no interval after which
/// somebody decides the holder must be dead, so a slow run is never overtaken by a second one.</para>
/// </remarks>
public sealed class RunClaim(FileStream? held) : IDisposable
{
    /// <summary>The claim nobody got.</summary>
    public static readonly RunClaim Refused = new(null);

    public bool Taken => held is not null;

    public void Dispose() => held?.Dispose();
}

/// <summary>
/// The run's half of the store: the claim, the sweep, the archives and retention.
/// </summary>
/// <remarks>
/// In its own file because <c>BackupStore.cs</c> was already about the key and the settings, and this
/// is about what a run does — the same split <c>VaultStoreOutbox</c> made when the vault store grew a
/// third concern.
/// </remarks>
public sealed partial class BackupStore
{
    /// <summary>
    /// Take the claim, or come back refused.
    /// </summary>
    /// <remarks>
    /// <para><b>The claim is an open handle with <c>FileShare.None</c>, and that choice answers five
    /// separate problems at once.</b> A boolean field is a claim that dies with the process while the
    /// state it guards — a half-built archive, a status saying "in progress" — outlives it. A lock FILE
    /// with a timestamp is worse than it looks: the review round pointed out that reclaiming one
    /// because it is older than some "longest plausible run" will, on the day a vault directory grows
    /// past that guess, start a second build over the same tree; and that a second container starting
    /// up cannot tell a live run from a dead one by looking at a file's age.</para>
    /// <para>An operating-system handle has neither problem. Two processes cannot hold it, whether they
    /// are on one machine or two containers sharing a volume. A process that dies releases it, because
    /// closing handles is what the kernel does on exit — so there is no orphan to detect and no
    /// heuristic to tune. And "is a run live?" becomes a question with an actual answer: try to take
    /// the claim.</para>
    /// </remarks>
    public RunClaim TryClaim()
    {
        try
        {
            // Creating the directory here is deliberate — a claim is taken because a run is about to
            // WRITE — but it is why the two read-only callers below check first. See RunIsLive.
            Directory.CreateDirectory(_dir);
            return new RunClaim(new FileStream(
                LockPath, FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None, 1, FileOptions.None));
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            return RunClaim.Refused;
        }
    }

    /// <summary>
    /// Whether a run is live right now, asked of the operating system rather than of a file's contents.
    /// </summary>
    /// <remarks>
    /// <para><b>It answers no without touching the disk when there is no backup tree.</b> That is not
    /// an optimisation: <c>org/</c> appears on this server only when something is WRITTEN into it, so
    /// that an operator looking at a data directory can tell a deployment with a roster from one
    /// without — and a probe that created <c>org/backup/</c> just to discover nothing was running would
    /// break that on every status read. Four existing tests caught exactly that, which is what they are
    /// for.</para>
    /// </remarks>
    public bool RunIsLive()
    {
        if (!Directory.Exists(_dir))
        {
            return false;
        }
        using var probe = TryClaim();
        return !probe.Taken;
    }

    /// <summary>
    /// At startup: a status left saying "in progress" by a process that is gone becomes a failure.
    /// </summary>
    /// <remarks>
    /// <para>Required by rule 8, and the failure it prevents is specific: a container killed mid-build
    /// leaves <c>in progress</c> on disk, so the page shows a spinner for ever and an administrator has
    /// no way to tell a running backup from a dead one.</para>
    /// <para><b>It sweeps only what it can prove is orphaned.</b> The proof is the claim: if this call
    /// can TAKE it, no process holds it, so nothing is running and an in-progress status is a lie left
    /// by something that died. If it cannot, a run is live — possibly in another container, minutes into
    /// a large archive — and the sweep does nothing at all. An earlier version of this plan rewrote the
    /// status whenever a server started, which would have declared another container's live run dead.</para>
    /// </remarks>
    public async Task<bool> SweepOrphanedRunAsync(CancellationToken ct)
    {
        // Nothing has ever been written here, so there is no status to have been interrupted — and
        // creating the tree to find that out would put an org/ on a server that has none.
        if (!Directory.Exists(_dir))
        {
            return false;
        }
        using var claim = TryClaim();
        if (!claim.Taken)
        {
            return false;
        }
        var status = await ReadStatusAsync(ct);
        if (!BackupRunResults.IsRunning(status.LastResult))
        {
            return false;
        }
        await WriteStatusAsync(
            status with
            {
                LastResult = BackupRunResults.Failed,
                LastError = "the server stopped while this run was building. No archive was finished by "
                    + "it; the next scheduled run will take one.",
            },
            ct);
        log.LogWarning(
            "a backup run was interrupted by a restart and its status said it was still in progress. It "
            + "is now recorded as failed, and nothing is holding the run claim.");
        return true;
    }

    /// <summary>The newest archive on disk, or none.</summary>
    /// <remarks>
    /// <para>Matches <see cref="ArchiveName.Pattern"/> only, so a half-written <c>*.cvbk.partial</c> is
    /// invisible here — the download must never be handed a file that is still being written.</para>
    /// <para><b>It reads names and stats exactly one file.</b> The status page polls this, and an
    /// earlier version built the whole list — parsing every name, calling <c>FileInfo.Length</c> on
    /// every file and sorting the lot — on every poll. The name carries the instant, so picking the
    /// newest needs no file opened at all; only the winner's size is asked for.</para>
    /// </remarks>
    public LocalArchive NewestArchive()
    {
        var newest = string.Empty;
        var at = DateTimeOffset.MinValue;
        foreach (var path in Names())
        {
            var taken = ArchiveName.InstantOf(path);
            if (taken is not null && taken.Value > at)
            {
                (newest, at) = (path, taken.Value);
            }
        }
        return newest.Length == 0 ? LocalArchive.None : new LocalArchive(newest, at, Size(newest));
    }

    private IEnumerable<string> Names()
    {
        try
        {
            return Directory.EnumerateFiles(ArchivesDir, ArchiveName.Pattern).ToArray();
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            return [];
        }
    }

    /// <summary>Every archive this store can account for, newest first.</summary>
    public IReadOnlyList<LocalArchive> Archives() =>
    [
        .. Names().Select(Read).Where(archive => archive.Exists).OrderByDescending(archive => archive.TakenAt),
    ];

    /// <summary>
    /// Delete archives older than the window — and never, ever all of them.
    /// </summary>
    /// <remarks>
    /// <para>The floor is <c>deploy/backup/backup-once.sh</c>'s own, reproduced rather than
    /// reinvented: <b>a pass whose every candidate is old deletes nothing</b>. A clock skew, a server
    /// that was down for a month, or a destination that was unreachable must not turn "prune old
    /// backups" into "delete every backup", and the shell script says exactly that in its own comment
    /// at line 129.</para>
    /// <para>Retention reads each name's own instant, not its file's timestamp — see
    /// <see cref="ArchiveName.InstantOf"/> for why a restore makes mtimes untrustworthy.</para>
    /// </remarks>
    public int PruneArchivesOlderThan(DateTimeOffset now, int retentionDays)
    {
        if (retentionDays <= 0)
        {
            return 0;
        }
        var all = Archives();
        var cutoff = now.AddDays(-retentionDays);
        var old = all.Where(archive => archive.TakenAt < cutoff).ToArray();
        if (old.Length == 0 || old.Length == all.Count)
        {
            RefuseToEmptyTheDirectory(old.Length, all.Count, retentionDays);
            return 0;
        }
        return old.Sum(archive => Deleted(archive.Path) ? 1 : 0);
    }

    private string LockPath => Path.Combine(_dir, "run.lock");

    private void RefuseToEmptyTheDirectory(int old, int total, int retentionDays)
    {
        if (old > 0)
        {
            log.LogWarning(
                "refusing to prune: all {Total} archive(s) are older than {Days} days. A clock that "
                + "jumped, a server that was down, or an upload that has not worked for a month must not "
                + "turn retention into deletion of everything.",
                total,
                retentionDays);
        }
    }

    private static LocalArchive Read(string path)
    {
        var at = ArchiveName.InstantOf(path);
        return at is null ? LocalArchive.None : new LocalArchive(path, at.Value, Size(path));
    }

    private static long Size(string path)
    {
        try
        {
            return new FileInfo(path).Length;
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            return 0;
        }
    }

    private static bool Deleted(string path)
    {
        try
        {
            File.Delete(path);
            return true;
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            // Held open by a download, or gone already. A retention pass that threw here would stop
            // retaining, and the next pass will find it again.
            return false;
        }
    }
}
