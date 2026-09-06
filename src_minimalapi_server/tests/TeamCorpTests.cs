using System.Net;
using System.Text.Json;
using FluentAssertions;

namespace CredVaultServer.Tests;

/// <summary>
/// <c>/api/team</c> on a corp server: filtered, not replaced. A colleague whose record says
/// <c>active: false</c> cannot be picked as a recipient; everything else about the answer — the DTO
/// most of all — is exactly what it was, because epic 3 owns the wider shape and two plans describing
/// one change is how neither builds it.
/// </summary>
[Collection(ServerCollection.Name)]
public sealed class TeamCorpTests
{
    private static string Alice => $"alice@{VaultServer.Domain}";

    private static string Bob => $"bob@{VaultServer.Domain}";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static async Task<string> TeamSeenByAliceAfterBothSyncedAndBobWasBlocked(VaultServer server)
    {
        using var alice = server.ClientFor(Alice);
        using var bob = server.ClientFor(Bob);
        await Corp.SyncAsync(alice);
        await Corp.SyncAsync(bob);
        // By hand rather than through the admin endpoint, so this suite stays about the team filter — and
        // so a personal server, which has no endpoint to block with, gets the same record on disk.
        await Corp.WriteActiveByHandAsync(server, Bob, active: false);
        return await alice.GetStringAsync("/api/team", Ct);
    }

    [Fact]
    public async Task AnInactiveMemberIsAbsentInCorpModeAndPresentInPersonalMode()
    {
        using (var corp = Corp.Server())
        {
            var team = await TeamSeenByAliceAfterBothSyncedAndBobWasBlocked(corp);
            team.Should().Contain(Alice).And.NotContain(Bob, "a blocked colleague cannot be offered as a recipient");
        }

        using (var personal = new VaultServer())
        {
            // The same record on disk, written by the test — the server never would — and ignored:
            // personal mode consults no registry, whatever a leftover file says.
            var team = await TeamSeenByAliceAfterBothSyncedAndBobWasBlocked(personal);
            team.Should().Contain(Alice).And.Contain(Bob, "personal mode has no registry to consult");
        }
    }

    [Fact]
    public async Task TheTeamShapeIsUnchangedForAnOldClient()
    {
        // An old client sends no contract header and is served as legacy — on a corp server too. What it
        // gets must be the shape it was written against: an array of {email} and no other field, and the
        // very same bytes a personal server answers for the same owners.
        string corp;
        using (var server = Corp.Server())
        {
            using var alice = server.ClientFor(Alice);
            await Corp.SyncAsync(alice);
            var response = await alice.GetAsync("/api/team", Ct);
            response.StatusCode.Should().Be(HttpStatusCode.OK);
            corp = await response.Content.ReadAsStringAsync(Ct);
        }

        string personal;
        using (var server = new VaultServer())
        {
            using var alice = server.ClientFor(Alice);
            await Corp.SyncAsync(alice);
            personal = await alice.GetStringAsync("/api/team", Ct);
        }

        corp.Should().Be(personal, "byte-identical: the filter changes who is listed, never how");
        var members = JsonDocument.Parse(corp).RootElement;
        members.GetArrayLength().Should().Be(1);
        members[0].EnumerateObject().Select(p => p.Name).Should().Equal("email");
        members[0].GetProperty("email").GetString().Should().Be(Alice);
    }

    private static HttpClient Modern(VaultServer server, string email)
    {
        var client = server.ClientFor(email);
        client.DefaultRequestHeaders.Add(ContractVersion.Header, ContractVersion.OrgPolicyContract.ToString());
        return client;
    }

    private static async Task<string> NewProjectAsync(HttpClient admin, string name)
    {
        var response = await Corp.PostJsonAsync(admin, "/api/org/projects", $$"""{"name":"{{name}}"}""");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        return (await Corp.BodyAsync(response)).GetProperty("id").GetString()!;
    }

    private static Task<HttpResponseMessage> AssignAsync(HttpClient admin, string id, string email) =>
        Corp.PutJsonAsync(admin, $"/api/org/projects/{id}/members/{email}", """{"share":"inherit"}""");

    private static async Task<JsonElement> TeamAsync(HttpClient client)
    {
        var response = await client.GetAsync("/api/team", Ct);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync(Ct)).RootElement.Clone();
    }

    [Fact]
    public async Task AModernClientIsToldTheRoleAndTheProjects()
    {
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = Modern(server, Alice);
        await Corp.SyncAsync(alice);
        var id = await NewProjectAsync(cto, "Atlas");
        await AssignAsync(cto, id, Alice);

        var row = (await TeamAsync(alice)).EnumerateArray().Should().ContainSingle().Subject;

        row.EnumerateObject().Select(p => p.Name).Should().Equal("email", "role", "projectIds");
        row.GetProperty("role").GetString().Should().Be("member");
        row.GetProperty("projectIds").EnumerateArray().Select(p => p.GetString()).Should().Equal(id);
    }

    [Fact]
    public async Task ADeveloperIsOfferedOnlyThePeopleTheyShareAProjectWith()
    {
        // The discovery half of the share rule: a client that proposes a recipient the rule will refuse
        // teaches people the feature is broken.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = Modern(server, Alice);
        using var bob = server.ClientFor(Bob);
        await Corp.SyncAsync(alice);
        await Corp.SyncAsync(bob);
        var ours = await NewProjectAsync(cto, "Ours");
        await AssignAsync(cto, ours, Alice);
        await Corp.SetMemberAsync(cto, Alice, role: "dev");

        var seenByDeveloper = await TeamAsync(alice);

        seenByDeveloper.EnumerateArray().Select(r => r.GetProperty("email").GetString())
            .Should().Equal([Alice], "Bob is on no project of theirs");

        await AssignAsync(cto, ours, Bob);
        (await TeamAsync(alice)).EnumerateArray().Select(r => r.GetProperty("email").GetString())
            .Should().BeEquivalentTo([Alice, Bob], "and appears the moment he is put on it");
    }

    [Fact]
    public async Task ADeveloperIsNotToldWhichOtherProjectsAColleagueIsOn()
    {
        // A colleague on Ours with me and on Theirs without me: handing over their whole list leaks the
        // engagement names this epic exists to fence, to exactly the role it fences.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = Modern(server, Alice);
        using var bob = server.ClientFor(Bob);
        await Corp.SyncAsync(alice);
        await Corp.SyncAsync(bob);
        var ours = await NewProjectAsync(cto, "Ours");
        var theirs = await NewProjectAsync(cto, "Theirs");
        await AssignAsync(cto, ours, Alice);
        await AssignAsync(cto, ours, Bob);
        await AssignAsync(cto, theirs, Bob);
        await Corp.SetMemberAsync(cto, Alice, role: "dev");

        var team = await TeamAsync(alice);

        var bobRow = team.EnumerateArray().Single(r => r.GetProperty("email").GetString() == Bob);
        bobRow.GetProperty("projectIds").EnumerateArray().Select(p => p.GetString())
            .Should().Equal([ours], "only the project they share");
        (await TeamAsync(Modern(server, Corp.Cto))).EnumerateArray()
            .Single(r => r.GetProperty("email").GetString() == Bob)
            .GetProperty("projectIds").GetArrayLength()
            .Should().Be(2, "an officer reads the roster anyway, so nothing is hidden from them");
    }

    [Fact]
    public async Task ADeveloperOnNoProjectStillSeesThemselves()
    {
        // The intersection of nothing with nothing is empty, so the caller vanished from their own team
        // and took the tree's "(you)" row with them. Found by the plan round; a branch now, not luck.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = Modern(server, Alice);
        using var bob = server.ClientFor(Bob);
        await Corp.SyncAsync(alice);
        await Corp.SyncAsync(bob);
        await Corp.SetMemberAsync(cto, Alice, role: "dev");

        (await TeamAsync(alice)).EnumerateArray().Select(r => r.GetProperty("email").GetString())
            .Should().Equal(Alice);
    }

    [Fact]
    public async Task AnOldClientGetsTheFilteredSetInTheOldShape()
    {
        // The clarification the plan round earned: the FILTER is about the caller's role and applies
        // whatever they claim; only the SHAPE is gated on the contract they declare.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = server.ClientFor(Alice);
        using var bob = server.ClientFor(Bob);
        await Corp.SyncAsync(alice);
        await Corp.SyncAsync(bob);
        await Corp.SetMemberAsync(cto, Alice, role: "dev");

        var team = await TeamAsync(alice);

        var row = team.EnumerateArray().Should().ContainSingle().Subject;
        row.EnumerateObject().Select(p => p.Name).Should().Equal(["email"], "the old shape, for a client that claims nothing");
        row.GetProperty("email").GetString().Should().Be(Alice);
    }

    [Fact]
    public async Task ADeveloperWhoMayNotShareFromAProjectIsNotOfferedItsPeople()
    {
        // The discovery half has to agree with the RULE, not merely with the assignment: a developer
        // whose share for the project is `none` cannot send anything into it, so offering them its
        // colleagues proposes a recipient the server will refuse.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = Modern(server, Alice);
        using var bob = server.ClientFor(Bob);
        await Corp.SyncAsync(alice);
        await Corp.SyncAsync(bob);
        var ours = await NewProjectAsync(cto, "Ours");
        await Corp.PutJsonAsync(cto, $"/api/org/projects/{ours}/members/{Alice}", """{"share":"none"}""");
        await AssignAsync(cto, ours, Bob);
        await Corp.SetMemberAsync(cto, Alice, role: "dev");

        (await TeamAsync(alice)).EnumerateArray().Select(r => r.GetProperty("email").GetString())
            .Should().Equal([Alice], "a project they may not share from is not a channel to its people");
    }

    [Fact]
    public async Task ADeveloperIsNotOfferedThePeopleOnAProjectThatHasClosed()
    {
        // Discovery has to agree with the RULE, not merely with the assignment. An archived project
        // is not a channel — ShareRule refuses a share into one — so offering its colleagues proposes
        // a recipient the server will then refuse, which is the failure this surface exists to avoid.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = Modern(server, Alice);
        using var bob = server.ClientFor(Bob);
        await Corp.SyncAsync(alice);
        await Corp.SyncAsync(bob);
        var closing = await NewProjectAsync(cto, "Closing");
        await AssignAsync(cto, closing, Alice);
        await AssignAsync(cto, closing, Bob);
        await Corp.SetMemberAsync(cto, Alice, role: "dev");
        (await TeamAsync(alice)).EnumerateArray().Select(r => r.GetProperty("email").GetString())
            .Should().BeEquivalentTo([Alice, Bob], "while it is open");

        await Corp.PutJsonAsync(cto, $"/api/org/projects/{closing}", """{"archived":true}""");

        (await TeamAsync(alice)).EnumerateArray().Select(r => r.GetProperty("email").GetString())
            .Should().Equal([Alice], "a closed engagement is not a channel to its people");
    }
}
