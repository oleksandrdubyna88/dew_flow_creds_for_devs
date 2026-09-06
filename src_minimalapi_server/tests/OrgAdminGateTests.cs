using System.Net;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;

namespace CredVaultServer.Tests;

/// <summary>
/// Who passes <c>RequireAdmin</c>, probed through the route it guards, <c>GET /api/org/members</c>.
/// An officer passes unconditionally — the roster is the operator's own list; a registry admin passes
/// by their record; everybody else, and every server with corp mode off, meets ONE <c>403</c>. A record
/// this build cannot read is refused too, never guessed at: the plan round's escalation, one gate later.
/// </summary>
[Collection(ServerCollection.Name)]
public sealed class OrgAdminGateTests
{
    private static string Alice => $"alice@{VaultServer.Domain}";

    private static string Bob => $"bob@{VaultServer.Domain}";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static Task<HttpResponseMessage> ListAsync(HttpClient client) => client.GetAsync("/api/org/members", Ct);

    [Fact]
    public async Task AnOfficerWithNoRegistryRowPassesAndPassingRegistersNobody()
    {
        // The roster is configuration, not a record: the CTO never synced, has no file, and administers
        // all the same. And the gate is a read — an officer listing the roster must not grow an org/.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);

        var response = await ListAsync(cto);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        File.Exists(Corp.RecordPath(server, Corp.Cto)).Should().BeFalse("passing a gate writes nothing");
        Directory.Exists(Corp.OrgDir(server)).Should().BeFalse("a read on an empty registry creates no directory");
    }

    [Fact]
    public async Task ARegistryAdminPasses()
    {
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = server.ClientFor(Alice);
        await Corp.SyncAsync(alice);
        (await Corp.SetMemberAsync(cto, Alice, role: MemberRole.Admin)).StatusCode.Should().Be(HttpStatusCode.OK);

        var response = await ListAsync(alice);

        response.StatusCode.Should().Be(HttpStatusCode.OK, "a record saying admin is the second way in");
    }

    [Fact]
    public async Task AMemberIs403WithAJsonReason()
    {
        using var server = Corp.Server();
        using var alice = server.ClientFor(Alice);
        await Corp.SyncAsync(alice);

        var response = await ListAsync(alice);

        (await Corp.RefusalAsync(response, HttpStatusCode.Forbidden)).Should().NotBeNullOrWhiteSpace();
    }

    [Fact]
    public async Task ADeveloperIs403()
    {
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var bob = server.ClientFor(Bob);
        (await Corp.SetMemberAsync(cto, Bob, role: MemberRole.Dev)).StatusCode.Should().Be(HttpStatusCode.OK);

        var response = await ListAsync(bob);

        (await Corp.RefusalAsync(response, HttpStatusCode.Forbidden)).Should().NotBeNullOrWhiteSpace();
    }

    [Fact]
    public async Task ANeverRegisteredCallerIs403()
    {
        // Not registered means the computed default, and the default is member — which may not administer.
        using var server = Corp.Server();
        using var alice = server.ClientFor(Alice);

        var response = await ListAsync(alice);

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        Directory.Exists(Corp.OrgDir(server)).Should().BeFalse("a refused caller registers nothing");
    }

    [Fact]
    public async Task AnAdminWhoseRecordBecameUnreadableIsRefusedNotGuessed()
    {
        // Alice administers, and the gate has said so once — so the cache holds "admin". Then the file is
        // corrupted underneath it: a restore, a bad sector. The gate must re-read (the stat check), find a
        // record it cannot act on, and refuse — never serve the cached verdict, never fall back to any
        // default, and not 503 either: on this gate every cause is the same 403.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = server.ClientFor(Alice);
        await Corp.SyncAsync(alice);
        await Corp.SetMemberAsync(cto, Alice, role: MemberRole.Admin);
        (await ListAsync(alice)).StatusCode.Should().Be(HttpStatusCode.OK, "precondition: Alice administers");

        await Corp.CorruptRecordAsync(server, Alice);
        var response = await ListAsync(alice);

        (await Corp.RefusalAsync(response, HttpStatusCode.Forbidden)).Should().NotBeNullOrWhiteSpace();
    }

    [Fact]
    public async Task CorpModeOffIsTheSame403AsNotBeingAnAdmin()
    {
        // Two servers, two causes, one body. Telling a caller WHICH fact failed — no roster here, or you
        // are not on it — hands them the roster's shape for free, exactly as RequireOfficer reasons. The
        // personal server even holds a record saying Alice is an admin: a leftover from a roster since
        // removed, and consulted by nothing.
        string notAnAdmin;
        using (var corp = Corp.Server())
        {
            using var alice = corp.ClientFor(Alice);
            await Corp.SyncAsync(alice);
            notAnAdmin = await Corp.RefusalAsync(await ListAsync(alice), HttpStatusCode.Forbidden);
        }

        using var personal = new VaultServer();
        await new OrgMembersStore(personal.DataDir, NullLogger<OrgMembersStore>.Instance)
            .UpsertAsync(Alice, r => r with { Role = MemberRole.Admin }, "admin@example.com", Ct);
        using var leftover = personal.ClientFor(Alice);

        var corpOff = await Corp.RefusalAsync(await ListAsync(leftover), HttpStatusCode.Forbidden);

        corpOff.Should().Be(notAnAdmin, "the two causes are indistinguishable from outside");
    }

    [Fact]
    public async Task WithoutATokenTheAdminRoutesAre401WithAJsonBody()
    {
        // The gate writes the caller refusal's body itself, so this surface's promise — every refusal is
        // a JSON {error} — holds for the 401 and the 403 the shared caller gate decides too.
        using var server = Corp.Server();
        using var anonymous = server.CreateClient();

        var response = await ListAsync(anonymous);

        (await Corp.RefusalAsync(response, HttpStatusCode.Unauthorized)).Should().NotBeNullOrWhiteSpace();
    }
}
