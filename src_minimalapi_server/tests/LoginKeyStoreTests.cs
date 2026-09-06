using FluentAssertions;
using Microsoft.Extensions.Logging;

namespace CredVaultServer.Tests;

/// <summary>
/// The store on its own, where the guarantees that have no HTTP shape live: that a key this server
/// cannot read is never replaced, that two processes on one volume cannot mint two keys for one person,
/// and that nothing about the key material ever reaches a log line.
/// </summary>
public sealed class LoginKeyStoreTests
{
    private const string Alice = "alice@example.com";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static byte[] Kek(byte seed) => [.. Enumerable.Range(0, LoginKeyStore.KeyBytes).Select(i => (byte)(i + seed))];

    private static string TempDir()
    {
        var dir = Path.Combine(Path.GetTempPath(), "cred-vault-tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        return dir;
    }

    private static string PathFor(string dir, string email) =>
        Path.Combine(dir, "org", "login-keys", VaultStore.KeyFor(email) + ".bin");

    private static (LoginKeyStore Store, CapturingLogger<LoginKeyStore> Log) StoreIn(string dir, byte seed = 1)
    {
        var log = new CapturingLogger<LoginKeyStore>();
        return (new LoginKeyStore(dir, Kek(seed), log), log);
    }

    /// <summary>
    /// A sealed record the test KEK opens, holding whatever bytes the caller asks for — the only way to
    /// produce a file that AUTHENTICATES and still carries the wrong thing.
    /// </summary>
    private static byte[] SealedUnderTestKek(byte[] payload)
    {
        var iv = new byte[12];
        var tag = new byte[16];
        var data = new byte[payload.Length];
        using var aes = new System.Security.Cryptography.AesGcm(Kek(1), tag.Length);
        aes.Encrypt(iv, payload, data, tag);
        return System.Text.Json.JsonSerializer.SerializeToUtf8Bytes(
            new SealedLoginKey(
                Convert.ToBase64String(iv),
                Convert.ToBase64String(tag),
                Convert.ToBase64String(data),
                DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()),
            AppJsonContext.Default.SealedLoginKey);
    }

    [Fact]
    public async Task NoLogLineEverCarriesTheKeyMaterial()
    {
        // The first feature in this server that could break the no-secrets-in-logs property by accident.
        // The positive control matters as much as the assertion: a run that logged NOTHING would pass the
        // second half for the wrong reason.
        var dir = TempDir();
        var (store, log) = StoreIn(dir);

        var minted = await store.GetOrCreateAsync(Alice, Ct);
        await store.RemoveAsync(Alice, Ct);

        var text = string.Join("\n", log.Entries.Select(e => e.Message));
        text.Should().Contain("login key issued for alice@example.com", "the positive control");
        text.Should().Contain("login key removed for alice@example.com");
        text.Should().NotContain(Convert.ToBase64String(minted.Key));
        text.Should().NotContain(Convert.ToHexString(minted.Key));
        text.Should().Contain(minted.Fingerprint, "the fingerprint is a public name, and identifies the key in the log");
    }

    [Fact]
    public async Task AKeyThatWillNotDecryptIsNeverReplaced()
    {
        // The plan round's blocking finding, and the worst thing this store could do: a KEK changed by a
        // restore or a typo must not mint a SECOND key while the person's vault stays sealed to the first.
        var dir = TempDir();
        var (first, _) = StoreIn(dir, seed: 1);
        await first.GetOrCreateAsync(Alice, Ct);
        var sealedBytes = await File.ReadAllBytesAsync(PathFor(dir, Alice), Ct);

        var (underAnotherKek, log) = StoreIn(dir, seed: 2);
        var result = await underAnotherKek.GetOrCreateAsync(Alice, Ct);

        result.Status.Should().Be(LoginKeyLookup.Unreadable);
        result.Key.Should().BeEmpty();
        (await File.ReadAllBytesAsync(PathFor(dir, Alice), Ct)).Should().Equal(sealedBytes, "nothing was rewritten");
        log.Errors.Should().ContainSingle().Which.Should().Contain("NOTHING is minted");
    }

    [Fact]
    public async Task ATamperedFileIsUnreadableRatherThanPlausibleGarbage()
    {
        // GCM authenticates. A flipped byte in the ciphertext must fail the tag, not decrypt into 32
        // bytes that a client would then seal a vault to.
        var dir = TempDir();
        var (store, _) = StoreIn(dir);
        await store.GetOrCreateAsync(Alice, Ct);
        var path = PathFor(dir, Alice);
        var json = await File.ReadAllTextAsync(path, Ct);
        await File.WriteAllTextAsync(path, json.Replace("\"data\":\"", "\"data\":\"A", StringComparison.Ordinal), Ct);

        var result = await store.GetOrCreateAsync(Alice, Ct);

        result.Status.Should().Be(LoginKeyLookup.Unreadable);
    }

    [Fact]
    public async Task GarbageInPlaceOfTheFileIsUnreadableNotAbsent()
    {
        var dir = TempDir();
        var (store, _) = StoreIn(dir);
        await store.GetOrCreateAsync(Alice, Ct);
        await File.WriteAllTextAsync(PathFor(dir, Alice), "{ this is not the JSON this store writes", Ct);

        (await store.GetOrCreateAsync(Alice, Ct)).Status.Should().Be(LoginKeyLookup.Unreadable);
    }

    [Fact]
    public async Task AWellFormedFileHoldingTheWrongNumberOfBytesIsUnreadable()
    {
        // GCM authenticates, so this cannot be forged from outside — but it CAN be written by a future
        // version, a hand-edited file, or a restore from a build that meant something else by these
        // bytes. Serving it would hand a client 31 bytes where the contract promises 32, and story 3
        // would seal a vault to something no later build reproduces.
        var dir = TempDir();
        var (store, _) = StoreIn(dir);
        await store.GetOrCreateAsync(Alice, Ct);
        await File.WriteAllBytesAsync(PathFor(dir, Alice), SealedUnderTestKek(new byte[31]), Ct);

        var result = await store.GetOrCreateAsync(Alice, Ct);

        result.Status.Should().Be(LoginKeyLookup.Unreadable, "a key of the wrong length is not a key");
    }

    [Fact]
    public async Task ValidJsonWithNoFieldsIsUnreadableAndMintsNothing()
    {
        var dir = TempDir();
        var (store, _) = StoreIn(dir);
        await store.GetOrCreateAsync(Alice, Ct);
        var before = await File.ReadAllBytesAsync(PathFor(dir, Alice), Ct);
        await File.WriteAllTextAsync(PathFor(dir, Alice), "{}", Ct);

        (await store.GetOrCreateAsync(Alice, Ct)).Status.Should().Be(LoginKeyLookup.Unreadable);
        (await File.ReadAllTextAsync(PathFor(dir, Alice), Ct)).Should().Be("{}", "nothing was minted over it");
        before.Should().NotBeEmpty("the premise: there was a real key here");
    }

    [Fact]
    public async Task AStorageFailureIsNeverReportedAsNoKey()
    {
        // The difference decides what a developer is told. "Absent" means "this server has issued you
        // nothing", which a client reads as "no binding" — while the truth here is "this server could
        // not write", and the honest answer is come back later. A directory that cannot be created is
        // the cheapest way to make every write fail.
        var dir = TempDir();
        var (store, _) = StoreIn(dir);
        var blocker = Path.Combine(dir, "org", "login-keys");
        Directory.CreateDirectory(Path.Combine(dir, "org"));
        await File.WriteAllTextAsync(blocker, "a file where the folder should be", Ct);

        var result = await store.GetOrCreateAsync(Alice, Ct);

        result.Status.Should().Be(LoginKeyLookup.Unreadable, "a write that failed is not an absence");
    }

    [Fact]
    public async Task TwoStoresOverOneDirectoryMintOneKey()
    {
        // Two server processes on one volume — a rolling restart, or a second container — share the disk
        // and nothing else. The in-memory stripe says nothing about that, so the write is a
        // create-if-absent and the loser reads the winner's key.
        var dir = TempDir();
        var (first, _) = StoreIn(dir);
        var (second, _) = StoreIn(dir);

        var results = await Task.WhenAll(
            first.GetOrCreateAsync(Alice, Ct),
            second.GetOrCreateAsync(Alice, Ct));

        results[0].Key.Should().Equal(results[1].Key);
        Directory.GetFiles(Path.Combine(dir, "org", "login-keys")).Should().ContainSingle("no temp file is left behind either");
    }

    [Fact]
    public async Task FindNeverMints()
    {
        var dir = TempDir();
        var (store, _) = StoreIn(dir);

        var result = await store.FindAsync(Alice, Ct);

        result.Status.Should().Be(LoginKeyLookup.Absent);
        Directory.Exists(Path.Combine(dir, "org", "login-keys")).Should().BeFalse("not even the folder");
    }

    [Fact]
    public async Task TheFingerprintNamesTheKeyAndChangesWithIt()
    {
        var dir = TempDir();
        var (store, _) = StoreIn(dir);
        var mine = await store.GetOrCreateAsync(Alice, Ct);
        var theirs = await store.GetOrCreateAsync("bob@example.com", Ct);

        mine.Fingerprint.Should().Be((await store.FindAsync(Alice, Ct)).Fingerprint, "the same key, the same name");
        mine.Fingerprint.Should().NotBe(theirs.Fingerprint);
        mine.Fingerprint.Should().MatchRegex("^[0-9a-f]{16}$");
        LoginKeyResult.Absent.Fingerprint.Should().BeEmpty("there is nothing to name");
    }

    [Fact]
    public async Task RemovingWhatIsNotThereIsSuccessAndRemovingSomethingHeldOpenIsNot()
    {
        // The difference the plan round asked for: a caller that could not tell these apart would report
        // a clean deletion over a file still on the disk.
        var dir = TempDir();
        var (store, log) = StoreIn(dir);
        (await store.RemoveAsync(Alice, Ct)).Should().BeTrue("nothing to remove is removed");

        await store.GetOrCreateAsync(Alice, Ct);
        bool refused;
        using (Corp.Undeletable(PathFor(dir, Alice)))
        {
            refused = await store.RemoveAsync(Alice, Ct);
        }

        refused.Should().BeFalse();
        log.Errors.Should().ContainSingle().Which.Should().Contain("still on disk");
    }

    [Fact]
    public void AKekIsThirtyTwoBytesOfBase64OrItIsNothing()
    {
        LoginKeyKek.Read(Convert.ToBase64String(new byte[32])).Should().HaveCount(32);
        LoginKeyKek.Read(Convert.ToBase64String(new byte[31])).Should().BeEmpty("a short key is refused, never padded");
        LoginKeyKek.Read(Convert.ToBase64String(new byte[33])).Should().BeEmpty("a long key is refused, never truncated");
        LoginKeyKek.Read("not base64 at all!").Should().BeEmpty();
        LoginKeyKek.Read("").Should().BeEmpty();
        LoginKeyKek.Read(null).Should().BeEmpty();
    }

    [Fact]
    public void TheStartupComplaintIsSilentOnlyWhereNobodyAskedForTheFeature()
    {
        LoginKeyKek.Complaint(null, corpMode: false).Should().BeEmpty("a personal server never wanted it");
        LoginKeyKek.Complaint(null, corpMode: true).Should().Contain("Vault:LoginKey:Kek is not configured");
        LoginKeyKek.Complaint(Convert.ToBase64String(new byte[32]), corpMode: true).Should().BeEmpty();
        LoginKeyKek.Complaint("oops", corpMode: false)
            .Should().Contain("IGNORED", "a setting somebody wrote and believes is working is worth a line either way");
    }
}
