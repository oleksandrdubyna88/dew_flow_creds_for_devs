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
/// Everything the corporate routes need from <c>Program.cs</c>, as one record. The gates and
/// <c>DomainOf</c> are local functions in a top-level program and cross into this file only as
/// delegates; a record lets the next epics widen the set without editing the call site each time.
/// <see cref="DomainOf"/> and <see cref="AllowAnyDomain"/> are carried for the admin routes the next
/// story adds — the cross-domain refusal is theirs.
/// </summary>
public sealed record OrgEndpointDeps(
    CallerGate RequireCaller,
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
    /// Only a person with NO record is written. The plan spelt the hook as an unconditional identity
    /// upsert, and that was watched doing the wrong thing: <see cref="OrgMembersStore.UpsertAsync"/>
    /// stamps every write, so a sync re-stamped a record an admin had edited — <c>updatedBy</c> became
    /// the empty string and <c>updatedAt</c> the time of the sync, and the admin list would have shown
    /// that nobody changed the role, at a time nobody did. So the lookup comes first. The window between
    /// it and the write — an admin's first edit landing at the very instant of the person's first-ever
    /// sync — costs at most that one stamp, and the role survives because the upsert reads inside the lock.
    /// </summary>
    private static async Task RegisterIfAbsentAsync(OrgEndpointDeps deps, string email, CancellationToken ct)
    {
        switch (deps.Members.Find(email).Status)
        {
            case MemberLookup.Found:
                return;
            case MemberLookup.Unavailable:
                // Not an exception path — the store answered — but the same rule: never written over.
                deps.Log.LogError("{Email} synced but was not registered: their record exists and cannot be read, and a sync must not overwrite it", email);
                return;
        }
        var result = await deps.Members.UpsertAsync(email, r => r, byAdmin: string.Empty, ct);
        if (result.Created)
        {
            await deps.Events.AppendAsync(Registered(result.Record), ct);
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
        var caller = await RequireOrgCallerAsync(ctx, deps);
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
    private static async Task<(string Email, string? Name)?> RequireOrgCallerAsync(HttpContext ctx, OrgEndpointDeps deps)
    {
        var caller = deps.RequireCaller(ctx);
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

    private static Task FailUnavailable(HttpContext ctx)
    {
        ctx.Response.Headers.RetryAfter = UnavailableRetryAfterSeconds.ToString(CultureInfo.InvariantCulture);
        // Names the problem and who fixes it, not the file: the path is the operator's business and is
        // already in the server log at Error, written once by the store.
        return FailJson(
            ctx,
            StatusCodes.Status503ServiceUnavailable,
            "Your membership record cannot be read by this server. Nothing about your role can be answered "
            + "until an operator fixes it; the server log names the file.");
    }
}
