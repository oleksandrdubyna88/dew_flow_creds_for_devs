using System.Threading.Channels;

namespace CredVaultServer;

/// <summary>
/// The queue a claimed run waits in until the hosted service picks it up.
/// </summary>
/// <remarks>
/// <para><b>A queue drained by a hosted service, not a <c>Task.Run</c>.</b> Rule 8 says so in as many
/// words — "it must run in the background, decoupled from the HTTP request (queue + hosted
/// <c>BackgroundService</c>)" — and the reliability rule says why: a task whose fault nobody observes
/// is a worker that dies with no line in the log while the process looks healthy. A queue gives the
/// work an owner, and the owner is <see cref="BackupScheduleService"/>, which already exists to run
/// backups.</para>
///
/// <para><b>Capacity one, and a refusal rather than a wait.</b> A second ticket cannot exist while a
/// first is queued or running, because a ticket carries the run claim and only one process can hold
/// it. The bound is therefore a belt: if it is ever hit, something has gone wrong upstream and the
/// caller is told, rather than an unbounded queue quietly growing.</para>
/// </remarks>
public sealed class BackupQueue
{
    private readonly Channel<RunTicket> _waiting =
        Channel.CreateBounded<RunTicket>(new BoundedChannelOptions(1)
        {
            FullMode = BoundedChannelFullMode.DropWrite,
            SingleReader = true,
        });

    /// <summary>Hand a claimed run to the hosted service, or say it could not be handed over.</summary>
    public bool Enqueue(RunTicket ticket) => _waiting.Writer.TryWrite(ticket);

    /// <summary>Every run handed over, in order, until the host stops.</summary>
    public IAsyncEnumerable<RunTicket> ReadAllAsync(CancellationToken ct) =>
        _waiting.Reader.ReadAllAsync(ct);
}
