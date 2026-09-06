using System.Globalization;
using System.Text.Json.Serialization.Metadata;
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
/// cross-domain target with. <see cref="Shares"/> is the one store the share endpoints close over —
/// blocking withdraws a person's pending shares from it.
/// </summary>
public sealed record OrgEndpointDeps(
    CallerGate RequireCaller,
    AdminGate RequireAdmin,
    Func<string, string> DomainOf,
    OrgRecoveryConfig OrgRecovery,
    OrgMembersStore Members,
    OrgSettingsStore Settings,
    OrgEventLog Events,
    VaultStore Shares,
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
        // Blocking — the one admin action that reaches into other people's inboxes. Its own route rather
        // than a field on the upsert, because "changed a role" and "locked somebody out" are different
        // acts an audit log must tell apart, and because the body's ONE field must be impossible to omit
        // by accident (see SetActiveRequest).
        app.MapPut("/api/org/members/{email}/active", (HttpContext ctx, string email, CancellationToken ct) =>
            SetActiveAsync(ctx, deps, email, ct));
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
            await WriteRefusalAsync(ctx);
        }
        return caller;
    }

    /// <summary>
    /// The sentence for whatever the shared gate decided, read back off the status and the header it set.
    /// The blocking gate's <c>503</c> is the same file <c>/api/org/me</c> answers <c>503</c> for, so it gets
    /// that route's own sentence; its <c>403</c> is told apart from the domain's by the reason header — the
    /// same fact a client acts on, so the two cannot drift.
    /// </summary>
    private static Task WriteRefusalAsync(HttpContext ctx) =>
        ctx.Response.StatusCode == StatusCodes.Status503ServiceUnavailable
            ? FailUnavailable(ctx)
            : FailJson(ctx, ctx.Response.StatusCode, RefusalReason(ctx));

    private static string RefusalReason(HttpContext ctx) => ctx.Response.StatusCode switch
    {
        StatusCodes.Status401Unauthorized => "No verified identity was presented.",
        _ when ctx.Response.Headers[CallerStanding.ReasonHeader] == CallerStanding.AccountDeactivated =>
            "This account has been deactivated by an administrator, and the server refuses every request from it.",
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
        var request = await ReadJsonAsync(ctx, AppJsonContext.Default.SetMemberRequest);
        var problem = request is null ? MalformedMemberBody : request.Problem();
        if (problem.Length > 0)
        {
            await FailJson(ctx, StatusCodes.Status400BadRequest, problem);
            return;
        }
        await ApplyMemberEditAsync(ctx, deps, caller.Value.Email, target, request!, ct);
    }

    private const string MalformedMemberBody = "The body is not the JSON this endpoint reads; send a role, a share default, or both.";

    /// <summary>The refusal this target earns before the body is even read, or nothing.</summary>
    /// <remarks>
    /// <para>The shape is checked FIRST, and the order is the point: a path segment with no <c>@</c> is not a
    /// person, and answering it with the cross-domain <c>403</c> would tell an admin their own colleague
    /// is in another company. Without the check it would hash to a key like any string and be written.</para>
    /// <para>Shared by the role upsert and the block, so the two cannot come to disagree about who an
    /// admin may reach — and the sentences say "manage" rather than "give a role", because they are read
    /// from both.</para>
    /// </remarks>
    private static (int Status, string Message)? TargetProblem(OrgEndpointDeps deps, string caller, string target)
    {
        if (!target.Contains('@') || target.Length < 3)
        {
            return (StatusCodes.Status400BadRequest,
                "That is not an email address, so it names nobody this server could manage.");
        }
        if (!deps.AllowAnyDomain && deps.DomainOf(target) != deps.DomainOf(caller))
        {
            return (StatusCodes.Status403Forbidden,
                "That address is in another domain; an administrator may only manage people inside their own.");
        }
        return deps.OrgRecovery.IsOfficer(target)
            ? (StatusCodes.Status409Conflict,
                "That address is a recovery officer, which is configuration rather than a record: officers "
                + "administer by being on the roster, cannot be blocked, and the roster is changed by the "
                + "operator and a restart.")
            : null;
    }

    /// <summary>
    /// A body this build cannot parse is a <c>400</c>, never an exception the handler leaks. One reader for
    /// every request type on this surface — the third copy of this try/catch is where one of them would
    /// have caught one exception type fewer than the others.
    /// </summary>
    private static async Task<T?> ReadJsonAsync<T>(HttpContext ctx, JsonTypeInfo<T> typeInfo)
        where T : class
    {
        try
        {
            return await ctx.Request.ReadFromJsonAsync(typeInfo, ctx.RequestAborted);
        }
        catch (Exception e) when (e is System.Text.Json.JsonException or BadHttpRequestException)
        {
            return null;
        }
    }

    /// <summary>
    /// The one write the admin routes make, or the <c>503</c> — the same answer <c>/api/org/me</c> gives the
    /// person themselves, for the same reason: the record exists and cannot be read, so nothing may be
    /// written over it either. Shared by the role edit and the block.
    /// </summary>
    private static async Task<UpsertResult?> UpsertOrUnavailableAsync(
        HttpContext ctx,
        OrgEndpointDeps deps,
        string target,
        Func<MemberRecord, MemberRecord> edit,
        string admin,
        CancellationToken ct)
    {
        try
        {
            return await deps.Members.UpsertAsync(target, edit, admin, ct);
        }
        catch (MemberRecordUnavailableException)
        {
            await FailUnavailable(ctx);
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
        var result = await UpsertOrUnavailableAsync(ctx, deps, target, request.ApplyTo, admin, ct);
        if (result is null)
        {
            return;
        }
        await RecordMemberEditAsync(deps, admin, result.Value, ct);
        await ctx.Response.WriteAsJsonAsync(
            MemberListEntryDto.For(result.Value.Record, deps.OrgRecovery.IsOfficer(result.Value.Record.Email)),
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

    private static OrgEventDto Row(string kind, string actor, string subject, string? detail) => new(
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

    // ---------- blocking ----------

    /// <summary>
    /// <c>PUT /api/org/members/{email}/active</c> — <c>{active: false}</c> blocks, <c>{active: true}</c>
    /// re-admits. Admin-only; the same three target refusals as the role upsert, from the same function.
    ///
    /// <para><b>Idempotent, and a <c>204</c> either way.</b> A value the record already holds writes no
    /// event row — the log records transitions, and "blocked, again" is not one — but a repeated
    /// <c>active: false</c> DOES re-run the withdrawal, because that is the only way a human can finish one
    /// an earlier block left half-done; see <see cref="BlockedAsync"/>. A real transition to <c>false</c>
    /// is the block: the caller gate refuses
    /// the person from their very next request (the record is on disk, the gate re-stats), every pending
    /// share to and from them is withdrawn, and <c>member.blocked</c> is appended. A real transition to
    /// <c>true</c> re-admits and appends <c>member.unblocked</c>; nothing withdrawn comes back.</para>
    ///
    /// <para><b>The edit is <c>Active</c> and nothing else</b> — a developer who is blocked and re-admitted
    /// comes back the developer they were, not the default member who may export.</para>
    /// </summary>
    private static async Task SetActiveAsync(HttpContext ctx, OrgEndpointDeps deps, string email, CancellationToken ct)
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
        var (active, problem) = await ReadActiveAsync(ctx);
        if (problem.Length > 0)
        {
            await FailJson(ctx, StatusCodes.Status400BadRequest, problem);
            return;
        }
        await ApplyActiveAsync(ctx, deps, caller.Value.Email, target, active, ct);
    }

    private const string MalformedActiveBody = "The body is not the JSON this endpoint reads; send active, true or false.";

    /// <summary>The flag, or the <c>400</c> — an omitted or null <c>active</c> is never read as <c>false</c>.</summary>
    private static async Task<(bool Active, string Problem)> ReadActiveAsync(HttpContext ctx)
    {
        var request = await ReadJsonAsync(ctx, AppJsonContext.Default.SetActiveRequest);
        return request?.Active is { } active
            ? (active, string.Empty)
            : (false, request is null ? MalformedActiveBody : request.Problem());
    }

    private static async Task ApplyActiveAsync(
        HttpContext ctx,
        OrgEndpointDeps deps,
        string admin,
        string target,
        bool active,
        CancellationToken ct)
    {
        var result = await UpsertOrUnavailableAsync(ctx, deps, target, r => r with { Active = active }, admin, ct);
        if (result is null)
        {
            return;
        }
        await RecordActiveEditAsync(deps, admin, result.Value);
        ctx.Response.StatusCode = StatusCodes.Status204NoContent;
    }

    /// <summary>
    /// What a block or unblock leaves behind — AFTER the record has landed, and unable to fail the response.
    ///
    /// <para>"Changed" is decided against <see cref="UpsertResult.Before"/>, the record the write replaced
    /// under the store's lock, as the role rows are. <b>No client token from here on</b>, on the precedent of
    /// <c>DELETE /api/vault</c>: the record is written and the person is already refused, so the withdrawal
    /// and the rows are owed whether or not the admin's client is still listening — a disconnect that
    /// cancelled the withdrawal half-way would leave shares in inboxes the block was meant to empty.</para>
    /// </summary>
    private static async Task RecordActiveEditAsync(OrgEndpointDeps deps, string admin, UpsertResult result)
    {
        if (result.Created)
        {
            await deps.Events.AppendAsync(
                Row(OrgEventKinds.MemberRegistered, admin, result.Record.Email, result.Record.Role), CancellationToken.None);
        }
        if (!result.Record.Active)
        {
            await BlockedAsync(deps, admin, result.Record.Email, transition: result.Before.Active);
            return;
        }
        if (!result.Before.Active)
        {
            await UnblockedAsync(deps, admin, result.Record.Email);
        }
    }

    /// <summary>
    /// The block, once the record says so: withdraw both directions first, then the row, so the row can say
    /// what the block took with it. Logged at Warning naming the admin and the target — this is the one
    /// admin action that changes what happens to OTHER people's inboxes, and an operator reading the log
    /// must be able to see who did it to whom without opening the event log.
    ///
    /// <para><b>The withdrawal runs on every <c>active: false</c> write, transition or not, and that is what
    /// makes the operation recoverable.</b> It is a loop over other people's files: a crash, a handle
    /// somebody else holds, a permission flipped half-way leaves shares in an inbox the block was meant to
    /// empty, and nothing retries them on a cadence. If a repeat compared <see cref="UpsertResult.Before"/>,
    /// saw no transition and answered <c>204</c>, then the only recovery a human has — send it again — would
    /// be the one action guaranteed to do nothing. A repeat with nothing left costs two directory reads.</para>
    ///
    /// <para><b>Only a transition writes a row</b>, because the log records what changed and "blocked, again"
    /// did not. A repeat that DID find leftovers says so in the server log instead of appending a second
    /// <c>member.blocked</c> that a reader would count as a second block.</para>
    /// </summary>
    private static async Task BlockedAsync(OrgEndpointDeps deps, string admin, string target, bool transition)
    {
        var withdrawal = await deps.Shares.WithdrawAllInvolvingAsync(target, CancellationToken.None);
        if (!transition)
        {
            ReportRepeat(deps, admin, target, withdrawal);
            return;
        }
        deps.Log.LogWarning(
            "{Admin} BLOCKED {Target}: every request from them is refused from now on; {ToThem} pending share(s) "
            + "to them and {FromThem} from them were withdrawn",
            admin,
            target,
            withdrawal.ToThem,
            withdrawal.FromThem);
        await deps.Events.AppendAsync(
            Row(OrgEventKinds.MemberBlocked, admin, target, WithdrawalDetail(withdrawal)), CancellationToken.None);
    }

    /// <summary>
    /// A repeated block: silent when it found nothing, which is the ordinary case, and loud when it did —
    /// leftovers mean an earlier block did not finish, and the row that block wrote understates what was
    /// actually withdrawn.
    /// </summary>
    private static void ReportRepeat(OrgEndpointDeps deps, string admin, string target, Withdrawal withdrawal)
    {
        if (withdrawal.Total == 0)
        {
            return;
        }
        deps.Log.LogWarning(
            "{Admin} repeated the block on {Target} and it completed a withdrawal an earlier one left unfinished: "
            + "{ToThem} pending share(s) to them and {FromThem} from them went now",
            admin,
            target,
            withdrawal.ToThem,
            withdrawal.FromThem);
    }

    private static string WithdrawalDetail(Withdrawal withdrawal) =>
        $"withdrew {withdrawal.ToThem} pending share(s) to them and {withdrawal.FromThem} from them";

    private static async Task UnblockedAsync(OrgEndpointDeps deps, string admin, string target)
    {
        deps.Log.LogWarning("{Admin} UNBLOCKED {Target}: they are served again from now on", admin, target);
        await deps.Events.AppendAsync(Row(OrgEventKinds.MemberUnblocked, admin, target, detail: null), CancellationToken.None);
    }

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
        var request = await ReadJsonAsync(ctx, AppJsonContext.Default.SetSettingsRequest);
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
