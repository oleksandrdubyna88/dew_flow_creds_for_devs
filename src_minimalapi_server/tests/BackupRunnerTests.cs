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
            backups, dir, Config(), null, Clock(), NullLogger<BackupRunner>.Instance);

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
            new BackupStatus(Noon.ToUnixTimeMilliseconds(), BackupRunResults.InProgress, string.Empty, 0), Ct);

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
            new BackupStatus(Noon.ToUnixTimeMilliseconds(), BackupRunResults.InProgress, string.Empty, 0), Ct);
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
    public async Task ARunKeepsWhateverRetentionSaysToKeepAndNothingElseDecides()
    {
        // Retention is the ONLY policy over this directory. An earlier version also kept just the
        // newest archive on every run, which quietly made the admin's retention setting mean nothing
        // locally — two policies over one directory, and the one nobody configured winning.
        var world = await Ready();
        Directory.CreateDirectory(world.Backups.ArchivesDir);
        await world.Backups.WriteSettingsAsync(new BackupSettings(3, 30), Ct);
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
            backups, dir, new ThrowingConfig(), null, Clock(), NullLogger<BackupRunner>.Instance);
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

    private sealed record Deployment(string Dir, BackupStore Backups, BackupRunner Runner, string Words);

    private static Deployment World(bool withLog = false)
    {
        var dir = TempDir();
        var kek = RandomNumberGenerator.GetBytes(Key32.Bytes);
        var backups = new BackupStore(dir, kek, NullLogger<BackupStore>.Instance);
        var events = withLog
            ? new OrgEventLog(dir, NullLogger<OrgEventLog>.Instance, () => Noon)
            : null;
        return new Deployment(
            dir,
            backups,
            new BackupRunner(backups, dir, Config(), events, Clock(), NullLogger<BackupRunner>.Instance),
            string.Empty);
    }

    /// <summary>A deployment with a key somebody has written down, and one vault to archive.</summary>
    private static async Task<Deployment> Ready(bool withLog = false)
    {
        var world = World(withLog);
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
