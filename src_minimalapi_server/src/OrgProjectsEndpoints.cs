using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace CredVaultServer;

/// <summary>
/// The project surface, <c>/api/org/projects/*</c>, mapped from its own file.
///
/// <para>Its own file for the reason <see cref="OrgEndpoints"/> gives: <c>Program.cs</c> is past the
/// size a reader can hold, and each epic of the control plane adds routes. It gains one
/// <see cref="MapOrgProjectsEndpoints"/> call and nothing else. The gates, the refusal shapes and the
/// event row come from <see cref="OrgEndpoints"/> rather than being written again — a second
/// <c>TargetProblem</c> is how two admin surfaces end up disagreeing about who an admin may manage.</para>
/// </summary>
public static class OrgProjectsEndpoints
{
    /// <summary>Everything these routes need, beside what <see cref="OrgEndpointDeps"/> already carries.</summary>
    public static IEndpointRouteBuilder MapOrgProjectsEndpoints(
        this IEndpointRouteBuilder app,
        OrgEndpointDeps deps,
        OrgProjectsStore projects)
    {
        app.MapGet("/api/org/projects", (HttpContext ctx, CancellationToken ct) => ListAsync(ctx, deps, projects, ct));
        app.MapPost("/api/org/projects", (HttpContext ctx, CancellationToken ct) => CreateAsync(ctx, deps, projects, ct));
        app.MapPut("/api/org/projects/{id}", (HttpContext ctx, string id, CancellationToken ct) =>
            UpdateAsync(ctx, deps, projects, id, ct));
        app.MapPut("/api/org/projects/{id}/members/{email}", (HttpContext ctx, string id, string email, CancellationToken ct) =>
            AssignAsync(ctx, deps, projects, id, email, ct));
        app.MapDelete("/api/org/projects/{id}/members/{email}", (HttpContext ctx, string id, string email, CancellationToken ct) =>
            UnassignAsync(ctx, deps, projects, id, email, ct));
        // The person's own acknowledgement that a folder removal has landed AND been pushed. Not an
        // admin route: it is the only write on this surface somebody makes about themselves.
        app.MapPost("/api/org/members/me/pending-folder-removals/{projectId}/ack",
            (HttpContext ctx, string projectId, CancellationToken ct) => AckAsync(ctx, deps, projectId, ct));
        return app;
    }

    // ---------- reading ----------

    /// <summary>
    /// <c>GET /api/org/projects</c> — what this caller may see.
    ///
    /// <para><b>A developer sees the projects they are ASSIGNED to, and nothing else.</b> Not the ones
    /// they created (a developer creates none), and not the whole list: a project's NAME is a fact about
    /// a customer engagement, and the roster of who else exists is not a developer's business. Admins
    /// and members see everything, archived included — a member may still hold entities from a project
    /// that has since closed, and a name they cannot resolve helps nobody.</para>
    /// </summary>
    private static async Task ListAsync(
        HttpContext ctx,
        OrgEndpointDeps deps,
        OrgProjectsStore projects,
        CancellationToken ct)
    {
        var caller = await OrgEndpoints.RequireOrgCallerAsync(ctx, deps.RequireCaller);
        if (caller is null)
        {
            return;
        }
        if (!deps.OrgRecovery.Enabled)
        {
            await WriteListAsync(ctx, [], ct);
            return;
        }
        var visible = Visible(deps, projects, caller.Value.Email);
        if (visible is null)
        {
            await OrgEndpoints.FailUnavailable(ctx);
            return;
        }
        await WriteListAsync(ctx, visible, ct);
    }

    /// <summary>
    /// What this caller may see, or <c>null</c> when their own record cannot be read.
    ///
    /// <para><b>Null rather than the whole list</b>, and the shape is the point. The blocking gate
    /// already refuses an unreadable record with a <c>503</c> before this method runs — a test proves
    /// it — so this branch is unreachable today. It is written closed anyway: the previous shape
    /// answered "I cannot read your record" with *every project on this server*, which is the one
    /// answer a developer must never get, and the only thing standing between it and a caller was a
    /// gate on a different layer.</para>
    /// </summary>
    private static List<ProjectDto>? Visible(OrgEndpointDeps deps, OrgProjectsStore projects, string email)
    {
        var lookup = deps.OrgRecovery.IsOfficer(email) ? null : (MemberLookupResult?)deps.Members.Find(email);
        if (lookup is { Status: MemberLookup.Unavailable })
        {
            return null;
        }
        // A developer resolves the projects they are ON, rather than reading every project on the
        // server and discarding the rest. Archived ones are kept: a developer may still hold entities
        // from an engagement that has closed, and an id they cannot resolve to a name helps nobody.
        return lookup is { Status: MemberLookup.Found, Record: { Role: MemberRole.Dev } developer }
            ? Assigned(projects, developer)
            : [.. projects.List().Select(Dto)];
    }

    private static List<ProjectDto> Assigned(OrgProjectsStore projects, MemberRecord developer) =>
    [
        .. developer.Projects
            .Select(p => projects.Find(p.ProjectId))
            .Where(found => found is { Status: ProjectLookup.Found })
            .Select(found => Dto(found.Record!)),
    ];

    private static ProjectDto Dto(ProjectRecord record) => new(record.Id, record.Name, record.Archived);

    private static Task WriteListAsync(HttpContext ctx, List<ProjectDto> projects, CancellationToken ct) =>
        ctx.Response.WriteAsJsonAsync(projects, AppJsonContext.Default.ListProjectDto, cancellationToken: ct);

    // ---------- the admin's four ----------

    private static async Task CreateAsync(
        HttpContext ctx,
        OrgEndpointDeps deps,
        OrgProjectsStore projects,
        CancellationToken ct)
    {
        var admin = await deps.RequireAdmin(ctx);
        if (admin is null)
        {
            return;
        }
        var request = await OrgEndpoints.ReadJsonAsync(ctx, AppJsonContext.Default.CreateProjectRequest);
        var problem = request?.Problem() ?? "The body is not the JSON this endpoint reads; send a name.";
        if (problem.Length > 0)
        {
            await OrgEndpoints.FailJson(ctx, StatusCodes.Status400BadRequest, problem);
            return;
        }
        var created = await projects.CreateAsync(request!.Name!, admin.Value.Email, ct);
        await deps.Events.AppendAsync(
            OrgEndpoints.Row(OrgEventKinds.ProjectCreated, admin.Value.Email, null, created.Name, created.Id),
            CancellationToken.None);
        await WriteProjectAsync(ctx, created, ct);
    }

    /// <summary>
    /// <c>PUT /api/org/projects/{id}</c> — rename, archive, unarchive, or a rename and one of those.
    ///
    /// <para>Both fields are nullable and null means "leave it": an omitted <c>archived</c> must not
    /// unarchive, which a positional <c>bool</c> would have done on every rename. <b>Unarchiving is
    /// allowed</b> and gets its own row — an admin who archived the wrong project must be able to say
    /// so, and a log that records the archive without the undo describes a state the server is not in.</para>
    /// </summary>
    private static async Task UpdateAsync(
        HttpContext ctx,
        OrgEndpointDeps deps,
        OrgProjectsStore projects,
        string id,
        CancellationToken ct)
    {
        var admin = await deps.RequireAdmin(ctx);
        if (admin is null)
        {
            return;
        }
        var request = await OrgEndpoints.ReadJsonAsync(ctx, AppJsonContext.Default.UpdateProjectRequest);
        var problem = request?.Problem() ?? "The body is not the JSON this endpoint reads; send name, archived, or both.";
        if (problem.Length > 0)
        {
            await OrgEndpoints.FailJson(ctx, StatusCodes.Status400BadRequest, problem);
            return;
        }
        await ApplyUpdateAsync(ctx, deps, projects, id, request!, admin.Value.Email, ct);
    }

    private static async Task ApplyUpdateAsync(
        HttpContext ctx,
        OrgEndpointDeps deps,
        OrgProjectsStore projects,
        string id,
        UpdateProjectRequest request,
        string admin,
        CancellationToken ct)
    {
        var result = await projects.UpdateAsync(
            id,
            p => p with { Name = request.Name?.Trim() ?? p.Name, Archived = request.Archived ?? p.Archived },
            admin,
            ct);
        if (result is not { Status: ProjectLookup.Found, Before: { } before, After: { } after })
        {
            await MissingOrUnavailable(ctx, result.Status);
            return;
        }
        await RecordUpdateAsync(deps, admin, before, after);
        await WriteProjectAsync(ctx, after, ct);
    }

    /// <summary>
    /// One row per thing that actually changed — a rename and an archive in one call are two.
    ///
    /// <para><paramref name="before"/> is the record the write REPLACED, taken under the store's own
    /// lock (<see cref="ProjectUpdate"/>). A <c>Find</c> here instead would compare against whatever a
    /// concurrent admin had not yet written, and log a transition this request did not make.</para>
    /// </summary>
    private static async Task RecordUpdateAsync(
        OrgEndpointDeps deps,
        string admin,
        ProjectRecord before,
        ProjectRecord after)
    {
        if (before.Name != after.Name)
        {
            await deps.Events.AppendAsync(
                OrgEndpoints.Row(OrgEventKinds.ProjectRenamed, admin, null, $"{before.Name} → {after.Name}", after.Id),
                CancellationToken.None);
        }
        if (before.Archived == after.Archived)
        {
            return;
        }
        var kind = after.Archived ? OrgEventKinds.ProjectArchived : OrgEventKinds.ProjectUnarchived;
        await deps.Events.AppendAsync(
            OrgEndpoints.Row(kind, admin, null, after.Name, after.Id), CancellationToken.None);
    }

    private static async Task AssignAsync(
        HttpContext ctx,
        OrgEndpointDeps deps,
        OrgProjectsStore projects,
        string id,
        string email,
        CancellationToken ct)
    {
        var context = await AdminOnAsync(ctx, deps, projects, id, email);
        if (context is null)
        {
            return;
        }
        // Archiving is the only way a project closes — it cannot be deleted, because the event log
        // cites it forever. A closed project that still takes people is not closed. Taking somebody
        // OFF an archived project stays allowed: a project closes with people still on it.
        if (context.Value.Project.Archived)
        {
            await OrgEndpoints.FailJson(
                ctx,
                StatusCodes.Status409Conflict,
                "That project is archived. Unarchive it before putting anybody on it; taking somebody off it works either way.");
            return;
        }
        var request = await OrgEndpoints.ReadJsonAsync(ctx, AppJsonContext.Default.ProjectMemberRequest);
        var problem = request?.Problem() ?? "The body is not the JSON this endpoint reads; send a share.";
        if (problem.Length > 0)
        {
            await OrgEndpoints.FailJson(ctx, StatusCodes.Status400BadRequest, problem);
            return;
        }
        await WriteAssignmentAsync(ctx, deps, context.Value, request!.Share!, ct);
    }

    private static async Task WriteAssignmentAsync(
        HttpContext ctx,
        OrgEndpointDeps deps,
        (string Admin, string Target, ProjectRecord Project) on,
        string share,
        CancellationToken ct)
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var result = await UpsertOrFailAsync(ctx, deps, on.Target, on.Admin, ct, r => r with
        {
            Projects = [.. r.Projects.Where(p => p.ProjectId != on.Project.Id), new ProjectAssignment(on.Project.Id, share)],
            // Putting somebody back WITHDRAWS a standing instruction to delete that folder. Both are
            // durable and their client reads them in one document: left in place, the removal is
            // carried out on the next cycle against the folder it has just been told it owns.
            PendingFolderRemovals = RemovalsAfter(r, on.Project.Id, deleteFolder: false, now),
        });
        if (result is null)
        {
            return;
        }
        await deps.Events.AppendAsync(
            OrgEndpoints.Row(OrgEventKinds.ProjectAssigned, on.Admin, on.Target, share, on.Project.Id),
            CancellationToken.None);
        ctx.Response.StatusCode = StatusCodes.Status204NoContent;
    }

    /// <summary>
    /// <c>DELETE /api/org/projects/{id}/members/{email}?deleteFolder=…</c> — take somebody off a project.
    ///
    /// <para><b><c>deleteFolder</c> is required.</b> Left to a default, one reading deletes somebody's
    /// folder when the admin meant only to unassign, and the other leaves corporate material on a
    /// machine when they meant to remove it — and the request looks identical either way. Making the
    /// caller say it costs one query parameter and removes the guess.</para>
    /// </summary>
    private static async Task UnassignAsync(
        HttpContext ctx,
        OrgEndpointDeps deps,
        OrgProjectsStore projects,
        string id,
        string email,
        CancellationToken ct)
    {
        var context = await AdminOnAsync(ctx, deps, projects, id, email);
        if (context is null)
        {
            return;
        }
        var (deleteFolder, problem) = ReadDeleteFolder(ctx);
        if (problem.Length > 0)
        {
            await OrgEndpoints.FailJson(ctx, StatusCodes.Status400BadRequest, problem);
            return;
        }
        if (!await RemovableAsync(ctx, deps, context.Value.Target, context.Value.Project.Id))
        {
            return;
        }
        await WriteUnassignmentAsync(ctx, deps, context.Value, deleteFolder, ct);
    }

    /// <summary>
    /// Whether there is anything here to take away from this person — asked on the way OUT of a
    /// project, never on the way in.
    ///
    /// <para><b>The asymmetry with assignment is deliberate.</b> The member store creates what it
    /// cannot find, and on an ASSIGNMENT that is the feature: an admin puts a new hire on a project on
    /// their first day, before they have opened the extension, exactly as the members surface already
    /// gives them a role. On an unassignment there is nothing to create.</para>
    ///
    /// <para><b>Being on the roster is not enough — they must be on THIS project</b>, or hold a standing
    /// instruction about it. The code round found what the weaker check allowed: an admin's typo naming
    /// a real colleague answered <c>204</c>, wrote a <c>project.unassigned</c> row for something that
    /// never happened, and queued a folder deletion against a project that person was never on, which
    /// their client would then carry out. The standing-instruction half is what keeps an admin able to
    /// change their mind — <c>?deleteFolder=false</c> after a removal — once the assignment is gone.</para>
    /// </summary>
    private static async Task<bool> RemovableAsync(
        HttpContext ctx,
        OrgEndpointDeps deps,
        string target,
        string projectId)
    {
        var lookup = deps.Members.Find(target);
        if (lookup is { Status: MemberLookup.Found, Record: { } record })
        {
            return OrgProjects.IsAssigned(record, projectId)
                || record.PendingFolderRemovals.Any(x => x.ProjectId == projectId)
                || await RefuseUnassignmentAsync(ctx, "That person is not on that project, so there is nothing to remove them from.");
        }
        await (lookup.Status == MemberLookup.Unavailable
            ? OrgEndpoints.FailUnavailable(ctx)
            : OrgEndpoints.FailJson(
                ctx,
                StatusCodes.Status404NotFound,
                "Nobody with that address is registered on this server, so there is nothing to unassign."));
        return false;
    }

    /// <summary>Writes the refusal and answers false, so the caller reads as one boolean expression.</summary>
    private static async Task<bool> RefuseUnassignmentAsync(HttpContext ctx, string message)
    {
        await OrgEndpoints.FailJson(ctx, StatusCodes.Status404NotFound, message);
        return false;
    }

    private static (bool DeleteFolder, string Problem) ReadDeleteFolder(HttpContext ctx)
    {
        var raw = ctx.Request.Query["deleteFolder"].ToString();
        if (bool.TryParse(raw, out var value))
        {
            return (value, string.Empty);
        }
        return (false,
            "Say what happens to their copy: deleteFolder=true removes the project folder from every "
            + "machine they sync, deleteFolder=false leaves it with them. There is no default, because "
            + "the two are not recoverable from each other.");
    }

    private static async Task WriteUnassignmentAsync(
        HttpContext ctx,
        OrgEndpointDeps deps,
        (string Admin, string Target, ProjectRecord Project) on,
        bool deleteFolder,
        CancellationToken ct)
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var result = await UpsertOrFailAsync(ctx, deps, on.Target, on.Admin, ct, r => r with
        {
            Projects = [.. r.Projects.Where(p => p.ProjectId != on.Project.Id)],
            PendingFolderRemovals = RemovalsAfter(r, on.Project.Id, deleteFolder, now),
        });
        if (result is null)
        {
            return;
        }
        await deps.Events.AppendAsync(
            OrgEndpoints.Row(
                OrgEventKinds.ProjectUnassigned,
                on.Admin,
                on.Target,
                deleteFolder ? "and their folder is to be removed" : "their folder stays with them",
                on.Project.Id),
            CancellationToken.None);
        ctx.Response.StatusCode = StatusCodes.Status204NoContent;
    }

    /// <summary>
    /// Their standing folder removals after this decision: at most one per project, and the last word
    /// wins.
    ///
    /// <para>Both callers pass through here, which is what makes the rule one rule. An unassignment
    /// that leaves the folder records nothing — nothing has to happen on the other side — but it must
    /// still WITHDRAW an instruction already standing, or an admin who changes their mind cannot.</para>
    /// </summary>
    private static IReadOnlyList<PendingFolderRemoval> RemovalsAfter(
        MemberRecord record,
        string projectId,
        bool deleteFolder,
        long now)
    {
        var others = record.PendingFolderRemovals.Where(x => x.ProjectId != projectId);
        return deleteFolder ? [.. others, new PendingFolderRemoval(projectId, true, now)] : [.. others];
    }

    // ---------- the person's own ----------

    /// <summary>
    /// <c>POST /api/org/members/me/pending-folder-removals/{projectId}/ack</c> — this device has removed
    /// the folder AND pushed the removal.
    ///
    /// <para><b>Idempotent, and per PERSON rather than per device.</b> One entry per member record: the
    /// first machine to carry the instruction out clears it, and every other machine of theirs receives
    /// the deletion the ordinary way, as a tombstone through their own vault sync. That is why the
    /// client must ack after the PUSH and not after the local delete — the acknowledgement is a claim
    /// that the removal has left this machine, not that it happened on it.</para>
    /// </summary>
    private static async Task AckAsync(HttpContext ctx, OrgEndpointDeps deps, string projectId, CancellationToken ct)
    {
        var caller = await OrgEndpoints.RequireOrgCallerAsync(ctx, deps.RequireCaller);
        if (caller is null)
        {
            return;
        }
        // The only route on this surface with no admin gate of its own, and it WRITES — through a store
        // that creates what it cannot find. Without this line a caller on a personal deployment could
        // conjure the org/ tree such a server is documented never to grow. Idempotent either way: there
        // is nothing to acknowledge here, and saying so with 204 is the same answer as clearing one.
        if (!deps.OrgRecovery.Enabled)
        {
            ctx.Response.StatusCode = StatusCodes.Status204NoContent;
            return;
        }
        var result = await UpsertOrFailAsync(ctx, deps, caller.Value.Email, caller.Value.Email, ct, r => r with
        {
            PendingFolderRemovals = [.. r.PendingFolderRemovals.Where(x => x.ProjectId != projectId)],
        });
        if (result is not null)
        {
            ctx.Response.StatusCode = StatusCodes.Status204NoContent;
        }
    }

    // ---------- the shapes these five share ----------

    /// <summary>
    /// The admin, the target and the project — or nothing, with the refusal already written.
    ///
    /// <para>The project must EXIST before anybody is assigned to it: without this check an admin's typo
    /// writes an assignment naming nothing, and an event row citing an id that resolves to no project.</para>
    /// </summary>
    private static async Task<(string Admin, string Target, ProjectRecord Project)?> AdminOnAsync(
        HttpContext ctx,
        OrgEndpointDeps deps,
        OrgProjectsStore projects,
        string id,
        string email)
    {
        var admin = await deps.RequireAdmin(ctx);
        if (admin is null)
        {
            return null;
        }
        var target = MemberRecord.Normalize(email);
        var refusal = OrgEndpoints.TargetProblem(deps, admin.Value.Email, target);
        if (refusal is not null)
        {
            await OrgEndpoints.FailJson(ctx, refusal.Value.Status, refusal.Value.Message);
            return null;
        }
        var project = projects.Find(id);
        if (project.Status != ProjectLookup.Found || project.Record is null)
        {
            await MissingOrUnavailable(ctx, project.Status);
            return null;
        }
        return (admin.Value.Email, target, project.Record);
    }

    private static async Task<UpsertResult?> UpsertOrFailAsync(
        HttpContext ctx,
        OrgEndpointDeps deps,
        string target,
        string actor,
        CancellationToken ct,
        Func<MemberRecord, MemberRecord> edit)
    {
        try
        {
            return await deps.Members.UpsertAsync(target, edit, actor, ct);
        }
        catch (MemberRecordUnavailableException)
        {
            await OrgEndpoints.FailUnavailable(ctx);
            return null;
        }
    }

    /// <summary>A project nobody can find is a <c>404</c>; one this build cannot read is a <c>503</c>.</summary>
    private static Task MissingOrUnavailable(HttpContext ctx, ProjectLookup status) =>
        status == ProjectLookup.Unreadable
            ? OrgEndpoints.FailUnavailable(ctx)
            : OrgEndpoints.FailJson(ctx, StatusCodes.Status404NotFound, "There is no project with that id on this server.");

    private static Task WriteProjectAsync(HttpContext ctx, ProjectRecord record, CancellationToken ct) =>
        ctx.Response.WriteAsJsonAsync(
            Dto(record),
            AppJsonContext.Default.ProjectDto,
            cancellationToken: ct);
}
