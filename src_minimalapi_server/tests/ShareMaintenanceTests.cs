using System.Text;
using System.Text.Json;
using FluentAssertions;

namespace CredVaultServer.Tests;

/// <summary>
/// The hourly pass: shares nobody accepted in a month go, and a sender's receipt is retired the
/// moment the recipient deals with it.
/// </summary>
/// <remarks>
/// <para>The last test here is the one that matters most, and it is deliberately end-to-end: it
/// puts an old share on disk, starts the REAL server, and waits for it to disappear. Everything
/// above it exercises the store directly, which proves the sweep works but says nothing about
/// whether anything ever calls it — and a maintenance job that is registered but never runs looks
/// exactly like one that does.</para>
/// </remarks>
[Collection(ServerCollection.Name)]
public sealed class ShareMaintenanceTests
{
    private static string Bob => $"bob@{VaultServer.Domain}";

    private static string TempDir()
    {
        var dir = Path.Combine(Path.GetTempPath(), "cred-vault-tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        return dir;
    }

    /// <summary>Put a share on disk with an age of our choosing, bypassing the API.</summary>
    private static string WriteShare(string dataDir, string recipient, int daysOld, string name = "old thing")
    {
        var id = Guid.NewGuid().ToString();
        var dir = Path.Combine(dataDir, "shares", VaultStore.KeyFor(recipient));
        Directory.CreateDirectory(dir);
        var item = new ShareItem
        {
            Id = id,
            FromEmail = $"alice@{VaultServer.Domain}",
            ToEmail = recipient,
            EntityName = name,
            EntityKind = "db",
            CreatedAt = DateTimeOffset.UtcNow.AddDays(-daysOld).ToUnixTimeMilliseconds(),
            Salt = Convert.ToBase64String(new byte[16]),
            Iv = Convert.ToBase64String(new byte[12]),
            Tag = Convert.ToBase64String(new byte[16]),
            Data = Convert.ToBase64String(Encoding.UTF8.GetBytes("sealed")),
        };
        File.WriteAllBytes(
            Path.Combine(dir, id + ".json"),
            JsonSerializer.SerializeToUtf8Bytes(item, AppJsonContext.Default.ShareItem));
        return id;
    }

    private static string SharePath(string dataDir, string recipient, string id) =>
        Path.Combine(dataDir, "shares", VaultStore.KeyFor(recipient), id + ".json");

    private static string ReceiptPath(string dataDir, string sender, string id) =>
        Path.Combine(dataDir, "sent", VaultStore.KeyFor(sender), id + ".json");

    [Fact]
    public async Task AShareNobodyAcceptedInAMonthIsSwept()
    {
        var dir = TempDir();
        var store = new VaultStore(dir);
        var old = WriteShare(dir, Bob, daysOld: 40);
        var fresh = WriteShare(dir, Bob, daysOld: 2, name: "recent thing");

        var removed = await store.PruneOlderThanAsync(TimeSpan.FromDays(31), TestContext.Current.CancellationToken);

        removed.Should().Be(1);
        File.Exists(SharePath(dir, Bob, old)).Should().BeFalse();
        File.Exists(SharePath(dir, Bob, fresh)).Should().BeTrue();
    }

    [Fact]
    public async Task AgeComesFromTheItemNotTheFileTimestamp()
    {
        // A restore from backup rewrites every mtime. A sweep that trusted them would delete a
        // month of shares the first time someone recovered a server — the one moment nobody can
        // afford a second failure.
        var dir = TempDir();
        var store = new VaultStore(dir);
        var old = WriteShare(dir, Bob, daysOld: 40);
        File.SetLastWriteTimeUtc(SharePath(dir, Bob, old), DateTime.UtcNow); // as a restore would

        await store.PruneOlderThanAsync(TimeSpan.FromDays(31), TestContext.Current.CancellationToken);

        File.Exists(SharePath(dir, Bob, old)).Should().BeFalse("the item's own createdAt is 40 days ago");
    }

    [Fact]
    public async Task AReceiptIsRetiredOnceTheRecipientHasDealtWithIt()
    {
        var dir = TempDir();
        var store = new VaultStore(dir);
        var ct = TestContext.Current.CancellationToken;
        var alice = $"alice@{VaultServer.Domain}";
        var id = WriteShare(dir, Bob, daysOld: 1);
        await store.AppendSentAsync(
            alice,
            new SentShare { Id = id, ToEmail = Bob, EntityName = "old thing", EntityKind = "db", CreatedAt = 1 },
            ct);

        // While it is still pending, the receipt stays.
        (await store.ReconcileSentAsync(ct)).Should().Be(0);
        File.Exists(ReceiptPath(dir, alice, id)).Should().BeTrue();

        // Bob accepts — the inbox file goes, and nothing tells the sender.
        File.Delete(SharePath(dir, Bob, id));

        (await store.ReconcileSentAsync(ct)).Should().Be(1);
        File.Exists(ReceiptPath(dir, alice, id)).Should().BeFalse();
    }

    [Fact]
    public async Task TheSweepActuallyRUNS_notJustExists()
    {
        // End-to-end on purpose. Everything above proves the sweep works; this proves something
        // calls it. A hosted service that is registered but never reached looks identical from
        // the outside to one that runs — which is exactly how a maintenance job rots.
        var dir = TempDir();
        var old = WriteShare(dir, Bob, daysOld: 90);
        var path = SharePath(dir, Bob, old);

        using var server = new VaultServer(new Dictionary<string, string?> { ["Vault__DataDir"] = dir });
        using var client = server.ClientFor(Bob); // creating a client is what starts the host

        var ct = TestContext.Current.CancellationToken;
        for (var attempt = 0; attempt < 50 && File.Exists(path); attempt += 1)
        {
            await Task.Delay(100, ct);
        }

        File.Exists(path).Should().BeFalse("the startup pass should have swept a 90-day-old share");
    }
}
