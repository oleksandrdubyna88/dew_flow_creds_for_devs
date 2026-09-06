using System.Net;
using System.Text.Json;
using FluentAssertions;

namespace CredVaultServer.Tests;

/// <summary>
/// The admin's roster and the admin's upsert — <c>GET /api/org/members</c> and
/// <c>PUT /api/org/members/{email}</c> — and the rows each change leaves. The two refusals that were real
/// findings in the plan round are pinned here: a role written across a domain boundary, and an officer
/// "demoted" by a UI that would then be lying.
/// </summary>
[Collection(ServerCollection.Name)]
public sealed class OrgMembersAdminTests
{
    private const string OtherDomain = "other.test";

    private static string Alice => $"alice@{VaultServer.Domain}";

    private static string Bob => $"bob@{VaultServer.Domain}";

    private static string Outsider => $"carol@{OtherDomain}";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    /// <summary>A corp server whose <c>AllowedDomains</c> names two companies — the shape the cross-domain hole needed.</summary>
    private static VaultServer TwoCompanyServer(bool allowAnyDomain = false) => new(new Dictionary<string, string?>
    {
        ["Vault__CorpRecovery__OfficerEmails"] = Corp.Officers,
        ["Vault__CorpRecovery__Threshold"] = "2",
        ["Vault__AllowedDomains"] = $"{VaultServer.Domain},{OtherDomain}",
        ["Vault__AllowAnyDomain"] = allowAnyDomain ? "true" : "false",
    });

    private static async Task<JsonElement> ListAsync(HttpClient admin)
    {
        var response = await admin.GetAsync("/api/org/members", Ct);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        response.Content.Headers.ContentType!.MediaType.Should().Be("application/json");
        return await Corp.BodyAsync(response);
    }

    private static JsonElement Entry(JsonElement list, string email) =>
        list.EnumerateArray().Single(e => e.GetProperty("email").GetString() == email);

    [Fact]
    public async Task TheListIsScopedToTheAdminsDomainAndFlagsOfficers()
    {
        // Three people synced: Alice and the CTO at example.com, Carol at the other company this server
        // also serves. The CTO's list has the first two — and says which of them is on the roster, because
        // an officer cannot be given a registry role and a list that showed the CTO as a plain member
        // would invite exactly the edit the server refuses.
        using var server = TwoCompanyServer();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = server.ClientFor(Alice);
        using var carol = server.ClientFor(Outsider);
        await Corp.SyncAsync(cto);
        await Corp.SyncAsync(alice);
        await Corp.SyncAsync(carol);

        var list = await ListAsync(cto);

        list.EnumerateArray().Select(e => e.GetProperty("email").GetString()).Should().BeEquivalentTo([Alice, Corp.Cto]);
        Entry(list, Corp.Cto).GetProperty("isOfficer").GetBoolean().Should().BeTrue("the roster is reported beside the role");
        var entry = Entry(list, Alice);
        entry.GetProperty("isOfficer").GetBoolean().Should().BeFalse();
        entry.GetProperty("role").GetString().Should().Be(MemberRole.Member);
        entry.GetProperty("active").GetBoolean().Should().BeTrue();
        entry.GetProperty("shareDefault").GetString().Should().Be(ShareDefaults.Default);
        entry.GetProperty("projectIds").GetArrayLength().Should().Be(0);
        entry.GetProperty("updatedAt").GetInt64().Should().BePositive();
        entry.GetProperty("updatedBy").GetString().Should().Be(string.Empty, "nobody has edited a record the sync created");
    }

    [Fact]
    public async Task AnAdminMaySetARoleBeforeThePersonsFirstSync()
    {
        // The whole reason the upsert creates: Bob joins on Monday, the admin sets him up on Friday. The
        // record exists before Bob's first sync, the admin is its author, and the sync then finds it and
        // leaves it alone (story 2's insert-if-absent), so Bob's first policy is the one the admin chose.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var bob = server.ClientFor(Bob);

        var put = await Corp.SetMemberAsync(cto, Bob, role: MemberRole.Dev);

        put.StatusCode.Should().Be(HttpStatusCode.OK);
        var answered = await Corp.BodyAsync(put);
        answered.GetProperty("email").GetString().Should().Be(Bob);
        answered.GetProperty("role").GetString().Should().Be(MemberRole.Dev);
        answered.GetProperty("updatedBy").GetString().Should().Be(Corp.Cto);
        var created = Corp.ReadRecord(server, Bob);
        created.Role.Should().Be(MemberRole.Dev);
        created.UpdatedBy.Should().Be(Corp.Cto);

        var bytesBefore = await File.ReadAllBytesAsync(Corp.RecordPath(server, Bob), Ct);
        var writtenAt = File.GetLastWriteTimeUtc(Corp.RecordPath(server, Bob));

        (await Corp.SyncAsync(bob)).StatusCode.Should().Be(HttpStatusCode.NoContent);

        // The bytes and the mtime, not record equality: MemberRecord holds collections, and a record's
        // generated Equals compares those by REFERENCE, so two reads of one unchanged file are never
        // equal to each other. What the sync must not have done is rewrite the file, and that is a
        // property of the file.
        (await File.ReadAllBytesAsync(Corp.RecordPath(server, Bob), Ct)).Should().Equal(
            bytesBefore, "the sync found a record and left it alone");
        File.GetLastWriteTimeUtc(Corp.RecordPath(server, Bob)).Should().Be(writtenAt);
        Corp.ReadRecord(server, Bob).UpdatedBy.Should().Be(created.UpdatedBy);
        var me = await Corp.BodyAsync(await bob.GetAsync("/api/org/me", Ct));
        me.GetProperty("role").GetString().Should().Be(MemberRole.Dev);
        me.GetProperty("policy").GetProperty("export").GetBoolean().Should().BeFalse();
    }

    [Fact]
    public async Task CreatingARecordForANeverSyncedPersonLeavesAMemberRegisteredRowWithTheAdminAsActor()
    {
        // Two emitters, one kind: the sync hook with the person as actor, and this — the admin as actor.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);

        await Corp.SetMemberAsync(cto, Bob, role: MemberRole.Dev);

        var registered = Corp.Rows(server, OrgEventKinds.MemberRegistered).Should().ContainSingle().Subject;
        registered.Actor.Should().Be(Corp.Cto, "the admin registered Bob, not Bob");
        registered.Subject.Should().Be(Bob);
        registered.Detail.Should().Be(MemberRole.Dev, "the row carries the role the record was created with");
        var roleChanged = Corp.Rows(server, OrgEventKinds.MemberRoleChanged).Should().ContainSingle().Subject;
        roleChanged.Detail.Should().Contain(MemberRole.Member).And.Contain(MemberRole.Dev, "from the default the record started as");
    }

    [Fact]
    public async Task ACrossDomainTargetIs403AndNothingIsWritten()
    {
        // The hole two reviewers found independently: on a server serving two companies, an admin at one
        // could write a role for a person at the other. Refused exactly as the break-glass session start
        // refuses a cross-domain target.
        using var server = TwoCompanyServer();
        using var cto = server.ClientFor(Corp.Cto);

        var put = await Corp.SetMemberAsync(cto, Outsider, role: MemberRole.Dev);

        (await Corp.RefusalAsync(put, HttpStatusCode.Forbidden)).Should().Contain("domain");
        File.Exists(Corp.RecordPath(server, Outsider)).Should().BeFalse();
    }

    [Fact]
    public async Task ACrossDomainTargetIsAcceptedWhenTheDeploymentAllowsAnyDomain()
    {
        // Vault:AllowAnyDomain keeps its meaning: a deployment that turned domain scoping off gets none here.
        using var server = TwoCompanyServer(allowAnyDomain: true);
        using var cto = server.ClientFor(Corp.Cto);

        var put = await Corp.SetMemberAsync(cto, Outsider, role: MemberRole.Dev);

        put.StatusCode.Should().Be(HttpStatusCode.OK);
        Corp.ReadRecord(server, Outsider).Role.Should().Be(MemberRole.Dev);
    }

    [Fact]
    public async Task AnOfficerTargetIs409NeverASilentNoOp()
    {
        // The roster is configuration; changing it is a restart and a ceremony. A 200 here would let a UI
        // show the CTO demoted while the server kept admitting them.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        const string lead = "lead@example.com";

        var put = await Corp.SetMemberAsync(cto, lead, role: MemberRole.Dev);

        (await Corp.RefusalAsync(put, HttpStatusCode.Conflict)).Should().Contain("officer");
        File.Exists(Corp.RecordPath(server, lead)).Should().BeFalse("nothing was written for an officer");
        (await Corp.SetMemberAsync(cto, Corp.Cto, role: MemberRole.Member)).StatusCode.Should().Be(
            HttpStatusCode.Conflict, "an officer's own record is no exception");
    }

    [Fact]
    public async Task AnUnknownRoleOrShareDefaultIs400NamingTheLegalValues()
    {
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);

        var badRole = await Corp.SetMemberAsync(cto, Alice, role: "boss");
        var badShare = await Corp.SetMemberAsync(cto, Alice, shareDefault: "everyone");

        (await Corp.RefusalAsync(badRole, HttpStatusCode.BadRequest))
            .Should().Contain(MemberRole.Admin).And.Contain(MemberRole.Member).And.Contain(MemberRole.Dev);
        (await Corp.RefusalAsync(badShare, HttpStatusCode.BadRequest))
            .Should().Contain(ShareDefaults.Project).And.Contain(ShareDefaults.None);
        File.Exists(Corp.RecordPath(server, Alice)).Should().BeFalse("a refused request creates nothing");
    }

    [Fact]
    public async Task BothFieldsNullIs400NotASuccessThatChangesNothing()
    {
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);

        var empty = await Corp.PutJsonAsync(cto, $"/api/org/members/{Alice}", "{}");
        var nulls = await Corp.SetMemberAsync(cto, Alice);

        (await Corp.RefusalAsync(empty, HttpStatusCode.BadRequest)).Should().NotBeNullOrWhiteSpace();
        (await Corp.RefusalAsync(nulls, HttpStatusCode.BadRequest)).Should().NotBeNullOrWhiteSpace();
        File.Exists(Corp.RecordPath(server, Alice)).Should().BeFalse();
    }

    [Fact]
    public async Task AMalformedBodyIs400NotAnInternalError()
    {
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);

        var put = await Corp.PutJsonAsync(cto, $"/api/org/members/{Alice}", "{ not json");

        (await Corp.RefusalAsync(put, HttpStatusCode.BadRequest)).Should().NotBeNullOrWhiteSpace();
    }

    [Fact]
    public async Task AMalformedTargetEmailIs400()
    {
        // A path segment with no @ is not a person; without this it would hash to a key and be written.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);

        var put = await Corp.SetMemberAsync(cto, "not-an-email", role: MemberRole.Dev);

        (await Corp.RefusalAsync(put, HttpStatusCode.BadRequest)).Should().NotBeNullOrWhiteSpace();
        Directory.Exists(Path.Combine(Corp.OrgDir(server), "members")).Should().BeFalse();
    }

    [Fact]
    public async Task AShareDefaultForAMemberIsStoredAndTakesNoEffect()
    {
        // Stored, not refused: it only applies to a developer, and refusing it would stop an admin from
        // setting the shape first and demoting second. The policy shows it took no effect.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = server.ClientFor(Alice);
        await Corp.SyncAsync(alice);

        (await Corp.SetMemberAsync(cto, Alice, shareDefault: ShareDefaults.None)).StatusCode.Should().Be(HttpStatusCode.OK);

        var record = Corp.ReadRecord(server, Alice);
        record.Role.Should().Be(MemberRole.Member, "the role was not sent, so it was not touched");
        record.ShareDefault.Should().Be(ShareDefaults.None);
        var me = await Corp.BodyAsync(await alice.GetAsync("/api/org/me", Ct));
        me.GetProperty("shareDefault").GetString().Should().Be(ShareDefaults.None);
        me.GetProperty("policy").GetProperty("share").GetString().Should().Be(ShareDefaults.Any, "a member's policy ignores the share default");
    }

    [Fact]
    public async Task UpdatedByComesFromTheTokenEvenWhenTheBodyClaimsOtherwise()
    {
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);

        var put = await Corp.PutJsonAsync(
            cto,
            $"/api/org/members/{Alice}",
            """{"role":"dev","updatedBy":"mallory@example.com","updatedAt":1}""");

        put.StatusCode.Should().Be(HttpStatusCode.OK);
        var record = Corp.ReadRecord(server, Alice);
        record.UpdatedBy.Should().Be(Corp.Cto, "the stamp is the token's; the body cannot name an author");
        record.UpdatedAt.Should().BeGreaterThan(1);
    }

    [Fact]
    public async Task ARoleChangeLeavesExactlyOneRoleChangedRowAndNoOther()
    {
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = server.ClientFor(Alice);
        await Corp.SyncAsync(alice);

        await Corp.SetMemberAsync(cto, Alice, role: MemberRole.Dev);

        var row = Corp.Rows(server, OrgEventKinds.MemberRoleChanged).Should().ContainSingle().Subject;
        row.Actor.Should().Be(Corp.Cto);
        row.Subject.Should().Be(Alice);
        row.Detail.Should().Contain(MemberRole.Member).And.Contain(MemberRole.Dev, "from and to");
        Corp.Rows(server, OrgEventKinds.MemberShareDefaultChanged).Should().BeEmpty("the share default was not sent");
        Corp.Rows(server, OrgEventKinds.MemberRegistered).Should().ContainSingle("the sync registered Alice; the edit did not register her again");
    }

    [Fact]
    public async Task AShareDefaultChangeLeavesExactlyOneRowOfItsOwn()
    {
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = server.ClientFor(Alice);
        await Corp.SyncAsync(alice);

        await Corp.SetMemberAsync(cto, Alice, shareDefault: ShareDefaults.None);

        var row = Corp.Rows(server, OrgEventKinds.MemberShareDefaultChanged).Should().ContainSingle().Subject;
        row.Actor.Should().Be(Corp.Cto);
        row.Subject.Should().Be(Alice);
        row.Detail.Should().Contain(ShareDefaults.Project).And.Contain(ShareDefaults.None);
        Corp.Rows(server, OrgEventKinds.MemberRoleChanged).Should().BeEmpty();
    }

    [Fact]
    public async Task AChangeWhoseValueIsIdenticalLeavesNoRow()
    {
        // The log records what changed. An admin re-saving the role a person already has is a 200 and a
        // re-stamped record — and not a row saying member became member.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = server.ClientFor(Alice);
        await Corp.SyncAsync(alice);

        var put = await Corp.SetMemberAsync(cto, Alice, role: MemberRole.Member, shareDefault: ShareDefaults.Project);

        put.StatusCode.Should().Be(HttpStatusCode.OK);
        Corp.ReadRecord(server, Alice).UpdatedBy.Should().Be(Corp.Cto, "the write happened");
        Corp.Rows(server, OrgEventKinds.MemberRoleChanged).Should().BeEmpty();
        Corp.Rows(server, OrgEventKinds.MemberShareDefaultChanged).Should().BeEmpty();
    }

    [Fact]
    public async Task ARoleChangeStillAnswers200WhenTheEventLogCannotBeWritten()
    {
        // The row is appended after the record has landed, and a failed append never fails the mutation
        // it records: a 500 for a role change that happened would send a client retrying a lie.
        using var server = Corp.Server();
        Corp.BlockTheEventLog(server);
        using var cto = server.ClientFor(Corp.Cto);

        var put = await Corp.SetMemberAsync(cto, Bob, role: MemberRole.Dev);

        put.StatusCode.Should().Be(HttpStatusCode.OK);
        Corp.ReadRecord(server, Bob).Role.Should().Be(MemberRole.Dev, "the change is on disk whatever the log did");
        Corp.EventRows(server).Should().BeEmpty("nothing could be appended under a file");
    }

    [Fact]
    public async Task ATargetWhoseRecordCannotBeReadIs503AndTheFileIsLeftAlone()
    {
        // The store refuses to edit a record it cannot read — the edit would start from the default, and a
        // default written over a blocked developer's unreadable record is an unblock nobody ordered. The
        // admin is told to repair it, with Retry-After, exactly as /api/org/me tells the person.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = server.ClientFor(Alice);
        await Corp.SyncAsync(alice);
        await Corp.CorruptRecordAsync(server, Alice);

        var put = await Corp.SetMemberAsync(cto, Alice, role: MemberRole.Dev);

        (await Corp.RefusalAsync(put, HttpStatusCode.ServiceUnavailable)).Should().NotBeNullOrWhiteSpace();
        put.Headers.RetryAfter.Should().NotBeNull();
        (await File.ReadAllTextAsync(Corp.RecordPath(server, Alice), Ct)).Should().Be(Corp.Garbage);
    }
}
