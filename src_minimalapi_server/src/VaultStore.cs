using System.Runtime.CompilerServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace CredVaultServer;

/// <summary>
/// Zero-knowledge storage: opaque vault blobs + per-recipient share inboxes
/// on the filesystem. The server never decrypts anything it stores — vault
/// bytes and a share item's `data` are ciphertext produced on the clients.
/// </summary>
public sealed partial class VaultStore
{
    private readonly string _dataDir;
    private readonly string _vaultsDir;
    private readonly string _sharesDir;

    public VaultStore(string dataDir)
    {
        _dataDir = dataDir;
        _vaultsDir = Path.Combine(dataDir, "vaults");
        _sharesDir = Path.Combine(dataDir, "shares");
        Directory.CreateDirectory(_vaultsDir);
        Directory.CreateDirectory(_sharesDir);
    }

    /// <summary>Filesystem-safe, collision-free key for an email.</summary>
    public static string KeyFor(string email)
    {
        var normalized = email.Trim().ToLowerInvariant();
        var hash = Convert.ToHexString(
            SHA256.HashData(Encoding.UTF8.GetBytes(normalized))).ToLowerInvariant();
        return hash[..32];
    }

    // ---------- vaults ----------

    public async Task<byte[]?> ReadVaultAsync(string email, CancellationToken ct)
    {
        var path = Path.Combine(_vaultsDir, KeyFor(email) + ".bin");
        return File.Exists(path) ? await File.ReadAllBytesAsync(path, ct) : null;
    }

    /// <summary>
    /// The version identifier a client echoes back to write conditionally. Derived from
    /// the content, so it is stable across reads, changes on every write, and needs no
    /// stored counter that could disagree with the bytes on disk.
    /// </summary>
    public static string ETagFor(byte[] content) =>
        '"' + Convert.ToHexString(SHA256.HashData(content))[..32].ToLowerInvariant() + '"';

    /// <summary>
    /// Compare-and-write. Returns false when the caller's precondition does not hold —
    /// which means somebody else wrote in between and this caller's copy is stale.
    ///
    /// <para>
    /// The check and the write happen under the same lock. Doing them separately is the
    /// classic way to build a race that only appears under the load nobody tests with:
    /// two callers both read "matches", both write, and the second still wins.
    /// </para>
    /// </summary>
    public async Task<bool> TryWriteVaultAsync(
        string email,
        byte[] content,
        VaultPrecondition precondition,
        CancellationToken ct)
    {
        var key = KeyFor(email);
        var path = Path.Combine(_vaultsDir, key + ".bin");
        var gate = GateFor(key);

        await gate.WaitAsync(ct);
        try
        {
            if (!precondition.IsUnconditional)
            {
                var current = File.Exists(path) ? await File.ReadAllBytesAsync(path, ct) : null;

                if (precondition.RequireAbsent && current is not null)
                {
                    return false;
                }
                if (precondition.IfMatch is { } expected)
                {
                    // A precondition against a vault that does not exist can never hold:
                    // there is no version to match.
                    if (current is null || !ETagsEqual(expected, ETagFor(current)))
                    {
                        return false;
                    }
                }
            }

            await AtomicWriteAsync(path, content, ct);
            return true;
        }
        finally
        {
            gate.Release();
        }
    }

    /// <summary>An If-Match may carry several candidates, and `*` means "any existing version".</summary>
    private static bool ETagsEqual(string header, string actual) =>
        header.Split(',')
            .Select(candidate => candidate.Trim())
            .Any(candidate => candidate == "*" || candidate == actual);

    // A fixed stripe of locks rather than one per email. Per-email locks would be a
    // dictionary that grows with every account and is never pruned — the "everything that
    // grows has an owner" rule. 64 stripes means two accounts occasionally wait on each
    // other for the length of one file write, which costs nothing and cannot leak.
    //
    // Shared with OrgMembersStore rather than duplicated: a member upsert takes the same gate as a
    // vault write for the same email, which is harmless — each holds it for one small file write —
    // and one stripe is one owner to reason about instead of two.
    private static readonly SemaphoreSlim[] Gates =
        [.. Enumerable.Range(0, 64).Select(_ => new SemaphoreSlim(1, 1))];

    internal static SemaphoreSlim GateFor(string key) =>
        Gates[(int)(uint.Parse(key[..8], System.Globalization.NumberStyles.HexNumber) % Gates.Length)];

    /// <summary>Emails of everyone with a stored vault (for team discovery).</summary>
    /// <summary>How many vaults are stored and how many bytes they take — the officers' metrics.</summary>
    public (int Count, long Bytes) VaultFootprint() =>
        Footprint(Directory.EnumerateFiles(_vaultsDir, "*.bin"));

    /// <summary>Pending shares across every inbox, and their bytes.</summary>
    public (int Count, long Bytes) ShareFootprint() =>
        Footprint(Directory.EnumerateFiles(_sharesDir, "*.json", SearchOption.AllDirectories));

    private static (int Count, long Bytes) Footprint(IEnumerable<string> files)
    {
        var count = 0;
        long bytes = 0;
        foreach (var file in files)
        {
            count++;
            try { bytes += new FileInfo(file).Length; }
            catch (IOException) { /* deleted between the listing and the stat — not worth a miscount */ }
        }
        return (count, bytes);
    }

    public IReadOnlyList<string> ListVaultOwners()
    {
        var emails = new List<string>();
        foreach (var meta in Directory.EnumerateFiles(_vaultsDir, "*.email"))
        {
            try
            {
                var email = File.ReadAllText(meta).Trim();
                // Trust only well-formed emails; never let a hostile sidecar
                // (or a locked/half-written file) break team discovery.
                if (email.Length is > 0 and <= 320 && email.Contains('@') && !email.Contains('\n'))
                {
                    emails.Add(email);
                }
            }
            catch (IOException)
            {
                // locked / unreadable — skip this one, keep listing the rest
            }
            catch (UnauthorizedAccessException)
            {
                // permission flip — skip
            }
        }
        return emails;
    }

    /// <summary>
    /// What a deletion actually managed to remove. <c>true</c> also means "was not there".
    /// </summary>
    /// <param name="Refusal">
    /// Why a component would not go, for the caller to write down. Carried out rather than logged
    /// here: the endpoint is where the person-facing decision is made and where a logger already
    /// exists, and a store that logs would have to be constructed with one before the host is built.
    /// </param>
    /// <param name="RestDone">Whether the caller's own continuation finished — see <c>whileHeld</c>.</param>
    public sealed record VaultDeletion(
        bool VaultGone,
        bool OwnerGone,
        bool InboxGone,
        Exception? Refusal = null,
        bool RestDone = true);

    /// <summary>
    /// Delete a vault, its owner sidecar and the owner's whole inbox — and say what happened.
    /// </summary>
    /// <remarks>
    /// <para>It used to return <c>void</c> and swallow a locked file in silence, so the endpoint
    /// carried on and removed the login key S from a vault that was still there (audit 2026-09-09,
    /// finding #4). On a corporate server every developer wrap is sealed to S, which makes a vault
    /// that outlives its key a vault nobody can OPEN — the one leftover this design will not take.</para>
    ///
    /// <para><b>The vault goes FIRST and alone.</b> If it will not go, nothing else is attempted:
    /// the caller answers "nothing else was removed", and that has to be true rather than nearly
    /// true, or a retry runs against a state the first attempt already changed.</para>
    ///
    /// <para><b>The gate is held for the caller's continuation too</b>, through <paramref name="whileHeld"/>,
    /// and that continuation is the REST of account deletion — the login key and the registry record.
    /// Releasing between any two of them leaves a window for a concurrent PUT to recreate the vault
    /// and be orphaned by what follows: the same "a vault nobody can open" outcome by a different
    /// door, raised twice by the review gate. Whatever runs in there must not take this gate again,
    /// because a <see cref="SemaphoreSlim"/> is not re-entrant — which is why `OrgMembersStore` grew
    /// a `RemoveWhileGateHeld` beside its gated `RemoveAsync`.</para>
    ///
    /// <para>The continuation answers whether it finished, and that answer is carried out with the
    /// rest: a login key the OS will not unlink is the leftover this design accepts (300 bytes of
    /// ciphertext nobody can use), but an accepted leftover is still one to report.</para>
    ///
    /// <para>The gate is <see cref="GateFor"/> on <see cref="KeyFor"/>(email) — the same lock identity
    /// <see cref="TryWriteVaultAsync"/> takes, which is what makes a write and a delete for one person
    /// mutually exclusive.</para>
    /// </remarks>
    public async Task<VaultDeletion> DeleteEverythingForAsync(
        string email,
        Func<CancellationToken, Task<bool>> whileHeld,
        CancellationToken ct)
    {
        var key = KeyFor(email);
        var gate = GateFor(key);
        await gate.WaitAsync(ct);
        try
        {
            var vault = Removed(Path.Combine(_vaultsDir, key + ".bin"));
            if (vault is not null)
            {
                return new VaultDeletion(false, false, false, vault);
            }
            var owner = Removed(Path.Combine(_vaultsDir, key + ".email"));
            var inbox = RemovedTree(Path.Combine(_sharesDir, key));
            var rest = await whileHeld(ct);
            return new VaultDeletion(true, owner is null, inbox is null, owner ?? inbox, rest);
        }
        finally
        {
            gate.Release();
        }
    }

    /// <summary>Delete one file. <c>null</c> means gone — absent counts as gone; otherwise, why not.</summary>
    private static Exception? Removed(string path)
    {
        try
        {
            File.Delete(path);
            return null;
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            return e;
        }
    }

    private static Exception? RemovedTree(string path)
    {
        try
        {
            Directory.Delete(path, recursive: true);
            return null;
        }
        catch (DirectoryNotFoundException)
        {
            return null;
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            return e;
        }
    }

    /// <summary>Record the plaintext email beside a vault so the team can be listed.</summary>
    public async Task RecordOwnerAsync(string email, CancellationToken ct)
    {
        var path = Path.Combine(_vaultsDir, KeyFor(email) + ".email");
        await AtomicWriteAsync(path, Encoding.UTF8.GetBytes(email.Trim().ToLowerInvariant()), ct);
    }

    // ---------- shares ----------

    public async Task AppendShareAsync(string recipientEmail, ShareItem item, CancellationToken ct)
    {
        var dir = Path.Combine(_sharesDir, KeyFor(recipientEmail));
        Directory.CreateDirectory(dir);
        var path = Path.Combine(dir, item.Id + ".json");
        await AtomicWriteAsync(path, JsonSerializer.SerializeToUtf8Bytes(item, AppJsonContext.Default.ShareItem), ct);
    }

    /// <summary>Number of pending shares for a recipient (for quota checks).</summary>
    public Task<int> CountSharesAsync(string recipientEmail, CancellationToken ct)
    {
        var dir = Path.Combine(_sharesDir, KeyFor(recipientEmail));
        var count = Directory.Exists(dir) ? Directory.EnumerateFiles(dir, "*.json").Count() : 0;
        return Task.FromResult(count);
    }

    /// <summary>Delete stray temp files from writes interrupted by a crash.</summary>
    public void SweepStaleTempFiles()
    {
        var cutoff = DateTime.UtcNow.AddMinutes(-10);
        foreach (var root in new[] { _vaultsDir, _sharesDir })
        {
            try
            {
                foreach (var tmp in Directory.EnumerateFiles(root, "*.tmp", SearchOption.AllDirectories))
                {
                    try
                    {
                        if (File.GetLastWriteTimeUtc(tmp) < cutoff)
                        {
                            File.Delete(tmp);
                        }
                    }
                    catch (IOException) { /* in use — leave it */ }
                    catch (UnauthorizedAccessException) { /* skip */ }
                }
            }
            catch (DirectoryNotFoundException) { /* nothing to sweep */ }
        }
    }

    /// <summary>
    /// Streams a recipient's inbox, one item at a time.
    ///
    /// Deliberately an <see cref="IAsyncEnumerable{T}"/> rather than a materialised list:
    /// an inbox holds up to <c>Vault:MaxInboxItems</c> (500) items of up to
    /// <c>Vault:MaxShareBytes</c> (1 MiB) each, so building the whole list first put a
    /// ~700 MiB spike — before JSON encoding doubled it — on one request that any
    /// same-domain account could provoke by filling someone's inbox. Yielding keeps
    /// exactly one item live and lets the GC reclaim each one as the response drains.
    /// </summary>
    public async IAsyncEnumerable<ShareItem> ListSharesAsync(
        string recipientEmail,
        [EnumeratorCancellation] CancellationToken ct)
    {
        var dir = Path.Combine(_sharesDir, KeyFor(recipientEmail));
        if (!Directory.Exists(dir))
        {
            yield break;
        }
        foreach (var path in Directory.EnumerateFiles(dir, "*.json"))
        {
            ct.ThrowIfCancellationRequested();
            var item = await ReadShareOrNullAsync(path, ct);
            if (item is not null)
            {
                yield return item;
            }
        }
    }

    /// <summary>One corrupted or vanished item must not fail the whole listing.</summary>
    private static async Task<ShareItem?> ReadShareOrNullAsync(string path, CancellationToken ct)
    {
        try
        {
            return JsonSerializer.Deserialize(await File.ReadAllBytesAsync(path, ct), AppJsonContext.Default.ShareItem);
        }
        catch (JsonException)
        {
            return null;
        }
        catch (FileNotFoundException)
        {
            // Deleted between the directory scan and the read.
            return null;
        }
    }

    /// <summary>
    /// Take one pending share out of a recipient's inbox: what it was, and whether this call is the one
    /// that removed it.
    /// </summary>
    /// <remarks>
    /// <para>Read then delete, in that order and in one place, because the caller needs both answers and
    /// asking for them separately is how two of them come to disagree. <b>Only the delete decides</b>:
    /// two clients racing the same share — a retried request, a second window — both read it and only
    /// one removes it, so a row written on the read would carry two answers for one share and one of
    /// them would be a lie.</para>
    /// <para>The item is <c>null</c> when the file could not be read even though it was there — a
    /// half-written file, or one from a newer server. The share is gone either way; the caller says so
    /// rather than inventing what it held.</para>
    /// </remarks>
    public async Task<(bool Removed, ShareItem? Item)> TakeShareAsync(
        string recipientEmail,
        string shareId,
        CancellationToken ct)
    {
        if (!Guid.TryParse(shareId, out _))
        {
            return (false, null);
        }
        var path = Path.Combine(_sharesDir, KeyFor(recipientEmail), shareId + ".json");
        var item = File.Exists(path) ? await ReadShareOrNullAsync(path, ct) : null;
        return (DeleteShare(recipientEmail, shareId), item);
    }

    /// <summary>Delete one pending share from a recipient's inbox. True if it existed.</summary>
    public bool DeleteShare(string recipientEmail, string shareId)
    {
        // Guard the id so it can never escape the inbox directory.
        if (!Guid.TryParse(shareId, out _))
        {
            return false;
        }
        var path = Path.Combine(_sharesDir, KeyFor(recipientEmail), shareId + ".json");
        if (!File.Exists(path))
        {
            return false;
        }
        File.Delete(path);
        return true;
    }

    /// <summary>
    /// Temp, then move, so a reader never sees a partial file. Shared with the org stores for the
    /// same reason the gate is: one write idiom in the server is one set of failure modes to learn.
    /// </summary>
    /// <param name="overwrite">
    /// Widened for the login-key store rather than copied: <c>false</c> makes this a create-if-absent,
    /// which the OS refuses when the destination already exists. That refusal is the only thing standing
    /// between two server processes on one volume and two different login keys for one person — an
    /// in-memory lock says nothing across processes, and a second key orphans every wrap sealed to the
    /// first. The temp file is cleaned up when the move is refused, so a losing race leaves no litter.
    /// </param>
    internal static async Task AtomicWriteAsync(
        string path,
        byte[] content,
        CancellationToken ct,
        bool overwrite = true)
    {
        var temp = path + "." + Guid.NewGuid().ToString("N")[..8] + ".tmp";
        await File.WriteAllBytesAsync(temp, content, ct);
        try
        {
            File.Move(temp, path, overwrite);
        }
        catch
        {
            File.Delete(temp);
            throw;
        }
    }
}
