using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace CredVaultServer;

/// <summary>
/// Drops setup invites nobody acted on.
///
/// <para>A ceremony that stalls — one officer on holiday, an initiator who changed their mind —
/// otherwise leaves sealed shares sitting in inboxes forever, and the officers cannot tell a
/// live invitation from a dead one. Bounding it means a stale ceremony expires instead of
/// becoming a share somebody accepts a year later into a key that was never published.</para>
///
/// <para>Same shape as <see cref="ShareMaintenance"/>: one timer, a pass at startup so a server
/// that was down catches up on the way in, and a sweep that never throws — a hosted service that
/// faulted would disable maintenance for the life of the process.</para>
/// </summary>
public sealed class OrgRecoveryMaintenance(
    OrgRecoveryStore store,
    ILogger<OrgRecoveryMaintenance> log,
    TimeSpan interval,
    TimeSpan maxAge) : BackgroundService
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

    internal async Task SweepAsync(CancellationToken ct)
    {
        try
        {
            var pruned = await store.PruneInvitesOlderThanAsync(maxAge, ct).ConfigureAwait(false);
            // Sessions carry their own deadline rather than being aged like invites: a session
            // is a live authorisation to read one person's vault, and how long that stands is a
            // decision made when it starts, not one derived later from a file's timestamp.
            var expired = await store
                .PruneExpiredSessionsAsync(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), ct)
                .ConfigureAwait(false);
            if (pruned > 0 || expired > 0)
            {
                log.LogInformation(
                    "org-recovery maintenance: {Pruned} unacknowledged invite(s) older than {Hours}h dropped, "
                    + "{Expired} expired session(s) closed",
                    pruned,
                    (int)maxAge.TotalHours,
                    expired);
            }
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            log.LogWarning(e, "org-recovery maintenance pass failed; the next one will try again");
        }
    }
}
