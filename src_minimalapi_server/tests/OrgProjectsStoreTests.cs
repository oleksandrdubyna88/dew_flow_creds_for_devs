using FluentAssertions;
using Microsoft.Extensions.Logging;

namespace CredVaultServer.Tests;

/// <summary>
/// The project store on its own: what it writes, what it refuses to overwrite, and the one thing it
/// must never do — treat a file it cannot read as a project that is not there.
/// </summary>
public sealed class OrgProjectsStoreTests
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static string TempDir()
    {
        var dir = Path.Combine(Path.GetTempPath(), "cred-vault-tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        return dir;
    }

    private static (OrgProjectsStore Store, CapturingLogger<OrgProjectsStore> Log, string Dir) StoreIn(string? dir = null)
    {
        var root = dir ?? TempDir();
        var log = new CapturingLogger<OrgProjectsStore>();
        return (new OrgProjectsStore(root, log), log, root);
    }

    private static string PathFor(string dir, string id) => Path.Combine(dir, "org", "projects", id + ".json");

    [Fact]
    public async Task AProjectRoundTripsAndIsNamedByItsId()
    {
        var (store, _, dir) = StoreIn();

        var created = await store.CreateAsync("Atlas", "cto@example.com", Ct);

        created.Id.Should().MatchRegex("^[0-9a-f]{32}$", "the id is a hex GUID, which is also the filename");
        File.Exists(PathFor(dir, created.Id)).Should().BeTrue();
        var found = store.Find(created.Id);
        found.Status.Should().Be(ProjectLookup.Found);
        found.Record!.Name.Should().Be("Atlas");
        found.Record.Archived.Should().BeFalse();
        found.Record.CreatedBy.Should().Be("cto@example.com");
    }

    [Fact]
    public void NoProjectsMeansNoDirectoryAtAll()
    {
        // The rule epic 1 departed from the older template for: an `org/` tree appearing on a personal
        // deployment tells an operator this server has a roster when it has none.
        var (store, _, dir) = StoreIn();

        store.List().Should().BeEmpty();
        store.Find(new string('a', 32)).Status.Should().Be(ProjectLookup.Absent);

        Directory.Exists(Path.Combine(dir, "org")).Should().BeFalse();
    }

    [Fact]
    public async Task AFileThisBuildCannotReadIsUnreadableAndNeverAbsent()
    {
        // The whole reason the result has three states. Read as "absent", a rename would write a fresh
        // record over a half-written one and lose whatever it held — including assignments nobody touched.
        var (store, log, dir) = StoreIn();
        var created = await store.CreateAsync("Atlas", "cto@example.com", Ct);
        await File.WriteAllTextAsync(PathFor(dir, created.Id), "{ this is not a project", Ct);

        var found = store.Find(created.Id);

        found.Status.Should().Be(ProjectLookup.Unreadable);
        found.Record.Should().BeNull();
        log.Errors.Should().ContainSingle().Which.Should().Contain("NOT treated as absent");
    }

    [Fact]
    public async Task ARecordInTheWrongFileIsUnreadableToo()
    {
        // A restore that mixed two files, or a hand-edit. The id inside must match the name outside, or
        // one project's assignments answer under another's id.
        var (store, _, dir) = StoreIn();
        var a = await store.CreateAsync("Atlas", "cto@example.com", Ct);
        var b = await store.CreateAsync("Borealis", "cto@example.com", Ct);
        File.Copy(PathFor(dir, b.Id), PathFor(dir, a.Id), overwrite: true);

        store.Find(a.Id).Status.Should().Be(ProjectLookup.Unreadable);
    }

    [Fact]
    public async Task AnIdThatCouldLeaveTheFolderIsSimplyNotThere()
    {
        var (store, _, _) = StoreIn();
        await store.CreateAsync("Atlas", "cto@example.com", Ct);

        foreach (var hostile in new[] { "../settings", "..", "", "not-a-guid", new string('z', 32) })
        {
            store.Find(hostile).Status.Should().Be(ProjectLookup.Absent, $"'{hostile}' names no project");
        }
    }

    [Fact]
    public async Task AnUpdateReadsAndWritesUnderOneLockSoConcurrentEditsDoNotLoseEachOther()
    {
        // A rename and an archive arriving together. Without the gate both read the same record and the
        // second write discards the first — silently, which is the only kind of loss nobody reports.
        var (store, _, _) = StoreIn();
        var created = await store.CreateAsync("Atlas", "cto@example.com", Ct);

        await Task.WhenAll(
            store.UpdateAsync(created.Id, p => p with { Name = "Atlas II" }, "a@example.com", Ct),
            store.UpdateAsync(created.Id, p => p with { Archived = true }, "b@example.com", Ct));

        var found = store.Find(created.Id).Record!;
        found.Name.Should().Be("Atlas II", "the rename survived the archive");
        found.Archived.Should().BeTrue("and the archive survived the rename");
    }

    [Fact]
    public async Task UpdatingSomethingThatIsNotThereSaysSoRatherThanCreatingIt()
    {
        var (store, _, _) = StoreIn();

        var result = await store.UpdateAsync(new string('b', 32), p => p with { Name = "Ghost" }, "a@example.com", Ct);

        result.Status.Should().Be(ProjectLookup.Absent);
        result.Before.Should().BeNull("nothing was replaced");
    }

    [Fact]
    public async Task TheListIsNewestFirstAndSkipsWhatItCannotRead()
    {
        var (store, log, dir) = StoreIn();
        var first = await store.CreateAsync("First", "cto@example.com", Ct);
        await Task.Delay(2, Ct);
        var second = await store.CreateAsync("Second", "cto@example.com", Ct);
        await File.WriteAllTextAsync(PathFor(dir, first.Id), "{ broken", Ct);

        var listed = store.List();

        listed.Should().ContainSingle().Which.Id.Should().Be(second.Id);
        log.Errors.Should().ContainSingle().Which.Should().Contain("left out of the list");
    }

    [Fact]
    public async Task NameOfAnswersEmptyForAnythingItCannotResolve()
    {
        // An assignment to a project since removed must not fail the whole /api/org/me document.
        var (store, _, _) = StoreIn();
        var created = await store.CreateAsync("Atlas", "cto@example.com", Ct);

        store.NameOf(created.Id).Should().Be("Atlas");
        store.NameOf(new string('c', 32)).Should().BeEmpty();
        store.NameOf("../settings").Should().BeEmpty();
    }

    [Fact]
    public void ANameIsSomethingAPersonCanRead()
    {
        ProjectRecord.NameProblem("Atlas").Should().BeEmpty();
        ProjectRecord.NameProblem("  ").Should().Contain("needs a name");
        ProjectRecord.NameProblem(null).Should().Contain("needs a name");
        ProjectRecord.NameProblem(new string('x', ProjectRecord.MaxNameLength + 1)).Should().Contain("at most");
    }

    [Fact]
    public void AnUnassignedPersonMayDoNothingInAProject()
    {
        // The plan round's finding, and it would have been a real hole: falling through to the member's
        // own shareDefault gives somebody with a permissive default the run of every project on the
        // server, assigned or not. An absent assignment is not a missing override.
        var member = MemberRecord.DefaultFor("bob@example.com", 0) with
        {
            ShareDefault = ShareDefaults.Any,
            Projects = [new ProjectAssignment("p1", ProjectMemberRequest.Inherit)],
        };

        OrgProjects.EffectiveShare(member, "p1").Should().Be(ShareDefaults.Any, "inherit means the role's default");
        OrgProjects.EffectiveShare(member, "p2").Should().Be(ShareDefaults.None, "not assigned is not permitted");
        OrgProjects.IsAssigned(member, "p1").Should().BeTrue();
        OrgProjects.IsAssigned(member, "p2").Should().BeFalse();
    }

    [Fact]
    public void AnOverrideBeatsTheRoleDefault()
    {
        var member = MemberRecord.DefaultFor("bob@example.com", 0) with
        {
            ShareDefault = ShareDefaults.None,
            Projects = [new ProjectAssignment("p1", ShareDefaults.Project)],
        };

        OrgProjects.EffectiveShare(member, "p1").Should().Be(ShareDefaults.Project);
    }

    [Fact]
    public void AnOmittedArchivedFieldMeansUnchangedRatherThanFalse()
    {
        // `SetActiveRequest`'s lesson one epic later: a positional bool the client omitted binds false,
        // so a plain rename would have silently unarchived the project.
        new UpdateProjectRequest("Atlas II", null).Archived.Should().BeNull();
        new UpdateProjectRequest("Atlas II", null).Problem().Should().BeEmpty();
        new UpdateProjectRequest(null, null).Problem().Should().Contain("Nothing to change");
        new UpdateProjectRequest("  ", null).Problem().Should().Contain("needs a name");
    }

    [Fact]
    public void InheritFollowsTheRolesPolicyRatherThanTheStoredField()
    {
        // `MemberPolicy.For` is where "what may this role do" is decided, and the type it returns says
        // why: derived, never stored. Reading `ShareDefault` off the record instead is a second copy of
        // that rule, and the two disagree exactly where it matters — a role this build does not know
        // fails CLOSED in the policy and fell through to the stored value here.
        var newerServersRole = MemberRecord.DefaultFor("bob@example.com", 0) with
        {
            Role = "overseer",
            ShareDefault = ShareDefaults.Project,
            Projects = [new ProjectAssignment("p1", ProjectMemberRequest.Inherit)],
        };

        OrgProjects.EffectiveShare(newerServersRole, "p1").Should().Be(
            ShareDefaults.None,
            "a role this build cannot understand is one whose permissions it cannot honestly grant");
    }

    [Fact]
    public void AStoredShareThisBuildDoesNotKnowIsNotHonoured()
    {
        var dev = MemberRecord.DefaultFor("bob@example.com", 0) with
        {
            Role = MemberRole.Dev,
            ShareDefault = "everything",
            Projects = [new ProjectAssignment("p1", ProjectMemberRequest.Inherit)],
        };

        OrgProjects.EffectiveShare(dev, "p1").Should().Be(ShareDefaults.None);
    }

    [Fact]
    public async Task AnUpdateSaysWhatItReplacedAndWhatItWrote()
    {
        // The caller writes "renamed from X to Y" out of the difference, so X has to be the record this
        // write replaced. Read with a Find before the call it is whatever a concurrent admin had not yet
        // written — which is how a rename ends up logging an archive it did not perform.
        var (store, _, _) = StoreIn();
        var created = await store.CreateAsync("Atlas", "cto@example.com", Ct);

        var update = await store.UpdateAsync(created.Id, p => p with { Name = "Atlas II" }, "a@example.com", Ct);

        update.Status.Should().Be(ProjectLookup.Found);
        update.Before!.Name.Should().Be("Atlas");
        update.After!.Name.Should().Be("Atlas II");
        update.Before.Archived.Should().BeFalse();
    }

    [Fact]
    public async Task AListedRecordMustBeTheProjectItsFileIsNamedFor()
    {
        // Find already refuses this; the LIST did not, so a copied file answered under one id in the
        // listing and was absent from every id-based route — an admin sees a project they cannot
        // rename, archive or assign anybody to.
        var (store, log, dir) = StoreIn();
        var a = await store.CreateAsync("Atlas", "cto@example.com", Ct);
        var b = await store.CreateAsync("Borealis", "cto@example.com", Ct);
        File.Copy(PathFor(dir, b.Id), PathFor(dir, a.Id), overwrite: true);

        store.List().Select(p => p.Id).Should().Equal([b.Id], "the impostor is left out");
        log.Errors.Should().ContainSingle().Which.Should().Contain("named for");
    }

    [Fact]
    public void AProjectsFolderThatCannotBeReadSaysSoRatherThanLookingEmpty()
    {
        // A permissions or I/O failure on the directory looked exactly like a server with no
        // projects, and nothing anywhere said otherwise.
        var (store, log, dir) = StoreIn();
        // A FILE where the projects directory should be: no enumeration can succeed under it.
        Directory.CreateDirectory(Path.Combine(dir, "org"));
        File.WriteAllText(Path.Combine(dir, "org", "projects"), "a file where the folder should be");

        store.List().Should().BeEmpty();

        log.Errors.Should().ContainSingle().Which.Should().Contain("sits where the projects folder belongs");
    }

    [Fact]
    public void ANameIsOneLineAPersonCanRead()
    {
        // The name becomes a FOLDER on every assigned person's machine, and a newline or a tab in a
        // folder name is a path Windows refuses outright.
        ProjectRecord.NameProblem("Atlas\nBorealis").Should().Contain("one line");
        ProjectRecord.NameProblem("Atlas\tII").Should().Contain("one line");
        ProjectRecord.NameProblem("Atlas II").Should().BeEmpty();
    }

    [Fact]
    public void ANameThatCouldBeAPathIsRefused()
    {
        // The name is carried to every assigned machine and used as a folder name there. A separator
        // in it is not a name — and an export, which writes files named after what it exports, is one
        // step from a path nobody chose.
        ProjectRecord.NameProblem("../../outside").Should().Contain("slashes");
        ProjectRecord.NameProblem("..\\Secrets").Should().Contain("slashes");
        ProjectRecord.NameProblem("a/b").Should().Contain("slashes");
        ProjectRecord.NameProblem("Atlas II").Should().BeEmpty("an ordinary name is untouched");
    }

    [Fact]
    public void AnAssignmentWithNoProjectIdAtAllIsAbsentRatherThanACrash()
    {
        // A record written by a newer server, or one hand-edited, can carry a null where the type says
        // string — the AOT serializer does not enforce it. NameOf must answer, not throw: a document
        // that fails whole costs the person their role, their policy and their lease.
        var (store, _, _) = StoreIn();

        store.NameOf(null!).Should().BeEmpty();
        store.Find(null!).Status.Should().Be(ProjectLookup.Absent);
    }

    [Fact]
    public void AServerWithNoProjectsYetIsNotAnERROR()
    {
        // The directory appears on the first WRITE, so on a corporate server before anybody has made a
        // project it is simply not there. Reported as a failure to list, every fresh deployment would
        // log an error for its ordinary first state.
        var (store, log, _) = StoreIn();

        store.List().Should().BeEmpty();

        log.Errors.Should().BeEmpty();
    }
}
