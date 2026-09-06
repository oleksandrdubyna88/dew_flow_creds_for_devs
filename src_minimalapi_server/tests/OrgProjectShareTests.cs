using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using FluentAssertions;

namespace CredVaultServer.Tests;

/// <summary>
/// The project boundary over the wire: what a developer's share is refused for, what a member's is
/// not, and that a refusal leaves nothing behind.
/// </summary>
/// <remarks>
/// <para>The truth table itself lives in <see cref="ShareRuleTests"/>. These are the rows that reach
/// HTTP — the status, the sentence, and the two things a refused share must not do: land in somebody's
/// inbox, or leave the sender a receipt saying it went.</para>
/// </remarks>
[Collection(ServerCollection.Name)]
public sealed class OrgProjectShareTests
{
    private static string Alice => $"alice@{VaultServer.Domain}";

    private static string Bob => $"bob@{VaultServer.Domain}";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static object Envelope(string toEmail, string? projectId) =>
        new
        {
            toEmail,
            entityName = "prod db",
            entityKind = "db",
            salt = Convert.ToBase64String(new byte[16]),
            iv = Convert.ToBase64String(new byte[12]),
            tag = Convert.ToBase64String(new byte[16]),
            data = Convert.ToBase64String(Encoding.UTF8.GetBytes("sealed-payload")),
            projectId,
        };

    private static Task<HttpResponseMessage> ShareAsync(HttpClient sender, string toEmail, string? projectId = null) =>
        sender.PostAsJsonAsync("/api/shares", Envelope(toEmail, projectId), Ct);

    private static async Task<string> NewProjectAsync(HttpClient admin, string name = "Atlas")
    {
        var response = await Corp.PostJsonAsync(admin, "/api/org/projects", $$"""{"name":"{{name}}"}""");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        return (await Corp.BodyAsync(response)).GetProperty("id").GetString()!;
    }

    private static Task<HttpResponseMessage> AssignAsync(HttpClient admin, string id, string email, string share = "inherit") =>
        Corp.PutJsonAsync(admin, $"/api/org/projects/{id}/members/{email}", $$"""{"share":"{{share}}"}""");

    /// <summary>Nothing was written anywhere: no inbox for the recipient, no receipt for the sender.</summary>
    private static async Task NothingLandedAsync(VaultServer server, HttpClient sender, string recipient)
    {
        Directory.Exists(Path.Combine(server.DataDir, "shares", VaultStore.KeyFor(recipient)))
            .Should().BeFalse("a refused share creates no inbox at all");
        (await sender.GetStringAsync("/api/shares/sent", Ct))
            .Should().Be("[]", "and leaves no receipt claiming it went");
    }

    [Fact]
    public async Task ADeveloperSharingFromOutsideAnyProjectIsRefusedAndNothingLands()
    {
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = server.ClientFor(Alice, "Alice");
        using var bob = server.ClientFor(Bob);
        await Corp.SyncAsync(alice);
        await Corp.SyncAsync(bob);
        await Corp.SetMemberAsync(cto, Alice, role: "dev");

        var share = await ShareAsync(alice, Bob);

        share.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await share.Content.ReadAsStringAsync(Ct)).Should().Contain("project folder");
        await NothingLandedAsync(server, alice, Bob);
    }

    [Fact]
    public async Task ADeveloperSharesInsideTheirProjectToSomebodyOnIt()
    {
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = server.ClientFor(Alice, "Alice");
        using var bob = server.ClientFor(Bob);
        await Corp.SyncAsync(alice);
        await Corp.SyncAsync(bob);
        var id = await NewProjectAsync(cto);
        await AssignAsync(cto, id, Alice);
        await AssignAsync(cto, id, Bob);
        await Corp.SetMemberAsync(cto, Alice, role: "dev");

        var share = await ShareAsync(alice, Bob, id);

        share.StatusCode.Should().Be(HttpStatusCode.Created);
        var inbox = JsonDocument.Parse(await bob.GetStringAsync("/api/shares", Ct)).RootElement;
        var item = inbox.EnumerateArray().Should().ContainSingle().Subject;
        item.GetProperty("projectId").GetString().Should().Be(id, "the project is carried to the recipient");
    }

    [Fact]
    public async Task ADeveloperMayNotShareOutOfAProjectTheyAreNotOn()
    {
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = server.ClientFor(Alice, "Alice");
        using var bob = server.ClientFor(Bob);
        await Corp.SyncAsync(alice);
        await Corp.SyncAsync(bob);
        var theirs = await NewProjectAsync(cto, "Theirs");
        await AssignAsync(cto, theirs, Bob);
        await Corp.SetMemberAsync(cto, Alice, role: "dev");

        var share = await ShareAsync(alice, Bob, theirs);

        share.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await share.Content.ReadAsStringAsync(Ct)).Should().Contain("may not share");
        await NothingLandedAsync(server, alice, Bob);
    }

    [Fact]
    public async Task ADeveloperMayNotReachSomebodyOutsideTheProject()
    {
        // "Replying to somebody outside the project is refused" is this row with the people swapped —
        // which is why the rule has no separate branch for it.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = server.ClientFor(Alice, "Alice");
        using var bob = server.ClientFor(Bob);
        await Corp.SyncAsync(alice);
        await Corp.SyncAsync(bob);
        var id = await NewProjectAsync(cto);
        await AssignAsync(cto, id, Alice);
        await Corp.SetMemberAsync(cto, Alice, role: "dev");

        var share = await ShareAsync(alice, Bob, id);

        share.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await share.Content.ReadAsStringAsync(Ct)).Should().Contain("recipient is not on that project");
        await NothingLandedAsync(server, alice, Bob);
    }

    [Fact]
    public async Task ADeveloperWhoseAssignmentForbidsSharingIsRefused()
    {
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = server.ClientFor(Alice, "Alice");
        using var bob = server.ClientFor(Bob);
        await Corp.SyncAsync(alice);
        await Corp.SyncAsync(bob);
        var id = await NewProjectAsync(cto);
        await AssignAsync(cto, id, Alice, share: "none");
        await AssignAsync(cto, id, Bob);
        await Corp.SetMemberAsync(cto, Alice, role: "dev");

        var share = await ShareAsync(alice, Bob, id);

        share.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        await NothingLandedAsync(server, alice, Bob);
    }

    [Fact]
    public async Task AnArchivedProjectIsNoLongerAChannel()
    {
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = server.ClientFor(Alice, "Alice");
        using var bob = server.ClientFor(Bob);
        await Corp.SyncAsync(alice);
        await Corp.SyncAsync(bob);
        var id = await NewProjectAsync(cto);
        await AssignAsync(cto, id, Alice);
        await AssignAsync(cto, id, Bob);
        await Corp.SetMemberAsync(cto, Alice, role: "dev");
        await Corp.PutJsonAsync(cto, $"/api/org/projects/{id}", """{"archived":true}""");

        var share = await ShareAsync(alice, Bob, id);

        share.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await share.Content.ReadAsStringAsync(Ct)).Should().Contain("archived");
        await NothingLandedAsync(server, alice, Bob);
    }

    [Fact]
    public async Task AProjectFileThisBuildCannotReadIsA503AndNeverARefusal()
    {
        // Read as "that project is gone" a corrupt file would close a channel nobody closed, and tell
        // the sender their administrator had done it.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = server.ClientFor(Alice, "Alice");
        using var bob = server.ClientFor(Bob);
        await Corp.SyncAsync(alice);
        await Corp.SyncAsync(bob);
        var id = await NewProjectAsync(cto);
        await AssignAsync(cto, id, Alice);
        await AssignAsync(cto, id, Bob);
        await Corp.SetMemberAsync(cto, Alice, role: "dev");
        await File.WriteAllTextAsync(
            Path.Combine(Corp.OrgDir(server), "projects", id + ".json"), "{ not a project", Ct);

        var share = await ShareAsync(alice, Bob, id);

        share.StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable);
        await NothingLandedAsync(server, alice, Bob);
    }

    [Fact]
    public async Task AMemberSharesExactlyAsTheyDidBeforeThisEpic()
    {
        // Decision 9, and the regression this test exists to catch: the client sends projectId for any
        // entity under a project folder whatever the sender's role, so a rule keyed on "the request
        // names a project" would have fenced members too.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = server.ClientFor(Alice, "Alice");
        using var bob = server.ClientFor(Bob);
        await Corp.SyncAsync(alice);
        await Corp.SyncAsync(bob);
        var theirs = await NewProjectAsync(cto, "Theirs");
        await AssignAsync(cto, theirs, Bob);

        (await ShareAsync(alice, Bob)).StatusCode.Should().Be(HttpStatusCode.Created);
        (await ShareAsync(alice, Bob, theirs)).StatusCode.Should().Be(
            HttpStatusCode.Created,
            "a member sharing out of a project they are not on is today's behaviour, untouched");
    }

    [Fact]
    public async Task AnOfficerIsNotFencedAndTheirRecordIsNeverRead()
    {
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var bob = server.ClientFor(Bob);
        await Corp.SyncAsync(bob);

        (await ShareAsync(cto, Bob)).StatusCode.Should().Be(HttpStatusCode.Created);
    }

    [Fact]
    public async Task APersonalServerFencesNobodyAndConsultsNothing()
    {
        using var server = new VaultServer();
        using var alice = server.ClientFor(Alice, "Alice");
        using var bob = server.ClientFor(Bob);
        await Corp.SyncAsync(alice);
        await Corp.SyncAsync(bob);

        (await ShareAsync(alice, Bob, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")).StatusCode
            .Should().Be(HttpStatusCode.Created, "there is no roster to consult and no project to check");
    }

    [Fact]
    public async Task AnOversizedProjectIdIsCountedAgainstTheShareBudget()
    {
        // A field nobody counts is a field an attacker fills — the lesson PayloadBytes already carries
        // for entityKind, and a member's projectId is stored verbatim without the rule bounding it.
        using var server = Corp.Server();
        using var alice = server.ClientFor(Alice, "Alice");
        using var bob = server.ClientFor(Bob);
        await Corp.SyncAsync(alice);
        await Corp.SyncAsync(bob);

        var share = await ShareAsync(alice, Bob, new string('a', (1024 * 1024) + 1));

        share.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await share.Content.ReadAsStringAsync(Ct)).Should().Contain("exceeds");
    }

    [Fact]
    public async Task ASharePostedWithoutAProjectCarriesNoProjectFieldAtAll()
    {
        // Written as absent rather than null, for the reason `format` records: a released client's own
        // shape check accepts a string or nothing, and drops the whole item on a JSON null — the
        // recipient then sees an empty inbox instead of an error.
        using var server = Corp.Server();
        using var alice = server.ClientFor(Alice, "Alice");
        using var bob = server.ClientFor(Bob);
        await Corp.SyncAsync(alice);
        await Corp.SyncAsync(bob);

        (await ShareAsync(alice, Bob)).StatusCode.Should().Be(HttpStatusCode.Created);

        var inbox = await bob.GetStringAsync("/api/shares", Ct);
        inbox.Should().NotContain("projectId");
    }
}
