using System.Net;
using System.Text.Json;
using FluentAssertions;

namespace CredVaultServer.Tests;

/// <summary>
/// <c>PUT /api/org/members/{email}/active</c> — the admin's block and unblock, and the row each real
/// transition leaves. Idempotent by design (<c>204</c> whether or not anything changed), refusing what the
/// role upsert refuses for the same reasons, and unable to be failed by the log it writes to afterwards.
/// </summary>
[Collection(ServerCollection.Name)]
public sealed class OrgBlockingAdminTests
{
    private const string OtherDomain = "other.test";

    private static string Alice => $"alice@{VaultServer.Domain}";

    private static string Bob => $"bob@{VaultServer.Domain}";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static VaultServer TwoCompanyServer() => new(new Dictionary<string, string?>
    {
        ["Vault__CorpRecovery__OfficerEmails"] = Corp.Officers,
        ["Vault__CorpRecovery__Threshold"] = "2",
        ["Vault__AllowedDomains"] = $"{VaultServer.Domain},{OtherDomain}",
    });

    private static async Task<JsonElement> RosterEntryAsync(HttpClient admin, string email)
    {
        var list = await Corp.BodyAsync(await admin.GetAsync("/api/org/members", Ct));
        return list.EnumerateArray().Single(e => e.GetProperty("email").GetString() == email);
    }

    [Fact]
    public async Task BlockingAnswers204AndTheRosterShowsThePersonInactive()
    {
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var bob = server.ClientFor(Bob);
        await Corp.SyncAsync(bob);

        var put = await Corp.SetActiveAsync(cto, Bob, active: false);

        put.StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await RosterEntryAsync(cto, Bob)).GetProperty("active").GetBoolean().Should().BeFalse();
        Corp.ReadRecord(server, Bob).Active.Should().BeFalse();
    }

    [Fact]
    public async Task TheBlockedPersonIsRefusedOnTheVeryNextRequest()
    {
        // The whole promise of the epic in one request: an admin blocks somebody, and their next call — a
        // vault read that was served a moment ago — meets the 403 with the reason header.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var bob = server.ClientFor(Bob);
        await Corp.SyncAsync(bob);
        (await bob.GetAsync("/api/vault", Ct)).StatusCode.Should().Be(HttpStatusCode.OK, "precondition: served");

        (await Corp.SetActiveAsync(cto, Bob, active: false)).StatusCode.Should().Be(HttpStatusCode.NoContent);
        var refused = await bob.GetAsync("/api/vault", Ct);

        refused.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        refused.Headers.GetValues(CallerStanding.ReasonHeader).Should().Equal([CallerStanding.AccountDeactivated]);
    }

    [Fact]
    public async Task BlockingTwiceIsIdempotentAndLeavesExactlyOneRow()
    {
        // The second PUT changes nothing, so it is a 204 and NO row: the log records transitions, and
        // "blocked, again" is not one. Decided against UpsertResult.Before, the record the write replaced.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var bob = server.ClientFor(Bob);
        await Corp.SyncAsync(bob);

        (await Corp.SetActiveAsync(cto, Bob, active: false)).StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await Corp.SetActiveAsync(cto, Bob, active: false)).StatusCode.Should().Be(HttpStatusCode.NoContent);

        var row = Corp.Rows(server, OrgEventKinds.MemberBlocked).Should().ContainSingle().Subject;
        row.Actor.Should().Be(Corp.Cto);
        row.Subject.Should().Be(Bob);
        Corp.Rows(server, OrgEventKinds.MemberUnblocked).Should().BeEmpty();
    }

    [Fact]
    public async Task UnblockingRestoresThePersonAndLeavesOneUnblockedRow()
    {
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var bob = server.ClientFor(Bob);
        await Corp.SyncAsync(bob);
        await Corp.SetActiveAsync(cto, Bob, active: false);

        var put = await Corp.SetActiveAsync(cto, Bob, active: true);
        var served = await bob.GetAsync("/api/vault", Ct);

        put.StatusCode.Should().Be(HttpStatusCode.NoContent);
        served.StatusCode.Should().Be(HttpStatusCode.OK, "reversible — decision 5");
        served.Headers.Contains(CallerStanding.ReasonHeader).Should().BeFalse();
        var row = Corp.Rows(server, OrgEventKinds.MemberUnblocked).Should().ContainSingle().Subject;
        row.Actor.Should().Be(Corp.Cto);
        row.Subject.Should().Be(Bob);
        Corp.Rows(server, OrgEventKinds.MemberBlocked).Should().ContainSingle("the earlier block is still on the record");
    }

    [Fact]
    public async Task ActivatingSomebodyAlreadyActiveIs204AndLeavesNoRowAtAll()
    {
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var bob = server.ClientFor(Bob);
        await Corp.SyncAsync(bob);

        var put = await Corp.SetActiveAsync(cto, Bob, active: true);

        put.StatusCode.Should().Be(HttpStatusCode.NoContent);
        Corp.Rows(server, OrgEventKinds.MemberBlocked).Should().BeEmpty();
        Corp.Rows(server, OrgEventKinds.MemberUnblocked).Should().BeEmpty();
    }

    [Fact]
    public async Task BlockingSomebodyWhoNeverSyncedCreatesTheRecordInactive()
    {
        // The upsert creates, as the role upsert does: an admin may shut a door before the person has
        // ever opened it. The record carries the admin's stamp and the registered row names the admin.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var bob = server.ClientFor(Bob);

        (await Corp.SetActiveAsync(cto, Bob, active: false)).StatusCode.Should().Be(HttpStatusCode.NoContent);

        var record = Corp.ReadRecord(server, Bob);
        record.Active.Should().BeFalse();
        record.UpdatedBy.Should().Be(Corp.Cto);
        Corp.Rows(server, OrgEventKinds.MemberRegistered).Should().ContainSingle().Which.Actor.Should().Be(Corp.Cto);
        Corp.Rows(server, OrgEventKinds.MemberBlocked).Should().ContainSingle();
        (await bob.GetAsync("/api/vault", Ct)).StatusCode.Should().Be(HttpStatusCode.Forbidden, "the first sync never happens");
    }

    [Fact]
    public async Task AnOfficerTargetIs409AndNothingIsWritten()
    {
        // The roster is configuration, and refusing an officer would lock the break-glass quorum out.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        const string lead = "lead@example.com";

        var put = await Corp.SetActiveAsync(cto, lead, active: false);

        (await Corp.RefusalAsync(put, HttpStatusCode.Conflict)).Should().Contain("officer");
        File.Exists(Corp.RecordPath(server, lead)).Should().BeFalse();
        Corp.Rows(server, OrgEventKinds.MemberBlocked).Should().BeEmpty();
    }

    [Fact]
    public async Task AnOfficerTargetIs409EvenWhenTheirOwnRecordCannotBeRead()
    {
        // Two refusals are true at once and the order decides something: 409 says "an officer can never be
        // blocked", 503 says "come back and try again". Answering 503 would invite a retry that can never
        // succeed, and would make a corrupt file look like the reason an officer is protected. The officer
        // check reads configuration and never opens the record, so it goes first — and stays first: the
        // same precedence the caller gate applies when it passes an officer whose record will not parse.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        const string lead = "lead@example.com";
        using (var leadClient = server.ClientFor(lead))
        {
            await Corp.SyncAsync(leadClient);
        }
        await Corp.CorruptRecordAsync(server, lead);

        var put = await Corp.SetActiveAsync(cto, lead, active: false);

        (await Corp.RefusalAsync(put, HttpStatusCode.Conflict)).Should().Contain("officer");
        put.Headers.RetryAfter.Should().BeNull("a retry cannot change the answer");
        (await File.ReadAllTextAsync(Corp.RecordPath(server, lead), Ct)).Should().Be(Corp.Garbage);
    }

    [Fact]
    public async Task ACrossDomainTargetIs403AndNothingIsWritten()
    {
        using var server = TwoCompanyServer();
        using var cto = server.ClientFor(Corp.Cto);
        var outsider = $"carol@{OtherDomain}";

        var put = await Corp.SetActiveAsync(cto, outsider, active: false);

        (await Corp.RefusalAsync(put, HttpStatusCode.Forbidden)).Should().Contain("domain");
        File.Exists(Corp.RecordPath(server, outsider)).Should().BeFalse();
    }

    [Fact]
    public async Task AMalformedTargetIs400()
    {
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);

        var put = await Corp.SetActiveAsync(cto, "not-an-email", active: false);

        (await Corp.RefusalAsync(put, HttpStatusCode.BadRequest)).Should().NotBeNullOrWhiteSpace();
        Directory.Exists(Path.Combine(Corp.OrgDir(server), "members")).Should().BeFalse();
    }

    [Fact]
    public async Task ABodyWithNoActiveFieldIs400NeverAFalseTheDeserializerInvented()
    {
        // `active` is nullable for the reason SetSettingsRequest documents: a deserializer runs no defaults,
        // a positional bool omitted by the client binds to false, and false here BLOCKS somebody. `{}`
        // must be a 400, and so must an explicit null and a body that is not JSON.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var bob = server.ClientFor(Bob);
        await Corp.SyncAsync(bob);

        var empty = await Corp.PutJsonAsync(cto, $"/api/org/members/{Bob}/active", "{}");
        var nul = await Corp.PutJsonAsync(cto, $"/api/org/members/{Bob}/active", """{"active":null}""");
        var garbage = await Corp.PutJsonAsync(cto, $"/api/org/members/{Bob}/active", "{ not json");

        (await Corp.RefusalAsync(empty, HttpStatusCode.BadRequest)).Should().Contain("active");
        (await Corp.RefusalAsync(nul, HttpStatusCode.BadRequest)).Should().Contain("active");
        (await Corp.RefusalAsync(garbage, HttpStatusCode.BadRequest)).Should().NotBeNullOrWhiteSpace();
        Corp.ReadRecord(server, Bob).Active.Should().BeTrue("none of the three may have blocked anybody");
        (await bob.GetAsync("/api/vault", Ct)).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task ATargetWhoseRecordCannotBeReadIs503AndTheFileIsLeftAlone()
    {
        // Overwriting an unreadable record would start from the default — active — and a default written
        // over a blocked developer's corrupt record is an unblock nobody ordered.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var bob = server.ClientFor(Bob);
        await Corp.SyncAsync(bob);
        await Corp.CorruptRecordAsync(server, Bob);

        var put = await Corp.SetActiveAsync(cto, Bob, active: true);

        (await Corp.RefusalAsync(put, HttpStatusCode.ServiceUnavailable)).Should().NotBeNullOrWhiteSpace();
        put.Headers.RetryAfter.Should().NotBeNull();
        (await File.ReadAllTextAsync(Corp.RecordPath(server, Bob), Ct)).Should().Be(Corp.Garbage);
    }

    [Fact]
    public async Task ANonAdminIs403AndBlocksNobody()
    {
        using var server = Corp.Server();
        using var alice = server.ClientFor(Alice);
        using var bob = server.ClientFor(Bob);
        await Corp.SyncAsync(alice);
        await Corp.SyncAsync(bob);

        var put = await Corp.SetActiveAsync(alice, Bob, active: false);

        (await Corp.RefusalAsync(put, HttpStatusCode.Forbidden)).Should().NotBeNullOrWhiteSpace();
        Corp.ReadRecord(server, Bob).Active.Should().BeTrue();
        (await bob.GetAsync("/api/vault", Ct)).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task WithoutATokenItIs401WithAJsonBody()
    {
        using var server = Corp.Server();
        using var anonymous = server.CreateClient();

        var put = await Corp.PutJsonAsync(anonymous, $"/api/org/members/{Bob}/active", """{"active":false}""");

        (await Corp.RefusalAsync(put, HttpStatusCode.Unauthorized)).Should().NotBeNullOrWhiteSpace();
    }

    [Fact]
    public async Task UpdatedByComesFromTheTokenEvenWhenTheBodyClaimsOtherwise()
    {
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var bob = server.ClientFor(Bob);
        await Corp.SyncAsync(bob);

        var put = await Corp.PutJsonAsync(
            cto,
            $"/api/org/members/{Bob}/active",
            """{"active":false,"updatedBy":"mallory@example.com","updatedAt":1}""");

        put.StatusCode.Should().Be(HttpStatusCode.NoContent);
        var record = Corp.ReadRecord(server, Bob);
        record.Active.Should().BeFalse();
        record.UpdatedBy.Should().Be(Corp.Cto, "the stamp is the token's; the body cannot name an author");
        record.UpdatedAt.Should().BeGreaterThan(1);
    }

    [Fact]
    public async Task ABlockStillAnswers204WhenTheEventLogCannotBeWritten()
    {
        // The row is appended after the record has landed, and a failed append never fails the mutation:
        // a 500 for a block that happened would send an admin retrying — and the person is already refused.
        using var server = Corp.Server();
        Corp.BlockTheEventLog(server);
        using var cto = server.ClientFor(Corp.Cto);
        using var bob = server.ClientFor(Bob);

        var put = await Corp.SetActiveAsync(cto, Bob, active: false);

        put.StatusCode.Should().Be(HttpStatusCode.NoContent);
        Corp.ReadRecord(server, Bob).Active.Should().BeFalse("the block is on disk whatever the log did");
        (await bob.GetAsync("/api/vault", Ct)).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        Corp.EventRows(server).Should().BeEmpty("nothing could be appended under a file");
    }

    [Fact]
    public async Task ABlockDoesNotTouchTheRoleOrTheShareDefault()
    {
        // The edit is `r with { Active = ... }` and nothing else: a developer who is blocked and later
        // re-admitted must come back as the developer they were, not as the default member who may export.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var bob = server.ClientFor(Bob);
        await Corp.SyncAsync(bob);
        await Corp.SetMemberAsync(cto, Bob, role: MemberRole.Dev, shareDefault: ShareDefaults.None);

        await Corp.SetActiveAsync(cto, Bob, active: false);
        await Corp.SetActiveAsync(cto, Bob, active: true);

        var record = Corp.ReadRecord(server, Bob);
        record.Role.Should().Be(MemberRole.Dev);
        record.ShareDefault.Should().Be(ShareDefaults.None);
        Corp.Rows(server, OrgEventKinds.MemberRoleChanged).Should().ContainSingle("only the admin's own role edit, never the block");
    }
}
