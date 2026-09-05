using System.Net;
using System.Text.Json;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;

namespace CredVaultServer.Tests;

/// <summary>
/// Registration, and the document every client reads: who gets written into the registry and when, and
/// what <c>GET /api/org/me</c> answers before and after — on a corp server and on a personal one.
/// </summary>
/// <remarks>
/// <para>The two rules under test pull in opposite directions and both have to hold: the first vault
/// write registers a person, and reading <c>/api/org/me</c> registers nobody. Registering on read
/// would fill an admin's list with every token that ever asked; not registering on write would leave
/// the roster empty until an admin typed it in.</para>
/// </remarks>
[Collection(ServerCollection.Name)]
public sealed class OrgMembersTests
{
    private static string Alice => $"alice@{VaultServer.Domain}";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static async Task<JsonElement> MeAsync(HttpClient client)
    {
        var response = await client.GetAsync("/api/org/me", Ct);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync(Ct)).RootElement;
    }

    [Fact]
    public async Task RegistrationHappensOnTheFirstVaultWriteNotOnOrgMe()
    {
        using var server = Corp.Server();
        using var alice = server.ClientFor(Alice);

        await MeAsync(alice);
        File.Exists(Corp.RecordPath(server, Alice)).Should().BeFalse("reading the document registers nobody");

        (await Corp.SyncAsync(alice)).StatusCode.Should().Be(HttpStatusCode.NoContent);

        File.Exists(Corp.RecordPath(server, Alice)).Should().BeTrue("the first vault write is the registration");
    }

    [Fact]
    public async Task TheDefaultRoleIsMember()
    {
        // A decision, not a fallback: defaulting to `dev` would strip every colleague of export and
        // sharing on the day a roster appears, over a role nobody assigned them.
        using var server = Corp.Server();
        using var alice = server.ClientFor(Alice);
        await Corp.SyncAsync(alice);

        var me = await MeAsync(alice);

        me.GetProperty("corpMode").GetBoolean().Should().BeTrue();
        me.GetProperty("role").GetString().Should().Be(MemberRole.Member);
        me.GetProperty("active").GetBoolean().Should().BeTrue();
        me.GetProperty("policy").GetProperty("export").GetBoolean().Should().BeTrue();
        Corp.ReadRecord(server, Alice).Role.Should().Be(MemberRole.Member, "the record on disk says the same");
    }

    [Fact]
    public async Task ASecondVaultWriteDoesNotRewriteTheRecord()
    {
        // An admin set a role, and stamped the record doing it. The person's next sync must find the
        // record and leave it alone — a sync that re-stamped it would say nobody changed the role, at
        // the time of the sync, which is the one fact the admin list exists to show.
        using var server = Corp.Server();
        using var alice = server.ClientFor(Alice);
        await Corp.SyncAsync(alice);
        var admin = new OrgMembersStore(server.DataDir, NullLogger<OrgMembersStore>.Instance);
        var stamped = (await admin.UpsertAsync(Alice, r => r with { Role = MemberRole.Dev }, "admin@example.com", Ct)).Record;

        (await Corp.SyncAsync(alice)).StatusCode.Should().Be(HttpStatusCode.NoContent);

        var after = Corp.ReadRecord(server, Alice);
        after.UpdatedBy.Should().Be("admin@example.com", "the sync found a record and left it alone");
        after.UpdatedAt.Should().Be(stamped.UpdatedAt);
        after.Role.Should().Be(MemberRole.Dev);
    }

    [Fact]
    public async Task PersonalModeCreatesNoOrgDirectory()
    {
        // The whole corporate surface is reachable on a personal server — the same endpoints answer
        // "corp mode off" — and none of it may leave an `org/` behind: its presence is what tells an
        // operator looking at the disk that this server has a roster.
        using var server = new VaultServer();
        using var alice = server.ClientFor(Alice);

        await Corp.SyncAsync(alice);
        await MeAsync(alice);
        await alice.GetAsync("/api/team", Ct);
        await alice.DeleteAsync("/api/vault", Ct);

        Directory.Exists(Corp.OrgDir(server)).Should().BeFalse("a personal deployment has no roster, and no org/ that says otherwise");
    }

    [Fact]
    public async Task OrgMeInPersonalModeAnswersCorpModeFalse()
    {
        // And the answer consults nothing. A record left over from a roster since removed — Alice as a
        // blocked developer — must change no field: a personal server has to be indistinguishable from
        // one that never had a registry, or "switch corp mode off" would not mean off.
        using var server = new VaultServer();
        using var alice = server.ClientFor(Alice);
        await Corp.SyncAsync(alice);
        var leftover = new OrgMembersStore(server.DataDir, NullLogger<OrgMembersStore>.Instance);
        await leftover.UpsertAsync(Alice, r => r with { Role = MemberRole.Dev, Active = false }, "admin@example.com", Ct);

        var me = await MeAsync(alice);

        me.GetProperty("corpMode").GetBoolean().Should().BeFalse();
        me.GetProperty("email").GetString().Should().Be(Alice);
        me.GetProperty("role").GetString().Should().Be(MemberRole.Member);
        me.GetProperty("active").GetBoolean().Should().BeTrue();
        me.GetProperty("isOfficer").GetBoolean().Should().BeFalse();
        me.GetProperty("shareDefault").GetString().Should().Be(ShareDefaults.Default);
        me.GetProperty("projects").GetArrayLength().Should().Be(0);
        me.GetProperty("pendingFolderRemovals").GetArrayLength().Should().Be(0);
        me.GetProperty("policy").GetProperty("export").GetBoolean().Should().BeTrue();
        me.GetProperty("policy").GetProperty("share").GetString().Should().Be(ShareDefaults.Any);
        me.GetProperty("policy").GetProperty("moveOutOfProject").GetBoolean().Should().BeTrue();
        me.GetProperty("offlineLeaseHours").GetInt32().Should().Be(OrgSettingsDto.DefaultOfflineLeaseHours);
        me.GetProperty("loginKeyVersion").GetInt32().Should().Be(0);
        me.GetProperty("serverContract").GetInt32().Should().Be(ContractVersion.Current);
    }

    [Fact]
    public async Task OrgMeForANeverSyncedCallerIsComputedAndWritesNothing()
    {
        // "Off is the shape, not a flag", applied to a person: the answer is correct before the disk
        // agrees, and a token that stored nothing gets no file — not even the directory.
        using var server = Corp.Server();
        using var alice = server.ClientFor(Alice);

        var me = await MeAsync(alice);

        me.GetProperty("corpMode").GetBoolean().Should().BeTrue();
        me.GetProperty("role").GetString().Should().Be(MemberRole.Member);
        me.GetProperty("active").GetBoolean().Should().BeTrue();
        me.GetProperty("offlineLeaseHours").GetInt32().Should().Be(OrgSettingsDto.DefaultOfflineLeaseHours);
        Directory.Exists(Corp.OrgDir(server)).Should().BeFalse("a read created nothing");
    }

    [Fact]
    public async Task AnOfficerReadsIsOfficerTrueWithoutARegistryRow()
    {
        // The roster is configuration, not a registry record; an officer who never synced is still
        // one, and the client's admin predicate is `role === 'admin' || isOfficer`.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);

        var me = await MeAsync(cto);

        me.GetProperty("isOfficer").GetBoolean().Should().BeTrue();
        me.GetProperty("role").GetString().Should().Be(MemberRole.Member, "the registry role is separate from the roster");
    }
}
