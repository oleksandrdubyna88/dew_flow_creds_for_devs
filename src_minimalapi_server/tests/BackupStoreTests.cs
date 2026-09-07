using System.Security.Cryptography;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;

namespace CredVaultServer.Tests;

/// <summary>
/// The four files a backup deployment keeps, and the one thing it deliberately cannot do.
/// </summary>
/// <remarks>
/// The properties worth a test here are all about the failures that are silent: a second key minted
/// over a first, a key sealed to words nobody saw, a KEK that changed under an existing key, and the
/// key travelling inside the archive it opens.
/// </remarks>
public class BackupStoreTests
{
    private static readonly CancellationToken Ct = CancellationToken.None;

    [Fact]
    public async Task AFreshDeploymentHasNoKeyAndMintingGivesOneSetOfWords()
    {
        var dir = TempDir();
        var store = Store(dir, out _);

        (await store.FindKeyAsync(Ct)).Status.Should().Be(BackupKeyLookup.Absent);
        var minted = await store.MintKeyAsync(Ct);

        minted.Formatted.Should().StartWith("BK1-");
        minted.EntropyBits.Should().Be(150);
        BackupKey.Parse(minted.Formatted).Ok.Should().BeTrue("the words it hands over are a valid key");
    }

    [Fact]
    public async Task AKeyIsNotUsableForARunUntilSomebodyHasSeenItsWords()
    {
        // The failure this exists for: seal the key, crash before showing it, and the deployment now
        // takes archives sealed to words nobody has. So a minted key is AWAITING until something says
        // it reached a person, and no run may use it in the meantime.
        var dir = TempDir();
        var store = Store(dir, out _);
        await store.MintKeyAsync(Ct);

        var awaiting = await store.FindKeyAsync(Ct);
        awaiting.Status.Should().Be(BackupKeyLookup.AwaitingAcknowledgement);
        awaiting.UsableForARun.Should().BeFalse();

        await store.AcknowledgeKeyShownAsync(Ct);

        var ready = await store.FindKeyAsync(Ct);
        ready.Status.Should().Be(BackupKeyLookup.Ready);
        ready.UsableForARun.Should().BeTrue();
        ready.Key.Should().Equal(awaiting.Key, "acknowledging changes the standing, not the key");
    }

    [Fact]
    public async Task MintingAgainBeforeAnybodyHasSeenTheWordsReplacesTheKey()
    {
        // Nothing is sealed to a key no run was allowed to use, so replacing it costs nothing — and it
        // is the only way out of a crash between the seal and the screen.
        var dir = TempDir();
        var store = Store(dir, out _);
        var first = await store.MintKeyAsync(Ct);
        var firstKey = (await store.FindKeyAsync(Ct)).Key;

        var second = await store.MintKeyAsync(Ct);

        second.Formatted.Should().NotBe(first.Formatted).And.StartWith("BK1-");
        (await store.FindKeyAsync(Ct)).Key.Should().NotEqual(firstKey);
    }

    [Fact]
    public async Task MintingAgainAfterTheWordsWereShownChangesNothingAndHandsOverNoWords()
    {
        // Once a run could have used it, a second key would orphan every archive taken under the first.
        var dir = TempDir();
        var store = Store(dir, out _);
        await store.MintKeyAsync(Ct);
        await store.AcknowledgeKeyShownAsync(Ct);
        var key = (await store.FindKeyAsync(Ct)).Key;

        var again = await store.MintKeyAsync(Ct);

        again.Status.Should().Be(BackupKeyLookup.Ready);
        again.Formatted.Should().BeEmpty("the words cannot be produced a second time — HKDF does not run backwards");
        (await store.FindKeyAsync(Ct)).Key.Should().Equal(key);
    }

    [Fact]
    public async Task AKeyThisServerCannotOpenIsUNREADABLEAndNothingIsMintedOverIt()
    {
        // A KEK changed by a restore or a typo. Answering "absent" here would mint a second key while
        // every existing archive stayed sealed to the first — data present and permanently unopenable.
        var dir = TempDir();
        var mine = Store(dir, out _);
        await mine.MintKeyAsync(Ct);
        await mine.AcknowledgeKeyShownAsync(Ct);

        var theirs = new BackupStore(dir, RandomNumberGenerator.GetBytes(Key32.Bytes), NullLogger<BackupStore>.Instance);

        (await theirs.FindKeyAsync(Ct)).Status.Should().Be(BackupKeyLookup.Unreadable);
        (await theirs.MintKeyAsync(Ct)).Formatted.Should().BeEmpty();
        (await mine.FindKeyAsync(Ct)).Status.Should().Be(
            BackupKeyLookup.Ready, "and the real key is untouched by the server that could not read it");
    }

    [Fact]
    public async Task ARecordFromALaterBuildIsUnreadableByVersionRatherThanByCipher()
    {
        // The difference between "fetch a newer build" and "your key is corrupt". The message names
        // the number; the cipher never gets a chance to report the wrong thing.
        var dir = TempDir();
        var store = Store(dir, out var kek);
        await store.MintKeyAsync(Ct);
        var path = Path.Combine(dir, "org", "backup", "key.sealed");
        var record = File.ReadAllText(path).Replace("\"schemaVersion\":1", "\"schemaVersion\":9");
        File.WriteAllText(path, record);

        var log = new CapturingLogger<BackupStore>();
        var reader = new BackupStore(dir, kek, log);

        (await reader.FindKeyAsync(Ct)).Status.Should().Be(BackupKeyLookup.Unreadable);
        log.Errors.Should().Contain(line => line.Contains("schema version 9"));
    }

    [Fact]
    public async Task ADeploymentWithNoKekCanMintNothingAndSaysSo()
    {
        var log = new CapturingLogger<BackupStore>();
        var store = new BackupStore(TempDir(), [], log);

        store.Configured.Should().BeFalse();
        (await store.MintKeyAsync(Ct)).Formatted.Should().BeEmpty();
        log.Entries.Select(entry => entry.Message).Should().Contain(
            line => line.Contains("Vault:LoginKey:Kek"));
    }

    [Fact]
    public async Task TheSealedKeyNeverTravelsInsideAnArchiveOfItsOwnDeployment()
    {
        // Asserted by listing what came OUT of an archive, not by trusting the exclusion rule's own
        // unit test. This is the one mistake the whole feature cannot survive.
        var dir = TempDir();
        var store = Store(dir, out _);
        await store.MintKeyAsync(Ct);
        await store.AcknowledgeKeyShownAsync(Ct);
        await store.WriteSettingsAsync(new BackupSettings(4, 14), Ct);
        Directory.CreateDirectory(Path.Combine(dir, "vaults"));
        File.WriteAllText(Path.Combine(dir, "vaults", "alice.json"), "keep me");
        var archive = Path.Combine(TempDir(), "archive.cvbk");
        var restored = Path.Combine(TempDir(), "restored");
        var key = RandomNumberGenerator.GetBytes(Key32.Bytes);

        BackupArchive.CreateFile(dir, archive, key, DateTimeOffset.UtcNow);
        BackupArchive.Extract(archive, restored, key);

        Directory.EnumerateFiles(restored, "*", SearchOption.AllDirectories)
            .Select(path => Path.GetRelativePath(restored, path).Replace('\\', '/'))
            .Should().BeEquivalentTo(["vaults/alice.json"], "the backup tree, key and settings alike, stays out");
    }

    [Fact]
    public async Task SettingsAndStatusRoundTripAndAnswerDefaultsWhenAbsent()
    {
        var dir = TempDir();
        var store = Store(dir, out _);

        (await store.ReadSettingsAsync(Ct)).Should().Be(BackupSettings.Default);
        (await store.ReadStatusAsync(Ct)).Should().Be(BackupStatus.NeverRun);

        await store.WriteSettingsAsync(new BackupSettings(7, 90), Ct);
        await store.WriteStatusAsync(new BackupStatus(1234, "ok", string.Empty, 4096), Ct);

        (await store.ReadSettingsAsync(Ct)).Should().Be(new BackupSettings(7, 90));
        (await store.ReadStatusAsync(Ct)).Should().Be(new BackupStatus(1234, "ok", string.Empty, 4096));
    }

    [Fact]
    public async Task AStatusFileNobodyCanParseAnswersTheDefaultRatherThanFailingABackup()
    {
        // Status is a convenience. Failing a whole deployment over a torn one would be the wrong trade,
        // and it is stated here so that nobody "fixes" it into a throw.
        var dir = TempDir();
        var store = Store(dir, out _);
        await store.WriteStatusAsync(new BackupStatus(1, "ok", string.Empty, 1), Ct);
        File.WriteAllText(Path.Combine(dir, "org", "backup", "status.json"), "{ not json");

        (await store.ReadStatusAsync(Ct)).Should().Be(BackupStatus.NeverRun);
    }

    [Fact]
    public async Task TheWordsAndTheBytesAreTheSameKey()
    {
        // The two halves have to meet: what the person writes down must open what the server sealed.
        var dir = TempDir();
        var store = Store(dir, out _);

        var minted = await store.MintKeyAsync(Ct);
        var onDisk = (await store.FindKeyAsync(Ct)).Key;

        var typed = BackupKey.Parse(minted.Formatted);
        typed.Ok.Should().BeTrue();
        BackupKey.KeyFrom(typed.Core).Should().Equal(onDisk);
    }

    private static BackupStore Store(string dir, out byte[] kek)
    {
        kek = RandomNumberGenerator.GetBytes(Key32.Bytes);
        return new BackupStore(dir, kek, NullLogger<BackupStore>.Instance);
    }

    private static string TempDir()
    {
        var dir = Path.Combine(Path.GetTempPath(), "cred-vault-backup-store", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        return dir;
    }
}
