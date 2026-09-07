using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace CredVaultServer;

/// <summary>
/// The five-minute question: is a backup due, and is anything holding a run that died?
/// </summary>
/// <remarks>
/// <para><b>A timer that asks, not a sleep until the hour.</b> Sleeping until 03:00 means a restart at
/// 02:59 skips the night, which is precisely the failure a nightly backup cannot have. Five minutes is
/// small enough that the run starts within the window and large enough that the question costs
/// nothing — one status file read.</para>
///
/// <para><b>The sweep runs once, before the first tick.</b> A container killed mid-build leaves a
/// status saying "in progress"; without this, the page shows a spinner for ever. It sweeps only what it
/// can PROVE is orphaned — see <see cref="BackupStore.SweepOrphanedRunAsync"/> — so a second container
/// starting while the first is minutes into a large archive changes nothing.</para>
///
/// <para><b>It never throws out of <c>ExecuteAsync</c>.</b> An exception here takes the hosted service
/// down and with it every later run, so a bad file on disk would quietly disable backups for the life
/// of the process. The shape <see cref="ShareMaintenance"/> and <see cref="OrgRecoveryMaintenance"/>
/// already use, for the same reason.</para>
///
/// <para><b>Registered only in corp mode</b>, like the recovery sweep: a personal deployment has no
/// backup key, no roster and no <c>org/</c> tree, and an idle timer on every one of them is noise with
/// a cost, however small.</para>
/// </remarks>
public sealed class BackupScheduleService(
    BackupStore backups,
    BackupRunner runner,
    BackupQueue queue,
    TimeProvider clock,
    ILogger<BackupScheduleService> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stopping)
    {
        await SweepAsync(stopping);
        // Two jobs, one service: ask every five minutes whether tonight's backup is due, and carry out
        // the runs an administrator queued from the page. The second is why this is a queue rather than
        // a Task.Run — a detached build needs an owner, and the thing that already owns builds is here.
        await Task.WhenAll(TickingAsync(stopping), DrainingAsync(stopping));
    }

    /// <summary>One tick. Never throws.</summary>
    internal async Task TickAsync(CancellationToken ct)
    {
        try
        {
            await RunIfDueAsync(ct);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        // A catch-all rather than two exception types: this loop must survive whatever one tick meets,
        // because an exception escaping here takes the hosted service down and with it every LATER
        // backup — a bad file on disk would quietly disable the feature for the life of the process.
        catch (Exception e)
        {
            log.LogWarning(e, "a backup schedule tick failed; the next one will try again");
        }
    }

    private async Task TickingAsync(CancellationToken stopping)
    {
        using var timer = new PeriodicTimer(BackupSchedule.Interval);
        try
        {
            do
            {
                await TickAsync(stopping).ConfigureAwait(false);
            }
            while (await timer.WaitForNextTickAsync(stopping).ConfigureAwait(false));
        }
        catch (OperationCanceledException)
        {
            // The host is stopping. Not a fault, and not worth a line that reads like one.
        }
    }

    /// <summary>
    /// Carry out the runs the page queued, one at a time, until the host stops.
    /// </summary>
    /// <remarks>
    /// The ticket owns the run claim, so a run that is never drained would hold it for ever — which is
    /// why the enqueue is refused rather than dropped when nothing is here to read, and why this loop
    /// disposes whatever it takes even on the way down.
    /// </remarks>
    private async Task DrainingAsync(CancellationToken stopping)
    {
        try
        {
            await foreach (var ticket in queue.ReadAllAsync(stopping).ConfigureAwait(false))
            {
                await runner.ContinueAsync(ticket, stopping).ConfigureAwait(false);
            }
        }
        catch (OperationCanceledException)
        {
            // The host is stopping between runs.
        }
    }

    private async Task SweepAsync(CancellationToken ct)
    {
        try
        {
            await backups.SweepOrphanedRunAsync(ct);
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            log.LogWarning(e, "the interrupted-run sweep could not read the backup status at startup");
        }
    }

    private async Task RunIfDueAsync(CancellationToken ct)
    {
        var settings = await backups.ReadSettingsAsync(ct);
        var status = await backups.ReadStatusAsync(ct);
        if (BackupRunResults.IsRunning(status.LastResult) || !Due(settings, status, ct))
        {
            return;
        }
        // "schedule" rather than an address: the actor of a scheduled run is the schedule, and putting
        // a person's name on something they did not press would make the history lie.
        //
        // It goes through the SAME queue an administrator's run does, rather than being carried out
        // inline here. One path means one place where a run is executed and one place where its faults
        // are observed — and it keeps this loop free to ask its question every five minutes instead of
        // being occupied for the length of an archive.
        var start = await runner.BeginAsync("schedule", ct);
        if (start.Ticket is null)
        {
            log.LogInformation("the scheduled backup did not start: {Why}", start.Refusal.Why);
            return;
        }
        if (!queue.Enqueue(start.Ticket))
        {
            await runner.AbandonAsync(start.Ticket, "the backup queue would not take it", ct);
        }
    }

    /// <summary>
    /// Whether the hour has come and today has not had its backup.
    /// </summary>
    /// <remarks>
    /// The DUE decision is not the claim: two schedulers can both answer yes here, and the run claim is
    /// what makes only one of them take an archive. Asking the other way round — claim first, then ask —
    /// would mean taking a lock on every tick of every container all day long.
    /// </remarks>
    private bool Due(BackupSettings settings, BackupStatus status, CancellationToken ct) =>
        BackupSchedule.IsDue(clock.GetUtcNow(), settings.ScheduleHourUtc, status.LastRunAt)
        && !ct.IsCancellationRequested;
}
