using System.Runtime.CompilerServices;
using System.Text.Json;

namespace CredVaultServer;

/// <summary>
/// The sender's side of a share, and the two sweeps that keep both sides from growing forever.
/// </summary>
/// <remarks>
/// <para><b>Why a sender-side directory exists at all.</b> An inbox is keyed by the RECIPIENT, so
/// until now a sender could neither see nor name what was waiting for someone else — which is
/// precisely why a share could not be withdrawn: there was no id to withdraw. A receipt in the
/// sender's own tree gives them that id and discloses nothing they did not already do.</para>
///
/// <para><b>Two sweeps, not one, because they answer different questions.</b> Reconciliation asks
/// "is this receipt still about something pending?" and drops it the moment the recipient has
/// accepted or declined — that is the ordinary end of a share's life, and the receipt should not
/// outlive it. Age pruning asks "has anyone looked at this in a month?" and drops BOTH sides. A
/// recipient who never opens their inbox used to fill it to the 500-item quota and then silently
/// stop receiving anything, with nobody but them able to fix it.</para>
///
/// <para>In its own file rather than in <c>VaultStore.cs</c>: that one was already about vaults
/// and inboxes, and a third concern in it would have pushed a 300-line class past the point where
/// a reader can hold it.</para>
/// </remarks>
public sealed partial class VaultStore
{
    private string SentDir => Path.Combine(_dataDir, "sent");

    private string SentDirFor(string senderEmail) => Path.Combine(SentDir, KeyFor(senderEmail));

    /// <summary>Record that this sender posted this share, so they can find it again.</summary>
    public async Task AppendSentAsync(string senderEmail, SentShare receipt, CancellationToken ct)
    {
        var dir = SentDirFor(senderEmail);
        Directory.CreateDirectory(dir);
        await AtomicWriteAsync(
            Path.Combine(dir, receipt.Id + ".json"),
            JsonSerializer.SerializeToUtf8Bytes(receipt, AppJsonContext.Default.SentShare),
            ct);
    }

    /// <summary>
    /// Everything this sender has pending, one at a time.
    /// </summary>
    /// <remarks>
    /// Streamed for the same reason the inbox is: a receipt is small, but "small times a quota"
    /// is how the inbox listing came to need it, and a second listing that materialises would be
    /// the same defect written twice.
    /// </remarks>
    public async IAsyncEnumerable<SentShare> ListSentAsync(
        string senderEmail,
        [EnumeratorCancellation] CancellationToken ct)
    {
        var dir = SentDirFor(senderEmail);
        if (!Directory.Exists(dir))
        {
            yield break;
        }
        foreach (var path in Directory.EnumerateFiles(dir, "*.json"))
        {
            ct.ThrowIfCancellationRequested();
            var receipt = await ReadSentOrNullAsync(path, ct);
            if (receipt is not null)
            {
                yield return receipt;
            }
        }
    }

    /// <summary>One receipt, or null when this sender has none by that id.</summary>
    public Task<SentShare?> ReadSentAsync(string senderEmail, string id, CancellationToken ct) =>
        Guid.TryParse(id, out _)
            ? ReadSentOrNullAsync(Path.Combine(SentDirFor(senderEmail), id + ".json"), ct)
            : Task.FromResult<SentShare?>(null);

    /// <summary>Forget a receipt. True if it was there.</summary>
    public bool DeleteSent(string senderEmail, string id)
    {
        // The same guard the inbox delete uses: an id that is not a GUID never reaches Path.Combine.
        if (!Guid.TryParse(id, out _))
        {
            return false;
        }
        var path = Path.Combine(SentDirFor(senderEmail), id + ".json");
        if (!File.Exists(path))
        {
            return false;
        }
        File.Delete(path);
        return true;
    }

    /// <summary>
    /// Drop every receipt whose share is no longer pending — except one the server withdrew itself.
    /// </summary>
    /// <remarks>
    /// <para>The recipient accepting or declining deletes the inbox file; nothing tells the sender. So
    /// the file's absence IS the signal, and this is the periodic reading of it. Returns how many
    /// receipts were retired.</para>
    /// <para><b>A receipt carrying <see cref="SentShare.WithdrawnReason"/> is kept.</b> Blocking a
    /// recipient deletes exactly the inbox file this test reads, so without the exception the sweep
    /// would erase the sender's one explanation within the hour and they would never learn why their
    /// share vanished — the story split found this by reading the two paths side by side. The reason
    /// stays until the sender dismisses it or the 31-day prune takes it.</para>
    /// </remarks>
    public async Task<int> ReconcileSentAsync(CancellationToken ct)
    {
        var retired = 0;
        foreach (var senderDir in SafeDirectories(SentDir))
        {
            foreach (var path in SafeFiles(senderDir))
            {
                ct.ThrowIfCancellationRequested();
                var receipt = await ReadSentOrNullAsync(path, ct);
                if (receipt is null || Retirable(receipt))
                {
                    retired += Forget(path);
                }
            }
        }
        return retired;
    }

    /// <summary>Gone from the inbox and NOT withdrawn by the server: the recipient acted, so the receipt has told its story.</summary>
    private bool Retirable(SentShare receipt) => !receipt.IsWithdrawn && !StillPending(receipt);

    private bool StillPending(SentShare receipt) =>
        File.Exists(Path.Combine(_sharesDir, KeyFor(receipt.ToEmail), receipt.Id + ".json"));

    /// <summary>
    /// Drop every share and receipt older than <paramref name="maxAge"/>.
    /// </summary>
    /// <remarks>
    /// <para>Age comes from the item's own <c>createdAt</c>, not from the file's timestamp: a
    /// restore from backup rewrites every mtime, and a sweep that trusted them would delete a
    /// month of shares the first time someone recovered a server — the one moment nobody can
    /// afford a second failure.</para>
    /// <para><b>It answers WHAT it removed from the inboxes</b>, not only how many files went, because
    /// the caller writes one <c>share.expired</c> row per expired share and a count cannot name the two
    /// people it was between. The inbox item is the source: it carries both addresses, the entity and
    /// the project. The RECEIPTS it also prunes are counted and not listed — a receipt's disappearance
    /// is not an event, because whatever happened to its share already left a row of its own, and a
    /// second one would double every share in the history.</para>
    /// </remarks>
    public Task<Prune> PruneOlderThanAsync(TimeSpan maxAge, CancellationToken ct) =>
        PruneOlderThanAsync(maxAge, FilesUnder(_sharesDir), FilesUnder(SentDir), ct);

    /// <summary>The same pass over two file sequences the caller supplies.</summary>
    /// <remarks>
    /// <para><b>STOPPING is not throwing, and the difference is a row.</b> Files are deleted as this
    /// walks, and an <c>OperationCanceledException</c> here would take the list of what went with it —
    /// the caller could then write no <c>share.expired</c> rows for shares that are already gone, and no
    /// later sweep can find them to try again. So a cancelled pass stops where it is and hands back what
    /// it did.</para>
    /// <para><b>Why the two sequences are parameters.</b> The case this method exists to survive is
    /// cancellation MID-WALK — after some files are deleted, before the pass ends — and a test cannot
    /// steer a real directory walk to that point except by racing it. A sequence that cancels the token
    /// as it yields puts the pass exactly there, deterministically and without a clock. Production
    /// passes the real trees, which is what the public overload above is.</para>
    /// </remarks>
    internal async Task<Prune> PruneOlderThanAsync(
        TimeSpan maxAge,
        IEnumerable<string> inboxFiles,
        IEnumerable<string> sentFiles,
        CancellationToken ct)
    {
        var cutoff = DateTimeOffset.UtcNow.Subtract(maxAge).ToUnixTimeMilliseconds();
        var expired = await PruneSharesAsync(inboxFiles, cutoff, ct);
        var receipts = await PruneReceiptsAsync(sentFiles, cutoff, ct);
        return new Prune(expired, receipts);
    }

    /// <summary>Inbox items older than the cutoff, deleted and named.</summary>
    private static async Task<List<ShareFacts>> PruneSharesAsync(
        IEnumerable<string> files, long cutoff, CancellationToken ct)
    {
        var expired = new List<ShareFacts>();
        foreach (var path in files)
        {
            if (ct.IsCancellationRequested)
            {
                break;
            }
            expired.AddRange(Taken(path, await ReadShareOrNullAsync(path, CancellationToken.None), cutoff));
        }
        return expired;
    }

    /// <summary>Sender receipts older than the cutoff, deleted and counted.</summary>
    /// <remarks>
    /// Counted rather than named: a receipt's disappearance is not an event, because whatever happened
    /// to its share already left a row, and a second one would double every share in the history.
    /// </remarks>
    private static async Task<int> PruneReceiptsAsync(
        IEnumerable<string> files, long cutoff, CancellationToken ct)
    {
        var gone = 0;
        foreach (var path in files)
        {
            if (ct.IsCancellationRequested)
            {
                break;
            }
            gone += ForgetIfStale(path, await ReadSentOrNullAsync(path, CancellationToken.None), cutoff);
        }
        return gone;
    }

    /// <summary>The share this path held, if it was expired and the delete actually took it.</summary>
    private static IEnumerable<ShareFacts> Taken(string path, ShareItem? item, long cutoff) =>
        item is not null && item.CreatedAt < cutoff && Forget(path) == 1 ? [ShareFacts.Of(item)] : [];

    private static int ForgetIfStale(string path, SentShare? receipt, long cutoff) =>
        receipt is not null && receipt.CreatedAt < cutoff ? Forget(path) : 0;

    /// <summary>Every file in a tree that is one directory per person, lazily.</summary>
    private static IEnumerable<string> FilesUnder(string root) => SafeDirectories(root).SelectMany(SafeFiles);

    private static async Task<SentShare?> ReadSentOrNullAsync(string path, CancellationToken ct)
    {
        try
        {
            return JsonSerializer.Deserialize(
                await File.ReadAllBytesAsync(path, ct), AppJsonContext.Default.SentShare);
        }
        catch (Exception e) when (e is JsonException or FileNotFoundException or DirectoryNotFoundException)
        {
            // A half-written file, or one deleted between the scan and the read. Neither is a fault.
            return null;
        }
    }

    /// <summary>Delete one file, counting it only if it actually went.</summary>
    private static int Forget(string path)
    {
        try
        {
            File.Delete(path);
            return 1;
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            // Held open, or gone already. A sweep that threw here would stop sweeping.
            return 0;
        }
    }

    private static IEnumerable<string> SafeDirectories(string root)
    {
        try
        {
            return Directory.Exists(root) ? Directory.EnumerateDirectories(root) : [];
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            return [];
        }
    }

    private static IEnumerable<string> SafeFiles(string dir)
    {
        try
        {
            return Directory.EnumerateFiles(dir, "*.json").ToArray();
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            return [];
        }
    }
}
