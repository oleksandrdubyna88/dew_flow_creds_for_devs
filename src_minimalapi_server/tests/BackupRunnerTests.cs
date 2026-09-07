using System.Net;
using System.Security.Cryptography;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Primitives;

namespace CredVaultServer.Tests;

/// <summary>
/// One run: the claim, the refusals, the durable status, and the sweep after a crash.
/// </summary>
/// <remarks>
/// The properties here are the ones an administrator finds out about at the worst moment: a run that
/// never happened and said nothing, a page stuck on a spinner for a run that died, two runs over one
/// data directory, and a retention pass that deleted everything.
/// </remarks>
public class BackupRunnerTests
{
    private static readonly CancellationToken Ct = CancellationToken.None;

    private static readonly DateTimeOffset Noon = DateTimeOffset.Parse("2026-09-07T12:00:00Z").ToUniversalTime();

    [Fact]
    public async Task ARunTakesAnArchiveAndSaysItSucceeded()
    {
        var world = await Ready();

        var outcome = await world.Runner.RunAsync("admin@corp.com", Ct);

        outcome.Started.Should().BeTrue(outcome.Why);
        var status = await world.Backups.ReadStatusAsync(Ct);
        status.LastResult.Should().Be(BackupRunResults.Succeeded);
        status.Bytes.Should().BeGreaterThan(0);
        world.Backups.NewestArchive().Name.Should().Be(ArchiveName.For(Noon));
    }

    [Fact]
    public async Task AnUploadThatLANDEDWhereRetentionCannotRunIsNotACleanRun()
    {
        // The second review round's finding, and it is the failure that hides: the archive DID reach
        // the destination, so every existing assertion is satisfied — while the pass that keeps that
        // destination bounded could not list it, so its archives now accumulate for ever and the only
        // place saying so is a sentence on a row the page draws green. The run is `partial`: calling it
        // failed would be the other lie, because the copy that matters left the building.
        var stub = new StubTransport()
            .Answer(HttpStatusCode.OK)   // the upload is accepted
            .AnswerStored()              // and the HEAD agrees it is all there
            .Answer(HttpStatusCode.Forbidden, "<Error><Code>AccessDenied</Code></Error>"); // the listing is not
        var world = await Ready(transport: stub);
        await Configured(world);

        await world.Runner.RunAsync("admin@corp.com", Ct);

        var status = await world.Backups.ReadStatusAsync(Ct);
        status.LastResult.Should().Be(
            BackupRunner.Partial, "the archive arrived and the destination is now unbounded");
        var target = status.Targets.Should().ContainSingle().Subject;
        target.Result.Should().Be(BackupRunResults.Succeeded, "the upload itself was fine");
        target.Error.Should().BeEmpty("and nothing about the upload went wrong");
        target.Retention.Should().Contain("retention could not run").And.Contain("403");
        status.LastError.Should().Contain("retention could not run", "the page's summary says it too");
    }

    [Fact]
    public async Task ARunNEVERInheritsTheTargetRowsOfTheRunBeforeIt()
    {
        // BackupRunner is registered as a SINGLETON, so anything it keeps in a field outlives the run
        // that put it there. The failure CodeRabbit found: a first run whose destination refused
        // leaves two failed rows behind; an administrator then removes the destination; the next run
        // takes a perfectly good archive, inherits the old rows, and reports itself FAILED with a
        // destination list from an hour ago that no longer exists in the settings.
        var stub = new StubTransport().Answer(HttpStatusCode.Forbidden, "denied");
        var world = await Ready(transport: stub);
        await Configured(world);

        await world.Runner.RunAsync("admin@corp.com", Ct);
        var first = await world.Backups.ReadStatusAsync(Ct);
        first.LastResult.Should().Be(BackupRunResults.Failed, "the destination refused");
        first.Targets.Should().ContainSingle();

        // The administrator removes the destination and runs again on the SAME runner instance.
        await world.Backups.WriteSettingsAsync(BackupSettings.Default, Ct);
        await world.Runner.RunAsync("admin@corp.com", Ct);

        var second = await world.Backups.ReadStatusAsync(Ct);
        second.Targets.Should().BeEmpty("this run had no destination, so it has no destination rows");
        second.LastResult.Should().Be(
            BackupRunResults.Succeeded, "and an archive that was taken is not a failure");
        second.LastError.Should().BeEmpty();
    }

    [Fact]
    public async Task AnUploadThatLANDEDAndWasPRUNEDIsAPlainSuccess()
    {
        // The other half, so the test above cannot pass by calling every run partial.
        var stub = new StubTransport()
            .Answer(HttpStatusCode.OK)
            .AnswerStored()
            .Answer(HttpStatusCode.OK, EmptyListing);
        var world = await Ready(transport: stub);
        await Configured(world);

        await world.Runner.RunAsync("admin@corp.com", Ct);

        var status = await world.Backups.ReadStatusAsync(Ct);
        status.LastResult.Should().Be(BackupRunResults.Succeeded);
        status.Targets.Should().ContainSingle().Which.Retention.Should().BeEmpty();
        status.LastError.Should().BeEmpty();
    }

    [Fact]
    public async Task TheArchiveOpensWithTheKeyTheAdministratorWroteDown()
    {
        // The property the whole epic exists for, asserted end to end: what a person holds opens what
        // the scheduled run produced.
        var world = await Ready();
        await world.Runner.RunAsync("admin@corp.com", Ct);

        var restored = Path.Combine(TempDir(), "restored");
        BackupArchive.Extract(
            world.Backups.NewestArchive().Path, restored, BackupKey.KeyFrom(BackupKey.Parse(world.Words).Core));

        File.ReadAllText(Path.Combine(restored, "vaults", "alice.json")).Should().Be("alice");
    }

    [Fact]
    public async Task TheArchiveCarriesTheConfigurationSnapshotAndNotTheBackupKey()
    {
        // Both halves of one decision: the snapshot travels so a restore onto a fresh host can work,
        // and org/backup stays out so the archive never carries the key that opens it.
        var world = await Ready();
        await world.Runner.RunAsync("admin@corp.com", Ct);
        var restored = Path.Combine(TempDir(), "restored");
        BackupArchive.Extract(
            world.Backups.NewestArchive().Path, restored, BackupKey.KeyFrom(BackupKey.Parse(world.Words).Core));

        var listing = Directory.EnumerateFiles(restored, "*", SearchOption.AllDirectories)
            .Select(path => Path.GetRelativePath(restored, path).Replace('\\', '/'))
            .ToArray();

        listing.Should().Contain(BackupConfigSnapshot.EntryName);
        listing.Should().NotContain(name => name.StartsWith("org/backup/", StringComparison.Ordinal));
        File.ReadAllText(Path.Combine(restored, BackupConfigSnapshot.EntryName))
            .Should().Contain("Vault__LoginKey__Kek=", "a restore onto a fresh host needs it");
    }

    [Fact]
    public async Task ASecondRunWhileOneHoldsTheClaimIsRefused()
    {
        var world = await Ready();
        using var held = world.Backups.TryClaim();
        held.Taken.Should().BeTrue();

        var outcome = await world.Runner.RunAsync("admin@corp.com", Ct);

        outcome.Started.Should().BeFalse();
        outcome.Why.Should().Contain("already running");
    }

    [Fact]
    public void TheClaimIsHeldByTheOperatingSystemAndReleasedByDisposal()
    {
        // Not a boolean field: a field dies with the process while the half-built archive and the
        // in-progress status outlive it, and a lock file's TIMESTAMP cannot tell a live run from a dead
        // one. A handle can.
        var world = World();
        using (var first = world.Backups.TryClaim())
        {
            first.Taken.Should().BeTrue();
            using var second = world.Backups.TryClaim();
            second.Taken.Should().BeFalse("two processes cannot hold one handle");
            world.Backups.RunIsLive().Should().BeTrue();
        }

        world.Backups.RunIsLive().Should().BeFalse("disposal releases it, and so does dying");
    }

    [Fact]
    public async Task ARunWithNoKeyRefusesAndSaysToMintOne()
    {
        var world = World();

        var outcome = await world.Runner.RunAsync("admin@corp.com", Ct);

        outcome.Started.Should().BeFalse();
        outcome.Why.Should().Contain("no backup key yet");
    }

    [Fact]
    public async Task ARunWithAKeyNobodyHasAcknowledgedRefusesAndSaysWhy()
    {
        // Story 2's whole point, enforced here: an archive sealed under words that reached no person is
        // an archive nobody can open.
        var world = World();
        await world.Backups.MintKeyAsync(Ct);

        var outcome = await world.Runner.RunAsync("admin@corp.com", Ct);

        outcome.Started.Should().BeFalse();
        outcome.Why.Should().Contain("nobody has confirmed writing it down");
        world.Backups.Archives().Should().BeEmpty("and nothing was written");
    }

    [Fact]
    public async Task ARunOnADeploymentWithNoKekRefusesAndNamesTheSetting()
    {
        var dir = TempDir();
        var backups = new BackupStore(dir, [], NullLogger<BackupStore>.Instance);
        var runner = new BackupRunner(
            backups, dir, Config(), null, Targets(RandomNumberGenerator.GetBytes(Key32.Bytes)), Clock(), NullLogger<BackupRunner>.Instance);

        var outcome = await runner.RunAsync("admin@corp.com", Ct);

        outcome.Started.Should().BeFalse();
        outcome.Why.Should().Contain("Vault:LoginKey:Kek");
    }

    [Fact]
    public async Task AStatusLeftInProgressByACrashBecomesAFailureAtStartup()
    {
        // Rule 8's startup sweep. Without it the page shows a spinner for ever and nobody can tell a
        // running backup from a dead one.
        var world = await Ready();
        await world.Backups.WriteStatusAsync(
            new BackupStatus(Noon.ToUnixTimeMilliseconds(), BackupRunResults.InProgress, string.Empty, 0, []), Ct);

        (await world.Backups.SweepOrphanedRunAsync(Ct)).Should().BeTrue();

        var status = await world.Backups.ReadStatusAsync(Ct);
        status.LastResult.Should().Be(BackupRunResults.Failed);
        status.LastError.Should().Contain("the server stopped");
    }

    [Fact]
    public async Task TheSweepLeavesALiveRunAloneEvenWhenItSaysInProgress()
    {
        // A second container starting while the first is minutes into a large archive. An earlier
        // design rewrote the status whenever a server started, which would have declared that run dead.
        var world = await Ready();
        await world.Backups.WriteStatusAsync(
            new BackupStatus(Noon.ToUnixTimeMilliseconds(), BackupRunResults.InProgress, string.Empty, 0, []), Ct);
        using var held = world.Backups.TryClaim();

        (await world.Backups.SweepOrphanedRunAsync(Ct)).Should().BeFalse("something holds the claim");

        (await world.Backups.ReadStatusAsync(Ct)).LastResult.Should().Be(BackupRunResults.InProgress);
    }

    [Fact]
    public async Task ASweepOnAFinishedRunChangesNothing()
    {
        var world = await Ready();
        await world.Runner.RunAsync("admin@corp.com", Ct);

        (await world.Backups.SweepOrphanedRunAsync(Ct)).Should().BeFalse();

        (await world.Backups.ReadStatusAsync(Ct)).LastResult.Should().Be(BackupRunResults.Succeeded);
    }

    [Fact]
    public async Task TheSweepREMOVESAConfigurationSnapshotAKilledRunLeftInPlaintext()
    {
        // The run deletes it in a `finally`, and a `finally` does not run when a container is killed —
        // so a `docker kill` mid-build leaves this deployment's KEK and its local signing key sitting
        // in clear on the volume that the archive's encryption exists to protect. Nothing else on this
        // server would ever look at that file again.
        var world = await Ready();
        var snapshot = Path.Combine(world.Dir, BackupConfigSnapshot.EntryName);
        Directory.CreateDirectory(Path.Combine(world.Dir, "org", "backup"));
        File.WriteAllText(snapshot, "Vault__LoginKey__Kek=the-whole-deployment");

        await world.Backups.SweepOrphanedRunAsync(Ct);

        File.Exists(snapshot).Should().BeFalse("nothing is running, so no snapshot may exist");
    }

    [Fact]
    public async Task TheSweepLeavesTheSnapshotOfARunThatIsSTILLBuilding()
    {
        // The other side of it, and the one that would corrupt a live backup: while a run holds the
        // claim, the snapshot belongs to it and is about to travel inside the archive.
        var world = await Ready();
        var snapshot = Path.Combine(world.Dir, BackupConfigSnapshot.EntryName);
        Directory.CreateDirectory(Path.Combine(world.Dir, "org", "backup"));
        File.WriteAllText(snapshot, "Vault__LoginKey__Kek=the-whole-deployment");
        using var held = world.Backups.TryClaim();
        held.Taken.Should().BeTrue();

        await world.Backups.SweepOrphanedRunAsync(Ct);

        File.Exists(snapshot).Should().BeTrue("a live run is still going to seal it into the archive");
    }

    [Fact]
    public async Task ARunKeepsWhateverRetentionSaysToKeepAndNothingElseDecides()
    {
        // Retention is the ONLY policy over this directory. An earlier version also kept just the
        // newest archive on every run, which quietly made the admin's retention setting mean nothing
        // locally — two policies over one directory, and the one nobody configured winning.
        var world = await Ready();
        Directory.CreateDirectory(world.Backups.ArchivesDir);
        await world.Backups.WriteSettingsAsync(new BackupSettings(3, 30, []), Ct);
        var recent = ArchiveName.For(DateTimeOffset.Parse("2026-09-05T03:00:00Z"));
        var ancient = ArchiveName.For(DateTimeOffset.Parse("2026-01-01T03:00:00Z"));
        File.WriteAllText(Path.Combine(world.Backups.ArchivesDir, recent), "inside the window");
        File.WriteAllText(Path.Combine(world.Backups.ArchivesDir, ancient), "long past it");

        await world.Runner.RunAsync("admin@corp.com", Ct);

        var kept = world.Backups.Archives().Select(archive => archive.Name).ToArray();
        kept.Should().Contain(ArchiveName.For(Noon)).And.Contain(recent, "30 days keeps it");
        kept.Should().NotContain(ancient, "and the window is what removed the other one");
    }

    [Fact]
    public async Task TheConfigurationSnapshotDoesNotStayOnDiskAfterTheRun()
    {
        // It holds the deployment's secrets in PLAINTEXT — that is the point of it, and it is why it
        // belongs inside the sealed archive and nowhere else. Leaving it in the data directory would
        // put the KEK unencrypted on the volume the archive's encryption exists to protect.
        var world = await Ready();

        await world.Runner.RunAsync("admin@corp.com", Ct);

        File.Exists(Path.Combine(world.Dir, BackupConfigSnapshot.EntryName)).Should().BeFalse();
    }

    [Fact]
    public async Task AFailureThatIsNotAFileProblemStillEndsTheRunRatherThanLeavingASpinner()
    {
        // The catch-all. This runs detached, so anything not caught leaves the status saying "in
        // progress" until the next restart sweeps it — a spinner all night and no failure row.
        //
        // The provocation has to be an exception the narrow catch would NOT have caught, which is the
        // whole point: a first attempt used a key of the wrong length and proved nothing, because the
        // archive format refuses that with a BackupArchiveException. A configuration whose read throws
        // is a real shape — a provider backed by something that has gone away — and it is none of the
        // three types the old catch listed.
        var dir = TempDir();
        var kek = RandomNumberGenerator.GetBytes(Key32.Bytes);
        var backups = new BackupStore(dir, kek, NullLogger<BackupStore>.Instance);
        var runner = new BackupRunner(
            backups, dir, new ThrowingConfig(), null, Targets(kek), Clock(), NullLogger<BackupRunner>.Instance);
        await backups.MintKeyAsync(Ct);
        (await backups.AcknowledgeKeyShownAsync(Ct)).Should().BeTrue();

        var outcome = await runner.RunAsync("admin@corp.com", Ct);

        outcome.Started.Should().BeTrue("it started; it is the finishing that went wrong");
        var status = await backups.ReadStatusAsync(Ct);
        status.LastResult.Should().Be(BackupRunResults.Failed);
        status.LastError.Should().Contain("the configuration provider is gone", "the reason reaches the page");
        backups.RunIsLive().Should().BeFalse("and the claim went with it");
    }

    [Fact]
    public async Task ARunThatCannotRecordItsStartReleasesTheClaimRatherThanHoldingItForEver()
    {
        // The claim is released by the ticket, and a failed status write happens before there is one.
        // Without this, a full disk would leave run.lock held by a live process with no run behind it
        // and every later attempt answering "already running" for the life of the server.
        var world = await Ready();
        var statusPath = Path.Combine(world.Dir, "org", "backup", "status.json");
        File.Delete(statusPath);
        Directory.CreateDirectory(statusPath);

        var start = await world.Runner.BeginAsync("admin@corp.com", Ct);

        start.Ticket.Should().BeNull();
        start.Refusal.Why.Should().Contain("could not be recorded as started");
        world.Backups.RunIsLive().Should().BeFalse("the claim went with the failure");
    }

    [Fact]
    public void RetentionNeverEmptiesTheDirectory()
    {
        // The shell backup's own floor (deploy/backup/backup-once.sh:129), reproduced rather than
        // reinvented: a clock that jumped, a server that was down for a month, or an upload that has
        // not worked must not turn "prune old backups" into "delete every backup".
        var world = World();
        Directory.CreateDirectory(world.Backups.ArchivesDir);
        foreach (var at in new[] { "2026-01-01T03:00:00Z", "2026-01-02T03:00:00Z" })
        {
            File.WriteAllText(
                Path.Combine(world.Backups.ArchivesDir, ArchiveName.For(DateTimeOffset.Parse(at))), "ancient");
        }

        world.Backups.PruneArchivesOlderThan(Noon, 30).Should().Be(0, "every one of them is old");

        world.Backups.Archives().Should().HaveCount(2);
    }

    [Fact]
    public void RetentionDeletesWhatAgedOutAndKeepsTheRest()
    {
        var world = World();
        Directory.CreateDirectory(world.Backups.ArchivesDir);
        foreach (var at in new[] { "2026-01-01T03:00:00Z", "2026-09-06T03:00:00Z" })
        {
            File.WriteAllText(
                Path.Combine(world.Backups.ArchivesDir, ArchiveName.For(DateTimeOffset.Parse(at))), "one of two");
        }

        world.Backups.PruneArchivesOlderThan(Noon, 30).Should().Be(1);

        world.Backups.Archives().Should().ContainSingle()
            .Which.TakenAt.Should().Be(DateTimeOffset.Parse("2026-09-06T03:00:00Z").ToUniversalTime());
    }

    [Fact]
    public void AFileTheSweepCannotAccountForIsNotDeleted()
    {
        // Somebody's own copy of something, sitting where they put it, is not this pass's to remove.
        var world = World();
        Directory.CreateDirectory(world.Backups.ArchivesDir);
        var theirs = Path.Combine(world.Backups.ArchivesDir, "somebody-elses.cvbk");
        File.WriteAllText(theirs, "not ours");
        File.WriteAllText(
            Path.Combine(world.Backups.ArchivesDir, ArchiveName.For(DateTimeOffset.Parse("2026-01-01T03:00:00Z"))),
            "ours, and ancient");
        File.WriteAllText(
            Path.Combine(world.Backups.ArchivesDir, ArchiveName.For(DateTimeOffset.Parse("2026-09-06T03:00:00Z"))),
            "ours, and recent");

        world.Backups.PruneArchivesOlderThan(Noon, 30).Should().Be(1);

        File.Exists(theirs).Should().BeTrue();
    }

    [Fact]
    public async Task ARunLeavesARowNamingTheArchive()
    {
        var world = await Ready(withLog: true);

        await world.Runner.RunAsync("admin@corp.com", Ct);

        var rows = Rows(world.Dir, OrgEventKinds.BackupTaken);
        rows.Should().ContainSingle();
        rows[0].Should().Contain(ArchiveName.For(Noon)).And.Contain("admin@corp.com");
    }

    [Fact]
    public async Task AClaimedRunThatCannotBeHandedOverIsGivenBackRatherThanLeftSpinning()
    {
        // Begin ANNOUNCES the run before anything long happens, which is what makes a reloaded page
        // tell the truth. A caller that then cannot hand it over has to unsay it — otherwise the page
        // shows a spinner for a run nobody will carry out, until a restart sweeps it.
        var world = await Ready();
        var start = await world.Runner.BeginAsync("admin@corp.com", Ct);
        start.Ticket.Should().NotBeNull();
        (await world.Backups.ReadStatusAsync(Ct)).LastResult.Should().Be(BackupRunResults.InProgress);

        await world.Runner.AbandonAsync(start.Ticket!, "nothing was there to carry the run out", Ct);

        var status = await world.Backups.ReadStatusAsync(Ct);
        status.LastResult.Should().Be(BackupRunResults.Refused);
        status.LastError.Should().Contain("nothing was there");
        world.Backups.RunIsLive().Should().BeFalse("and the claim went with it");
    }

    [Fact]
    public async Task AnEventLogThatCannotBeWrittenToDoesNotTurnAGoodRunIntoAFailedOne()
    {
        // The archive is written and the status already says ok by the time the row is appended. An
        // append that threw would otherwise be routed through the failure path, leaving a reader with a
        // good archive, a success and a failure about the same run, and no way to tell which is true.
        var world = await Ready(withLog: true);
        var events = Path.Combine(world.Dir, "org", "events");
        Directory.CreateDirectory(events);
        using var blocked = Unwritable(events);

        var outcome = await world.Runner.RunAsync("admin@corp.com", Ct);

        outcome.Started.Should().BeTrue();
        (await world.Backups.ReadStatusAsync(Ct)).LastResult.Should().Be(
            BackupRunResults.Succeeded, "the archive is there, whatever the history says");
        world.Backups.NewestArchive().Exists.Should().BeTrue();
    }

    /// <summary>
    /// A directory nothing can be written into, on both platforms.
    /// </summary>
    /// <remarks>
    /// The Windows branch holds an exclusive handle on the file the log appends through; the Unix one
    /// takes the write bit off the directory. Two branches because epic 4 already learned that
    /// Corp's own helper is a no-op on Windows, and a test that silently does nothing on the platform
    /// it runs on is a test that proves nothing.
    /// </remarks>
    private static IDisposable Unwritable(string dir) =>
        OperatingSystem.IsWindows()
            // The exclusive handle is on the very file the log appends through, so the append fails
            // rather than the directory being unusable — the shape a locked file actually takes here.
            ? new FileStream(
                Path.Combine(dir, ".append.lock"), FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None)
            : new WritableAgain(dir);

    /// <summary>Takes the write bit off a directory and puts it back.</summary>
    private sealed class WritableAgain : IDisposable
    {
        private readonly string _dir;

        public WritableAgain(string dir)
        {
            _dir = dir;
            Chmod(dir, UnixFileMode.UserRead | UnixFileMode.UserExecute);
        }

        public void Dispose() =>
            Chmod(_dir, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);

        /// <summary>Guarded rather than suppressed: the analyser is right that this is Unix-only.</summary>
        private static void Chmod(string dir, UnixFileMode mode)
        {
            if (!OperatingSystem.IsWindows())
            {
                File.SetUnixFileMode(dir, mode);
            }
        }
    }

    private sealed record Deployment(
        string Dir, BackupStore Backups, BackupRunner Runner, string Words, BackupTargets Targets);

    private static Deployment World(bool withLog = false, StubTransport? transport = null)
    {
        var dir = TempDir();
        var kek = RandomNumberGenerator.GetBytes(Key32.Bytes);
        var backups = new BackupStore(dir, kek, NullLogger<BackupStore>.Instance);
        var events = withLog
            ? new OrgEventLog(dir, NullLogger<OrgEventLog>.Instance, () => Noon)
            : null;
        // The same instance seals the target and builds its client, because a target sealed under one
        // KEK and opened under another is a different test — the one BackupStoreTests already runs.
        var targets = Targets(kek, transport);
        return new Deployment(
            dir,
            backups,
            new BackupRunner(backups, dir, Config(), events, targets, Clock(), NullLogger<BackupRunner>.Instance),
            string.Empty,
            targets);
    }

    /// <summary>A deployment with a key somebody has written down, and one vault to archive.</summary>
    private static async Task<Deployment> Ready(bool withLog = false, StubTransport? transport = null)
    {
        var world = World(withLog, transport);
        var minted = await world.Backups.MintKeyAsync(Ct);
        (await world.Backups.AcknowledgeKeyShownAsync(Ct)).Should().BeTrue();
        Directory.CreateDirectory(Path.Combine(world.Dir, "vaults"));
        File.WriteAllText(Path.Combine(world.Dir, "vaults", "alice.json"), "alice");
        return world with { Words = minted.Formatted };
    }

    private static IConfiguration Config() =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Vault:DataDir"] = "/data",
                ["Vault:LoginKey:Kek"] = "a-secret",
                ["Auth:Local:SigningKey"] = "another",
            })
            .Build();

    private static TimeProvider Clock() => new FrozenClock(Noon);

    /// <summary>
    /// The target factory. Most tests here configure NO target and never ask it to build one; the ones
    /// that do hand in a stubbed transport, so a whole run can be driven without a network.
    /// </summary>
    private static BackupTargets Targets(byte[] kek, StubTransport? transport = null) =>
        new(kek, new Clients(transport), Clock(), NullLogger<BackupTargets>.Instance);

    private sealed class Clients(StubTransport? transport) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) =>
            transport is null ? new HttpClient() : new HttpClient(transport, disposeHandler: false);
    }

    private const string EmptyListing =
        """
        <?xml version="1.0" encoding="UTF-8"?>
        <ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
          <IsTruncated>false</IsTruncated>
        </ListBucketResult>
        """;

    /// <summary>One S3 destination, sealed by the same factory the run will open it with.</summary>
    private static async Task Configured(Deployment world)
    {
        await world.Backups.WriteSettingsAsync(
            BackupSettings.Default with
            {
                Targets =
                [
                    world.Targets.Seal(
                        TargetKinds.S3,
                        "https://s3.example.com",
                        "eu-central-1",
                        "vaults",
                        "backups",
                        new TargetSecrets("AKIDEXAMPLE", "secret", string.Empty, string.Empty)),
                ],
            },
            Ct);
    }

    private static IReadOnlyList<string> Rows(string dir, string kind) =>
    [
        .. Directory.EnumerateFiles(Path.Combine(dir, "org", "events"), "*.ndjson")
            .SelectMany(File.ReadAllLines)
            .Where(line => line.Contains($"\"kind\":\"{kind}\"", StringComparison.Ordinal)),
    ];

    private static string TempDir()
    {
        var dir = Path.Combine(Path.GetTempPath(), "cred-vault-backup-run", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        return dir;
    }

    /// <summary>
    /// A configuration whose reads throw — a provider backed by something that has gone away.
    /// </summary>
    /// <remarks>
    /// It exists to raise an exception that is NOT one of the file exceptions, which is the only way to
    /// tell a catch-all from a catch-three.
    /// </remarks>
    private sealed class ThrowingConfig : IConfiguration
    {
        public string? this[string key]
        {
            get => throw new InvalidOperationException("the configuration provider is gone");
            set => throw new InvalidOperationException("the configuration provider is gone");
        }

        public IEnumerable<IConfigurationSection> GetChildren() => [];

        public IChangeToken GetReloadToken() => throw new InvalidOperationException("the configuration provider is gone");

        public IConfigurationSection GetSection(string key) =>
            throw new InvalidOperationException("the configuration provider is gone");
    }

    private sealed class FrozenClock(DateTimeOffset at) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => at;
    }
}
