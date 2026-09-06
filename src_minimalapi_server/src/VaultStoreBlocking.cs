using System.Text.Json;

namespace CredVaultServer;

/// <summary>What one block withdrew: how many pending shares were addressed TO the person, and how many FROM them.</summary>
public readonly record struct Withdrawal(int ToThem, int FromThem)
{
    public static readonly Withdrawal None = new(0, 0);

    public int Total => ToThem + FromThem;
}

/// <summary>
/// The third concern beside vaults, inboxes and the sender's outbox: what happens to a person's pending
/// shares the moment an administrator blocks them.
/// </summary>
/// <remarks>
/// <para><b>In its own file for the reason <c>VaultStoreOutbox.cs</c> gives</b> — a fourth concern in a
/// class already about three would push it past what a reader can hold — and because this is the one
/// piece of the store that reaches into OTHER people's inboxes on somebody else's say-so, which deserves
/// to be read on its own.</para>
///
/// <para><b>Both directions, inline, at the block — not on the hourly cadence.</b> "Immediately" is the
/// requirement (owner decision 5): a share sent an hour before the block is still openable until this
/// runs, and the recipient's next sync is not something an admin can wait for.</para>
///
/// <para><b>Shares TO the blocked person</b> are deleted from their inbox, and each SENDER's receipt is
/// rewritten with <see cref="SentShare.WithdrawnReason"/> set — rewritten, never deleted, because the
/// receipt is the only place the sender can learn why their share vanished. <see cref="VaultStore.ReconcileSentAsync"/>
/// keeps a receipt carrying a reason for exactly that purpose; the 31-day prune still retires it, so a
/// sender who never opens their Sent view does not accumulate them.</para>
///
/// <para><b>Shares FROM the blocked person</b> are deleted from every recipient's inbox, and the blocked
/// sender's own receipts go with them: they need no reason, because a blocked person cannot call
/// anything to read one.</para>
///
/// <para><b>Best-effort per file, and it never throws.</b> The block is already on disk when this runs, and
/// a <c>500</c> for a block that happened would send an admin retrying a lie — so each file is its own
/// unit: one that will not read or delete (held open, permission flipped) is skipped, exactly as the
/// sweeps' <c>Forget</c> skips one, and the rest are still withdrawn. The counts say what actually went.
/// What a skipped file leaves behind is a pending share the person cannot read — the gate refuses them —
/// and the hourly sweep eventually prunes.</para>
/// </remarks>
public sealed partial class VaultStore
{
    /// <summary>
    /// The sentence a sender reads on a receipt the server withdrew for them. Prose rather than a code,
    /// unlike the refusal header: the client ACTS on the header and cannot be asked to match English, but
    /// the only action on a receipt is to dismiss it, which keys on the field's presence, not its value.
    /// </summary>
    public const string RecipientDeactivatedReason =
        "Withdrawn: the recipient's account was deactivated by an administrator before they accepted it.";

    /// <summary>Withdraw every pending share to and from <paramref name="email"/>. Never throws for I/O.</summary>
    public async Task<Withdrawal> WithdrawAllInvolvingAsync(string email, CancellationToken ct)
    {
        var toThem = 0;
        foreach (var path in SafeFiles(Path.Combine(_sharesDir, KeyFor(email))))
        {
            ct.ThrowIfCancellationRequested();
            toThem += await WithdrawInboxItemAsync(path, ct);
        }
        var fromThem = 0;
        foreach (var path in SafeFiles(SentDirFor(email)))
        {
            ct.ThrowIfCancellationRequested();
            fromThem += await WithdrawSentItemAsync(path, ct);
        }
        return new Withdrawal(toThem, fromThem);
    }

    /// <summary>
    /// One item in the blocked person's inbox: read it, delete it, tell its sender. Counts 1 only when the
    /// inbox file actually went; an I/O refusal on this one item skips it and the loop goes on.
    /// </summary>
    private async Task<int> WithdrawInboxItemAsync(string path, CancellationToken ct)
    {
        try
        {
            var item = await ReadShareOrNullAsync(path, ct);
            if (item is null || Forget(path) == 0)
            {
                return 0;
            }
            await MarkWithdrawnAsync(item.FromEmail, item.Id, RecipientDeactivatedReason, ct);
            return 1;
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            return 0;
        }
    }

    /// <summary>
    /// Rewrite one sender's receipt with the reason, if the receipt still exists. A missing receipt — already
    /// dismissed, pruned, or never written by an older server — is not resurrected: a row nobody can act on
    /// would be noise in a view whose one action is "dismiss". A receipt that will not rewrite is left as it
    /// was: the share is already out of the inbox, which is the part that matters, and the hourly sweep then
    /// retires the receipt exactly as it would for an accepted share.
    /// </summary>
    private async Task MarkWithdrawnAsync(string senderEmail, string id, string reason, CancellationToken ct)
    {
        var path = Path.Combine(SentDirFor(senderEmail), id + ".json");
        try
        {
            var receipt = await ReadSentOrNullAsync(path, ct);
            if (receipt is null)
            {
                return;
            }
            await AtomicWriteAsync(
                path,
                JsonSerializer.SerializeToUtf8Bytes(receipt with { WithdrawnReason = reason }, AppJsonContext.Default.SentShare),
                ct);
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            // See the summary: the inbox file is gone, and the sweep handles a receipt it could not rewrite.
        }
    }

    /// <summary>
    /// One receipt the blocked person holds: delete the recipient's copy, then the receipt. Counts 1 only when
    /// the recipient's inbox file actually went.
    /// </summary>
    private async Task<int> WithdrawSentItemAsync(string path, CancellationToken ct)
    {
        try
        {
            var receipt = await ReadSentOrNullAsync(path, ct);
            if (receipt is null)
            {
                return 0;
            }
            var withdrawn = Forget(Path.Combine(_sharesDir, KeyFor(receipt.ToEmail), receipt.Id + ".json"));
            Forget(path);
            return withdrawn;
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            return 0;
        }
    }
}
