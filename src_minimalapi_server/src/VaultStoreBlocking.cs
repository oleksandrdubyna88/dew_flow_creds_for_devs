using System.Text.Json;

namespace CredVaultServer;

/// <summary>
/// What one block withdrew: how many pending shares were addressed TO the person, how many FROM them, and
/// how many of their senders could NOT be told why.
/// </summary>
/// <remarks>
/// <b><see cref="UnexplainedSenders"/> exists because the alternative is a silence nobody can see.</b> The
/// inbox copy is deleted before the sender's receipt is rewritten — the right order, since the reverse
/// leaves readable material in the inbox of somebody who may be re-admitted — so a receipt that will not
/// rewrite (a lock, a permission, a full disk) costs the sender their one explanation, and the hourly
/// sweep then retires the unmarked receipt as an ordinary accepted share. That is best-effort working as
/// designed, but it must not be invisible: the count rides back with the others into the Warning line and
/// the <c>member.blocked</c> row, so an operator can see that a sender was left in the dark.
/// </remarks>
public readonly record struct Withdrawal(
    int ToThem,
    int FromThem,
    int UnexplainedSenders,
    IReadOnlyList<ShareFacts> Shares)
{
    public static readonly Withdrawal None = new(0, 0, 0, []);

    public int Total => ToThem + FromThem;
}

/// <summary>
/// What one prune pass removed: the expired INBOX shares, each of which earns a row, and how many
/// sender receipts went with them, which earn none. See <see cref="VaultStore.PruneOlderThanAsync"/>
/// for why the receipts are counted rather than listed.
/// </summary>
public readonly record struct Prune(IReadOnlyList<ShareFacts> Expired, int Receipts)
{
    /// <summary>Files removed — what the sweep's own log line has always reported.</summary>
    public int Count => Expired.Count + Receipts;
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
        // Every share this took, so the caller can leave one row per share. A count in the admin's own
        // row cannot answer "what happened to the share I sent Boris", which is the question the log
        // exists for; the volume is bounded by the inbox cap.
        var shares = new List<ShareFacts>();
        var toThem = 0;
        var unexplained = 0;
        foreach (var path in SafeFiles(Path.Combine(_sharesDir, KeyFor(email))))
        {
            ct.ThrowIfCancellationRequested();
            var (withdrawn, untold, facts) = await WithdrawInboxItemAsync(path, ct);
            toThem += withdrawn;
            unexplained += untold;
            if (facts is { } taken)
            {
                shares.Add(taken);
            }
        }
        var fromThem = 0;
        foreach (var path in SafeFiles(SentDirFor(email)))
        {
            ct.ThrowIfCancellationRequested();
            var (withdrawn, facts) = await WithdrawSentItemAsync(email, path, ct);
            fromThem += withdrawn;
            if (facts is { } taken)
            {
                shares.Add(taken);
            }
        }
        return new Withdrawal(toThem, fromThem, unexplained, shares);
    }

    /// <summary>
    /// One item in the blocked person's inbox: read it, delete it, tell its sender. Counts 1 as withdrawn
    /// only when the inbox file actually went; an I/O refusal on this one item skips it and the loop goes
    /// on. <c>Untold</c> is 1 when the share went but its sender's receipt could not be rewritten — the
    /// case that would otherwise be a silence (see <see cref="Withdrawal.UnexplainedSenders"/>).
    /// </summary>
    private async Task<(int Withdrawn, int Untold, ShareFacts? Facts)> WithdrawInboxItemAsync(string path, CancellationToken ct)
    {
        try
        {
            var item = await ReadShareOrNullAsync(path, ct);
            if (item is null || Forget(path) == 0)
            {
                return (0, 0, null);
            }
            var told = await MarkWithdrawnAsync(item.FromEmail, item.Id, RecipientDeactivatedReason, ct);
            return (1, told ? 0 : 1, ShareFacts.Of(item));
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            return (0, 0, null);
        }
    }

    /// <summary>
    /// Rewrite one sender's receipt with the reason, if the receipt still exists. A missing receipt — already
    /// dismissed, pruned, or never written by an older server — is not resurrected: a row nobody can act on
    /// would be noise in a view whose one action is "dismiss". A receipt that will not rewrite is left as it
    /// was: the share is already out of the inbox, which is the part that matters, and the hourly sweep then
    /// retires the receipt exactly as it would for an accepted share.
    ///
    /// <para><b>Returns whether the sender now has their explanation</b>, and a missing receipt counts as
    /// yes: nothing was owed, because the sender had already dismissed or pruned it. Only the I/O failure
    /// is a no, and it is the one case where somebody is left in the dark by a block that reported
    /// success — so the caller counts it and the admin's log line says it happened.</para>
    /// </summary>
    private async Task<bool> MarkWithdrawnAsync(string senderEmail, string id, string reason, CancellationToken ct)
    {
        var path = Path.Combine(SentDirFor(senderEmail), id + ".json");
        try
        {
            var receipt = await ReadSentOrNullAsync(path, ct);
            if (receipt is null)
            {
                return true;
            }
            await AtomicWriteAsync(
                path,
                JsonSerializer.SerializeToUtf8Bytes(receipt with { WithdrawnReason = reason }, AppJsonContext.Default.SentShare),
                ct);
            return true;
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            // The inbox file is already gone and the sweep will retire this receipt as an ordinary one, so
            // the sender loses the explanation. Counted, never swallowed: the block's log line says it.
            return false;
        }
    }

    /// <summary>
    /// One receipt the blocked person holds: delete the recipient's copy, then the receipt. Counts 1 only when
    /// the recipient's inbox file actually went.
    /// </summary>
    private async Task<(int Withdrawn, ShareFacts? Facts)> WithdrawSentItemAsync(string sender, string path, CancellationToken ct)
    {
        try
        {
            var receipt = await ReadSentOrNullAsync(path, ct);
            if (receipt is null)
            {
                return (0, null);
            }
            var withdrawn = Forget(Path.Combine(_sharesDir, KeyFor(receipt.ToEmail), receipt.Id + ".json"));
            Forget(path);
            // The sender is the blocked person, which the receipt cannot say — its directory is a one-way
            // hash of them — so it is passed in rather than derived.
            return (withdrawn, withdrawn == 1 ? ShareFacts.Of(sender, receipt) : null);
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            return (0, null);
        }
    }
}
