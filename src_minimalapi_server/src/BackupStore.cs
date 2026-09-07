using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace CredVaultServer;

/// <summary>
/// Four answers about the backup key, because the differences between them are decisions.
/// </summary>
/// <remarks>
/// <para><c>Absent</c> means mint one. <c>AwaitingAcknowledgement</c> means one was minted but nobody
/// has confirmed seeing it, so no archive may be taken under it yet — and minting again is allowed,
/// because there is nothing sealed to the old one to orphan. <c>Ready</c> is the ordinary state.
/// <c>Unreadable</c> means a key exists and this server cannot open it, and NOTHING is minted in its
/// place.</para>
/// <para>Two answers would collapse the two that matter. "Absent" and "unreadable" look the same to a
/// caller that only asks "have I got a key?", and a KEK changed by a restore or a typo would then mint
/// a second key while every archive already taken stays sealed to the first.</para>
/// </remarks>
public enum BackupKeyLookup
{
    Absent = 0,
    AwaitingAcknowledgement = 1,
    Ready = 2,
    Unreadable = 3,
}

/// <summary>The answer, and the key when there is one to hand over.</summary>
public sealed record BackupKeyState(BackupKeyLookup Status, byte[] Key)
{
    public static readonly BackupKeyState Absent = new(BackupKeyLookup.Absent, []);

    public static readonly BackupKeyState Unreadable = new(BackupKeyLookup.Unreadable, []);

    public static BackupKeyState Ready(byte[] key) => new(BackupKeyLookup.Ready, key);

    public static BackupKeyState Awaiting(byte[] key) => new(BackupKeyLookup.AwaitingAcknowledgement, key);

    /// <summary>Whether a run may seal an archive under this. Only one status says yes.</summary>
    public bool UsableForARun => Status == BackupKeyLookup.Ready;
}

/// <summary>What a mint produced: the words for the person, or the reason there are none.</summary>
public sealed record MintOutcome(BackupKeyLookup Status, string Formatted, double EntropyBits)
{
    public static readonly MintOutcome NotConfigured = new(BackupKeyLookup.Unreadable, string.Empty, 0);

    public static MintOutcome Minted(MintedBackupKey key) =>
        new(BackupKeyLookup.AwaitingAcknowledgement, key.Formatted, key.EntropyBits);

    /// <summary>
    /// Somebody else already has a key, and its words cannot be produced again — by construction, not
    /// by policy: what is on the disk is the DERIVED key and HKDF does not run backwards.
    /// </summary>
    public static readonly MintOutcome AlreadyMinted = new(BackupKeyLookup.Ready, string.Empty, 0);
}

/// <summary>
/// Everything a backup deployment keeps on disk, and the one thing it deliberately does not.
/// </summary>
/// <remarks>
/// <para>Four things under <c>org/backup/</c>: the sealed key, a marker saying its words have been
/// shown to a person, the settings an admin edits, and the last run's outcome. Plus
/// <c>archives/</c>, which story 3 fills. This is the ONE directory the archive builder refuses to
/// walk (<see cref="BackupArchive.Excluded"/>) — an archive must never carry the key that opens it, and
/// an archive of the archives is a shape nobody wants.</para>
///
/// <para><b>The printable key is shown once, and that is a fact rather than a promise.</b> What is
/// sealed here is the 32 DERIVED bytes; the words the administrator wrote down are HKDF's input, and
/// HKDF does not run backwards. A server that could re-show the key would be a server whose compromise
/// hands over every archive ever taken.</para>
///
/// <para><b>Which is exactly why there is an acknowledgement.</b> Sealing the key and showing it to a
/// person are two steps, and a crash between them would leave a deployment whose archives are sealed to
/// words nobody has. So a mint writes the key AND leaves <c>key.shown</c> absent; until something
/// confirms the words reached a person, the state is <c>AwaitingAcknowledgement</c>, a run refuses to
/// take an archive, and minting again is allowed — there is nothing to orphan yet.</para>
///
/// <para><b>Two processes, one first run.</b> The key is written with a create that REFUSES to
/// overwrite, so a rolling restart with two containers on one volume ends with one key rather than
/// two: the loser of the race re-reads the winner's file. The same discipline
/// <see cref="LoginKeyStore"/> uses, for the same reason.</para>
///
/// <para><b>Settings and status are separate files</b> because they have separate writers. A run
/// writes status every time it runs; settings change when an admin edits them, and one file would mean
/// a run overwriting an admin's edit through a read-modify-write window.</para>
///
/// <para><b>Every lookup reads the disk.</b> Nothing here is cached, so an operator who fixes a wrong
/// KEK and asks again gets a fresh attempt at the same bytes rather than a remembered verdict.</para>
/// </remarks>
public sealed class BackupStore(string dataDir, byte[] kek, ILogger<BackupStore> log)
{
    /// <summary>The record layout this build writes. A higher one is not something to guess about.</summary>
    public const int SchemaVersion = 1;

    private readonly string _dir = Path.Combine(dataDir, "org", "backup");

    /// <summary>Whether this deployment can seal a backup key at all.</summary>
    public bool Configured => kek.Length == Key32.Bytes;

    /// <summary>Where archives accumulate. Created on demand, never walked into one.</summary>
    public string ArchivesDir => Path.Combine(_dir, "archives");

    /// <summary>The key, and which of the four answers this deployment is at.</summary>
    public async Task<BackupKeyState> FindKeyAsync(CancellationToken ct)
    {
        if (!Configured)
        {
            return BackupKeyState.Unreadable;
        }
        var sealedKey = await ReadSealedAsync(ct);
        return sealedKey is null ? BackupKeyState.Absent : Open(sealedKey);
    }

    /// <summary>
    /// Mint a key if there is none, and return its words exactly once.
    /// </summary>
    /// <remarks>
    /// A create that refuses to overwrite is what makes this safe to call from two processes; the loser
    /// gets <see cref="MintOutcome.AlreadyMinted"/> and no words, which is the truth — the winner's
    /// words exist only in whatever the winner's caller did with them.
    /// </remarks>
    public async Task<MintOutcome> MintKeyAsync(CancellationToken ct)
    {
        if (!Configured)
        {
            log.LogWarning(
                "a backup key cannot be minted because Vault:LoginKey:Kek is not configured. Set it to "
                + "base64 of 32 random bytes; the same key seals developer login keys.");
            return MintOutcome.NotConfigured;
        }
        var existing = await FindKeyAsync(ct);
        return existing.Status == BackupKeyLookup.Absent || existing.Status == BackupKeyLookup.AwaitingAcknowledgement
            ? await MintOverAsync(existing.Status, ct)
            : MintOutcome.AlreadyMinted;
    }

    /// <summary>
    /// Record that a person has seen the words. Until this, no archive may be taken.
    /// </summary>
    /// <remarks>
    /// A zero-byte marker rather than a field: flipping a field means rewriting <c>key.sealed</c>, and
    /// that file is written with a create that refuses to overwrite precisely so that it is never
    /// rewritten. Existence is the smallest fact that answers the question.
    /// </remarks>
    public async Task AcknowledgeKeyShownAsync(CancellationToken ct)
    {
        Directory.CreateDirectory(_dir);
        await VaultStore.AtomicWriteAsync(ShownPath, [], ct);
    }

    /// <summary>The settings, or this build's defaults when none have been written.</summary>
    public async Task<BackupSettings> ReadSettingsAsync(CancellationToken ct) =>
        await ReadOrDefaultAsync(SettingsPath, AppJsonContext.Default.BackupSettings, BackupSettings.Default, ct);

    public async Task WriteSettingsAsync(BackupSettings settings, CancellationToken ct) =>
        await WriteAsync(SettingsPath, JsonSerializer.SerializeToUtf8Bytes(settings, AppJsonContext.Default.BackupSettings), ct);

    /// <summary>The last run's outcome, or the never-run default.</summary>
    public async Task<BackupStatus> ReadStatusAsync(CancellationToken ct) =>
        await ReadOrDefaultAsync(StatusPath, AppJsonContext.Default.BackupStatus, BackupStatus.NeverRun, ct);

    public async Task WriteStatusAsync(BackupStatus status, CancellationToken ct) =>
        await WriteAsync(StatusPath, JsonSerializer.SerializeToUtf8Bytes(status, AppJsonContext.Default.BackupStatus), ct);

    private string KeyPath => Path.Combine(_dir, "key.sealed");

    private string ShownPath => Path.Combine(_dir, "key.shown");

    private string SettingsPath => Path.Combine(_dir, "settings.json");

    private string StatusPath => Path.Combine(_dir, "status.json");

    private async Task<MintOutcome> MintOverAsync(BackupKeyLookup was, CancellationToken ct)
    {
        var minted = BackupKey.Mint();
        // A key whose words nobody has seen is a key with nothing sealed to it — no run has been
        // allowed — so replacing it costs nothing. Only that state overwrites.
        var overwrite = was == BackupKeyLookup.AwaitingAcknowledgement;
        if (!await TryCreateKeyAsync(minted.Key, overwrite, ct))
        {
            return await AfterAFailedCreateAsync(ct);
        }
        log.LogInformation(
            "a backup key was minted. It is shown ONCE: what this server keeps is the derived key, and "
            + "the printable form cannot be produced again from it.");
        return MintOutcome.Minted(minted);
    }

    /// <summary>
    /// A create that did not happen is two events, and the disk says which.
    /// </summary>
    /// <remarks>
    /// A key that is there now belonged to the winner of a race; one that is still absent means the
    /// write failed — a full volume, a read-only mount — and answering "absent" would invite the caller
    /// to try minting for ever. The same reading <see cref="LoginKeyStore"/> makes.
    /// </remarks>
    private async Task<MintOutcome> AfterAFailedCreateAsync(CancellationToken ct)
    {
        var winner = await FindKeyAsync(ct);
        if (winner.Status != BackupKeyLookup.Absent)
        {
            return MintOutcome.AlreadyMinted;
        }
        log.LogError(
            "a backup key could not be written to {Dir}, so none was minted. This is a storage problem — "
            + "check the data directory's permissions and free space.",
            _dir);
        return MintOutcome.NotConfigured;
    }

    private async Task<bool> TryCreateKeyAsync(byte[] key, bool overwrite, CancellationToken ct)
    {
        try
        {
            Directory.CreateDirectory(_dir);
            var sealedKey = KekSeal.Seal(kek, key);
            await VaultStore.AtomicWriteAsync(
                KeyPath,
                JsonSerializer.SerializeToUtf8Bytes(
                    new SealedBackupKey(
                        SchemaVersion,
                        Convert.ToBase64String(sealedKey.Iv),
                        Convert.ToBase64String(sealedKey.Tag),
                        Convert.ToBase64String(sealedKey.Data),
                        DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()),
                    AppJsonContext.Default.SealedBackupKey),
                ct,
                overwrite);
            return true;
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            return false;
        }
    }

    private async Task<SealedBackupKey?> ReadSealedAsync(CancellationToken ct)
    {
        try
        {
            return JsonSerializer.Deserialize(
                await File.ReadAllBytesAsync(KeyPath, ct), AppJsonContext.Default.SealedBackupKey);
        }
        catch (Exception e) when (e is FileNotFoundException or DirectoryNotFoundException)
        {
            return null;
        }
        catch (Exception e) when (e is JsonException or IOException or UnauthorizedAccessException)
        {
            // A file that is THERE and cannot be read is never "absent": absence invites a second key.
            log.LogError(e, "the sealed backup key at {Path} cannot be read. NOTHING is minted in its place.", KeyPath);
            return new SealedBackupKey(SchemaVersion, string.Empty, string.Empty, string.Empty, 0);
        }
    }

    /// <summary>
    /// Open the sealed key, or say it cannot be opened — and never mint over one that exists.
    /// </summary>
    /// <remarks>
    /// A record whose <c>schemaVersion</c> is above this build's is unreadable BY VERSION, with a
    /// message that names the number: the same reading the members registry makes, and the difference
    /// between "fetch a newer build" and "your key is corrupt".
    /// </remarks>
    private BackupKeyState Open(SealedBackupKey sealedKey)
    {
        if (sealedKey.SchemaVersion > SchemaVersion)
        {
            return Unreadable(
                $"it is schema version {sealedKey.SchemaVersion} and this build writes {SchemaVersion}");
        }
        try
        {
            var key = KekSeal.Open(
                kek,
                new SealedBytes(
                    Convert.FromBase64String(sealedKey.Iv),
                    Convert.FromBase64String(sealedKey.Tag),
                    Convert.FromBase64String(sealedKey.Data)));
            return key.Length == Key32.Bytes
                ? Shown() ? BackupKeyState.Ready(key) : BackupKeyState.Awaiting(key)
                : Unreadable($"it holds {key.Length} bytes where a backup key is {Key32.Bytes}");
        }
        catch (Exception e) when (e is CryptographicException or FormatException or ArgumentException)
        {
            return Unreadable("it will not decrypt under this server's KEK");
        }
    }

    private bool Shown() => File.Exists(ShownPath);

    private BackupKeyState Unreadable(string why)
    {
        log.LogError(
            "the backup key exists and cannot be read: {Why}. NOTHING is minted in its place — a second "
            + "key would orphan every archive sealed to the first. Restore the file or the KEK.",
            why);
        return BackupKeyState.Unreadable;
    }

    private async Task<T> ReadOrDefaultAsync<T>(
        string path, System.Text.Json.Serialization.Metadata.JsonTypeInfo<T> shape, T fallback, CancellationToken ct)
    {
        try
        {
            return JsonSerializer.Deserialize(await File.ReadAllBytesAsync(path, ct), shape) ?? fallback;
        }
        catch (Exception e) when (e is IOException or JsonException or UnauthorizedAccessException)
        {
            // A missing file is the ordinary case and the defaults are the answer. An unreadable one
            // answers the same way on purpose: settings and status are conveniences, and failing a
            // whole backup deployment over a torn status file would be the wrong trade.
            return fallback;
        }
    }

    private async Task WriteAsync(string path, byte[] content, CancellationToken ct)
    {
        Directory.CreateDirectory(_dir);
        await VaultStore.AtomicWriteAsync(path, content, ct);
    }
}
