using System.Net;
using System.Text.Json;
using FluentAssertions;

namespace CredVaultServer.Tests;

/// <summary>
/// The six project routes over the wire: who may call them, what each refusal says, and — the part
/// that is not a status code — that every mutation leaves a row somebody can read back OUT of the
/// event log.
/// </summary>
/// <remarks>
/// The rows are asserted from the log rather than from the response for the reason epic 1 recorded as
/// its sharpest finding: a log nothing is REQUIRED to write to is a log that quietly stays empty until
/// the day somebody needs the history. Epic 4 ships the reader; these rows are what it will read.
/// </remarks>
[Collection(ServerCollection.Name)]
public sealed class OrgProjectsAdminTests
{
    private static string Alice => $"alice@{VaultServer.Domain}";

    private static string Bob => $"bob@{VaultServer.Domain}";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static Task<HttpResponseMessage> CreateAsync(HttpClient admin, string name) =>
        Corp.PostJsonAsync(admin, "/api/org/projects", $$"""{"name":{{JsonSerializer.Serialize(name)}}}""");

    private static async Task<string> NewProjectAsync(HttpClient admin, string name = "Atlas")
    {
        var response = await CreateAsync(admin, name);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        return (await Corp.BodyAsync(response)).GetProperty("id").GetString()!;
    }

    private static Task<HttpResponseMessage> AssignAsync(HttpClient admin, string id, string email, string share = "inherit") =>
        Corp.PutJsonAsync(admin, $"/api/org/projects/{id}/members/{email}", $$"""{"share":"{{share}}"}""");

    private static Task<HttpResponseMessage> UnassignAsync(HttpClient admin, string id, string email, string query) =>
        admin.DeleteAsync($"/api/org/projects/{id}/members/{email}{query}", Ct);

    private static async Task<JsonElement> ListAsync(HttpClient client)
    {
        var response = await client.GetAsync("/api/org/projects", Ct);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync(Ct)).RootElement.Clone();
    }

    [Fact]
    public async Task CreatingAProjectAnswersItAndLeavesARowNamingTheAdmin()
    {
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);

        var id = await NewProjectAsync(cto, "Atlas");

        var row = Corp.Rows(server, OrgEventKinds.ProjectCreated).Should().ContainSingle().Subject;
        row.Actor.Should().Be(Corp.Cto);
        row.Project.Should().Be(id);
        row.Detail.Should().Be("Atlas");
        row.Subject.Should().BeNull("a project row names no person, so a reader filtering by subject finds only people rows");
    }

    [Fact]
    public async Task ANamelessProjectIs400AndNothingIsWritten()
    {
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);

        (await Corp.RefusalAsync(await CreateAsync(cto, "   "), HttpStatusCode.BadRequest)).Should().Contain("needs a name");

        Corp.Rows(server, OrgEventKinds.ProjectCreated).Should().BeEmpty();
        (await ListAsync(cto)).GetArrayLength().Should().Be(0);
    }

    [Fact]
    public async Task RenamingLeavesARowThatSaysBothNames()
    {
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        var id = await NewProjectAsync(cto, "Atlas");

        var renamed = await Corp.PutJsonAsync(cto, $"/api/org/projects/{id}", """{"name":"Atlas II"}""");

        renamed.StatusCode.Should().Be(HttpStatusCode.OK);
        (await Corp.BodyAsync(renamed)).GetProperty("name").GetString().Should().Be("Atlas II");
        Corp.Rows(server, OrgEventKinds.ProjectRenamed).Should().ContainSingle()
            .Which.Detail.Should().Be("Atlas → Atlas II");
    }

    [Fact]
    public async Task ARenameDoesNotUnarchive()
    {
        // The trap `SetActiveRequest` documents one epic earlier: a positional bool the client omitted
        // binds false, and every rename would have quietly reopened a closed project.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        var id = await NewProjectAsync(cto);
        await Corp.PutJsonAsync(cto, $"/api/org/projects/{id}", """{"archived":true}""");

        await Corp.PutJsonAsync(cto, $"/api/org/projects/{id}", """{"name":"Atlas II"}""");

        var listed = (await ListAsync(cto)).EnumerateArray().Single();
        listed.GetProperty("archived").GetBoolean().Should().BeTrue();
        listed.GetProperty("name").GetString().Should().Be("Atlas II");
    }

    [Fact]
    public async Task ArchivingAndUnarchivingAreTwoDifferentRows()
    {
        // A log that records the archive and not the undo describes a state the server is not in.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        var id = await NewProjectAsync(cto);

        await Corp.PutJsonAsync(cto, $"/api/org/projects/{id}", """{"archived":true}""");
        await Corp.PutJsonAsync(cto, $"/api/org/projects/{id}", """{"archived":false}""");

        Corp.Rows(server, OrgEventKinds.ProjectArchived).Should().ContainSingle();
        Corp.Rows(server, OrgEventKinds.ProjectUnarchived).Should().ContainSingle();
    }

    [Fact]
    public async Task AnEmptyChangeIs400()
    {
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        var id = await NewProjectAsync(cto);

        var refused = await Corp.PutJsonAsync(cto, $"/api/org/projects/{id}", "{}");

        (await Corp.RefusalAsync(refused, HttpStatusCode.BadRequest)).Should().Contain("Nothing to change");
    }

    [Fact]
    public async Task AssigningPutsTheProjectOnTheirRecordAndLeavesARow()
    {
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = server.ClientFor(Alice);
        await Corp.SyncAsync(alice);
        var id = await NewProjectAsync(cto, "Atlas");

        (await AssignAsync(cto, id, Alice, "project")).StatusCode.Should().Be(HttpStatusCode.NoContent);

        Corp.ReadRecord(server, Alice).Projects.Should().ContainSingle()
            .Which.Should().BeEquivalentTo(new ProjectAssignment(id, "project"));
        var row = Corp.Rows(server, OrgEventKinds.ProjectAssigned).Should().ContainSingle().Subject;
        row.Subject.Should().Be(Alice);
        row.Project.Should().Be(id);
        row.Detail.Should().Be("project");
    }

    [Fact]
    public async Task AssigningTwiceReplacesTheOverrideRatherThanRepeatingTheProject()
    {
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = server.ClientFor(Alice);
        await Corp.SyncAsync(alice);
        var id = await NewProjectAsync(cto);

        await AssignAsync(cto, id, Alice, "inherit");
        await AssignAsync(cto, id, Alice, "none");

        Corp.ReadRecord(server, Alice).Projects.Should().ContainSingle().Which.Share.Should().Be("none");
    }

    [Fact]
    public async Task AssigningToAProjectThatDoesNotExistIs404AndWritesNothing()
    {
        // Without the check an admin's typo writes an assignment naming nothing, and an event row
        // citing an id that resolves to no project.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = server.ClientFor(Alice);
        await Corp.SyncAsync(alice);

        var refused = await AssignAsync(cto, new string('a', 32), Alice);

        (await Corp.RefusalAsync(refused, HttpStatusCode.NotFound)).Should().Contain("no project");
        Corp.ReadRecord(server, Alice).Projects.Should().BeEmpty();
        Corp.Rows(server, OrgEventKinds.ProjectAssigned).Should().BeEmpty();
    }

    [Fact]
    public async Task AnUnassignmentMustSayWhatHappensToTheirCopy()
    {
        // No default: one reading deletes somebody's folder when the admin meant to unassign, the other
        // leaves corporate material behind when they meant to remove it — and the request looks the same.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = server.ClientFor(Alice);
        await Corp.SyncAsync(alice);
        var id = await NewProjectAsync(cto);
        await AssignAsync(cto, id, Alice);

        var refused = await UnassignAsync(cto, id, Alice, "");

        (await Corp.RefusalAsync(refused, HttpStatusCode.BadRequest)).Should().Contain("deleteFolder");
        Corp.ReadRecord(server, Alice).Projects.Should().ContainSingle("nothing was changed");
    }

    [Fact]
    public async Task UnassigningWithTheFolderKeptLeavesNoInstruction()
    {
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = server.ClientFor(Alice);
        await Corp.SyncAsync(alice);
        var id = await NewProjectAsync(cto);
        await AssignAsync(cto, id, Alice);

        (await UnassignAsync(cto, id, Alice, "?deleteFolder=false")).StatusCode.Should().Be(HttpStatusCode.NoContent);

        var record = Corp.ReadRecord(server, Alice);
        record.Projects.Should().BeEmpty();
        record.PendingFolderRemovals.Should().BeEmpty("nothing has to happen on their machine");
        Corp.Rows(server, OrgEventKinds.ProjectUnassigned).Should().ContainSingle()
            .Which.Detail.Should().Contain("stays with them");
    }

    [Fact]
    public async Task UnassigningWithTheFolderRemovedLeavesAnInstructionTheyCanAcknowledge()
    {
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = server.ClientFor(Alice);
        await Corp.SyncAsync(alice);
        var id = await NewProjectAsync(cto);
        await AssignAsync(cto, id, Alice);

        await UnassignAsync(cto, id, Alice, "?deleteFolder=true");

        var pending = Corp.ReadRecord(server, Alice).PendingFolderRemovals.Should().ContainSingle().Subject;
        pending.ProjectId.Should().Be(id);
        pending.DeleteFolder.Should().BeTrue();
        Corp.Rows(server, OrgEventKinds.ProjectUnassigned).Should().ContainSingle()
            .Which.Detail.Should().Contain("to be removed");
    }

    [Fact]
    public async Task TheAckClearsExactlyOneInstructionAndIsIdempotent()
    {
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = server.ClientFor(Alice);
        await Corp.SyncAsync(alice);
        var first = await NewProjectAsync(cto, "Atlas");
        var second = await NewProjectAsync(cto, "Borealis");
        await AssignAsync(cto, first, Alice);
        await AssignAsync(cto, second, Alice);
        await UnassignAsync(cto, first, Alice, "?deleteFolder=true");
        await UnassignAsync(cto, second, Alice, "?deleteFolder=true");

        var acked = await alice.PostAsync($"/api/org/members/me/pending-folder-removals/{first}/ack", null, Ct);
        var again = await alice.PostAsync($"/api/org/members/me/pending-folder-removals/{first}/ack", null, Ct);

        acked.StatusCode.Should().Be(HttpStatusCode.NoContent);
        again.StatusCode.Should().Be(HttpStatusCode.NoContent);
        Corp.ReadRecord(server, Alice).PendingFolderRemovals.Should().ContainSingle()
            .Which.ProjectId.Should().Be(second, "the other instruction is untouched");
    }

    [Fact]
    public async Task ADeveloperSeesOnlyTheProjectsTheyAreOn()
    {
        // A project's NAME is a fact about a customer engagement, and the list of who else exists is
        // not a developer's business.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = server.ClientFor(Alice);
        using var bob = server.ClientFor(Bob);
        await Corp.SyncAsync(alice);
        await Corp.SyncAsync(bob);
        var mine = await NewProjectAsync(cto, "Mine");
        await NewProjectAsync(cto, "Theirs");
        await AssignAsync(cto, mine, Alice);
        await Corp.SetMemberAsync(cto, Alice, role: "dev");

        var seen = await ListAsync(alice);

        seen.EnumerateArray().Should().ContainSingle().Which.GetProperty("id").GetString().Should().Be(mine);
        (await ListAsync(bob)).GetArrayLength().Should().Be(2, "a member sees them all");
    }

    [Fact]
    public async Task TheirOwnDocumentNamesTheProjectRatherThanOnlyItsId()
    {
        // Epic 1 shipped `ProjectSelfDto` without a name because there was no store to take one from.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = server.ClientFor(Alice);
        await Corp.SyncAsync(alice);
        var id = await NewProjectAsync(cto, "Atlas");
        await AssignAsync(cto, id, Alice);

        var me = JsonDocument.Parse(await alice.GetStringAsync("/api/org/me", Ct)).RootElement;

        var project = me.GetProperty("projects").EnumerateArray().Should().ContainSingle().Subject;
        project.GetProperty("projectId").GetString().Should().Be(id);
        project.GetProperty("name").GetString().Should().Be("Atlas");
    }

    [Fact]
    public async Task ANonAdminChangesNothing()
    {
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = server.ClientFor(Alice);
        await Corp.SyncAsync(alice);
        var id = await NewProjectAsync(cto);

        (await CreateAsync(alice, "Sneaky")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await Corp.PutJsonAsync(alice, $"/api/org/projects/{id}", """{"name":"Sneaky"}""")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await AssignAsync(alice, id, Alice)).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await UnassignAsync(alice, id, Alice, "?deleteFolder=true")).StatusCode.Should().Be(HttpStatusCode.Forbidden);

        Corp.ReadRecord(server, Alice).Projects.Should().BeEmpty();
    }

    [Fact]
    public async Task AnOfficerTargetIs409AndACrossDomainTargetIs403()
    {
        // The same TargetProblem the members routes use, so the two surfaces cannot disagree about
        // whom an admin may manage.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        var id = await NewProjectAsync(cto);

        (await AssignAsync(cto, id, "lead@example.com")).StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await AssignAsync(cto, id, "someone@elsewhere.test")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await AssignAsync(cto, id, "not-an-address")).StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task AnUnknownShareIs400()
    {
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = server.ClientFor(Alice);
        await Corp.SyncAsync(alice);
        var id = await NewProjectAsync(cto);

        var refused = await AssignAsync(cto, id, Alice, "everything");

        (await Corp.RefusalAsync(refused, HttpStatusCode.BadRequest)).Should().Contain("Unknown share");
    }

    [Fact]
    public async Task MixedCasingNamesOnePerson()
    {
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = server.ClientFor(Alice);
        await Corp.SyncAsync(alice);
        var id = await NewProjectAsync(cto);

        await AssignAsync(cto, id, Alice.ToUpperInvariant());

        Corp.ReadRecord(server, Alice).Projects.Should().ContainSingle();
    }

    [Fact]
    public async Task OnAPersonalServerThereAreNoProjects()
    {
        using var server = new VaultServer();
        using var alice = server.ClientFor(Alice);
        await Corp.SyncAsync(alice);

        (await ListAsync(alice)).GetArrayLength().Should().Be(0);
        Directory.Exists(Path.Combine(server.DataDir, "org", "projects")).Should().BeFalse();
    }

    [Fact]
    public async Task AnUnreadableMemberRecordHandsOutNoProjectNamesAtAll()
    {
        // Fail-OPEN was the shape of this one: when the caller's own record could not be read the
        // developer branch was skipped and the answer was every project on the server — the single
        // list a developer is not allowed to have. A record this build cannot read is a 503 here for
        // the same reason it is one everywhere else the roster is consulted.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = server.ClientFor(Alice);
        await Corp.SyncAsync(alice);
        await NewProjectAsync(cto, "Atlas");
        await Corp.CorruptRecordAsync(server, Alice);

        var response = await alice.GetAsync("/api/org/projects", Ct);

        response.StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable);
    }

    [Fact]
    public async Task AnArchivedProjectTakesNoNewAssignments()
    {
        // Archiving is how a project is closed, and it is the only way — it cannot be deleted. A
        // closed project that still accepts people is not closed.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = server.ClientFor(Alice);
        await Corp.SyncAsync(alice);
        var id = await NewProjectAsync(cto, "Closed");
        (await Corp.PutJsonAsync(cto, $"/api/org/projects/{id}", """{"archived":true}"""))
            .StatusCode.Should().Be(HttpStatusCode.OK);

        (await Corp.RefusalAsync(await AssignAsync(cto, id, Alice), HttpStatusCode.Conflict))
            .Should().Contain("archived");

        Corp.ReadRecord(server, Alice).Projects.Should().BeEmpty();
        Corp.Rows(server, OrgEventKinds.ProjectAssigned).Should().BeEmpty();
    }

    [Fact]
    public async Task TakingSomebodyOffAnArchivedProjectStillWorks()
    {
        // The other half of the rule above: a project closes with people still on it, and getting them
        // off it must not require unarchiving the thing first.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = server.ClientFor(Alice);
        await Corp.SyncAsync(alice);
        var id = await NewProjectAsync(cto, "Closing");
        await AssignAsync(cto, id, Alice);
        await Corp.PutJsonAsync(cto, $"/api/org/projects/{id}", """{"archived":true}""");

        (await UnassignAsync(cto, id, Alice, "?deleteFolder=true")).StatusCode.Should().Be(HttpStatusCode.NoContent);

        Corp.ReadRecord(server, Alice).Projects.Should().BeEmpty();
    }

    [Fact]
    public async Task PuttingSomebodyBackOnAProjectWithdrawsTheInstructionToDeleteTheirFolder()
    {
        // The order that deletes a folder somebody has just been given back: unassign with the folder
        // removed, change your mind, re-assign. The instruction is durable and their client carries it
        // out on its next cycle — by then against the folder it has just been told it owns.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = server.ClientFor(Alice);
        await Corp.SyncAsync(alice);
        var id = await NewProjectAsync(cto, "Atlas");
        await AssignAsync(cto, id, Alice);
        await UnassignAsync(cto, id, Alice, "?deleteFolder=true");

        (await AssignAsync(cto, id, Alice)).StatusCode.Should().Be(HttpStatusCode.NoContent);

        var record = Corp.ReadRecord(server, Alice);
        record.Projects.Should().ContainSingle().Which.ProjectId.Should().Be(id);
        record.PendingFolderRemovals.Should().BeEmpty(
            "an assignment and an instruction to delete that project's folder cannot both be true");
    }

    [Fact]
    public async Task ChangingYourMindToKeepingTheFolderWithdrawsAStandingInstruction()
    {
        // Same defect from the other side: the admin unassigns with the folder removed, thinks better
        // of it, and says so with the only request that means it — deleteFolder=false.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = server.ClientFor(Alice);
        await Corp.SyncAsync(alice);
        var id = await NewProjectAsync(cto, "Atlas");
        await AssignAsync(cto, id, Alice);
        await UnassignAsync(cto, id, Alice, "?deleteFolder=true");

        (await UnassignAsync(cto, id, Alice, "?deleteFolder=false")).StatusCode.Should().Be(HttpStatusCode.NoContent);

        Corp.ReadRecord(server, Alice).PendingFolderRemovals.Should().BeEmpty(
            "the last word about their copy is the one that stands");
    }

    [Fact]
    public async Task UnassigningSomebodyWhoIsOnNoRosterIs404AndRegistersNobody()
    {
        // An unassignment writes through the member store, and the store creates what it cannot find.
        // On the way IN that is deliberate — see the test below. On the way OUT it means an admin's
        // typo puts a person on the roster by removing them from something they were never on.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        var id = await NewProjectAsync(cto);
        var stranger = $"nobody@{VaultServer.Domain}";

        (await Corp.RefusalAsync(await UnassignAsync(cto, id, stranger, "?deleteFolder=true"), HttpStatusCode.NotFound))
            .Should().Contain("registered");

        File.Exists(Corp.RecordPath(server, stranger)).Should().BeFalse("nothing was created to be removed from");
        Corp.Rows(server, OrgEventKinds.ProjectUnassigned).Should().BeEmpty();
    }

    [Fact]
    public async Task AssigningSomebodyWhoHasNotSyncedYetPutsThemOnTheRoster()
    {
        // The deliberate asymmetry, written down as a test so the next reader does not "fix" it: an
        // admin assigns a new hire to a project on their first day, before the person has opened the
        // extension at all. The same pre-provisioning the members surface already does for a role.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        var id = await NewProjectAsync(cto);
        var newHire = $"newhire@{VaultServer.Domain}";

        (await AssignAsync(cto, id, newHire)).StatusCode.Should().Be(HttpStatusCode.NoContent);

        Corp.ReadRecord(server, newHire).Projects.Should().ContainSingle().Which.ProjectId.Should().Be(id);
    }

    [Fact]
    public async Task UnassigningAColleagueWhoIsNotOnTheProjectIs404AndQueuesNoDeletion()
    {
        // The typo that names a REAL colleague. Answered 204, it wrote a project.unassigned row for
        // something that never happened and queued a folder deletion against a project they were
        // never on — which their client would then carry out.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = server.ClientFor(Alice);
        using var bob = server.ClientFor(Bob);
        await Corp.SyncAsync(alice);
        await Corp.SyncAsync(bob);
        var id = await NewProjectAsync(cto);
        await AssignAsync(cto, id, Alice);

        (await Corp.RefusalAsync(await UnassignAsync(cto, id, Bob, "?deleteFolder=true"), HttpStatusCode.NotFound))
            .Should().Contain("not on that project");

        Corp.ReadRecord(server, Bob).PendingFolderRemovals.Should().BeEmpty("nothing of his was ever there");
        Corp.Rows(server, OrgEventKinds.ProjectUnassigned).Should().BeEmpty();
    }

    [Fact]
    public async Task APersonalServerGrowsNoRecordFromTheAcknowledgementRoute()
    {
        // The one route on this surface with no corporate gate of its own: it wrote through the member
        // store, and the store creates what it cannot find — so a caller on a personal deployment could
        // conjure the org/ tree the architecture says such a server never grows.
        using var server = new VaultServer();
        using var alice = server.ClientFor(Alice);
        await Corp.SyncAsync(alice);

        var response = await alice.PostAsync(
            "/api/org/members/me/pending-folder-removals/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/ack", null, Ct);

        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
        Directory.Exists(Corp.OrgDir(server)).Should().BeFalse("a personal server grows no org/ tree");
    }

    [Fact]
    public async Task ADevelopersListSaysUnavailableRatherThanQuietlyDroppingAProjectItCannotRead()
    {
        // The caller's own record answers 503 when it cannot be read; an assigned project that cannot
        // be read was silently omitted, so the answer was 200 and a list missing the very project the
        // developer was looking for — which reads as "you are not on it any more".
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = server.ClientFor(Alice);
        await Corp.SyncAsync(alice);
        var id = await NewProjectAsync(cto, "Atlas");
        await AssignAsync(cto, id, Alice);
        await Corp.SetMemberAsync(cto, Alice, role: "dev");
        await File.WriteAllTextAsync(
            Path.Combine(Corp.OrgDir(server), "projects", id + ".json"), "{ not a project", Ct);

        var response = await alice.GetAsync("/api/org/projects", Ct);

        response.StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable);
    }
}
