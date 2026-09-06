using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace CredVaultServer;

/// <summary>What the store found: the key, nothing at all, or a file it must not replace.</summary>
/// <remarks>
/// Three states rather than two, for the reason <see cref="MemberLookup"/> has three: collapsing
/// <see cref="Unreadable"/> into <see cref="Absent"/> is what would make a wrong KEK mint a SECOND key
/// and orphan every wrap already sealed to the first. That is a vault nobody can open, produced by a
/// server that answered <c>200</c>. The type exists so no caller can flatten it back.
/// </remarks>
public enum LoginKeyLookup
{
    Found,
    Absent,
    Unreadable,
}

/// <summary>One answer from the store: the state, and the key when there is one.</summary>
public readonly record struct LoginKeyResult(LoginKeyLookup Status, byte[] Key)
{
    public static readonly LoginKeyResult Absent = new(LoginKeyLookup.Absent, []);

    public static readonly LoginKeyResult Unreadable = new(LoginKeyLookup.Unreadable, []);

    public static LoginKeyResult Of(byte[] key) => new(LoginKeyLookup.Found, key);

    /// <summary>
    /// The short public name of a key: the first eight bytes of its SHA-256 as sixteen lowercase hex
    /// characters. A client stores it beside a wrap and compares it against what the server returns, so
    /// "the server's key changed under me" is answerable without either side comparing secrets — and so
    /// that a changed key is never reported to a person as a wrong PIN. Sixteen hex characters is a
    /// fingerprint, not a key: it identifies, and 64 bits of a hash of 32 random bytes is not something
    /// an attacker inverts into the bytes themselves.
    /// </summary>
    public string Fingerprint => Status == LoginKeyLookup.Found ? FingerprintOf(Key) : string.Empty;

    internal static string FingerprintOf(byte[] key) =>
        Convert.ToHexString(SHA256.HashData(key)[..8]).ToLowerInvariant();
}

/// <summary>The sealed shape on disk. AES-256-GCM under the deployment KEK; no plaintext ever lands.</summary>
public sealed record SealedLoginKey(string Iv, string Tag, string Data, long CreatedAt);

/// <summary>
/// Custody of the login key S — 32 random bytes per person that a developer's vault wraps are sealed
/// to, so a copied vault file is dead without a live login (story 3 does the sealing).
///
/// <para><b>The key never leaves this server in the clear except to the person it belongs to</b>, and
/// never touches the disk in the clear at all: it is stored at
/// <c>${DataDir}/org/login-keys/&lt;key&gt;.bin</c> as AES-256-GCM ciphertext under the deployment's own
/// KEK, keyed by <see cref="VaultStore.KeyFor"/> so one identity space keeps one hashing scheme.</para>
///
/// <para><b>Minting is idempotent by lock and by filesystem, not by luck.</b> Re-minting is the worst
/// thing this class can do — every wrap already sealed to the old S becomes unopenable — so two
/// mechanisms stand in the way. In-process, the 64-way stripe every other store takes. Across
/// processes, the write is a create-if-absent: a temp file moved with <c>overwrite: false</c>, which
/// the OS refuses when the destination exists, and the loser then reads the winner's key. A single
/// deployment is the normal case; a rolling restart with two containers on one volume for a few
/// seconds is not exotic, and the in-memory stripe says nothing about it.</para>
///
/// <para><b>A missing KEK degrades this feature and nothing else.</b> The store is constructed on every
/// deployment, personal ones included, and <see cref="RemoveAsync"/> works without a KEK because
/// deleting a file is not decryption. Only sealing and opening need it. <c>module_server.md</c> records
/// where that lesson came from: refusing to boot over an optional feature took ordinary vault sync down
/// for everyone.</para>
/// </summary>
public sealed class LoginKeyStore(string dataDir, byte[] kek, ILogger<LoginKeyStore> log)
{
    /// <summary>32 bytes, because the cipher is AES-256.</summary>
    public const int KeyBytes = 32;

    private readonly string _dir = Path.Combine(dataDir, "org", "login-keys");

    /// <summary>Whether this deployment can seal and open keys at all — false when no KEK is configured.</summary>
    public bool Configured => kek.Length == KeyBytes;

    /// <summary>
    /// The person's key, minting one on the first call and returning the same bytes ever after.
    ///
    /// <para>An <see cref="LoginKeyLookup.Unreadable"/> existing file is returned AS unreadable and
    /// nothing is minted — the finding the plan round called blocking, and rightly: a KEK changed by a
    /// restore or a typo would otherwise silently issue a second key while the person's vault stayed
    /// sealed to the first, and the API would report success the whole way.</para>
    /// </summary>
    public async Task<LoginKeyResult> GetOrCreateAsync(string email, CancellationToken ct)
    {
        var existing = await FindAsync(email, ct);
        if (existing.Status != LoginKeyLookup.Absent)
        {
            return existing;
        }
        var gate = VaultStore.GateFor(VaultStore.KeyFor(email));
        await gate.WaitAsync(ct);
        try
        {
            return await MintAsync(email, ct);
        }
        finally
        {
            gate.Release();
        }
    }

    /// <summary>The key if this server has one it can open. Never mints, never throws.</summary>
    public async Task<LoginKeyResult> FindAsync(string email, CancellationToken ct)
    {
        var path = PathFor(email);
        try
        {
            if (!File.Exists(path))
            {
                return LoginKeyResult.Absent;
            }
            var sealedKey = JsonSerializer.Deserialize(
                await File.ReadAllBytesAsync(path, ct), AppJsonContext.Default.SealedLoginKey);
            return sealedKey is null ? Unreadable(email, "the file is not the JSON this store writes") : Open(email, sealedKey);
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or JsonException)
        {
            return Unreadable(email, e.Message);
        }
    }

    /// <summary>
    /// Delete the person's key. Answers whether it is gone — a caller that swallowed the difference
    /// would report a clean deletion over a file still on the disk.
    /// </summary>
    public Task<bool> RemoveAsync(string email, CancellationToken ct)
    {
        var path = PathFor(email);
        // Nothing to remove is removed — and silently, because the overwhelmingly common caller is a
        // personal deployment's DELETE /api/vault, where no org/ tree exists at all. Checked rather than
        // left to File.Delete: it is a no-op for a missing file but THROWS for a missing directory, which
        // would have turned "this server has never issued a key" into an Error line on every deletion.
        if (!File.Exists(path))
        {
            return Task.FromResult(true);
        }
        try
        {
            File.Delete(path);
            log.LogInformation("login key removed for {Email}", email);
            return Task.FromResult(true);
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            log.LogError(e, "login key for {Email} could not be removed; it is still on disk", email);
            return Task.FromResult(false);
        }
    }

    private string PathFor(string email) => Path.Combine(_dir, VaultStore.KeyFor(email) + ".bin");

    /// <summary>
    /// Seal fresh bytes and write them ONLY if nobody else has. The loser of the race reads the
    /// winner's file rather than overwriting it, so two processes cannot hand two people's clients two
    /// different keys for one person.
    /// </summary>
    private async Task<LoginKeyResult> MintAsync(string email, CancellationToken ct)
    {
        var found = await FindAsync(email, ct);
        if (found.Status != LoginKeyLookup.Absent)
        {
            return found;
        }
        var key = RandomNumberGenerator.GetBytes(KeyBytes);
        Directory.CreateDirectory(_dir);
        var written = await TryCreateAsync(PathFor(email), Seal(key), ct);
        if (!written)
        {
            return await FindAsync(email, ct);
        }
        log.LogInformation("login key issued for {Email} ({Fingerprint})", email, LoginKeyResult.FingerprintOf(key));
        return LoginKeyResult.Of(key);
    }

    /// <summary>
    /// Temp file, then a move that REFUSES to overwrite. Both halves matter: the temp file is why a
    /// reader never sees a half-written key, and <c>overwrite: false</c> is why a second process cannot
    /// replace one that already exists.
    /// </summary>
    private static async Task<bool> TryCreateAsync(string path, byte[] content, CancellationToken ct)
    {
        try
        {
            await VaultStore.AtomicWriteAsync(path, content, ct, overwrite: false);
            return true;
        }
        catch (IOException)
        {
            return false;
        }
    }

    private byte[] Seal(byte[] key)
    {
        var iv = RandomNumberGenerator.GetBytes(AesGcm.NonceByteSizes.MaxSize);
        var tag = new byte[AesGcm.TagByteSizes.MaxSize];
        var data = new byte[key.Length];
        using var aes = new AesGcm(kek, tag.Length);
        aes.Encrypt(iv, key, data, tag);
        return JsonSerializer.SerializeToUtf8Bytes(
            new SealedLoginKey(
                Convert.ToBase64String(iv),
                Convert.ToBase64String(tag),
                Convert.ToBase64String(data),
                DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()),
            AppJsonContext.Default.SealedLoginKey);
    }

    /// <summary>
    /// Open one sealed key, or say it cannot be opened. A wrong KEK and a tampered file both land here
    /// as <see cref="LoginKeyLookup.Unreadable"/> — GCM authenticates, so neither can produce plausible
    /// garbage that a caller would go on to use.
    /// </summary>
    private LoginKeyResult Open(string email, SealedLoginKey sealedKey)
    {
        try
        {
            var data = Convert.FromBase64String(sealedKey.Data);
            var key = new byte[data.Length];
            using var aes = new AesGcm(kek, Convert.FromBase64String(sealedKey.Tag).Length);
            aes.Decrypt(Convert.FromBase64String(sealedKey.Iv), data, Convert.FromBase64String(sealedKey.Tag), key);
            return LoginKeyResult.Of(key);
        }
        catch (Exception e) when (e is CryptographicException or FormatException or ArgumentException)
        {
            return Unreadable(email, "it will not decrypt under this server's KEK");
        }
    }

    private LoginKeyResult Unreadable(string email, string why)
    {
        log.LogError(
            "login key for {Email} exists and cannot be read: {Why}. NOTHING is minted in its place — a "
            + "second key would orphan every wrap sealed to the first. Restore the file or the KEK.",
            email,
            why);
        return LoginKeyResult.Unreadable;
    }
}
