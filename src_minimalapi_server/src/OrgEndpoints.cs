using System.Globalization;
using Microsoft.Extensions.Logging;

namespace CredVaultServer;

/// <summary>
/// Who is calling, or nothing — and when nothing, the gate has already set the status. The shape of
/// <c>RequireCaller</c> in <c>Program.cs</c>, crossing the file boundary as a delegate because the gates
/// stay there, so one file still answers "who may do this".
/// </summary>
public delegate (string Email, string? Name)? CallerGate(HttpContext ctx);

/// <summary>
/// The admin gate, which is asynchronous where <see cref="CallerGate"/> is not: it reads the registry
/// and writes its own refusal. It lives in <c>Program.cs</c> beside <c>RequireOfficer</c> — one file
/// answers "who may do this" — and crosses into the routes as this delegate.
/// </summary>
public delegate Task<(string Email, string? Name)?> AdminGate(HttpContext ctx);

/// <summary>
/// Everything the corporate routes need from <c>Program.cs</c>, as one record. The gates and
/// <c>DomainOf</c> are local functions in a top-level program and cross into this file only as
/// delegates; a record lets the next epics widen the set without editing the call site each time.
/// <see cref="DomainOf"/> and <see cref="AllowAnyDomain"/> are what the admin routes refuse a
/// cross-domain target with.
/// </summary>
public sealed record OrgEndpointDeps(
    CallerGate RequireCaller,
    AdminGate RequireAdmin,
    Func<string, string> DomainOf,
    OrgRecoveryConfig OrgRecovery,
    OrgMembersStore Members,
    OrgSettingsStore Settings,
    OrgEventLog Events,
    bool AllowAnyDomain,
    ILogger Log,
    int ServerContract);

/// <summary>
/// The corporate surface, <c>/api/org/*</c>, mapped from its own file.
///
/// <para><c>Program.cs</c> is past the coding-style ceiling already and four more epics add about
/// twenty routes between them, so the corporate routes are registered from per-epic files starting
/// with the first one — the way logic and storage are already split into <c>Org*.cs</c> /
/// <c>Org*Store.cs</c>. The authorization gates do not move: they stay beside <c>RequireOfficer</c>.</para>
///
/// <para><b>Every refusal here is a JSON <see cref="ErrorDto"/>.</b> An admin UI has to show WHY, so
/// <see cref="FailJson"/> is the sibling of <c>Program.cs</c>'s plain-text <c>Fail</c>; the older
/// endpoints keep their shape, because their clients were written against it.</para>
///
/// <para><b>What this surface is not.</b> The document <c>GET /api/org/me</c> serves is what an honest
/// client obeys — export, local backup and moving an entry out of a project happen inside the
/// extension, where the server cannot see them. Nothing here stops a developer with a valid token and
/// <c>curl</c>; the rules the server does enforce land at <c>POST /api/shares</c> and in the caller
/// gate in later epics, and the umbrella plan's <i>Boundaries</i> table grades each one.</para>
/// </summary>
public static class OrgEndpoints
{
    /// <summary>
    /// What the <c>503</c> tells a client about when to ask again. One constant, not a number at each
    /// site. Sixty seconds rather than a few: the record can only be fixed by an operator, so a client
    /// hammering the endpoint learns nothing sooner and logs the same Error line once per attempt.
    /// </summary>
    public const int UnavailableRetryAfterSeconds = 60;

    public static WebApplication MapOrgEndpoints(this WebApplication app, OrgEndpointDeps deps)
    {
        // The one document every client reads each cycle — in corp mode and out of it. Any allowed
        // caller; never writes (see MeAsync).
        app.MapGet("/api/org/me", (HttpContext ctx, CancellationToken ct) => MeAsync(ctx, deps, ct));

        // The admin's surface. Every one of these is RequireAdmin's, and the gate writes its own
        // refusal, so a route that forgets the null check cannot serve anybody.
        app.MapGet("/api/org/members", (HttpContext ctx, CancellationToken ct) => MembersAsync(ctx, deps, ct));
        app.MapPut("/api/org/members/{email}", (HttpContext ctx, string email, CancellationToken ct) =>
            SetMemberAsync(ctx, deps, email, ct));
        app.MapGet("/api/org/settings", (HttpContext ctx, CancellationToken ct) => SettingsAsync(ctx, deps, ct));
        app.MapPut("/api/org/settings", (HttpContext ctx, CancellationToken ct) => SetSettingsAsync(ctx, deps, ct));
        return app;
    }

    /// <summary>
    /// The JSON sibling of <c>Program.cs</c>'s <c>Fail</c>: a status and an <see cref="ErrorDto"/>, the
    /// shape the exception handler already emits. The gate the next story adds calls this too — a gate
    /// modelled on <c>RequireOfficer</c> would set a status and write nothing, and an empty <c>403</c> is
    /// not the "why" this surface promises.
    /// </summary>
    public static Task FailJson(HttpContext ctx, int status, string message)
    {
        ctx.Response.StatusCode = status;
        return ctx.Response.WriteAsJsonAsync(
            new ErrorDto(message), AppJsonContext.Default.ErrorDto, cancellationToken: ctx.RequestAborted);
    }

    /// <summary>
    /// The registration hook. <c>PUT /api/vault</c> calls it after the vault AND its owner sidecar have
    /// landed, corp mode only: the umbrella's decision 2 words it "auto-registered on first sync", and
    /// registering on every authenticated call would fill an admin's list with tokens that synced
    /// nothing. Personal mode returns before touching anything, so no <c>org/</c> can appear there.
    ///
    /// <para><b>It may never fail the write it rides on.</b> By the time it runs the vault is stored, so
    /// whatever the registry does — disk full, a lock, a permission, a record this build cannot read —
    /// is logged at Error and swallowed. Answering <c>500</c> for a vault that was in fact stored is a
    /// worse failure than an unregistered person: that is a state the design already handles, because
    /// <c>GET /api/org/me</c> computes the default and the next sync retries this same idempotent write.
    /// Watched failing without the catch: a file where <c>org/members</c> should be turned a stored vault
    /// into a <c>500</c>.</para>
    /// </summary>
    public static async Task RegisterOnSyncAsync(OrgEndpointDeps deps, string email, CancellationToken ct)
    {
        if (!deps.OrgRecovery.Enabled)
        {
            return;
        }
        try
        {
            await RegisterIfAbsentAsync(deps, email, ct);
        }
        catch (MemberRecordUnavailableException e)
        {
            // The store refused to overwrite a record it cannot read — a default written over a blocked
            // developer's unreadable record would be an unblock nobody ordered. The operator fixes the
            // file; the person's vault is stored regardless.
            deps.Log.LogError(e, "{Email} synced but was not registered: {Path} cannot be read and a sync must not overwrite it", email, e.FilePath);
        }
        catch (Exception e)
        {
            deps.Log.LogError(e, "{Email} synced but could not be registered; the vault write stands and the next sync retries", email);
        }
    }

    /// <summary>
    /// Only a person with NO record is written, and the decision is the store's, INSIDE the lock. The plan
    /// spelt the hook as an unconditional identity upsert, and that was watched re-stamping a record an
    /// admin had edited — <c>updatedBy</c> back to the empty string, <c>updatedAt</c> the time of the sync.
    /// The first fix looked the caller up first, and that was watched too: with the per-member gate held
    /// by a test, an admin's create landing between the lookup and the write was re-stamped all the same.
    /// <see cref="OrgMembersStore.InsertIfAbsentAsync"/> decides with the gate held, so there is no window.
    ///
    /// <para>The insert takes the request's token: a client that hangs up before the record exists has
    /// lost nothing, because the next sync retries this same idempotent write. The row does NOT — see
    /// inside.</para>
    /// </summary>
    private static async Task RegisterIfAbsentAsync(OrgEndpointDeps deps, string email, CancellationToken ct)
    {
        var result = await deps.Members.InsertIfAbsentAsync(email, ct);
        if (result.Created)
        {
            // Once the record exists the row is owed whoever is still listening. Cancelled by a
            // disconnect it is lost for good — every later sync finds the record and emits nothing — so
            // the append gets no client token; its own five-second bound is what limits the wait.
            await deps.Events.AppendAsync(Registered(result.Record), CancellationToken.None);
        }
    }

    /// <summary>The row for a record the sync created: the person is the actor of their own registration.</summary>
    private static OrgEventDto Registered(MemberRecord record) => new(
        At: record.UpdatedAt,
        Kind: OrgEventKinds.MemberRegistered,
        Actor: record.Email,
        Subject: record.Email,
        Project: null,
        ShareId: null,
        EntityName: null,
        EntityKind: null,
        Outcome: null,
        Detail: record.Role);

    /// <summary>
    /// <c>GET /api/org/me</c>. Corp mode off answers <c>corpMode: false</c> and the inert defaults from
    /// the default record — and consults nothing, so a personal server is indistinguishable from one that
    /// never had a registry, whatever a leftover file under <c>org/</c> says.
    /// </summary>
    private static async Task MeAsync(HttpContext ctx, OrgEndpointDeps deps, CancellationToken ct)
    {
        var caller = await RequireOrgCallerAsync(ctx, deps.RequireCaller);
        if (caller is null)
        {
            return;
        }
        if (!deps.OrgRecovery.Enabled)
        {
            await WriteAsync(ctx, MemberSelfDto.Personal(caller.Value.Email, deps.ServerContract), ct);
            return;
        }
        await CorpMeAsync(ctx, deps, caller.Value.Email, ct);
    }

    /// <summary>
    /// Three lookup answers, three branches, and the order they are written in is the finding of the
    /// plan round: <see cref="MemberLookup.NotRegistered"/> is the computed default with NOTHING written —
    /// a token that stored nothing gets no file — while <see cref="MemberLookup.Unavailable"/> is a
    /// <c>503</c>, never the default, because the default is <c>member</c> and a member may export.
    /// </summary>
    private static Task CorpMeAsync(HttpContext ctx, OrgEndpointDeps deps, string email, CancellationToken ct) =>
        deps.Members.Find(email) switch
        {
            { Status: MemberLookup.Unavailable } => FailUnavailable(ctx),
            { Status: MemberLookup.Found, Record: { } record } => WriteAsync(ctx, Self(deps, record), ct),
            _ => WriteAsync(ctx, Self(deps, MemberRecord.DefaultFor(email, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds())), ct),
        };

    private static MemberSelfDto Self(OrgEndpointDeps deps, MemberRecord record) =>
        MemberSelfDto.For(
            record,
            corpMode: true,
            isOfficer: deps.OrgRecovery.IsOfficer(record.Email),
            offlineLeaseHours: deps.Settings.Read().OfflineLeaseHours,
            serverContract: deps.ServerContract);

    private static Task WriteAsync(HttpContext ctx, MemberSelfDto self, CancellationToken ct) =>
        ctx.Response.WriteAsJsonAsync(self, AppJsonContext.Default.MemberSelfDto, cancellationToken: ct);

    /// <summary>
    /// The shared gate decides and sets the status; this adds the body the corporate surface promises,
    /// so a <c>401</c> or <c>403</c> here carries a sentence where the older endpoints carry none.
    /// </summary>
    public static async Task<(string Email, string? Name)?> RequireOrgCallerAsync(HttpContext ctx, CallerGate requireCaller)
    {
        var caller = requireCaller(ctx);
        if (caller is null)
        {
            await FailJson(ctx, ctx.Response.StatusCode, RefusalReason(ctx.Response.StatusCode));
        }
        return caller;
    }

    private static string RefusalReason(int status) => status switch
    {
        StatusCodes.Status401Unauthorized => "No verified identity was presented.",
        _ => "That account is not served by this deployment.",
    };

    // ---------- the admin's roster ----------

    /// <summary>
    /// Everyone in the admin's own domain, as rows.
    ///
    /// <para><b>Scoped by the store, not by the endpoint.</b> On a server whose
    /// <c>Vault:AllowedDomains</c> names two companies, one company's admin must never be handed the
    /// other's roster, and a filter written at the call site is a filter the next call site forgets.</para>
    ///
    /// <para><b>Not streamed</b>, unlike the share inbox: the plan budgets two hundred records of about
    /// a kilobyte, so the whole list is a fraction of one vault blob, and every record is answered from
    /// the store's cache behind one stat. The threshold at which that stops being true — roughly two
    /// thousand people — is recorded in the plan with pagination named as the answer.</para>
    /// </summary>
    private static async Task MembersAsync(HttpContext ctx, OrgEndpointDeps deps, CancellationToken ct)
    {
        var caller = await deps.RequireAdmin(ctx);
        if (caller is null)
        {
            return;
        }
        var rows = deps.Members.ListForDomain(deps.DomainOf(caller.Value.Email))
            .Select(record => MemberListEntryDto.For(record, deps.OrgRecovery.IsOfficer(record.Email)))
            .OrderBy(entry => entry.Email, StringComparer.Ordinal)
            .ToList();
        await ctx.Response.WriteAsJsonAsync(rows, AppJsonContext.Default.ListMemberListEntryDto, cancellationToken: ct);
    }

    /// <summary>
    /// Set a role, a share default, or both — for somebody who may not have synced yet.
    ///
    /// <para>The refusals, in the order they are checked and for the reason each exists. <b>A
    /// cross-domain target is <c>403</c></b>: two reviewers found that hole independently in the plan,
    /// and on a two-company server it is one company administering the other. <b>An officer is
    /// <c>409</c></b>, never a silent no-op — the roster is configuration, and a UI that appeared to
    /// demote the CTO would be lying about what happened. <b>An unknown role, an unknown share default,
    /// or nothing at all is <c>400</c></b>, naming the legal values, because the sentence is for an
    /// admin UI rather than a log. <b>A record this build cannot read is <c>503</c></b>, and the file is
    /// left exactly as it was: overwriting it would start from the default, and a default written over a
    /// blocked developer's corrupt record is an unblock nobody ordered.</para>
    /// </summary>
    private static async Task SetMemberAsync(HttpContext ctx, OrgEndpointDeps deps, string email, CancellationToken ct)
    {
        var caller = await deps.RequireAdmin(ctx);
        if (caller is null)
        {
            return;
        }
        var target = MemberRecord.Normalize(email);
        var refusal = TargetProblem(deps, caller.Value.Email, target);
        if (refusal is not null)
        {
            await FailJson(ctx, refusal.Value.Status, refusal.Value.Message);
            return;
        }
        var request = await ReadSetMemberAsync(ctx);
        var problem = request is null ? MalformedBody : request.Problem();
        if (problem.Length > 0)
        {
            await FailJson(ctx, StatusCodes.Status400BadRequest, problem);
            return;
        }
        await ApplyMemberEditAsync(ctx, deps, caller.Value.Email, target, request!, ct);
    }

    private const string MalformedBody = "The body is not the JSON this endpoint reads; send a role, a share default, or both.";

    /// <summary>The refusal this target earns before the body is even read, or nothing.</summary>
    /// <remarks>
    /// The shape is checked FIRST, and the order is the point: a path segment with no <c>@</c> is not a
    /// person, and answering it with the cross-domain <c>403</c> would tell an admin their own colleague
    /// is in another company. Without the check it would hash to a key like any string and be written.
    /// </remarks>
    private static (int Status, string Message)? TargetProblem(OrgEndpointDeps deps, string caller, string target)
    {
        if (!target.Contains('@') || target.Length < 3)
        {
            return (StatusCodes.Status400BadRequest,
                "That is not an email address, so there is nobody to give a role to.");
        }
        if (!deps.AllowAnyDomain && deps.DomainOf(target) != deps.DomainOf(caller))
        {
            return (StatusCodes.Status403Forbidden,
                "That address is in another domain; an administrator may only set roles inside their own.");
        }
        return deps.OrgRecovery.IsOfficer(target)
            ? (StatusCodes.Status409Conflict,
                "That address is a recovery officer, which is configuration rather than a role: officers "
                + "administer by being on the roster, and the roster is changed by the operator and a restart.")
            : null;
    }

    /// <summary>A body this build cannot parse is a <c>400</c>, never an exception the handler leaks.</summary>
    private static async Task<SetMemberRequest?> ReadSetMemberAsync(HttpContext ctx)
    {
        try
        {
            return await ctx.Request.ReadFromJsonAsync(AppJsonContext.Default.SetMemberRequest, ctx.RequestAborted);
        }
        catch (Exception e) when (e is System.Text.Json.JsonException or BadHttpRequestException)
        {
            return null;
        }
    }

    private static async Task ApplyMemberEditAsync(
        HttpContext ctx,
        OrgEndpointDeps deps,
        string admin,
        string target,
        SetMemberRequest request,
        CancellationToken ct)
    {
        UpsertResult result;
        try
        {
            result = await deps.Members.UpsertAsync(target, request.ApplyTo, admin, ct);
        }
        catch (MemberRecordUnavailableException)
        {
            // The same answer /api/org/me gives the person themselves, for the same reason: the record
            // exists and cannot be read, so nothing may be written over it either.
            await FailUnavailable(ctx);
            return;
        }
        await RecordMemberEditAsync(deps, admin, result, ct);
        await ctx.Response.WriteAsJsonAsync(
            MemberListEntryDto.For(result.Record, deps.OrgRecovery.IsOfficer(result.Record.Email)),
            AppJsonContext.Default.MemberListEntryDto,
            cancellationToken: ct);
    }

    /// <summary>
    /// The rows an edit leaves — after the write has landed, never before, and never able to fail it.
    ///
    /// <para>What "changed" means is decided against <see cref="UpsertResult.Before"/>, the record the
    /// write actually replaced, taken under the store's own lock. A lookup here would compare against
    /// whatever a concurrent admin had not yet written, and two admins editing one person could then log
    /// a transition that never happened.</para>
    /// </summary>
    private static async Task RecordMemberEditAsync(
        OrgEndpointDeps deps,
        string admin,
        UpsertResult result,
        CancellationToken ct)
    {
        if (result.Created)
        {
            await deps.Events.AppendAsync(
                Row(OrgEventKinds.MemberRegistered, admin, result.Record.Email, result.Record.Role), ct);
        }
        if (result.Before.Role != result.Record.Role)
        {
            await deps.Events.AppendAsync(
                Row(OrgEventKinds.MemberRoleChanged, admin, result.Record.Email,
                    Transition(result.Before.Role, result.Record.Role)), ct);
        }
        if (result.Before.ShareDefault != result.Record.ShareDefault)
        {
            await deps.Events.AppendAsync(
                Row(OrgEventKinds.MemberShareDefaultChanged, admin, result.Record.Email,
                    Transition(result.Before.ShareDefault, result.Record.ShareDefault)), ct);
        }
    }

    /// <summary>From and to in one field, because a row that says only the new value cannot be read back
    /// as a history: "made a developer" and "made a developer, again" are different facts.</summary>
    private static string Transition(string before, string after) => $"{before} -> {after}";

    private static OrgEventDto Row(string kind, string actor, string subject, string detail) => new(
        At: DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
        Kind: kind,
        Actor: actor,
        Subject: subject,
        Project: null,
        ShareId: null,
        EntityName: null,
        EntityKind: null,
        Outcome: null,
        Detail: detail);

    // ---------- the runtime settings ----------

    /// <summary>
    /// The settings an admin may change without a restart, and the reason they may: nothing here has a
    /// cryptographic consequence. The offline lease changes what an honest client does between two
    /// successful syncs; the officer roster changes what a key is sealed to, which is why that one stays
    /// in configuration and costs a restart and a ceremony.
    /// </summary>
    private static async Task SettingsAsync(HttpContext ctx, OrgEndpointDeps deps, CancellationToken ct)
    {
        var caller = await deps.RequireAdmin(ctx);
        if (caller is null)
        {
            return;
        }
        await ctx.Response.WriteAsJsonAsync(deps.Settings.Read(), AppJsonContext.Default.OrgSettingsDto, cancellationToken: ct);
    }

    private static async Task SetSettingsAsync(HttpContext ctx, OrgEndpointDeps deps, CancellationToken ct)
    {
        var caller = await deps.RequireAdmin(ctx);
        if (caller is null)
        {
            return;
        }
        var request = await ReadSetSettingsAsync(ctx);
        var problem = request is null ? MalformedSettingsBody : request.Problem();
        if (problem.Length > 0)
        {
            await FailJson(ctx, StatusCodes.Status400BadRequest, problem);
            return;
        }
        var hours = request!.OfflineLeaseHours!.Value;
        var update = await deps.Settings.UpdateAsync(
            current => current with { OfflineLeaseHours = hours }, caller.Value.Email, ct);
        if (update.Before.OfflineLeaseHours != update.After.OfflineLeaseHours)
        {
            await deps.Events.AppendAsync(
                Row(OrgEventKinds.SettingsChanged, caller.Value.Email, subject: string.Empty,
                    detail: $"offlineLeaseHours {Transition(
                        update.Before.OfflineLeaseHours.ToString(CultureInfo.InvariantCulture),
                        update.After.OfflineLeaseHours.ToString(CultureInfo.InvariantCulture))}"), ct);
        }
        await ctx.Response.WriteAsJsonAsync(update.After, AppJsonContext.Default.OrgSettingsDto, cancellationToken: ct);
    }

    private const string MalformedSettingsBody = "The body is not the JSON this endpoint reads; send offlineLeaseHours.";

    private static async Task<SetSettingsRequest?> ReadSetSettingsAsync(HttpContext ctx)
    {
        try
        {
            return await ctx.Request.ReadFromJsonAsync(AppJsonContext.Default.SetSettingsRequest, ctx.RequestAborted);
        }
        catch (Exception e) when (e is System.Text.Json.JsonException or BadHttpRequestException)
        {
            return null;
        }
    }

    private static Task FailUnavailable(HttpContext ctx)
    {
        ctx.Response.Headers.RetryAfter = UnavailableRetryAfterSeconds.ToString(CultureInfo.InvariantCulture);
        // Names the problem and WHO ends it — an administrator — so the person does not retry into the
        // same wall; never the file, which is the operator's business and is already in the server log
        // at Error, written once by the store.
        return FailJson(
            ctx,
            StatusCodes.Status503ServiceUnavailable,
            "Your membership record cannot be read by this server, so nothing about your role can be "
            + "answered. An administrator must repair it; the server log names the file.");
    }
}
