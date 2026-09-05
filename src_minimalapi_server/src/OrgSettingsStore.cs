using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace CredVaultServer;

/// <summary>
/// The runtime settings an admin may change without a restart — one record, and the reason it is
/// runtime: nothing in it has a cryptographic consequence. The officer roster changes what a key is
/// sealed to, so it is configuration plus a ceremony; the offline lease changes how long an honest
/// client stays open, so it is one PUT away.
/// </summary>
public sealed record OrgSettingsDto(int OfflineLeaseHours, long UpdatedAt, string UpdatedBy)
{
    /// <summary>Twenty-four hours, owner decision 7. <c>0</c> is the legal "strictly online", not an error.</summary>
    public const int DefaultOfflineLeaseHours = 24;

    /// <summary>What a server with no settings file answers — computed, never written.</summary>
    public static OrgSettingsDto Default => new(DefaultOfflineLeaseHours, 0, string.Empty);

    public bool IsWellFormed() => OfflineLeaseHours >= 0;
}

/// <summary>
/// <c>${DataDir}/org/settings.json</c>. Absent answers <see cref="OrgSettingsDto.Default"/> and writes
/// nothing — "off is the shape, not a flag": the answer is correct before the disk agrees, and a personal
/// deployment never grows an <c>org/</c> directory because somebody read a setting.
///
/// <para>Reads never throw and are served from memory under the same stat check as the members
/// registry. A file this build cannot read answers the DEFAULT, logged once at Error naming the file —
/// the opposite direction from a member record, and deliberately so: nothing in this file grants a
/// permission, so the worst a bad file can do is a lease of 24 hours where an admin wanted less, and
/// the log says exactly that. Refusing every <c>GET /api/org/me</c> over a settings file would turn one
/// bad file into an outage for everybody. Here <see cref="FileInfo.Exists"/> IS the existence check:
/// the members store pays for a stricter one because "absent" there means a permission.</para>
/// </summary>
public sealed class OrgSettingsStore(string dataDir, ILogger<OrgSettingsStore> log)
{
    private readonly string _orgDir = Path.Combine(dataDir, "org");
    private readonly string _path = Path.Combine(dataDir, "org", "settings.json");

    // One file, so one lock, not a stripe.
    private readonly SemaphoreSlim _gate = new(1, 1);

    private volatile CacheEntry? _cached;
    private int _ioFailureLogged;

    private sealed record CacheEntry(OrgSettingsDto Settings, DateTime LastWriteUtc, long Length);

    /// <summary>The current settings; never throws.</summary>
    public OrgSettingsDto Read()
    {
        var info = new FileInfo(_path);
        if (!info.Exists)
        {
            return OrgSettingsDto.Default;
        }
        var cached = _cached;
        return cached is not null && cached.LastWriteUtc == info.LastWriteTimeUtc && cached.Length == info.Length
            ? cached.Settings
            : ReadFromDisk(info);
    }

    private OrgSettingsDto ReadFromDisk(FileInfo info)
    {
        try
        {
            var settings = Parse(File.ReadAllBytes(_path));
            Interlocked.Exchange(ref _ioFailureLogged, 0);
            // The malformed verdict is cached with the stat too: the same bytes give the same answer,
            // and an unreadable file must be logged once, not on every request.
            _cached = new CacheEntry(settings, info.LastWriteTimeUtc, info.Length);
            return settings;
        }
        catch (FileNotFoundException)
        {
            // Deleted between the stat and the read. Absent is the default, not a failure.
            return OrgSettingsDto.Default;
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            LogIoFailureOnce(e);
            return OrgSettingsDto.Default;
        }
    }

    private OrgSettingsDto Parse(byte[] bytes)
    {
        try
        {
            var settings = JsonSerializer.Deserialize(bytes, AppJsonContext.Default.OrgSettingsDto);
            if (settings is { } read && read.IsWellFormed())
            {
                // A hand-edited file may omit the field; the deserializer does not run the default.
                return read with { UpdatedBy = read.UpdatedBy ?? string.Empty };
            }
            return AnswerDefault(null, "is empty or names a negative lease");
        }
        catch (JsonException e)
        {
            return AnswerDefault(e, "is not valid JSON");
        }
    }

    private OrgSettingsDto AnswerDefault(Exception? e, string reason)
    {
        log.LogError(
            e,
            "org settings {Path} {Reason}; answering the default lease of {Hours} h until it is fixed",
            _path,
            reason,
            OrgSettingsDto.DefaultOfflineLeaseHours);
        return OrgSettingsDto.Default;
    }

    private void LogIoFailureOnce(Exception e)
    {
        if (Interlocked.Exchange(ref _ioFailureLogged, 1) == 0)
        {
            log.LogError(
                e,
                "org settings {Path} cannot be opened; answering the default lease of {Hours} h until it can be",
                _path,
                OrgSettingsDto.DefaultOfflineLeaseHours);
        }
    }

    /// <summary>
    /// Read-modify-write under the one lock. Stamps who and when from the verified caller, never from
    /// the edit. A file this build cannot read is replaced by the admin's write: unlike a member record
    /// it carries nothing this build must not lose — which stops being true the day another build adds
    /// a block to it, and the members store is the shape that carries unknowns when it does.
    /// </summary>
    public async Task<OrgSettingsDto> UpdateAsync(
        Func<OrgSettingsDto, OrgSettingsDto> edit,
        string byAdmin,
        CancellationToken ct)
    {
        await _gate.WaitAsync(ct);
        try
        {
            var edited = Stamp(edit(Read()), byAdmin);
            Directory.CreateDirectory(_orgDir);
            await VaultStore.AtomicWriteAsync(
                _path,
                JsonSerializer.SerializeToUtf8Bytes(edited, AppJsonContext.Default.OrgSettingsDto),
                ct);
            _cached = null;
            return edited;
        }
        finally
        {
            _gate.Release();
        }
    }

    private static OrgSettingsDto Stamp(OrgSettingsDto edited, string byAdmin)
    {
        var stamped = edited with
        {
            UpdatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            UpdatedBy = MemberRecord.Normalize(byAdmin),
        };
        return stamped.IsWellFormed()
            ? stamped
            : throw new ArgumentException(
                "The edit produced a negative offline lease; nothing was written.",
                nameof(edited));
    }
}
