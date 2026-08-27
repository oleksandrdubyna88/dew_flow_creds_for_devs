using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;

namespace CredVaultServer.Tests;

/// <summary>
/// The setup ceremony, server side: one sealed Shamir share per officer, an acknowledgement
/// that means "stored durably", and a key that may only be published once every officer has
/// answered.
/// </summary>
[Collection(ServerCollection.Name)]
public sealed class OrgRecoverySetupTests
{
    private const string Cto = "cto@example.com";
    private const string Lead = "lead@example.com";
    private const string Devops = "devops@example.com";
    private const string Officers = $"{Cto},{Lead},{Devops}";

    private static string Outsider => $"alice@{VaultServer.Domain}";

    private static VaultServer Server() => new(new Dictionary<string, string?>
    {
        ["Vault__CorpRecovery__OfficerEmails"] = Officers,
        ["Vault__CorpRecovery__Threshold"] = "2",
    });

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    /// <summary>A well-formed sealed share. The server never opens it; it checks the shape.</summary>
    private static object Invite(string setupId, string toEmail, int shareIndex) => new
    {
        setupId,
        toEmail,
        shareIndex,
        threshold = 2,
        totalShares = 3,
        salt = Convert.ToBase64String(new byte[16]),
        iv = Convert.ToBase64String(new byte[12]),
        tag = Convert.ToBase64String(new byte[16]),
        data = Convert.ToBase64String(new byte[48]),
    };

    /// <summary>32 raw bytes, base64 — the shape of an X25519 public key.</summary>
    private static string PublicKey(byte fill = 7) =>
        Convert.ToBase64String(Enumerable.Repeat(fill, 32).ToArray());

    private static async Task<string> SendInvitesAsync(VaultServer server, string setupId)
    {
        using var cto = server.ClientFor(Cto);
        var index = 1;
        foreach (var officer in new[] { Cto, Lead, Devops })
        {
            var posted = await cto.PostAsJsonAsync(
                "/api/org-recovery/invites", Invite(setupId, officer, index++), Ct);
            posted.StatusCode.Should().Be(HttpStatusCode.Created, $"the invite for {officer}");
        }
        return setupId;
    }

    private static async Task AckAllAsync(VaultServer server)
    {
        foreach (var officer in new[] { Cto, Lead, Devops })
        {
            using var client = server.ClientFor(officer);
            var inbox = await client.GetStringAsync("/api/org-recovery/invites", Ct);
            using var parsed = JsonDocument.Parse(inbox);
            foreach (var item in parsed.RootElement.EnumerateArray())
            {
                var id = item.GetProperty("id").GetString();
                var acked = await client.PostAsync($"/api/org-recovery/invites/{id}/ack", null, Ct);
                acked.StatusCode.Should().Be(HttpStatusCode.NoContent);
            }
        }
    }

    // ---------------------------------------------------------------- who may act

    [Fact]
    public async Task SomebodyOffTheRosterCannotTouchTheCeremonyAtAll()
    {
        // Not because the payloads are readable — they are opaque — but because these are the
        // levers: a stranger who can post an invite seats their own share where a real
        // officer's belongs, and the quorum silently includes them.
        using var server = Server();
        using var outsider = server.ClientFor(Outsider);

        var posted = await outsider.PostAsJsonAsync(
            "/api/org-recovery/invites", Invite(Guid.NewGuid().ToString(), Lead, 1), Ct);
        var listed = await outsider.GetAsync("/api/org-recovery/invites", Ct);

        posted.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        listed.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task AServerWithNoRosterRefusesTheCeremonyRatherThanRunningItForNobody()
    {
        using var server = new VaultServer();
        using var anyone = server.ClientFor(Outsider);

        var posted = await anyone.PostAsJsonAsync(
            "/api/org-recovery/invites", Invite(Guid.NewGuid().ToString(), Lead, 1), Ct);

        posted.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task AShareMayNotBeSentToSomebodyOutsideTheRoster()
    {
        // Without this an officer could seat a share with an accomplice the operator never
        // named, and a 2-of-3 would quietly become something they control alone.
        using var server = Server();
        using var cto = server.ClientFor(Cto);

        var posted = await cto.PostAsJsonAsync(
            "/api/org-recovery/invites", Invite(Guid.NewGuid().ToString(), Outsider, 1), Ct);

        posted.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await posted.Content.ReadAsStringAsync(Ct)).Should().Contain("not a recovery officer");
    }

    [Fact]
    public async Task ASplitThatDisagreesWithTheRosterIsRefused()
    {
        // Clients pin a fingerprint describing "2 of 3". Shares minted as 2-of-5 would
        // implement a different scheme behind that same pin.
        using var server = Server();
        using var cto = server.ClientFor(Cto);
        var wrong = new
        {
            setupId = Guid.NewGuid().ToString(),
            toEmail = Lead,
            shareIndex = 1,
            threshold = 2,
            totalShares = 5,
            salt = Convert.ToBase64String(new byte[16]),
            iv = Convert.ToBase64String(new byte[12]),
            tag = Convert.ToBase64String(new byte[16]),
            data = Convert.ToBase64String(new byte[48]),
        };

        var posted = await cto.PostAsJsonAsync("/api/org-recovery/invites", wrong, Ct);

        posted.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await posted.Content.ReadAsStringAsync(Ct)).Should().Contain("2 of 3");
    }

    // ---------------------------------------------------------------- delivery

    [Fact]
    public async Task AnInviteReachesItsOfficerAndNobodyElse()
    {
        using var server = Server();
        var setupId = await SendInvitesAsync(server, Guid.NewGuid().ToString());

        using var lead = server.ClientFor(Lead);
        var leadsInbox = await lead.GetStringAsync("/api/org-recovery/invites", Ct);
        using var parsed = JsonDocument.Parse(leadsInbox);

        parsed.RootElement.GetArrayLength().Should().Be(1);
        var invite = parsed.RootElement[0];
        invite.GetProperty("toEmail").GetString().Should().Be(Lead);
        invite.GetProperty("setupId").GetString().Should().Be(setupId);
        invite.GetProperty("shareIndex").GetInt32().Should().Be(2);
    }

    [Fact]
    public async Task TheSenderIsStampedFromTheTokenAndNotAcceptedFromTheBody()
    {
        // The same rule as a shared secret, for a stronger reason: an invite a stranger could
        // attribute to the CTO is one an officer might accept into their own vault.
        using var server = Server();
        using var lead = server.ClientFor(Lead);
        var forged = new
        {
            setupId = Guid.NewGuid().ToString(),
            fromEmail = Cto, // the lie
            toEmail = Devops,
            shareIndex = 1,
            threshold = 2,
            totalShares = 3,
            salt = Convert.ToBase64String(new byte[16]),
            iv = Convert.ToBase64String(new byte[12]),
            tag = Convert.ToBase64String(new byte[16]),
            data = Convert.ToBase64String(new byte[48]),
        };

        (await lead.PostAsJsonAsync("/api/org-recovery/invites", forged, Ct))
            .StatusCode.Should().Be(HttpStatusCode.Created);

        using var devops = server.ClientFor(Devops);
        var inbox = await devops.GetStringAsync("/api/org-recovery/invites", Ct);
        using var parsed = JsonDocument.Parse(inbox);

        parsed.RootElement[0].GetProperty("fromEmail").GetString()
            .Should().Be(Lead, "the server stamps who actually called it");
    }

    [Fact]
    public async Task AcknowledgingRemovesItFromTheInboxAndCannotBeDoneForSomebodyElse()
    {
        using var server = Server();
        await SendInvitesAsync(server, Guid.NewGuid().ToString());

        using var lead = server.ClientFor(Lead);
        var inbox = await lead.GetStringAsync("/api/org-recovery/invites", Ct);
        using var parsed = JsonDocument.Parse(inbox);
        var id = parsed.RootElement[0].GetProperty("id").GetString();

        // Another officer holding the id has nothing to reach it with: the path names no owner.
        using var devops = server.ClientFor(Devops);
        (await devops.PostAsync($"/api/org-recovery/invites/{id}/ack", null, Ct))
            .StatusCode.Should().Be(HttpStatusCode.NotFound);

        (await lead.PostAsync($"/api/org-recovery/invites/{id}/ack", null, Ct))
            .StatusCode.Should().Be(HttpStatusCode.NoContent);
        var after = await lead.GetStringAsync("/api/org-recovery/invites", Ct);
        JsonDocument.Parse(after).RootElement.GetArrayLength().Should().Be(0);
    }

    [Fact]
    public async Task TheStatusEndpointNamesWhoHasNotAnsweredYet()
    {
        using var server = Server();
        var setupId = await SendInvitesAsync(server, Guid.NewGuid().ToString());

        using var cto = server.ClientFor(Cto);
        var before = await cto.GetStringAsync($"/api/org-recovery/invites/status?setupId={setupId}", Ct);
        using var parsedBefore = JsonDocument.Parse(before);

        parsedBefore.RootElement.GetProperty("total").GetInt32().Should().Be(3);
        parsedBefore.RootElement.GetProperty("pending")
            .EnumerateArray().Select(e => e.GetString())
            .Should().BeEquivalentTo(Cto, Lead, Devops);

        await AckAllAsync(server);
        var after = await cto.GetStringAsync($"/api/org-recovery/invites/status?setupId={setupId}", Ct);
        JsonDocument.Parse(after).RootElement.GetProperty("pending").GetArrayLength().Should().Be(0);
    }

    // ---------------------------------------------------------------- publishing

    [Fact]
    public async Task PublishingBeforeEveryoneHasAnsweredIsRefused()
    {
        // A key whose quorum cannot be assembled is recoverable-LOOKING and not recoverable,
        // which is the worst of the three possible states.
        using var server = Server();
        var setupId = await SendInvitesAsync(server, Guid.NewGuid().ToString());
        using var cto = server.ClientFor(Cto);

        var published = await cto.PostAsJsonAsync(
            "/api/org-recovery/setup",
            new { setupId, orgPublicKey = PublicKey(), rosterFingerprint = "" },
            Ct);

        published.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await published.Content.ReadAsStringAsync(Ct)).Should().Contain("have not acknowledged");
    }

    [Fact]
    public async Task OnceEveryoneHasAnsweredTheKeyPublishesAndTheConfigTurnsUsable()
    {
        using var server = Server();
        var setupId = await SendInvitesAsync(server, Guid.NewGuid().ToString());
        await AckAllAsync(server);
        using var cto = server.ClientFor(Cto);

        var published = await cto.PostAsJsonAsync(
            "/api/org-recovery/setup",
            new { setupId, orgPublicKey = PublicKey(), rosterFingerprint = "" },
            Ct);

        published.StatusCode.Should().Be(HttpStatusCode.OK);

        // And every account — not only officers — now sees a usable configuration.
        using var alice = server.ClientFor(Outsider);
        var config = JsonDocument.Parse(
            await alice.GetStringAsync("/api/org-recovery/config", Ct)).RootElement;
        config.GetProperty("setupComplete").GetBoolean().Should().BeTrue();
        config.GetProperty("orgPublicKey").GetString().Should().Be(PublicKey());
        config.GetProperty("orgPublicKeyFingerprint").GetString().Should().NotBeNullOrEmpty();
        config.GetProperty("publishedAt").GetInt64().Should().BeGreaterThan(0);
    }

    [Fact]
    public async Task RepublishingTheSameCeremonyIsIdempotent_ButSwappingItsKeyIsRefused()
    {
        // A retry after a dropped response must succeed. The same ceremony offering a DIFFERENT
        // key is not a retry, it is a swap, and it is the attack this endpoint has to refuse.
        using var server = Server();
        var setupId = await SendInvitesAsync(server, Guid.NewGuid().ToString());
        await AckAllAsync(server);
        using var cto = server.ClientFor(Cto);
        var body = new { setupId, orgPublicKey = PublicKey(), rosterFingerprint = "" };

        (await cto.PostAsJsonAsync("/api/org-recovery/setup", body, Ct))
            .StatusCode.Should().Be(HttpStatusCode.OK);
        (await cto.PostAsJsonAsync("/api/org-recovery/setup", body, Ct))
            .StatusCode.Should().Be(HttpStatusCode.OK, "a retry is idempotent");

        var swapped = await cto.PostAsJsonAsync(
            "/api/org-recovery/setup",
            new { setupId, orgPublicKey = PublicKey(9), rosterFingerprint = "" },
            Ct);

        swapped.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await swapped.Content.ReadAsStringAsync(Ct)).Should().Contain("already published a different key");
    }

    [Fact]
    public async Task APublicKeyOfTheWrongLengthIsRefused()
    {
        // 32 bytes or it is not an X25519 key, and a client sealing to a short one would
        // produce an escrow wrap nobody could ever open.
        using var server = Server();
        var setupId = await SendInvitesAsync(server, Guid.NewGuid().ToString());
        await AckAllAsync(server);
        using var cto = server.ClientFor(Cto);

        var published = await cto.PostAsJsonAsync(
            "/api/org-recovery/setup",
            new { setupId, orgPublicKey = Convert.ToBase64String(new byte[16]), rosterFingerprint = "" },
            Ct);

        published.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task AnInventedCeremonyCannotPublishAKey()
    {
        // The guard was "nobody is still pending", and PendingOfficersAsync can only report
        // officers who hold an invite FOR THAT setupId. A setupId that never existed has none,
        // so the count was zero and the publish went through — no invites, no shares, no quorum.
        // One officer could then make every vault on the server seal itself to a key they alone
        // hold. This is the most direct path to the whole product's secrets in the codebase.
        using var server = Server();
        using var cto = server.ClientFor(Cto);

        var published = await cto.PostAsJsonAsync(
            "/api/org-recovery/setup",
            new { setupId = Guid.NewGuid().ToString(), orgPublicKey = PublicKey(), rosterFingerprint = "" },
            Ct);

        published.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await published.Content.ReadAsStringAsync(Ct)).Should().Contain("no such ceremony");
    }

    [Fact]
    public async Task ACeremonyThatInvitedFewerOfficersThanTheRosterCannotPublish()
    {
        // The other half of the same hole: invite ONE officer, let them acknowledge, and the
        // "nobody pending" test passes with a two-thirds-empty quorum.
        using var server = Server();
        var setupId = Guid.NewGuid().ToString();
        using var cto = server.ClientFor(Cto);
        (await cto.PostAsJsonAsync("/api/org-recovery/invites", Invite(setupId, Cto, 1), Ct))
            .StatusCode.Should().Be(HttpStatusCode.Created);

        var inbox = await cto.GetStringAsync("/api/org-recovery/invites", Ct);
        using var parsed = JsonDocument.Parse(inbox);
        await cto.PostAsync(
            $"/api/org-recovery/invites/{parsed.RootElement[0].GetProperty("id").GetString()}/ack", null, Ct);

        var published = await cto.PostAsJsonAsync(
            "/api/org-recovery/setup",
            new { setupId, orgPublicKey = PublicKey(), rosterFingerprint = "" },
            Ct);

        published.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await published.Content.ReadAsStringAsync(Ct)).Should().Contain("1 of 3");
    }

    [Fact]
    public async Task OnlyTheOfficerWhoRanTheCeremonyMayPublishItsKey()
    {
        // Otherwise a second officer waits for somebody else's ceremony to complete and
        // publishes THEIR key against it, inheriting a legitimately-assembled quorum.
        using var server = Server();
        var setupId = await SendInvitesAsync(server, Guid.NewGuid().ToString());
        await AckAllAsync(server);
        using var lead = server.ClientFor(Lead);

        var published = await lead.PostAsJsonAsync(
            "/api/org-recovery/setup",
            new { setupId, orgPublicKey = PublicKey(9), rosterFingerprint = "" },
            Ct);

        published.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await published.Content.ReadAsStringAsync(Ct)).Should().Contain("did not run that ceremony");
    }
}
