using System.Globalization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Logging;

namespace CredVaultServer;

/// <summary>
/// The event log's reader over the wire, <c>GET /api/org/events</c>, mapped from its own file for the
/// reason <see cref="OrgEndpoints"/> gives: <c>Program.cs</c> is past the size a reader can hold, and
/// each epic of the control plane adds routes.
///
/// <para><b>Any allowed caller, scoped by who they are.</b> An officer, or a registry record that says
/// <c>admin</c>, reads the whole domain. Everybody else — a member, a developer, a person who has never
/// synced — reads the rows that name them as actor or subject, and their filters can only narrow that
/// set: the scope is a parameter of the query the reader applies before any filter, never a filter
/// the caller could leave out. A record this build cannot read is the <c>503</c> every corporate route
/// answers for the same file, because the caller's own record decides their scope and this surface
/// guesses nowhere.</para>
///
/// <para>A personal deployment answers an empty page: it has no <c>org/</c>, and the gate that admits
/// the caller reads nothing under it.</para>
/// </summary>
public static class OrgEventsEndpoints
{
    private static readonly OrgEventsPageDto Empty = new([], null);

    public static IEndpointRouteBuilder MapOrgEventsEndpoints(this IEndpointRouteBuilder app, OrgEndpointDeps deps)
    {
        app.MapGet("/api/org/events", (HttpContext ctx, CancellationToken ct) => ListAsync(ctx, deps, ct));
        return app;
    }

    private static async Task ListAsync(HttpContext ctx, OrgEndpointDeps deps, CancellationToken ct)
    {
        var caller = await OrgEndpoints.RequireOrgCallerAsync(ctx, deps.RequireCaller);
        if (caller is null)
        {
            return;
        }
        var (query, problem) = OrgEventQueryParser.Parse(ctx.Request.Query);
        if (query is null)
        {
            await OrgEndpoints.FailJson(ctx, StatusCodes.Status400BadRequest, problem ?? "The query could not be read.");
            return;
        }
        if (!deps.OrgRecovery.Enabled)
        {
            await WriteAsync(ctx, Empty, ct);
            return;
        }
        await AnswerScopedAsync(ctx, deps, caller.Value.Email, query, ct);
    }

    private static async Task AnswerScopedAsync(
        HttpContext ctx,
        OrgEndpointDeps deps,
        string email,
        OrgEventQuery query,
        CancellationToken ct)
    {
        var scope = ScopeOf(deps, email);
        if (scope.Unavailable)
        {
            await OrgEndpoints.FailUnavailable(ctx);
            return;
        }
        await AnswerAsync(ctx, deps, query with { RestrictToSelf = scope.Self }, ct);
    }

    /// <summary>Who this caller is, for the reader: the domain, themselves, or nobody until an operator fixes a file.</summary>
    private readonly record struct Scope(bool Unavailable, string? Self)
    {
        public static Scope Domain => new(false, null);

        public static Scope Nobody => new(true, null);

        public static Scope Only(string email) => new(false, email);
    }

    /// <summary>The same decision <c>RequireAdminAsync</c> makes, read for scope rather than for refusal.</summary>
    private static Scope ScopeOf(OrgEndpointDeps deps, string email)
    {
        if (deps.OrgRecovery.IsOfficer(email))
        {
            return Scope.Domain;
        }
        return deps.Members.Find(email) switch
        {
            { Status: MemberLookup.Unavailable } => Scope.Nobody,
            { Status: MemberLookup.Found, Record.Role: MemberRole.Admin } => Scope.Domain,
            _ => Scope.Only(email),
        };
    }

    private static async Task AnswerAsync(HttpContext ctx, OrgEndpointDeps deps, OrgEventQuery query, CancellationToken ct)
    {
        OrgEventPage page;
        try
        {
            page = await deps.Events.QueryAsync(query, ct);
        }
        catch (OrgEventLogUnreadableException e)
        {
            // The file is the operator's business and is named here, once per request; the caller is
            // told who ends it, not which file.
            deps.Log.LogError(e, "event log {Path}: a query could not read it, and the caller was answered 503", e.FilePath);
            await OrgEndpoints.FailUnavailableJson(
                ctx,
                "The event log could not be read by this server. An administrator must repair it; the server log names the file.");
            return;
        }
        await WriteAsync(ctx, new OrgEventsPageDto(page.Items, page.Next?.ToString()), ct);
    }

    private static Task WriteAsync(HttpContext ctx, OrgEventsPageDto page, CancellationToken ct) =>
        ctx.Response.WriteAsJsonAsync(page, AppJsonContext.Default.OrgEventsPageDto, cancellationToken: ct);
}

/// <summary>
/// The query string, read into an <see cref="OrgEventQuery"/> — or the sentence that says which
/// parameter could not be. Every number is checked before any arithmetic, and every text filter is
/// bounded, because a filter is a client's input however innocent it reads.
/// </summary>
internal static class OrgEventQueryParser
{
    public static (OrgEventQuery? Query, string? Problem) Parse(IQueryCollection q)
    {
        if (!TryInstant(q, "since", out var since, out var problem)
            || !TryInstant(q, "until", out var until, out problem)
            || !TryLimit(q, out var limit, out problem)
            || !TryCursor(q, out var cursor, out problem)
            || !TryTexts(q, out var texts, out problem))
        {
            return (null, problem);
        }
        if (since is { } s && until is { } u && s > u)
        {
            return (null, "since must not be later than until.");
        }
        return (new OrgEventQuery(
            Actor: texts["actor"],
            Subject: texts["subject"],
            Person: texts["person"],
            Project: texts["project"],
            Kind: texts["kind"],
            Since: since,
            Until: until,
            Text: texts["q"],
            Cursor: cursor,
            Limit: limit), null);
    }

    private static readonly string[] TextParameters = ["actor", "subject", "person", "project", "kind", "q"];

    private static bool TryTexts(IQueryCollection q, out Dictionary<string, string?> texts, out string? problem)
    {
        texts = [];
        foreach (var name in TextParameters)
        {
            var value = q.TryGetValue(name, out var raw) && !string.IsNullOrWhiteSpace(raw) ? raw.ToString().Trim() : null;
            if (value is { Length: > OrgEventQuery.MaxFilterLength })
            {
                problem = $"{name} is longer than {OrgEventQuery.MaxFilterLength} characters, which names nothing.";
                return false;
            }
            texts[name] = value;
        }
        problem = null;
        return true;
    }

    private static bool TryInstant(IQueryCollection q, string name, out long? value, out string? problem)
    {
        value = null;
        problem = null;
        if (!q.TryGetValue(name, out var raw) || string.IsNullOrWhiteSpace(raw))
        {
            return true;
        }
        if (!long.TryParse(raw.ToString(), NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out var parsed))
        {
            problem = $"{name} must be an instant in unix milliseconds.";
            return false;
        }
        value = parsed;
        return true;
    }

    private static bool TryLimit(IQueryCollection q, out int limit, out string? problem)
    {
        limit = OrgEventQuery.DefaultLimit;
        problem = null;
        if (!q.TryGetValue("limit", out var raw) || string.IsNullOrWhiteSpace(raw))
        {
            return true;
        }
        if (!int.TryParse(raw.ToString(), NumberStyles.None, CultureInfo.InvariantCulture, out var parsed) || parsed < 1)
        {
            problem = "limit must be a whole number of at least 1.";
            return false;
        }
        limit = Math.Min(parsed, OrgEventQuery.MaxLimit);
        return true;
    }

    private static bool TryCursor(IQueryCollection q, out OrgEventCursor? cursor, out string? problem)
    {
        cursor = null;
        problem = null;
        if (!q.TryGetValue("cursor", out var raw) || string.IsNullOrWhiteSpace(raw))
        {
            return true;
        }
        if (!OrgEventCursor.TryParse(raw.ToString(), out var parsed))
        {
            problem = "cursor is not one this server handed out.";
            return false;
        }
        cursor = parsed;
        return true;
    }
}
