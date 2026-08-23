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
public sealed class VaultStore
{
    private readonly string _vaultsDir;
    private readonly string _sharesDir;
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public VaultStore(string dataDir)
    {
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

    public async Task WriteVaultAsync(string email, byte[] content, CancellationToken ct)
    {
        var path = Path.Combine(_vaultsDir, KeyFor(email) + ".bin");
        await AtomicWriteAsync(path, content, ct);
    }

    /// <summary>Emails of everyone with a stored vault (for team discovery).</summary>
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

    /// <summary>Delete a vault, its owner sidecar, and the owner's whole inbox.</summary>
    public void DeleteEverythingFor(string email)
    {
        var key = KeyFor(email);
        foreach (var suffix in new[] { ".bin", ".email" })
        {
            try { File.Delete(Path.Combine(_vaultsDir, key + suffix)); }
            catch (IOException) { }
            catch (UnauthorizedAccessException) { }
        }
        try { Directory.Delete(Path.Combine(_sharesDir, key), recursive: true); }
        catch (DirectoryNotFoundException) { }
        catch (IOException) { }
        catch (UnauthorizedAccessException) { }
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
        await AtomicWriteAsync(path, JsonSerializer.SerializeToUtf8Bytes(item, Json), ct);
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
            return JsonSerializer.Deserialize<ShareItem>(await File.ReadAllBytesAsync(path, ct), Json);
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

    private static async Task AtomicWriteAsync(string path, byte[] content, CancellationToken ct)
    {
        var temp = path + "." + Guid.NewGuid().ToString("N")[..8] + ".tmp";
        await File.WriteAllBytesAsync(temp, content, ct);
        File.Move(temp, path, overwrite: true);
    }
}
