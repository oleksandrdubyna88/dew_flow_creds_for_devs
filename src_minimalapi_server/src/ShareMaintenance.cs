using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace CredVaultServer;

/// <summary>
/// The hourly pass that keeps inboxes and sender receipts from growing forever.
/// </summary>
/// <remarks>
/// <para><b>Two jobs, one timer.</b> Reconciliation retires a sender's receipt once the recipient
/// has accepted or declined — the inbox file's absence is the only signal there is, because
/// nothing tells the sender. Age pruning drops shares and receipts nobody touched for
/// <c>Vault:ShareMaxAgeDays</c> (31 by default).</para>
///
/// <para><b>Why the age sweep is not cosmetic.</b> An inbox is capped at
/// <c>Vault:MaxInboxItems</c> and only ever shrank when its owner accepted or declined. A person
/// who never opens that view fills it, and from then on every share sent to them is refused with
/// 409 — a failure that appears to the SENDER, about a state only the recipient can clear. The
/// sweep bounds it without anyone having to notice.</para>
///
/// <para><b>It runs once at startup and then on the interval</b>, so a server that was down for a
/// week catches up on the way in rather than waiting an hour to begin.</para>
/// </remarks>
public sealed class ShareMaintenance(
    VaultStore store,
    ILogger<ShareMaintenance> log,
    TimeSpan interval,
    TimeSpan maxAge,
    OrgEventLog? events = null) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stopping)
    {
        using var timer = new PeriodicTimer(interval);
        try
        {
            do
            {
                await SweepAsync(stopping).ConfigureAwait(false);
            }
            while (await timer.WaitForNextTickAsync(stopping).ConfigureAwait(false));
        }
        catch (OperationCanceledException)
        {
            // The host is stopping. Not a fault, and not worth a line that reads like one.
        }
    }

    /// <summary>
    /// One pass. Never throws.
    /// </summary>
    /// <remarks>
    /// A sweep that threw would take the hosted service down and stop every later pass, so a bad
    /// file on disk would quietly disable maintenance for the life of the process. Whatever went
    /// wrong is logged and the next hour tries again.
    /// </remarks>
    internal async Task SweepAsync(CancellationToken ct)
    {
        try
        {
            var retired = await store.ReconcileSentAsync(ct).ConfigureAwait(false);
            var pruned = await store.PruneOlderThanAsync(maxAge, ct).ConfigureAwait(false);
            await RecordExpiriesAsync(pruned, ct).ConfigureAwait(false);
            if (retired > 0 || pruned.Count > 0)
            {
                log.LogInformation(
                    "share maintenance: {Retired} receipt(s) retired, {Pruned} item(s) older than {Days} days pruned",
                    retired,
                    pruned.Count,
                    (int)maxAge.TotalDays);
            }
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            log.LogWarning(e, "share maintenance pass failed; the next one will try again");
        }
    }

    /// <summary>
    /// One <c>share.expired</c> per share the prune took out of an inbox, naming both people.
    /// </summary>
    /// <remarks>
    /// <para><b>The sender is the actor.</b> Nobody chose an expiry — a sweep did — and the question a
    /// reader brings to the row is "what happened to the share I sent", so the row reads from the send.
    /// The RECEIPTS the prune also removed leave no row: whatever happened to their shares was recorded
    /// when it happened, and a second row would double every share in the history.</para>
    /// <para>The log is optional here for one reason only: a personal deployment has none, and this
    /// sweep runs on every deployment. The row is appended AFTER the delete has landed, on
    /// <c>CancellationToken.None</c>, because a sweep that stopped half-way through recording would
    /// leave shares deleted and unrecorded.</para>
    /// </remarks>
    private async Task RecordExpiriesAsync(Prune pruned, CancellationToken ct)
    {
        if (events is null || pruned.Expired.Count == 0)
        {
            return;
        }
        foreach (var share in pruned.Expired)
        {
            ct.ThrowIfCancellationRequested();
            await events.AppendAsync(
                OrgEndpoints.ShareRow(OrgEventKinds.ShareExpired, share.FromEmail, share.ToEmail, share),
                CancellationToken.None).ConfigureAwait(false);
        }
    }
}
