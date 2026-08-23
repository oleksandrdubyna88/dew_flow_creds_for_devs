using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using FluentAssertions;

namespace CredVaultServer.Tests;

[Collection(ServerCollection.Name)]
public sealed class SharingTests
{
    private static string Alice => $"alice@{VaultServer.Domain}";

    private static string Bob => $"bob@{VaultServer.Domain}";

    /// <summary>A well-formed sealed envelope — the server never decrypts it, it only checks the shape.</summary>
    private static object Envelope(string toEmail, string entityName = "prod db", string? data = null) =>
        new
        {
            toEmail,
            entityName,
            entityKind = "db",
            salt = Convert.ToBase64String(new byte[16]),
            iv = Convert.ToBase64String(new byte[12]),
            tag = Convert.ToBase64String(new byte[16]),
            data = data ?? Convert.ToBase64String(Encoding.UTF8.GetBytes("sealed-payload")),
        };

    private static async Task<string> FirstShareId(HttpClient recipient, CancellationToken ct)
    {
        var inbox = await recipient.GetStringAsync("/api/shares", ct);
        using var parsed = JsonDocument.Parse(inbox);
        return parsed.RootElement[0].GetProperty("id").GetString()!;
    }

    [Fact]
    public async Task ASharedItemLandsInTheRecipientsInboxAndNotTheSenders()
    {
        using var server = new VaultServer();
        using var alice = server.ClientFor(Alice, "Alice");
        using var bob = server.ClientFor(Bob);
        var ct = TestContext.Current.CancellationToken;

        var posted = await alice.PostAsJsonAsync("/api/shares", Envelope(Bob), ct);
        posted.StatusCode.Should().Be(HttpStatusCode.Created);

        var bobsInbox = await bob.GetStringAsync("/api/shares", ct);
        var alicesInbox = await alice.GetStringAsync("/api/shares", ct);

        bobsInbox.Should().Contain("prod db");
        alicesInbox.Should().NotContain("prod db");
    }

    [Fact]
    public async Task TheSenderIdentityIsStampedFromTheTokenNotTheRequestBody()
    {
        using var server = new VaultServer();
        using var alice = server.ClientFor(Alice, "Alice");
        using var bob = server.ClientFor(Bob);
        var ct = TestContext.Current.CancellationToken;

        await alice.PostAsJsonAsync("/api/shares", Envelope(Bob), ct);

        var inbox = await bob.GetStringAsync("/api/shares", ct);

        inbox.Should().Contain(Alice);
    }

    [Fact]
    public async Task SharingWithSomeoneOutsideMyDomainIsForbidden()
    {
        using var server = new VaultServer();
        using var alice = server.ClientFor(Alice);
        var ct = TestContext.Current.CancellationToken;

        var response = await alice.PostAsJsonAsync("/api/shares", Envelope("eve@evil.example"), ct);

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task AMalformedEnvelopeIsRefused()
    {
        using var server = new VaultServer();
        using var alice = server.ClientFor(Alice);
        var ct = TestContext.Current.CancellationToken;

        var response = await alice.PostAsJsonAsync(
            "/api/shares", new { toEmail = Bob, entityName = "", data = "!!!not-base64!!!" }, ct);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task AnOversizePayloadIsRefused()
    {
        using var server = new VaultServer();
        using var alice = server.ClientFor(Alice);
        var ct = TestContext.Current.CancellationToken;

        var tooBig = Convert.ToBase64String(new byte[2 * 1024 * 1024]);

        var response = await alice.PostAsJsonAsync("/api/shares", Envelope(Bob, "big", tooBig), ct);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task OnlyTheRecipientCanDeleteAnInboxItem()
    {
        using var server = new VaultServer();
        using var alice = server.ClientFor(Alice);
        using var bob = server.ClientFor(Bob);
        var ct = TestContext.Current.CancellationToken;

        await alice.PostAsJsonAsync("/api/shares", Envelope(Bob), ct);
        var id = await FirstShareId(bob, ct);

        var bySender = await alice.DeleteAsync($"/api/shares/{id}", ct);
        bySender.StatusCode.Should().Be(HttpStatusCode.NotFound);

        var byRecipient = await bob.DeleteAsync($"/api/shares/{id}", ct);
        byRecipient.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var afterwards = await bob.GetStringAsync("/api/shares", ct);
        afterwards.Should().NotContain("prod db");
    }

    [Fact]
    public async Task AShareIdThatTriesToEscapeTheInboxDirectoryIsRefused()
    {
        using var server = new VaultServer();
        using var bob = server.ClientFor(Bob);
        var ct = TestContext.Current.CancellationToken;

        var response = await bob.DeleteAsync("/api/shares/..%2f..%2fetc%2fpasswd", ct);

        response.StatusCode.Should().BeOneOf(HttpStatusCode.NotFound, HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task DeletingMyAccountEmptiesMyInbox()
    {
        using var server = new VaultServer();
        using var alice = server.ClientFor(Alice);
        using var bob = server.ClientFor(Bob);
        var ct = TestContext.Current.CancellationToken;

        await alice.PostAsJsonAsync("/api/shares", Envelope(Bob), ct);
        await bob.DeleteAsync("/api/vault", ct);

        var inbox = await bob.GetStringAsync("/api/shares", ct);

        inbox.Should().NotContain("prod db");
    }
}
