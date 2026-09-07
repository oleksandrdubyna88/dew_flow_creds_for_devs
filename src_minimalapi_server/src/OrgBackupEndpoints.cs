using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace CredVaultServer;

/// <summary>
/// <c>/api/org/backup/*</c> — the five routes an administrator presses, mapped from their own file.
/// </summary>
/// <remarks>
/// <para>Its own file for the reason the projects surface has one: <c>Program.cs</c> is past the size a
/// reader can hold, and this epic adds five more routes. The gates and the refusal shape come from
/// <see cref="OrgEndpoints"/> rather than being written again.</para>
///
/// <para><b>Every route is admin-only.</b> The backup key opens every vault the server holds, and the
/// download is a copy of all of them; there is no read here that a developer has business making. A
/// recovery officer administers unconditionally, which is what <c>RequireAdmin</c> already encodes.</para>
///
/// <para><b>The download does not build.</b> Building takes as long as it takes, and a request that
/// outlives the browser is a download that fails at 90 %. So a run writes the archive and this streams
/// the newest one with a known length. Asking when there is none answers <b>404 with the reason</b> —
/// an earlier version of this plan started a run and answered 202, and the review round was right that
/// a GET with a side effect is both wrong HTTP and a loop for any client that retries. Starting a run
/// is what <c>POST /run</c> is for, and the status says whether there is anything to download.</para>
/// </remarks>
public static class OrgBackupEndpoints
{
    public static IEndpointRouteBuilder MapOrgBackupEndpoints(
        this IEndpointRouteBuilder app,
        OrgEndpointDeps deps,
        BackupStore backups,
        BackupRunner runner,
        BackupQueue queue)
    {
        app.MapGet("/api/org/backup/status", (HttpContext ctx, CancellationToken ct) =>
            StatusAsync(ctx, deps, backups, ct));
        app.MapPut("/api/org/backup/settings", (HttpContext ctx, CancellationToken ct) =>
            SettingsAsync(ctx, deps, backups, ct));
        app.MapPost("/api/org/backup/key", (HttpContext ctx, CancellationToken ct) =>
            MintAsync(ctx, deps, backups, ct));
        app.MapPost("/api/org/backup/run", (HttpContext ctx, CancellationToken ct) =>
            RunAsync(ctx, deps, runner, queue, ct));
        app.MapGet("/api/org/backup/archive", (HttpContext ctx, CancellationToken ct) =>
            DownloadAsync(ctx, deps, backups, ct));
        app.MapPost("/api/org/backup/key/rotate", (HttpContext ctx, CancellationToken ct) =>
            RotateAsync(ctx, deps, ct));
        return app;
    }

    /// <summary>
    /// <c>GET /api/org/backup/status</c> — everything the page draws, from what is on disk.
    /// </summary>
    /// <remarks>
    /// <c>Running</c> is DERIVED from the persisted result rather than being a second stored field, so
    /// the page cannot be handed "finished" and a spinner at the same time. That is the half of rule 8
    /// people forget: the in-flight state has to be readable after a reload, and it has to be readable
    /// from ONE place.
    /// </remarks>
    private static async Task StatusAsync(
        HttpContext ctx, OrgEndpointDeps deps, BackupStore backups, CancellationToken ct)
    {
        if (await Admin(ctx, deps) is null)
        {
            return;
        }
        var settings = await backups.ReadSettingsAsync(ct);
        var status = await backups.ReadStatusAsync(ct);
        var key = await backups.FindKeyAsync(ct);
        var archive = backups.NewestArchive();
        await ctx.Response.WriteAsJsonAsync(
            new BackupStatusDto(
                backups.Configured,
                key.Status.ToString(),
                settings.ScheduleHourUtc,
                settings.RetentionDays,
                status.LastRunAt,
                status.LastResult,
                status.LastError,
                BackupRunResults.IsRunning(status.LastResult),
                archive.Bytes,
                archive.Name),
            AppJsonContext.Default.BackupStatusDto,
            cancellationToken: ct);
    }

    /// <summary>
    /// <c>PUT /api/org/backup/settings</c> — the hour and the window, both bounded.
    /// </summary>
    /// <remarks>
    /// No credential fields, and that is a decision rather than an omission: the cloud targets are
    /// story 4 and there is nothing to hold credentials FOR yet. A shape invented now for a feature
    /// that does not exist would be a shape story 4 has to change, and an admin API that accepts
    /// secrets it does nothing with is worse than one that does not accept them.
    /// </remarks>
    private static async Task SettingsAsync(
        HttpContext ctx, OrgEndpointDeps deps, BackupStore backups, CancellationToken ct)
    {
        var admin = await Admin(ctx, deps);
        if (admin is null)
        {
            return;
        }
        var request = await ReadAsync(ctx, ct);
        var problem = Problem(request);
        if (problem.Length > 0)
        {
            await OrgEndpoints.FailJson(ctx, StatusCodes.Status400BadRequest, problem);
            return;
        }
        await backups.WriteSettingsAsync(new BackupSettings(request!.ScheduleHourUtc, request.RetentionDays), ct);
        await deps.Events.AppendAsync(
            OrgEndpoints.Row(
                OrgEventKinds.BackupSettingsChanged, admin.Value.Email, subject: null, detail: Said(request)),
            // The settings are already on disk. A client that hangs up at this instant must not take the
            // history of the change with it — the same reading every other row on this server makes.
            CancellationToken.None);
        ctx.Response.StatusCode = StatusCodes.Status204NoContent;
    }

    /// <summary>
    /// <c>POST /api/org/backup/key</c> — mint the key, and hand over its words the only time anybody can.
    /// </summary>
    /// <remarks>
    /// <para>The response carries the printable form ONCE. Nothing can produce it again: what the
    /// server keeps is the derived key, and HKDF does not run backwards. The row records that a key was
    /// issued and by whom — never the key, and not a fingerprint of it either, because a fingerprint of
    /// a secret shown once is something an attacker can check guesses against.</para>
    /// <para>Minting also ACKNOWLEDGES, in the same call: this response is the moment the words reach a
    /// person, so if it is delivered the handshake is done. A caller that never sees the response leaves
    /// the key waiting, which is exactly the state that permits minting again.</para>
    /// </remarks>
    private static async Task MintAsync(
        HttpContext ctx, OrgEndpointDeps deps, BackupStore backups, CancellationToken ct)
    {
        var admin = await Admin(ctx, deps);
        if (admin is null)
        {
            return;
        }
        var minted = await backups.MintKeyAsync(ct);
        if (minted.Formatted.Length == 0)
        {
            await OrgEndpoints.FailJson(ctx, StatusCodes.Status409Conflict, Why(minted.Status));
            return;
        }
        await deps.Events.AppendAsync(
            OrgEndpoints.Row(OrgEventKinds.BackupKeyIssued, admin.Value.Email, subject: null, detail: null),
            // The key is minted. A cancelled row here would leave an issued key nothing records.
            CancellationToken.None);
        await ctx.Response.WriteAsJsonAsync(
            new BackupKeyDto(minted.Formatted, minted.EntropyBits),
            AppJsonContext.Default.BackupKeyDto,
            cancellationToken: ct);
        await backups.AcknowledgeKeyShownAsync(ct);
    }

    /// <summary>
    /// <c>POST /api/org/backup/run</c> — 202 and the work detached, or 409 with the reason.
    /// </summary>
    /// <remarks>
    /// <para>Two halves, and the split is rule 8. The CLAIM and the in-progress status are written
    /// inside the request, so a page reloaded the instant after the button already reads "running" —
    /// and a refusal ("no key yet", "already running") comes back as a 409 with its sentence rather
    /// than as silence after a 202. Only the BUILD is detached, because it outlives the browser by
    /// design and a reload must not cancel it.</para>
    /// </remarks>
    private static async Task RunAsync(
        HttpContext ctx,
        OrgEndpointDeps deps,
        BackupRunner runner,
        BackupQueue queue,
        CancellationToken ct)
    {
        var admin = await Admin(ctx, deps);
        if (admin is null)
        {
            return;
        }
        // The claim and the in-progress status are taken HERE, inside the request, so that by the time
        // 202 reaches the browser a reload already reads "running". Detaching the whole run instead
        // left a window where the status still said "never run" — which is the "clicked, reloaded,
        // state lost" rule 8 exists to prevent, and the .http suite is what caught it.
        var start = await runner.BeginAsync(admin.Value.Email, ct);
        if (start.Ticket is null)
        {
            await OrgEndpoints.FailJson(ctx, StatusCodes.Status409Conflict, start.Refusal.Why);
            return;
        }
        // And only the long part is handed over — to a QUEUE a hosted service drains, not to a
        // Task.Run nobody owns. Rule 8 asks for exactly that pairing, and the reliability rule says
        // why: a detached task whose fault nobody observes is a worker that dies with no line in the
        // log while the process looks healthy.
        if (!queue.Enqueue(start.Ticket))
        {
            start.Ticket.Dispose();
            await OrgEndpoints.FailJson(
                ctx,
                StatusCodes.Status503ServiceUnavailable,
                "this server could not take the run: nothing is draining the backup queue. That means "
                + "the scheduled-backup service is not running, which is a deployment problem rather "
                + "than something to retry.");
            return;
        }
        ctx.Response.StatusCode = StatusCodes.Status202Accepted;
    }

    /// <summary>
    /// <c>GET /api/org/backup/archive</c> — stream the newest archive, or say there is none.
    /// </summary>
    /// <remarks>
    /// <para>The file is OPENED before anything is written to the response, and streamed from that
    /// handle with <c>FileShare.Read | FileShare.Delete</c>. A retention pass completing mid-download
    /// would otherwise delete the path out from under a half-sent response; with the handle already
    /// held, the download finishes from the bytes it opened and the deletion takes effect afterwards.</para>
    /// <para>404 rather than starting a run: a GET that mutates server state is wrong HTTP, and a
    /// client that retries it would start a run per attempt.</para>
    /// </remarks>
    private static async Task DownloadAsync(
        HttpContext ctx, OrgEndpointDeps deps, BackupStore backups, CancellationToken ct)
    {
        if (await Admin(ctx, deps) is null)
        {
            return;
        }
        var archive = backups.NewestArchive();
        using var file = Opened(archive);
        if (file is null)
        {
            await OrgEndpoints.FailJson(
                ctx,
                StatusCodes.Status404NotFound,
                "there is no archive on this server yet. Take one with POST /api/org/backup/run — the "
                + "status says when it has finished, and this route then streams it.");
            return;
        }
        ctx.Response.ContentType = "application/octet-stream";
        ctx.Response.ContentLength = file.Length;
        ctx.Response.Headers.ContentDisposition = $"attachment; filename=\"{archive.Name}\"";
        await file.CopyToAsync(ctx.Response.Body, ct);
    }

    /// <summary>
    /// <c>POST /api/org/backup/key/rotate</c> — 501, and the reason it is not a button.
    /// </summary>
    /// <remarks>
    /// Rotating orphans every archive taken under the old key: each archive's key is derived from the
    /// long-lived one plus that archive's own salt, so "re-key" means fetching, decrypting and
    /// re-encrypting every archive, including the ones already off this machine. That is a migration
    /// with its own failure modes, not a switch. 501 with the sentence rather than 404, because 404
    /// reads as "not built yet" and this is a decision.
    /// </remarks>
    private static async Task RotateAsync(HttpContext ctx, OrgEndpointDeps deps, CancellationToken ct)
    {
        if (await Admin(ctx, deps) is null)
        {
            return;
        }
        await OrgEndpoints.FailJson(
            ctx,
            StatusCodes.Status501NotImplemented,
            "rotating the backup key is not something this server will do for you. Every archive is "
            + "sealed under a key derived from the current one, so a new key orphans all of them — "
            + "including the copies already off this machine. Take new archives under a new key "
            + "deliberately, and destroy the old ones when you are sure.");
    }

    /// <summary>
    /// The handle the response is streamed from, or nothing when there is no archive.
    /// </summary>
    /// <remarks>
    /// <c>FileShare.Delete</c> is the point: retention may remove this path while the response is still
    /// being written, and a reader holding the handle keeps reading the bytes it opened.
    /// </remarks>
    private static FileStream? Opened(LocalArchive archive)
    {
        try
        {
            return archive.Exists
                ? new FileStream(
                    archive.Path,
                    FileMode.Open,
                    FileAccess.Read,
                    FileShare.Read | FileShare.Delete,
                    64 * 1024,
                    FileOptions.SequentialScan)
                : null;
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            return null;
        }
    }

    private static async Task<(string Email, string? Name)?> Admin(HttpContext ctx, OrgEndpointDeps deps) =>
        await deps.RequireAdmin(ctx);

    private static async Task<BackupSettingsRequest?> ReadAsync(HttpContext ctx, CancellationToken ct)
    {
        try
        {
            return await ctx.Request.ReadFromJsonAsync(AppJsonContext.Default.BackupSettingsRequest, ct);
        }
        catch (Exception e) when (e is JsonException or BadHttpRequestException)
        {
            return null;
        }
    }

    /// <summary>What is wrong with the request, or nothing. Both bounds are the page's own.</summary>
    private static string Problem(BackupSettingsRequest? request) => request switch
    {
        null => "that is not a settings document.",
        { ScheduleHourUtc: < 0 or > 23 } => "the schedule hour is a UTC hour, 0 to 23.",
        { RetentionDays: < 1 } => "the retention window is at least one day. Zero would mean a "
            + "retention pass with nothing to keep, and this one never empties the destination.",
        _ => string.Empty,
    };

    private static string Said(BackupSettingsRequest request) =>
        $"{request.ScheduleHourUtc:00}:00Z, {request.RetentionDays} day(s)";

    private static string Why(BackupKeyLookup status) => status switch
    {
        BackupKeyLookup.Ready =>
            "this deployment already has a backup key, and its words cannot be produced a second time: "
            + "what the server keeps is the derived key. If the words are lost, take new archives under "
            + "a new key deliberately.",
        _ =>
            "a backup key cannot be minted. Either Vault:LoginKey:Kek is not configured, or a key "
            + "exists that this server cannot open — nothing is minted over one that exists.",
    };

}
