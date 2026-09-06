using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using FluentAssertions;

namespace CredVaultServer.Tests;

/// <summary>
/// Withdrawal, both directions, at the moment of the block: every pending share TO the blocked person
/// leaves their inbox and the sender's receipt is rewritten carrying a reason; every pending share FROM
/// them leaves every recipient's inbox. And the part the story split found: the hourly sweep must KEEP a
/// receipt carrying a reason — its "still pending" test is "the inbox file exists", and withdrawal deletes
/// exactly that file — or the sender never learns why their share vanished.
/// </summary>
[Collection(ServerCollection.Name)]
public sealed class OrgBlockingWithdrawalTests
{
    private static string Alice => $"alice@{VaultServer.Domain}";

    private static string Bob => $"bob@{VaultServer.Domain}";

    private static string Carol => $"carol@{VaultServer.Domain}";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static object Envelope(string toEmail, string entityName = "prod db") =>
        new
        {
            toEmail,
            entityName,
            entityKind = "db",
            salt = Convert.ToBase64String(new byte[16]),
            iv = Convert.ToBase64String(new byte[12]),
            tag = Convert.ToBase64String(new byte[16]),
            data = Convert.ToBase64String(Encoding.UTF8.GetBytes("sealed-payload")),
        };

    private static async Task ShareAsync(HttpClient sender, string toEmail, string entityName = "prod db") =>
        (await sender.PostAsJsonAsync("/api/shares", Envelope(toEmail, entityName), Ct)).StatusCode.Should().Be(HttpStatusCode.Created);

    private static async Task<JsonElement> SentAsync(HttpClient sender) =>
        JsonDocument.Parse(await sender.GetStringAsync("/api/shares/sent", Ct)).RootElement.Clone();

    private static string InboxPath(VaultServer server, string recipient, string id) =>
        Path.Combine(server.DataDir, "shares", VaultStore.KeyFor(recipient), id + ".json");

    private static string ReceiptPath(string dataDir, string sender, string id) =>
        Path.Combine(dataDir, "sent", VaultStore.KeyFor(sender), id + ".json");

    private static string TempDir()
    {
        var dir = Path.Combine(Path.GetTempPath(), "cred-vault-tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        return dir;
    }

    [Fact]
    public async Task AShareToABlockedPersonLeavesTheirInboxAndTheSenderIsToldWhy()
    {
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = server.ClientFor(Alice, "Alice");
        using var bob = server.ClientFor(Bob);
        await Corp.SyncAsync(bob);
        await ShareAsync(alice, Bob);
        var id = (await SentAsync(alice))[0].GetProperty("id").GetString()!;

        (await Corp.SetActiveAsync(cto, Bob, active: false)).StatusCode.Should().Be(HttpStatusCode.NoContent);

        File.Exists(InboxPath(server, Bob, id)).Should().BeFalse("the share is gone from the inbox the moment the block lands");
        var receipt = (await SentAsync(alice)).EnumerateArray().Should().ContainSingle().Subject;
        receipt.GetProperty("id").GetString().Should().Be(id);
        receipt.GetProperty("withdrawnReason").GetString().Should().NotBeNullOrWhiteSpace("the sender sees why, once");
        receipt.GetProperty("withdrawnReason").GetString().Should().ContainEquivalentOf("deactivated");
    }

    [Fact]
    public async Task AReceiptThatWasNotWithdrawnCarriesNoReasonField()
    {
        // ABSENT, never null or "": a released extension's isSentShare checks its five fields and ignores
        // extras, so an absent field is byte-identical to today for every client that exists.
        using var server = Corp.Server();
        using var alice = server.ClientFor(Alice, "Alice");
        await ShareAsync(alice, Bob);

        var receipt = (await SentAsync(alice))[0];

        receipt.TryGetProperty("withdrawnReason", out _).Should().BeFalse();
    }

    [Fact]
    public async Task ASenderWhoCouldNotBeToldIsCountedInTheBlockRowRatherThanSilentlyLost()
    {
        // The review round's one real reliability finding. The inbox copy is deleted BEFORE the sender's
        // receipt is rewritten — the right order, since the reverse leaves readable material in the inbox of
        // somebody who may be re-admitted — so a receipt that will not rewrite costs the sender their one
        // explanation, and the hourly sweep then retires the unmarked receipt as an ordinary accepted share.
        // That is best-effort working as designed; being INVISIBLE is not. Here alice's receipt is held open
        // for the whole block: the share still leaves bob's inbox, the block still answers 204, and the row
        // says a sender was left in the dark.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = server.ClientFor(Alice, "Alice");
        using var bob = server.ClientFor(Bob);
        await Corp.SyncAsync(bob);
        await ShareAsync(alice, Bob);
        var id = (await SentAsync(alice))[0].GetProperty("id").GetString()!;

        using (Corp.Undeletable(ReceiptPath(server.DataDir, Alice, id)))
        {
            (await Corp.SetActiveAsync(cto, Bob, active: false)).StatusCode.Should().Be(HttpStatusCode.NoContent);
        }

        File.Exists(InboxPath(server, Bob, id)).Should().BeFalse("the share still leaves the inbox — that is the part that matters");
        var row = Corp.Rows(server, OrgEventKinds.MemberBlocked).Should().ContainSingle().Subject;
        row.Detail.Should().Contain("1 sender(s) could NOT be told why");
    }

    [Fact]
    public async Task TheHourlySweepKeepsAWithdrawnReceiptAndStillRetiresAnAcceptedOne()
    {
        // Store-level, the two receipts side by side. Both point at an inbox file that no longer exists;
        // only the one carrying a reason survives, because the reason IS what the sender has yet to read.
        // The accepted one is the positive control — a sweep that kept everything would pass the first
        // assertion for the wrong reason.
        var dir = TempDir();
        var store = new VaultStore(dir);
        var withdrawn = Guid.NewGuid().ToString();
        var accepted = Guid.NewGuid().ToString();
        await store.AppendSentAsync(Alice, new SentShare { Id = withdrawn, ToEmail = Bob, EntityName = "x", EntityKind = "db", CreatedAt = 1, WithdrawnReason = "gone" }, Ct);
        await store.AppendSentAsync(Alice, new SentShare { Id = accepted, ToEmail = Bob, EntityName = "y", EntityKind = "db", CreatedAt = 1 }, Ct);

        var retired = await store.ReconcileSentAsync(Ct);

        retired.Should().Be(1, "the accepted receipt retires; the withdrawn one is kept for its reason");
        File.Exists(ReceiptPath(dir, Alice, withdrawn)).Should().BeTrue("the sender has not read the reason yet");
        File.Exists(ReceiptPath(dir, Alice, accepted)).Should().BeFalse();
    }

    [Fact]
    public async Task TheSenderStillSeesTheReasonAfterTheSweepHasRun()
    {
        // End to end: block, then the sweep the server runs hourly, then the sender's own listing.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = server.ClientFor(Alice, "Alice");
        using var bob = server.ClientFor(Bob);
        await Corp.SyncAsync(bob);
        await ShareAsync(alice, Bob);
        await Corp.SetActiveAsync(cto, Bob, active: false);

        await new VaultStore(server.DataDir).ReconcileSentAsync(Ct);

        var receipt = (await SentAsync(alice)).EnumerateArray().Should().ContainSingle().Subject;
        receipt.GetProperty("withdrawnReason").GetString().Should().NotBeNullOrWhiteSpace();
    }

    [Fact]
    public async Task DismissingAWithdrawnReceiptIs204AndForgetsIt()
    {
        // Today this would be a 409 — the inbox file is gone, which the withdraw route reads as "already
        // accepted". A receipt carrying a reason is dismissed instead, whatever the inbox says.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = server.ClientFor(Alice, "Alice");
        using var bob = server.ClientFor(Bob);
        await Corp.SyncAsync(bob);
        await ShareAsync(alice, Bob);
        var id = (await SentAsync(alice))[0].GetProperty("id").GetString()!;
        (await Corp.SetActiveAsync(cto, Bob, active: false)).StatusCode.Should().Be(HttpStatusCode.NoContent);
        // Without this the DELETE below is an ordinary withdrawal of a still-pending share and the test
        // passes against the wrong path — it did, on its first run, before the endpoint existed.
        (await SentAsync(alice))[0].GetProperty("withdrawnReason").GetString().Should().NotBeNullOrWhiteSpace("precondition: withdrawn");

        var dismissed = await alice.DeleteAsync($"/api/shares/sent/{id}", Ct);

        dismissed.StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await alice.GetStringAsync("/api/shares/sent", Ct)).Should().Be("[]");
        (await alice.DeleteAsync($"/api/shares/sent/{id}", Ct)).StatusCode.Should().Be(HttpStatusCode.NotFound, "dismissed once, gone");
    }

    [Fact]
    public async Task ThePruneStillRetiresAWithdrawnReceiptAfterItsAge()
    {
        // The reason is kept for the sender to read, not forever: a sender who never opens the Sent view
        // must not accumulate receipts, so the 31-day prune takes it like any other.
        var dir = TempDir();
        var store = new VaultStore(dir);
        var id = Guid.NewGuid().ToString();
        var old = DateTimeOffset.UtcNow.AddDays(-40).ToUnixTimeMilliseconds();
        await store.AppendSentAsync(Alice, new SentShare { Id = id, ToEmail = Bob, EntityName = "x", EntityKind = "db", CreatedAt = old, WithdrawnReason = "gone" }, Ct);

        var removed = await store.PruneOlderThanAsync(TimeSpan.FromDays(31), Ct);

        removed.Should().Be(1);
        File.Exists(ReceiptPath(dir, Alice, id)).Should().BeFalse();
    }

    [Fact]
    public async Task AShareFromABlockedPersonLeavesTheRecipientsInbox()
    {
        // The other direction: Bob shared with Carol an hour before he was blocked. Carol's inbox must not
        // hold something she can still open from somebody the company just locked out — and Bob's own
        // receipt needs no reason, because he cannot call anything.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var bob = server.ClientFor(Bob, "Bob");
        using var carol = server.ClientFor(Carol);
        await Corp.SyncAsync(bob);
        await ShareAsync(bob, Carol);
        var id = (await SentAsync(bob))[0].GetProperty("id").GetString()!;
        (await carol.GetStringAsync("/api/shares", Ct)).Should().Contain("prod db", "precondition: delivered");

        (await Corp.SetActiveAsync(cto, Bob, active: false)).StatusCode.Should().Be(HttpStatusCode.NoContent);

        (await carol.GetStringAsync("/api/shares", Ct)).Should().Be("[]");
        File.Exists(ReceiptPath(server.DataDir, Bob, id)).Should().BeFalse("the blocked sender's receipt goes too");
    }

    [Fact]
    public async Task BothDirectionsAreWithdrawnInOneBlockAndAnUnrelatedShareSurvives()
    {
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = server.ClientFor(Alice, "Alice");
        using var bob = server.ClientFor(Bob, "Bob");
        using var carol = server.ClientFor(Carol);
        await Corp.SyncAsync(bob);
        await ShareAsync(alice, Bob, "to bob");
        await ShareAsync(bob, Carol, "from bob");
        await ShareAsync(alice, Carol, "unrelated");

        await Corp.SetActiveAsync(cto, Bob, active: false);

        var carolsInbox = await carol.GetStringAsync("/api/shares", Ct);
        carolsInbox.Should().Contain("unrelated").And.NotContain("from bob");
        var alicesReceipts = (await SentAsync(alice)).EnumerateArray().ToList();
        alicesReceipts.Should().HaveCount(2);
        alicesReceipts.Single(r => r.GetProperty("entityName").GetString() == "to bob").TryGetProperty("withdrawnReason", out _).Should().BeTrue();
        alicesReceipts.Single(r => r.GetProperty("entityName").GetString() == "unrelated").TryGetProperty("withdrawnReason", out _).Should().BeFalse();
    }

    [Fact]
    public async Task AWithdrawnShareDoesNotComeBackOnUnblock()
    {
        // Withdrawal is not a suspension. The sender was told and can send again; what was pending is gone.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = server.ClientFor(Alice, "Alice");
        using var bob = server.ClientFor(Bob);
        await Corp.SyncAsync(bob);
        await ShareAsync(alice, Bob);
        await Corp.SetActiveAsync(cto, Bob, active: false);

        await Corp.SetActiveAsync(cto, Bob, active: true);

        (await bob.GetStringAsync("/api/shares", Ct)).Should().Be("[]");
    }

    [Fact]
    public async Task ARepeatedBlockFinishesAWithdrawalTheFirstOneCouldNotComplete()
    {
        // The story split's finding, and the reason a repeat is not a no-op: the withdrawal is a loop over
        // other people's files, and a crash, a held handle or a permission flip half-way leaves shares in
        // an inbox the block was meant to empty. Nothing retries them on a cadence, so the only recovery a
        // human has is to repeat the request — which must therefore RE-RUN the sweep rather than read "no
        // transition" and answer 204 over an unfinished job. Here the first block cannot touch the file at
        // all; the second, once the handle is gone, must finish what it started.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = server.ClientFor(Alice, "Alice");
        using var bob = server.ClientFor(Bob);
        await Corp.SyncAsync(bob);
        await ShareAsync(alice, Bob);
        var id = (await SentAsync(alice))[0].GetProperty("id").GetString()!;
        using (Corp.Undeletable(InboxPath(server, Bob, id)))
        {
            (await Corp.SetActiveAsync(cto, Bob, active: false)).StatusCode.Should().Be(HttpStatusCode.NoContent);
            File.Exists(InboxPath(server, Bob, id)).Should().BeTrue("the premise: this block could not take it");
        }

        (await Corp.SetActiveAsync(cto, Bob, active: false)).StatusCode.Should().Be(HttpStatusCode.NoContent);

        File.Exists(InboxPath(server, Bob, id)).Should().BeFalse("repeating the block finishes the withdrawal");
        var receipt = (await SentAsync(alice)).EnumerateArray().Should().ContainSingle().Subject;
        receipt.GetProperty("withdrawnReason").GetString().Should().ContainEquivalentOf("deactivated");
    }

    [Fact]
    public async Task AnIdempotentReBlockWithdrawsNothingTwice()
    {
        // A repeat re-runs the sweep (the test above says why), and with nothing left it must find nothing:
        // no inbox to empty, and in particular no receipt to resurrect after the sender dismissed it.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = server.ClientFor(Alice, "Alice");
        using var bob = server.ClientFor(Bob);
        await Corp.SyncAsync(bob);
        await ShareAsync(alice, Bob);
        await Corp.SetActiveAsync(cto, Bob, active: false);
        var id = (await SentAsync(alice))[0].GetProperty("id").GetString()!;
        (await alice.DeleteAsync($"/api/shares/sent/{id}", Ct)).StatusCode.Should().Be(HttpStatusCode.NoContent);

        (await Corp.SetActiveAsync(cto, Bob, active: false)).StatusCode.Should().Be(HttpStatusCode.NoContent);

        (await alice.GetStringAsync("/api/shares/sent", Ct)).Should().Be("[]");
    }
}
