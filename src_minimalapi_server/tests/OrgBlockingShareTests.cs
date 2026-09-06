using System.Net;
using System.Net.Http.Json;
using System.Text;
using FluentAssertions;

namespace CredVaultServer.Tests;

/// <summary>
/// The recipient half of blocking, which the story split found missing: the gate refuses a blocked person
/// as a CALLER, and nothing stopped a colleague from addressing a new share TO them.
/// </summary>
/// <remarks>
/// <para>A blocked person is hidden from <c>/api/team</c>, so this needs somebody who types the address or
/// whose client remembers it — the ordinary case a week after a block. Without this rule the share lands
/// in an inbox its owner cannot open (they are refused at the door), waits out the 31-day prune, and
/// becomes readable the moment somebody is re-admitted: material sent while a person was locked out,
/// delivered by the unblock. The sender meanwhile has a receipt saying it was sent, and no way to learn it
/// never arrived.</para>
///
/// <para><b>The refusal carries no <c>X-Creds-Reason</c>.</b> That header is an instruction to a client
/// about its OWN account — lock it, purge the key material — and this response is about somebody else's.
/// An honest client that matched the header here would lock the innocent sender out of their own vault.</para>
/// </remarks>
[Collection(ServerCollection.Name)]
public sealed class OrgBlockingShareTests
{
    private static string Alice => $"alice@{VaultServer.Domain}";

    private static string Bob => $"bob@{VaultServer.Domain}";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static object Envelope(string toEmail) =>
        new
        {
            toEmail,
            entityName = "prod db",
            entityKind = "db",
            salt = Convert.ToBase64String(new byte[16]),
            iv = Convert.ToBase64String(new byte[12]),
            tag = Convert.ToBase64String(new byte[16]),
            data = Convert.ToBase64String(Encoding.UTF8.GetBytes("sealed-payload")),
        };

    private static Task<HttpResponseMessage> ShareAsync(HttpClient sender, string toEmail) =>
        sender.PostAsJsonAsync("/api/shares", Envelope(toEmail), Ct);

    [Fact]
    public async Task ASharePostToABlockedRecipientIsRefusedAndNothingLandsInTheirInbox()
    {
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = server.ClientFor(Alice, "Alice");
        using var bob = server.ClientFor(Bob);
        await Corp.SyncAsync(bob);
        await Corp.SetActiveAsync(cto, Bob, active: false);

        var share = await ShareAsync(alice, Bob);

        share.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await share.Content.ReadAsStringAsync(Ct)).Should().ContainEquivalentOf("deactivated");
        Directory.Exists(Path.Combine(server.DataDir, "shares", VaultStore.KeyFor(Bob)))
            .Should().BeFalse("a refused share creates no inbox at all");
        (await alice.GetStringAsync("/api/shares/sent", Ct)).Should().Be("[]", "and no receipt for a share that never went");
    }

    [Fact]
    public async Task TheRefusalForABlockedRecipientCarriesNoReasonHeader()
    {
        // The sender's own account is fine. A header saying `account-deactivated` on their response would
        // tell an honest client to lock the wrong person's vault.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = server.ClientFor(Alice, "Alice");
        using var bob = server.ClientFor(Bob);
        await Corp.SyncAsync(bob);
        await Corp.SetActiveAsync(cto, Bob, active: false);

        var share = await ShareAsync(alice, Bob);

        share.Headers.Contains(CallerStanding.ReasonHeader).Should().BeFalse();
        (await alice.GetAsync("/api/vault", Ct)).StatusCode.Should()
            .NotBe(HttpStatusCode.Forbidden, "the sender's own account is untouched — she has no vault yet, that is all");
    }

    [Fact]
    public async Task ASharePostToARecipientWhoseRecordCannotBeReadIs503AndNotADelivery()
    {
        // The same fail-closed rule the caller gate applies to itself: one corrupt record must not let a
        // share through to somebody who may be blocked. Temporary, and the header says to come back.
        using var server = Corp.Server();
        using var alice = server.ClientFor(Alice, "Alice");
        using var bob = server.ClientFor(Bob);
        await Corp.SyncAsync(bob);
        await Corp.CorruptRecordAsync(server, Bob);

        var share = await ShareAsync(alice, Bob);

        share.StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable);
        share.Headers.RetryAfter.Should().NotBeNull();
        (await alice.GetStringAsync("/api/shares/sent", Ct)).Should().Be("[]");
    }

    [Fact]
    public async Task ASharePostToAnActiveColleagueStillLands()
    {
        // The control. The rule must cost an ordinary share nothing.
        using var server = Corp.Server();
        using var alice = server.ClientFor(Alice, "Alice");
        using var bob = server.ClientFor(Bob);
        await Corp.SyncAsync(bob);

        (await ShareAsync(alice, Bob)).StatusCode.Should().Be(HttpStatusCode.Created);

        (await bob.GetStringAsync("/api/shares", Ct)).Should().Contain("prod db");
    }

    [Fact]
    public async Task ASharePostToSomebodyWhoNeverSyncedStillLands()
    {
        // No record is not a block: bob may be a new hire whose client has not run yet, and a share
        // waiting for him is exactly what an inbox is for.
        using var server = Corp.Server();
        using var alice = server.ClientFor(Alice, "Alice");
        using var bob = server.ClientFor(Bob);

        (await ShareAsync(alice, Bob)).StatusCode.Should().Be(HttpStatusCode.Created);

        (await bob.GetStringAsync("/api/shares", Ct)).Should().Contain("prod db");
    }

    [Fact]
    public async Task PersonalModeConsultsNoRegistryWhenAShareIsAddressed()
    {
        // The rule is corporate. A personal server has no roster to consult and must not stat one.
        using var server = new VaultServer();
        using var alice = server.ClientFor(Alice, "Alice");
        using var bob = server.ClientFor(Bob);
        Directory.CreateDirectory(Path.Combine(server.DataDir, "org", "members"));
        await File.WriteAllTextAsync(
            Path.Combine(server.DataDir, "org", "members", VaultStore.KeyFor(Bob) + ".json"),
            Corp.Garbage,
            Ct);

        (await ShareAsync(alice, Bob)).StatusCode.Should().Be(HttpStatusCode.Created);

        (await bob.GetStringAsync("/api/shares", Ct)).Should().Contain("prod db");
    }
}
