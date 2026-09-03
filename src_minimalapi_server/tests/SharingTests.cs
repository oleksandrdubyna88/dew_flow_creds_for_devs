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

    /// <summary>The same envelope, plus the AAD form the client sealed it in (contract 2).</summary>
    private static object EnvelopeWithFormat(string toEmail, int format) =>
        new
        {
            toEmail,
            entityName = "prod db",
            entityKind = "db",
            salt = Convert.ToBase64String(new byte[16]),
            iv = Convert.ToBase64String(new byte[12]),
            tag = Convert.ToBase64String(new byte[16]),
            data = Convert.ToBase64String(Encoding.UTF8.GetBytes("sealed-payload")),
            format,
        };

    private static async Task<JsonElement> FirstShare(HttpClient recipient, CancellationToken ct)
    {
        var inbox = await recipient.GetStringAsync("/api/shares", ct);
        return JsonDocument.Parse(inbox).RootElement[0].Clone();
    }

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
    public async Task AShareThatOmitsEntityKindIsAcceptedWithTheDefaultKindRatherThanCrashing()
    {
        // `entityKind` has a default on the record, so the wire contract says a client may omit it —
        // and every envelope in this file sends it, which is why nothing here ever exercised the
        // omission. The `.http` contract suite did, on its first run, and the answer was 500: the
        // source-generated deserializer leaves the property NULL rather than running the record's
        // initializer, and `EntityKind.Length` in IsValid() then dereferences it.
        //
        // A 500 is never the right answer to a well-formed request, and this one is reachable by
        // anybody who can authenticate.
        using var server = new VaultServer();
        using var alice = server.ClientFor(Alice, "Alice");
        using var bob = server.ClientFor(Bob);
        var ct = TestContext.Current.CancellationToken;

        var posted = await alice.PostAsJsonAsync(
            "/api/shares",
            new
            {
                toEmail = Bob,
                entityName = "prod db",
                salt = Convert.ToBase64String(new byte[16]),
                iv = Convert.ToBase64String(new byte[12]),
                tag = Convert.ToBase64String(new byte[16]),
                data = Convert.ToBase64String(Encoding.UTF8.GetBytes("sealed-payload")),
            },
            ct);

        posted.StatusCode.Should().Be(
            HttpStatusCode.Created,
            "omitting an optional field must not reach an unhandled NullReferenceException");

        var share = await FirstShare(bob, ct);
        share.GetProperty("entityKind").GetString().Should().Be(
            "credential",
            "the record's documented default is what an omitted kind means");
    }

    [Fact]
    public async Task AShareWhoseEntityKindIsExplicitlyNullIsRefusedRatherThanCrashing()
    {
        // The same dereference by the other route. A client that serialises its optional field as
        // `null` instead of omitting it is ordinary, and it must not be able to produce a 500.
        using var server = new VaultServer();
        using var alice = server.ClientFor(Alice, "Alice");
        var ct = TestContext.Current.CancellationToken;

        var posted = await alice.PostAsJsonAsync(
            "/api/shares",
            new
            {
                toEmail = Bob,
                entityName = "prod db",
                entityKind = (string?)null,
                salt = Convert.ToBase64String(new byte[16]),
                iv = Convert.ToBase64String(new byte[12]),
                tag = Convert.ToBase64String(new byte[16]),
                data = Convert.ToBase64String(Encoding.UTF8.GetBytes("sealed-payload")),
            },
            ct);

        posted.StatusCode.Should().Be(HttpStatusCode.Created);
    }

    [Fact]
    public async Task TheShareFormatReachesTheRecipientUntouched()
    {
        // The field the recipient cannot open a bound share without. It was missing until
        // contract 2, so every share posted here by extension 0.82.1..0.87 arrived with no way
        // to say which fields its AAD covered — and was reported as sent by a build too old.
        using var server = new VaultServer();
        using var alice = server.ClientFor(Alice, "Alice");
        using var bob = server.ClientFor(Bob);
        var ct = TestContext.Current.CancellationToken;

        await alice.PostAsJsonAsync("/api/shares", EnvelopeWithFormat(Bob, 3), ct);

        var share = await FirstShare(bob, ct);
        share.GetProperty("format").ValueKind.Should().Be(
            JsonValueKind.Number,
            "a dropped format leaves the recipient unable to know which fields the AAD covered");
        share.GetProperty("format").GetInt32().Should().Be(3);
    }

    [Fact]
    public async Task AShareWithNoFormatKeepsNoneRatherThanGainingOne()
    {
        // A client older than contract 2 sends no `format`, and an invented default would be
        // read as a binding it never applied.
        using var server = new VaultServer();
        using var alice = server.ClientFor(Alice, "Alice");
        using var bob = server.ClientFor(Bob);
        var ct = TestContext.Current.CancellationToken;

        await alice.PostAsJsonAsync("/api/shares", Envelope(Bob), ct);

        var share = await FirstShare(bob, ct);
        // ABSENT, never `null`: a released extension's isShareItem accepts a number or nothing,
        // and drops any item carrying a null — which empties the inbox instead of explaining it.
        share.TryGetProperty("format", out _).Should().BeFalse();
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

    /// <summary>
    /// The size cap counted the sealed fields and the entity NAME, and nothing else.
    /// `entityKind` is a free string that is never routed on, never hashed into a path,
    /// and never bounded — so a same-domain colleague could keep `toEmail` pointing at a
    /// real victim, pad `entityKind` to megabytes, and slip past `maxShareBytes` entirely.
    /// The ceiling was then Kestrel's global body limit, ~8 MB a request, against an inbox
    /// documented as holding 500 items.
    /// </summary>
    [Fact]
    public async Task AShareThatHidesItsBulkInAnUncountedFieldIsRefused()
    {
        using var server = new VaultServer();
        using var alice = server.ClientFor(Alice, "Alice");
        var ct = TestContext.Current.CancellationToken;

        var smuggled = new
        {
            toEmail = Bob,
            entityName = "prod db",
            entityKind = new string('k', 2 * 1024 * 1024),
            salt = Convert.ToBase64String(new byte[16]),
            iv = Convert.ToBase64String(new byte[12]),
            tag = Convert.ToBase64String(new byte[16]),
            data = Convert.ToBase64String(Encoding.UTF8.GetBytes("tiny")),
        };

        var posted = await alice.PostAsJsonAsync("/api/shares", smuggled, ct);

        posted.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    /// <summary>
    /// Every field a client controls counts toward the cap, not merely the ones that
    /// happen to be encrypted — a cap that can be walked around is not a cap.
    /// </summary>
    [Fact]
    public async Task TheSizeCapCountsEveryClientControlledField()
    {
        using var server = new VaultServer();
        using var alice = server.ClientFor(Alice, "Alice");
        var ct = TestContext.Current.CancellationToken;

        var longName = await alice.PostAsJsonAsync(
            "/api/shares",
            Envelope(Bob, entityName: new string('n', 600)),
            ct);

        longName.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }
}
