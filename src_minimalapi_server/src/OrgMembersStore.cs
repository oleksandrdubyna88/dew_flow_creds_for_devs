using System.Collections.Concurrent;
using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace CredVaultServer;

/// <summary>
/// The members registry on disk: one small JSON record per person at
/// <c>${DataDir}/org/members/&lt;key&gt;.json</c>, keyed exactly as vaults are
/// (<see cref="VaultStore.KeyFor"/>) so one identity space has one hashing scheme.
///
/// <para>Same idioms as <see cref="OrgRecoveryStore"/> — atomic temp-then-move writes, defensive
/// reads — with two deliberate departures from that template, both stated here so nobody later reads
/// them as oversights:</para>
///
/// <para><b>Directories are created on the first write, never in the constructor.</b> The recovery
/// store creates its tree eagerly and can afford to. This store is constructed on every deployment,
/// personal ones included, and on a personal deployment no <c>org/</c> directory may appear at all:
/// its presence is what tells an operator looking at the disk that this server has a roster.</para>
///
/// <para><b>A record this build cannot read is <see cref="MemberLookup.Unavailable"/>, never "not
/// registered".</b> The recovery store maps an unreadable file to "not there" because for a setup or a
/// session that is the refusing direction. For a person it is the opposite: not registered means the
/// default, the default is <c>member</c>, and a member may export — so a half-written file would have
/// promoted a developer. The three-state result exists so that no caller can collapse it back to two.</para>
///
/// <para><b>Reads are synchronous and served from memory.</b> Epic 2 puts a lookup inside the caller
/// gate, which runs on every request and is synchronous. A cache entry carries the file's last-write
/// time and length, and every <see cref="Find"/> re-stats before answering: a restore, an operator's
/// editor or a second instance during a rolling restart changes the file underneath this process, and
/// a block that a stale cache kept ignoring is the failure the whole registry is scaffolding for. A
/// stat is microseconds. What it cannot see — a same-length rewrite inside one clock tick — no real
/// writer produces.</para>
/// </summary>
public sealed class OrgMembersStore(string dataDir, ILogger<OrgMembersStore> log)
{
    private readonly string _membersDir = Path.Combine(dataDir, "org", "members");

    // Keyed by the file key rather than the email, so a listing — which has only file names — shares
    // the cache with the lookups.
    private readonly ConcurrentDictionary<string, CacheEntry> _cache = new();

    // Files whose I/O failure has already been logged. The gate reads on every request, so an
    // unreadable record would otherwise log once per request. Cleared by the next successful read;
    // bounded by the number of member files, and shrinks as they recover.
    private readonly ConcurrentDictionary<string, byte> _ioFailureLogged = new();

    private sealed record FileStat(DateTime LastWriteUtc, long Length);

    private sealed record CacheEntry(MemberLookupResult Result, FileStat Stat);

    private string PathFor(string key) => Path.Combine(_membersDir, key + ".json");

    /// <summary>
    /// Three answers, never two, and never an exception — see <see cref="MemberLookup"/>.
    ///
    /// <para>The existence check is the read itself, not <see cref="FileInfo.Exists"/>: that property
    /// answers <c>false</c> for a directory this process may not list, and "may not read" has to come
    /// back as <see cref="MemberLookup.Unavailable"/>, not as a person with no record. The price is one
    /// caught <see cref="FileNotFoundException"/> per lookup of somebody who has no record — rare in corp
    /// mode, where everyone who syncs has one — and nothing for everybody else, who is answered from the
    /// cache after one stat.</para>
    /// </summary>
    public MemberLookupResult Find(string email) => FindByKey(VaultStore.KeyFor(email));

    private MemberLookupResult FindByKey(string key)
    {
        var path = PathFor(key);
        return _cache.TryGetValue(key, out var cached) && Stat(path) == cached.Stat
            ? cached.Result
            : ReadFromDisk(key, path);
    }

    private static FileStat? Stat(string path)
    {
        var info = new FileInfo(path);
        return info.Exists ? new FileStat(info.LastWriteTimeUtc, info.Length) : null;
    }

    /// <summary>
    /// Stat first, then read. A write landing between the two changes the stat, so the next
    /// <see cref="Find"/> re-reads; taken the other way round, a write between read and stat would be
    /// cached under the NEW stat and never seen.
    /// </summary>
    private MemberLookupResult ReadFromDisk(string key, string path)
    {
        try
        {
            var stat = Stat(path);
            var result = Classify(File.ReadAllBytes(path), path);
            _ioFailureLogged.TryRemove(key, out _);
            Remember(key, stat, result);
            return result;
        }
        catch (Exception e) when (e is FileNotFoundException or DirectoryNotFoundException)
        {
            _cache.TryRemove(key, out _);
            return MemberLookupResult.NotRegistered;
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            // Not cached: a lock or a permission flip may be transient, and the next read is the retry.
            LogIoFailureOnce(key, path, e);
            return MemberLookupResult.Unavailable;
        }
    }

    /// <summary>
    /// A content verdict is cached under the stat that produced it: the same bytes give the same answer,
    /// and a malformed record on the request path must be logged once, not once per request.
    /// </summary>
    private void Remember(string key, FileStat? stat, MemberLookupResult result)
    {
        if (stat is not null)
        {
            _cache[key] = new CacheEntry(result, stat);
        }
    }

    private void LogIoFailureOnce(string key, string path, Exception e)
    {
        if (_ioFailureLogged.TryAdd(key, 0))
        {
            log.LogError(
                e,
                "member record {Path} cannot be opened; the person it belongs to is refused until it can be",
                path);
        }
    }

    private MemberLookupResult Classify(byte[] bytes, string path)
    {
        try
        {
            return Validate(JsonSerializer.Deserialize(bytes, AppJsonContext.Default.MemberRecord), path);
        }
        catch (JsonException e)
        {
            log.LogError(
                e,
                "member record {Path} is not valid JSON; the person it belongs to is refused until it is fixed",
                path);
            return MemberLookupResult.Unavailable;
        }
    }

    private MemberLookupResult Validate(MemberRecord? record, string path)
    {
        if (record is null)
        {
            return Refuse(path, "is empty");
        }
        if (record.SchemaVersion > MemberRecord.CurrentSchemaVersion)
        {
            // "Unknown fields I will ignore" is a promotion waiting for the field that carries a
            // permission. A build that cannot promise it understands a record must not act on it.
            return Refuse(
                path,
                $"has schema version {record.SchemaVersion}; this build reads up to {MemberRecord.CurrentSchemaVersion}");
        }
        return record.IsWellFormed()
            ? MemberLookupResult.Found(record)
            : Refuse(path, "is missing a field or names a role or share default this build does not know");
    }

    private MemberLookupResult Refuse(string path, string reason)
    {
        log.LogError(
            "member record {Path} {Reason}; the person it belongs to is refused until it is fixed",
            path,
            reason);
        return MemberLookupResult.Unavailable;
    }

    /// <summary>
    /// Read-modify-write under the per-member lock, and it says whether it CREATED the record.
    ///
    /// <para>Atomic replacement stops a torn file, not a lost update: two admins editing one person
    /// would both read the same record, each apply their own change, and the second write would win
    /// whole. So the read, the edit and the write happen inside the lock — <see cref="VaultStore.GateFor"/>'s
    /// stripe, shared with vault writes for the same email, which is harmless and cheaper than a second
    /// stripe with the same "everything that grows has an owner" question to answer.</para>
    ///
    /// <para><see cref="UpsertResult.Created"/> is reported because two callers emit
    /// <c>member.registered</c> only on a create: the sync hook, and an admin who sets a role before the
    /// person's first sync.</para>
    ///
    /// <para>A record that reads as <see cref="MemberLookup.Unavailable"/> is never overwritten. The edit
    /// would have to start from the default, and a default written over a blocked developer's unreadable
    /// record is an unblock nobody ordered; <see cref="MemberRecordUnavailableException"/> names the file
    /// instead, and the operator fixes the file.</para>
    /// </summary>
    public async Task<UpsertResult> UpsertAsync(
        string email,
        Func<MemberRecord, MemberRecord> edit,
        string byAdmin,
        CancellationToken ct)
    {
        var normalized = MemberRecord.Normalize(email);
        var key = VaultStore.KeyFor(normalized);
        var gate = VaultStore.GateFor(key);
        await gate.WaitAsync(ct);
        try
        {
            var path = PathFor(key);
            var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            var (baseline, created) = Baseline(ReadFromDisk(key, path), normalized, now, path);
            var edited = Stamp(edit(baseline), normalized, byAdmin, now);
            Directory.CreateDirectory(_membersDir);
            await VaultStore.AtomicWriteAsync(
                path,
                JsonSerializer.SerializeToUtf8Bytes(edited, AppJsonContext.Default.MemberRecord),
                ct);
            _cache.TryRemove(key, out _);
            return new UpsertResult(edited, created);
        }
        finally
        {
            gate.Release();
        }
    }

    private static (MemberRecord Record, bool Created) Baseline(
        MemberLookupResult current,
        string email,
        long now,
        string path) =>
        current switch
        {
            { Status: MemberLookup.Found, Record: { } record } => (record, false),
            { Status: MemberLookup.NotRegistered } => (MemberRecord.DefaultFor(email, now), true),
            _ => throw new MemberRecordUnavailableException(path),
        };

    /// <summary>
    /// The key is cut from the email, so the record may not disagree with it; the stamp is the store's,
    /// so an edit cannot forge who changed what, or when. An edit that produces a record this build
    /// would refuse to read is a programming error and is refused before anything is written — the
    /// alternative is a person locked out by the very call that meant to change their role.
    /// </summary>
    private static MemberRecord Stamp(MemberRecord edited, string email, string byAdmin, long now)
    {
        var stamped = edited with
        {
            SchemaVersion = MemberRecord.CurrentSchemaVersion,
            Email = email,
            UpdatedAt = now,
            UpdatedBy = MemberRecord.Normalize(byAdmin),
        };
        return stamped.IsWellFormed()
            ? stamped
            : throw new ArgumentException(
                "The edit produced a record this build would refuse to read; nothing was written.",
                nameof(edited));
    }

    /// <summary>
    /// Everyone in one domain, for the admin's list.
    ///
    /// <para>Scoped here rather than in the endpoint so that on a server whose
    /// <c>Vault:AllowedDomains</c> names two companies, the store never hands one company's roster to
    /// the other's admin. An unreadable record is absent from the list and present in the log at Error,
    /// naming the file — and its owner meets the refusal, which is the louder of the two signals.</para>
    /// </summary>
    public IReadOnlyList<MemberRecord> ListForDomain(string domain)
    {
        if (!Directory.Exists(_membersDir))
        {
            return [];
        }
        var suffix = "@" + domain.Trim().ToLowerInvariant();
        return
        [
            .. Directory.EnumerateFiles(_membersDir, "*.json")
                .Select(path => FindByKey(Path.GetFileNameWithoutExtension(path)))
                .SelectMany(FoundRecord)
                .Where(record => record.Email.EndsWith(suffix, StringComparison.Ordinal)),
        ];
    }

    private static IEnumerable<MemberRecord> FoundRecord(MemberLookupResult result) =>
        result is { Status: MemberLookup.Found, Record: { } record } ? [record] : [];

    /// <summary>
    /// Delete the record — <c>DELETE /api/vault</c> takes it with the vault, so the registry cannot
    /// outgrow the people it describes. Under the same gate as the writes: a delete landing between an
    /// upsert's read and its move would be undone by the move.
    ///
    /// <para>Best-effort like <see cref="VaultStore.DeleteEverythingFor"/>, and unlike it, it says so: a
    /// file that could not be deleted is logged rather than silently left to be listed.</para>
    /// </summary>
    public void Remove(string email)
    {
        var key = VaultStore.KeyFor(MemberRecord.Normalize(email));
        var gate = VaultStore.GateFor(key);
        gate.Wait();
        try
        {
            var path = PathFor(key);
            if (File.Exists(path))
            {
                File.Delete(path);
            }
            _cache.TryRemove(key, out _);
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            log.LogWarning(e, "member record for a deleted vault could not be removed; it stays listed until it is");
        }
        finally
        {
            gate.Release();
        }
    }
}

/// <summary>
/// Thrown by <see cref="OrgMembersStore.UpsertAsync"/> when the record it would edit cannot be read.
///
/// <para>An exception rather than a fourth lookup state because it is an infrastructure failure on a
/// write path, not an expected answer: the endpoint maps it to <c>503</c> with <c>Retry-After</c>,
/// exactly as <c>GET /api/org/me</c> answers the same file. It is an <see cref="IOException"/> so the
/// "catch I/O, log, try again later" idiom the maintenance passes use keeps applying to it.</para>
/// </summary>
public sealed class MemberRecordUnavailableException(string filePath)
    : IOException($"The member record at '{filePath}' cannot be read by this build, so it was not overwritten.")
{
    public string FilePath { get; } = filePath;
}
