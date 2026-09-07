using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace CredVaultServer;

/// <summary>Why a run did not start, in the sentence the admin's page shows.</summary>
public sealed record RunRefusal(bool Started, string Why)
{
    public static readonly RunRefusal Started_ = new(true, string.Empty);

    public static RunRefusal Because(string why) => new(false, why);
}

/// <summary>
/// A run that has been claimed and announced, waiting to be carried out.
/// </summary>
/// <remarks>
/// It owns the claim for the whole of the work, so disposing it is what lets the next run happen.
/// </remarks>
public sealed class RunTicket(RunClaim claim, byte[] key, DateTimeOffset startedAt, string actor) : IDisposable
{
    public byte[] Key => key;

    public DateTimeOffset StartedAt => startedAt;

    public string Actor => actor;

    public void Dispose() => claim.Dispose();
}

/// <summary>What starting a run produced: a refusal, or a ticket to carry it out with.</summary>
public sealed record RunStart(RunRefusal Refusal, RunTicket? Ticket);

/// <summary>
/// One backup run: claim, say so, build, retain, record.
/// </summary>
/// <remarks>
/// <para><b>The order is the durability.</b> The status says <c>in progress</c> BEFORE the build
/// begins, so a page reloaded thirty seconds in tells the truth rather than showing whatever it showed
/// last; and it advances to a terminal state when the build ends, whichever way it ended. That is rule
/// 8, and the failure it prevents is a spinner that outlives the thing it was spinning for.</para>
///
/// <para><b>A run never throws.</b> It is called from a hosted service and from an endpoint that has
/// already answered, so an exception has nowhere to go but the process. Whatever went wrong becomes a
/// failed status with its message and an event row, and the next run tries again.</para>
///
/// <para><b>It refuses rather than improvising.</b> No KEK, no key, a key nobody has acknowledged, a
/// run already live — each is a sentence naming what to do about it, because an administrator who
/// presses a button and gets nothing has no way to tell "refused" from "broken".</para>
///
/// <para><b>The clock is injected.</b> The archive's name and the status stamps are persisted instants,
/// which is exactly what <c>utc-timestamps.md</c> is about.</para>
/// </remarks>
public sealed class BackupRunner(
    BackupStore backups,
    string dataDir,
    IConfiguration config,
    OrgEventLog? events,
    BackupTargets targets,
    TimeProvider clock,
    ILogger<BackupRunner> log)
{
    /// <summary>Some targets took it and some did not. The archive is here either way.</summary>
    public const string Partial = "partial";

    /// <summary>Take a backup now and wait for it. For the scheduler, and for tests.</summary>
    public async Task<RunRefusal> RunAsync(string actor, CancellationToken ct)
    {
        var start = await BeginAsync(actor, ct);
        if (start.Ticket is null)
        {
            return start.Refusal;
        }
        await ContinueAsync(start.Ticket, ct);
        return start.Refusal;
    }

    /// <summary>
    /// Claim the run and SAY SO, before anything long happens — or refuse, with the reason.
    /// </summary>
    /// <remarks>
    /// <para><b>Split from the work because of rule 8, and the .http suite is what proved it.</b> An
    /// earlier version detached the whole run: the endpoint answered 202 and the status still said
    /// "never run" for however long it took the background task to get going, so a page reloaded in
    /// that window showed nothing at all — exactly the "clicked, reloaded, state lost" the rule is
    /// about. The claim and the in-progress status are now written INSIDE the request, so by the time
    /// 202 reaches the browser the state it will reload into is already on disk.</para>
    /// <para>It also means the refusals reach the caller as an answer rather than only as a status a
    /// page has to go and read: "no key yet" is a 409 with a sentence, not silence after a 202.</para>
    /// </remarks>
    public async Task<RunStart> BeginAsync(string actor, CancellationToken ct)
    {
        var key = await backups.FindKeyAsync(ct);
        var refusal = Refusal(key);
        if (refusal is not null)
        {
            return new RunStart(refusal, null);
        }
        var claim = backups.TryClaim();
        if (!claim.Taken)
        {
            claim.Dispose();
            return new RunStart(
                RunRefusal.Because(
                    "a backup is already running. Wait for it to finish — two runs over one data "
                    + "directory would produce two archives of two different moments."),
                null);
        }
        var startedAt = clock.GetUtcNow();
        try
        {
            await backups.WriteStatusAsync(
                new BackupStatus(
                    startedAt.ToUnixTimeMilliseconds(),
                    BackupRunResults.InProgress,
                    // WHO is running it, so the sweep's message can name the process that stopped.
                    Owner(),
                    0,
                    []),
                ct);
        }
        catch (Exception e)
        {
            // The claim is only ever released by the ticket, and there is no ticket yet. A full disk
            // or a cancelled request here would otherwise leave run.lock held by a live process with
            // no run behind it, and every later attempt answering "already running" for ever.
            claim.Dispose();
            log.LogError(e, "a backup run could not record that it had started, so it did not start");
            return new RunStart(
                RunRefusal.Because(
                    "the run could not be recorded as started, so it was not started. This is a "
                    + "storage problem — check the data directory's permissions and free space."),
                null);
        }
        return new RunStart(RunRefusal.Started_, new RunTicket(claim, key.Key, startedAt, actor));
    }

    /// <summary>
    /// The process this run belongs to, recorded in the status while it is in progress.
    /// </summary>
    /// <remarks>
    /// The LIVENESS proof is the run claim — a handle a dead process cannot hold, which a recorded pid
    /// cannot match because pids are reused. This is for the human reading the sweep's message
    /// afterwards: "the server stopped" is more useful when it can say which one.
    /// </remarks>
    private static string Owner() => $"{Environment.MachineName}/{Environment.ProcessId}";

    /// <summary>
    /// Give a claimed run back: a terminal status, and the claim released.
    /// </summary>
    /// <remarks>
    /// <see cref="BeginAsync"/> announces the run before anything long happens, which is what makes a
    /// reloaded page tell the truth — and it means a caller that then cannot hand the run over has to
    /// UNsay it. Otherwise the page shows a spinner for a run nobody will carry out, until a restart
    /// sweeps it, which on a server that never restarts is for ever.
    /// </remarks>
    public async Task AbandonAsync(RunTicket ticket, string why, CancellationToken ct)
    {
        using (ticket)
        {
            await backups.WriteStatusAsync(
                new BackupStatus(
                    clock.GetUtcNow().ToUnixTimeMilliseconds(), BackupRunResults.Refused, why, 0, []),
                ct);
            log.LogWarning("a claimed backup run was given back before it started: {Why}", why);
        }
    }

    /// <summary>Carry out a claimed run. Never throws; releases the claim whatever happens.</summary>
    public async Task ContinueAsync(RunTicket ticket, CancellationToken ct)
    {
        using (ticket)
        {
            try
            {
                var summary = await BuildAsync(ticket.StartedAt, ticket.Key, ct);
                await FinishAsync(ticket.Actor, ticket.StartedAt, summary, ct);
            }
            // A CATCH-ALL, deliberately, and it is the difference between a spinner that ends and one
            // that does not. This runs detached, so anything not caught here is an exception with
            // nowhere to go: the status stays "in progress" until the next restart sweeps it, the page
            // shows a spinner all night, and no failure row is ever written. An earlier version caught
            // three exception types and would have let a CryptographicException do exactly that.
            catch (Exception e)
            {
                await FailAsync(ticket.Actor, ticket.StartedAt, e, ct);
            }
        }
    }

    /// <summary>What stops a run before it starts, or nothing.</summary>
    private RunRefusal? Refusal(BackupKeyState key) => key.Status switch
    {
        BackupKeyLookup.Ready => null,
        BackupKeyLookup.Absent => RunRefusal.Because(
            "this deployment has no backup key yet. Mint one first: the archive is sealed under it, and "
            + "the words it produces are shown once."),
        BackupKeyLookup.AwaitingAcknowledgement => RunRefusal.Because(
            "the backup key has been minted but nobody has confirmed writing it down. An archive sealed "
            + "under words that reached no person is an archive nobody can open — confirm the key first."),
        _ => RunRefusal.Because(
            backups.Configured
                ? "the backup key on disk cannot be opened by this server. Nothing has been minted in "
                  + "its place; restore the key file or the KEK it was sealed under."
                : "Vault:LoginKey:Kek is not configured, so this server cannot seal an archive. Set it "
                  + "to base64 of 32 random bytes — the same key seals developer login keys."),
    };

    /// <summary>
    /// Build into <c>archives/</c>, then keep only the newest and prune what aged out.
    /// </summary>
    /// <remarks>
    /// The configuration snapshot goes in first, as a file inside the tree being archived, because the
    /// archive format takes a directory and this is the cheapest way to make the snapshot travel
    /// exactly like everything else — one code path, one exclusion rule, one round trip. It is written
    /// into the data directory under the snapshot's own name and left there: it is not a secret the
    /// server did not already hold, and a restorer who finds one on the old disk loses nothing.
    /// </remarks>
    private async Task<ArchiveSummary> BuildAsync(DateTimeOffset startedAt, byte[] key, CancellationToken ct)
    {
        Directory.CreateDirectory(backups.ArchivesDir);
        var snapshot = Path.Combine(dataDir, BackupConfigSnapshot.EntryName);
        try
        {
            await File.WriteAllBytesAsync(snapshot, BackupConfigSnapshot.Build(config), ct);
            var path = Path.Combine(backups.ArchivesDir, ArchiveName.For(startedAt));
            var summary = BackupArchive.CreateFile(dataDir, path, key, startedAt);
            var settings = await backups.ReadSettingsAsync(ct);
            // The upload lives INSIDE this lifecycle rather than beside it: one claim, one status, one
            // place where a run is finished. A second orchestration path is how two paths come to
            // disagree about completion and retention.
            _uploads = await SendToTargetsAsync(path, settings, ct);
            // Retention governs this directory, and it is the ONLY thing that does. An earlier version
            // also kept just the newest archive, which quietly made the admin's retention setting mean
            // nothing locally — two policies over one directory, and the one nobody configured winning.
            backups.PruneArchivesOlderThan(clock.GetUtcNow(), settings.RetentionDays);
            return summary;
        }
        finally
        {
            // The snapshot is the deployment's secrets in PLAINTEXT — it exists so a restore onto a
            // fresh host can work, and it belongs inside the sealed archive and nowhere else. Leaving
            // it in the data directory would put the KEK on disk unencrypted for anybody who can read
            // the volume, which is precisely what the archive's encryption is for.
            Forget(snapshot);
        }
    }

    /// <summary>What each configured target did with this archive, in order.</summary>
    private IReadOnlyList<BackupTargetStatus> _uploads = [];

    /// <summary>
    /// The run's own verdict, which is not the same question as "was an archive made".
    /// </summary>
    /// <remarks>
    /// A backup that stayed on the machine it was taken from is not a backup, so a run whose every
    /// configured target refused must NOT read as ok — the review round was right that "the archive
    /// exists" is the wrong test. Some targets failing is <c>partial</c>: the copy that matters may
    /// still have left the building, and a page that cried failure would train an administrator to
    /// ignore it.
    /// </remarks>
    private string Verdict()
    {
        if (_uploads.Count == 0)
        {
            return BackupRunResults.Succeeded;
        }
        var ok = _uploads.Count(upload => upload.Result == BackupRunResults.Succeeded);
        return ok == _uploads.Count
            ? BackupRunResults.Succeeded
            : ok == 0 ? BackupRunResults.Failed : Partial;
    }

    private string Trouble() =>
        string.Join(
            " ",
            _uploads.Where(upload => upload.Result != BackupRunResults.Succeeded)
                .Select(upload => $"{upload.Where}: {upload.Error}"));

    /// <summary>
    /// Send the archive to every configured target, and never let one of them fail the run's archive.
    /// </summary>
    /// <remarks>
    /// The archive is written and local before any of this is attempted. A target that is unreachable
    /// is a target that is unreachable; throwing the local copy away over it would be the wrong trade,
    /// and it is why each target's outcome is a row in the status rather than an exception.
    /// </remarks>
    private async Task<IReadOnlyList<BackupTargetStatus>> SendToTargetsAsync(
        string path, BackupSettings settings, CancellationToken ct)
    {
        var outcomes = new List<BackupTargetStatus>();
        foreach (var configured in settings.Targets)
        {
            outcomes.Add(await SendOneAsync(path, configured, settings.RetentionDays, ct));
            // The status is rewritten after EACH target, not once at the end. A three-target run over a
            // multi-gigabyte archive is hours, and an administrator polling the page would otherwise see
            // "in progress" and nothing else the whole time — and if the server were restarted in the
            // middle, no record of which targets had already taken it.
            _uploads = [.. outcomes];
            await ProgressAsync(ct);
        }
        return outcomes;
    }

    private async Task<BackupTargetStatus> SendOneAsync(
        string path, SealedTarget configured, int retentionDays, CancellationToken ct)
    {
        var at = clock.GetUtcNow().ToUnixTimeMilliseconds();
        var client = targets.Build(configured);
        if (client is null)
        {
            return new BackupTargetStatus(
                configured.Kind,
                configured.Describe,
                BackupRunResults.Failed,
                "this server cannot open the credentials for this target. Re-enter them.",
                at);
        }
        var outcome = await UploadAsync(client, path, ct);
        var retention = outcome.Ok ? await PruneAsync(client, retentionDays, ct) : string.Empty;
        return new BackupTargetStatus(
            configured.Kind,
            client.Describe,
            outcome.Ok ? BackupRunResults.Succeeded : BackupRunResults.Failed,
            // A retention that could not run is not a failed upload — the archive IS there — but it is
            // not nothing either, and a log line is not somewhere an administrator looks.
            outcome.Ok ? retention : outcome.Why,
            at);
    }

    private static async Task<TargetOutcome> UploadAsync(IArchiveTarget client, string path, CancellationToken ct)
    {
        var length = new FileInfo(path).Length;
        if (length > client.MaxBytes)
        {
            // Refused BEFORE the request: a single upload is the phase-1 limit, and discovering it by
            // sending five gigabytes and being told no is an afternoon nobody gets back.
            return TargetOutcome.Failed(
                $"the archive is {length} bytes and a single upload to this target is at most "
                + $"{client.MaxBytes}. Multi-part upload is not built; keep less in the vaults, or use "
                + "a target whose single-upload limit is higher.");
        }
        await using var body = File.OpenRead(path);
        return await client.PutAsync(Path.GetFileName(path), body, length, ct);
    }

    /// <summary>
    /// Retention at the destination — the same floor as the local pass, and the same reason.
    /// </summary>
    /// <remarks>
    /// Only after a SUCCESSFUL upload: pruning a destination whose new archive did not arrive is how a
    /// retention window turns into deletion of the only copies left.
    /// </remarks>
    private async Task<string> PruneAsync(IArchiveTarget client, int retentionDays, CancellationToken ct)
    {
        var listing = await client.ListAsync(ct);
        if (!listing.Ok)
        {
            // A listing that FAILED is not an empty one. Pruning nothing and calling the run a success
            // would let a target whose list permission was revoked accumulate archives for ever with
            // nothing anywhere saying so — which is why this reaches the status rather than only a log.
            return $"the upload succeeded and retention could not run: {listing.Why}";
        }
        var refused = new List<string>();
        foreach (var archive in ArchiveTargets.Expired(listing.Archives, clock.GetUtcNow(), retentionDays))
        {
            var gone = await client.DeleteAsync(archive.Name, ct);
            if (!gone.Ok)
            {
                refused.Add(archive.Name);
                log.LogWarning(
                    "{Where} would not delete {Name}: {Why}. The next run will try again.",
                    client.Describe,
                    archive.Name,
                    gone.Why);
            }
        }
        return refused.Count == 0
            ? string.Empty
            : $"the upload succeeded and retention could not remove {refused.Count} old archive(s).";
    }

    /// <summary>Rewrite the in-progress status so the page can see the uploads landing.</summary>
    private async Task ProgressAsync(CancellationToken ct)
    {
        var status = await backups.ReadStatusAsync(ct);
        if (BackupRunResults.IsRunning(status.LastResult))
        {
            await backups.WriteStatusAsync(status with { Targets = _uploads }, ct);
        }
    }

    private void Forget(string path)
    {
        try
        {
            File.Delete(path);
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            log.LogError(
                e,
                "the configuration snapshot at {Path} could not be removed after the archive was "
                + "sealed. It holds this deployment's secrets in plaintext — delete it by hand.",
                path);
        }
    }

    private async Task FinishAsync(
        string actor, DateTimeOffset startedAt, ArchiveSummary summary, CancellationToken ct)
    {
        var archive = backups.NewestArchive();
        await backups.WriteStatusAsync(
            new BackupStatus(
                clock.GetUtcNow().ToUnixTimeMilliseconds(),
                Verdict(),
                Trouble(),
                archive.Bytes,
                _uploads),
            ct);
        log.LogInformation(
            "backup taken: {Files} file(s), {Bytes} bytes sealed into {Name} in {Seconds}s",
            summary.Files,
            archive.Bytes,
            archive.Name,
            (int)(clock.GetUtcNow() - startedAt).TotalSeconds);
        await RowAsync(OrgEventKinds.BackupTaken, actor, archive.Name, ct);
    }

    private async Task FailAsync(string actor, DateTimeOffset startedAt, Exception failure, CancellationToken ct)
    {
        await backups.WriteStatusAsync(
            new BackupStatus(
                clock.GetUtcNow().ToUnixTimeMilliseconds(),
                BackupRunResults.Failed,
                failure.Message,
                0,
                _uploads),
            ct);
        log.LogError(
            failure,
            "the backup run started at {At} failed. The next scheduled run will try again.",
            startedAt);
        await RowAsync(OrgEventKinds.BackupFailed, actor, failure.Message, ct);
    }

    /// <summary>
    /// One row per run, on the log a corporate deployment has.
    /// </summary>
    /// <remarks>
    /// <c>CancellationToken.None</c>, deliberately: by the time this runs the archive is written and the
    /// status is on disk, and a shutdown that cancelled the row would leave a backup nothing in the
    /// history mentions. The same reading the share-expiry rows make.
    /// </remarks>
    private async Task RowAsync(string kind, string actor, string detail, CancellationToken ct)
    {
        try
        {
            await AppendRowAsync(kind, actor, detail);
        }
        // BEST EFFORT, and only after the terminal status is on disk. Without this, an event log that
        // could not be appended to would turn a run that SUCCEEDED — archive written, status already
        // recorded as ok — into a failed one, because the catch-all in ContinueAsync would route the
        // append's exception through FailAsync. A reader would then have a good archive, a success and
        // a failure about the same run, and no way to tell which to believe.
        catch (Exception e)
        {
            log.LogError(
                e,
                "the {Kind} row could not be written to the event log. The run itself is unaffected and "
                + "its status stands; what is missing is the line in the history.",
                kind);
        }
    }

    private async Task AppendRowAsync(string kind, string actor, string detail)
    {
        if (events is null)
        {
            return;
        }
        // Through the same factory every other row on this server uses, which is also what stamps it.
        // Building the record here by hand is how three rows reached the log with At = 0 and broke the
        // event reader's newest-first ordering — the .http contract suite caught it, and it is exactly
        // the kind of thing only a live request can catch.
        //
        // The detail carries the archive's NAME, because that is what a reader of the history wants to
        // match against a file they are holding — or, for a failure, the reason there is no file.
        await events.AppendAsync(
            OrgEndpoints.Row(kind, actor, subject: null, detail: detail), CancellationToken.None);
    }
}
