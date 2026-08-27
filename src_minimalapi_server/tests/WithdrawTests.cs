using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using FluentAssertions;

namespace CredVaultServer.Tests;

/// <summary>
/// The sender's side of a share: a receipt they can find, a withdrawal while it is still
/// pending, and an honest answer once it is not.
/// </summary>
/// <remarks>
/// Before this existed a share could not be taken back at all, and the reason was structural
/// rather than a missing route: an inbox is keyed by the RECIPIENT, so the sender had no way to
/// learn the id of the thing waiting there. That mattered more once secrets could burn — a
/// burn-on-use secret has no deadline, so the sender's copy could be gone while the pending
/// share stayed live in a place the sender could not reach.
/// </remarks>
[Collection(ServerCollection.Name)]
public sealed class WithdrawTests
{
    private static string Alice => $"alice@{VaultServer.Domain}";

    private static string Bob => $"bob@{VaultServer.Domain}";

    private static string Carol => $"carol@{VaultServer.Domain}";

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

    private static async Task<string> FirstId(HttpClient client, string path, CancellationToken ct)
    {
        using var parsed = JsonDocument.Parse(await client.GetStringAsync(path, ct));
        return parsed.RootElement[0].GetProperty("id").GetString()!;
    }

    [Fact]
    public async Task SendingLeavesTheSenderAReceiptTheyCanFind()
    {
        using var server = new VaultServer();
        using var alice = server.ClientFor(Alice, "Alice");
        var ct = TestContext.Current.CancellationToken;

        await alice.PostAsJsonAsync("/api/shares", Envelope(Bob), ct);

        var sent = await alice.GetStringAsync("/api/shares/sent", ct);
        sent.Should().Contain("prod db").And.Contain(Bob);
    }

    [Fact]
    public async Task TheReceiptIsNotASecondCopyOfTheSecret()
    {
        // The whole payload exists once, in the recipient's inbox. A receipt that carried it too
        // would double the exposure of every share to buy a listing that does not need it.
        using var server = new VaultServer();
        using var alice = server.ClientFor(Alice, "Alice");
        var ct = TestContext.Current.CancellationToken;

        await alice.PostAsJsonAsync("/api/shares", Envelope(Bob), ct);

        var sent = await alice.GetStringAsync("/api/shares/sent", ct);
        sent.Should().NotContain("sealed-payload");
        using var parsed = JsonDocument.Parse(sent);
        var receipt = parsed.RootElement[0];
        receipt.TryGetProperty("data", out _).Should().BeFalse();
        receipt.TryGetProperty("salt", out _).Should().BeFalse();
        receipt.TryGetProperty("iv", out _).Should().BeFalse();
        receipt.TryGetProperty("tag", out _).Should().BeFalse();
    }

    [Fact]
    public async Task ASenderSeesOnlyTheirOwnSentItems()
    {
        using var server = new VaultServer();
        using var alice = server.ClientFor(Alice, "Alice");
        using var carol = server.ClientFor(Carol, "Carol");
        var ct = TestContext.Current.CancellationToken;

        await alice.PostAsJsonAsync("/api/shares", Envelope(Bob), ct);

        var carolsSent = await carol.GetStringAsync("/api/shares/sent", ct);
        carolsSent.Should().Be("[]");
    }

    [Fact]
    public async Task WithdrawingTakesItOutOfTheRecipientsInbox()
    {
        using var server = new VaultServer();
        using var alice = server.ClientFor(Alice, "Alice");
        using var bob = server.ClientFor(Bob);
        var ct = TestContext.Current.CancellationToken;
        await alice.PostAsJsonAsync("/api/shares", Envelope(Bob), ct);
        var id = await FirstId(alice, "/api/shares/sent", ct);

        var withdrawn = await alice.DeleteAsync($"/api/shares/sent/{id}", ct);

        withdrawn.StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await bob.GetStringAsync("/api/shares", ct)).Should().Be("[]");
        (await alice.GetStringAsync("/api/shares/sent", ct)).Should().Be("[]");
    }

    [Fact]
    public async Task WithdrawingSomethingAlreadyTakenSaysSoRatherThanPretending()
    {
        // 409, not 404: "there is no such share" and "it is beyond recall" are different answers,
        // and only one of them means the secret is now somewhere the sender cannot reach.
        using var server = new VaultServer();
        using var alice = server.ClientFor(Alice, "Alice");
        using var bob = server.ClientFor(Bob);
        var ct = TestContext.Current.CancellationToken;
        await alice.PostAsJsonAsync("/api/shares", Envelope(Bob), ct);
        var id = await FirstId(bob, "/api/shares", ct);
        await bob.DeleteAsync($"/api/shares/{id}", ct); // Bob accepts

        var withdrawn = await alice.DeleteAsync($"/api/shares/sent/{id}", ct);

        withdrawn.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await withdrawn.Content.ReadAsStringAsync(ct)).Should().Contain("no longer be withdrawn");
    }

    [Fact]
    public async Task OneSenderCannotWithdrawAnothersShare()
    {
        // The inbox a withdrawal reaches into is named by the SENDER'S OWN receipt, so a caller
        // with someone else's id has nothing to look it up in.
        using var server = new VaultServer();
        using var alice = server.ClientFor(Alice, "Alice");
        using var bob = server.ClientFor(Bob);
        using var carol = server.ClientFor(Carol, "Carol");
        var ct = TestContext.Current.CancellationToken;
        await alice.PostAsJsonAsync("/api/shares", Envelope(Bob), ct);
        var id = await FirstId(alice, "/api/shares/sent", ct);

        var attempt = await carol.DeleteAsync($"/api/shares/sent/{id}", ct);

        attempt.StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await bob.GetStringAsync("/api/shares", ct)).Should().Contain("prod db");
    }

    [Fact]
    public async Task AnIdThatIsNotAGuidIsRefusedRatherThanJoinedToAPath()
    {
        using var server = new VaultServer();
        using var alice = server.ClientFor(Alice, "Alice");
        var ct = TestContext.Current.CancellationToken;

        var attempt = await alice.DeleteAsync("/api/shares/sent/..%2F..%2Fvaults%2Fsomething", ct);

        attempt.StatusCode.Should().BeOneOf(HttpStatusCode.NotFound, HttpStatusCode.BadRequest);
    }
}
