using System.Runtime.CompilerServices;
using System.Text.Json;

namespace CredVaultServer;

/// <summary>
/// Filesystem storage for the corporate-recovery setup ceremony: the invites carrying each
/// officer's sealed Shamir share, and the one published organisation public key.
///
/// <para>Same idioms as <see cref="VaultStore"/> deliberately — hashed per-officer directories,
/// atomic temp-then-move writes, streamed listings — because a second storage style in one
/// server is a second set of failure modes to learn.</para>
///
/// <para><b>Everything here is either public or opaque.</b> The invite payload is AES-GCM
/// ciphertext sealed on the initiator's machine under a one-time PIN told to the officers out of
/// band; the published key is the PUBLIC half of an X25519 pair whose private half is, by the
/// time it is published, destroyed and existing only as the shares this store relayed. There is
/// no method on this class that returns a secret, because there is no secret here to return.</para>
/// </summary>
public sealed class OrgRecoveryStore
{
    private readonly string _root;
    private readonly string _invitesDir;
    private readonly string _sessionsDir;
    private readonly string _ceremoniesDir;
    private readonly string _setupPath;
    private readonly string _auditPath;

    public OrgRecoveryStore(string dataDir)
    {
        _root = Path.Combine(dataDir, "org-recovery");
        _invitesDir = Path.Combine(_root, "invites");
        _sessionsDir = Path.Combine(_root, "sessions");
        _ceremoniesDir = Path.Combine(_root, "ceremonies");
        _setupPath = Path.Combine(_root, "setup.json");
        _auditPath = Path.Combine(_root, "audit.log");
        Directory.CreateDirectory(_invitesDir);
        Directory.CreateDirectory(_sessionsDir);
        Directory.CreateDirectory(_ceremoniesDir);
    }

    private string InboxFor(string officerEmail) =>
        Path.Combine(_invitesDir, VaultStore.KeyFor(officerEmail));

    // ---------- invites ----------

    public async Task AppendInviteAsync(EscrowInviteItem invite, CancellationToken ct)
    {
        var dir = InboxFor(invite.ToEmail);
        Directory.CreateDirectory(dir);
        await AtomicWriteAsync(
            Path.Combine(dir, invite.Id + ".json"),
            JsonSerializer.SerializeToUtf8Bytes(invite, AppJsonContext.Default.EscrowInviteItem),
            ct);
    }

    /// <summary>
    /// One officer's pending invites, streamed.
    ///
    /// <para>Streamed for the same reason the share inbox is: materialising first puts every
    /// payload live at once on a request anybody in the roster can make.</para>
    /// </summary>
    public async IAsyncEnumerable<EscrowInviteItem> ListInvitesAsync(
        string officerEmail,
        [EnumeratorCancellation] CancellationToken ct)
    {
        var dir = InboxFor(officerEmail);
        if (!Directory.Exists(dir))
        {
            yield break;
        }
        foreach (var path in Directory.EnumerateFiles(dir, "*.json"))
        {
            var invite = await ReadInviteAsync(path, ct);
            if (invite is not null)
            {
                yield return invite;
            }
        }
    }

    /// <summary>Acknowledge — the officer has sealed the share into their own vault, durably.</summary>
    public bool AcknowledgeInvite(string officerEmail, string inviteId)
    {
        var path = Path.Combine(InboxFor(officerEmail), inviteId + ".json");
        if (!File.Exists(path))
        {
            return false;
        }
        File.Delete(path);
        return true;
    }

    /// <summary>
    /// Who has not yet acknowledged, for the initiator's poll.
    ///
    /// <para>Reads every officer's inbox rather than tracking state separately: the absence of
    /// an invite file IS the acknowledgement, so there is nothing that can disagree with it.</para>
    /// </summary>
    public async Task<IReadOnlyList<string>> PendingOfficersAsync(
        string setupId,
        IReadOnlyList<string> officerEmails,
        CancellationToken ct)
    {
        var pending = new List<string>();
        foreach (var officer in officerEmails)
        {
            await foreach (var invite in ListInvitesAsync(officer, ct))
            {
                if (invite.SetupId == setupId)
                {
                    pending.Add(officer);
                    break;
                }
            }
        }
        return pending;
    }

    /// <summary>Drop every invite belonging to a ceremony — used when it is superseded or expires.</summary>
    public async Task<int> DropInvitesAsync(string setupId, CancellationToken ct)
    {
        var dropped = 0;
        foreach (var dir in SafeDirectories(_invitesDir))
        {
            foreach (var path in Directory.EnumerateFiles(dir, "*.json"))
            {
                var invite = await ReadInviteAsync(path, ct);
                if (invite?.SetupId == setupId)
                {
                    File.Delete(path);
                    dropped++;
                }
            }
        }
        return dropped;
    }

    /// <summary>Remove invites nobody acted on. An unfinished ceremony must not linger forever.</summary>
    public async Task<int> PruneInvitesOlderThanAsync(TimeSpan maxAge, CancellationToken ct)
    {
        var cutoff = DateTimeOffset.UtcNow - maxAge;
        var pruned = 0;
        foreach (var dir in SafeDirectories(_invitesDir))
        {
            foreach (var path in Directory.EnumerateFiles(dir, "*.json"))
            {
                var invite = await ReadInviteAsync(path, ct);
                if (invite is not null
                    && DateTimeOffset.FromUnixTimeMilliseconds(invite.CreatedAt) < cutoff)
                {
                    File.Delete(path);
                    pruned++;
                }
            }
        }
        return pruned;
    }

    // ---------- the published key ----------

    public async Task<OrgRecoverySetup?> ReadSetupAsync(CancellationToken ct)
    {
        if (!File.Exists(_setupPath))
        {
            return null;
        }
        try
        {
            await using var stream = File.OpenRead(_setupPath);
            return await JsonSerializer.DeserializeAsync(
                stream, AppJsonContext.Default.OrgRecoverySetup, ct);
        }
        catch (Exception e) when (e is JsonException or IOException)
        {
            // A half-written or hand-edited file must not take the server down; it reads as
            // "setup not complete", which refuses enrolment rather than enrolling wrongly.
            return null;
        }
    }

    public async Task WriteSetupAsync(OrgRecoverySetup setup, CancellationToken ct) =>
        await AtomicWriteAsync(
            _setupPath,
            JsonSerializer.SerializeToUtf8Bytes(setup, AppJsonContext.Default.OrgRecoverySetup),
            ct);

    // ---------- the ceremony record ----------

    private string CeremonyPath(string setupId) =>
        Path.Combine(_ceremoniesDir, setupId + ".json");

    /// <summary>Record this ceremony, or add an officer to the one already recorded.</summary>
    public async Task NoteInvitedAsync(
        string setupId,
        string initiatorEmail,
        string toEmail,
        CancellationToken ct)
    {
        var existing = await ReadCeremonyAsync(setupId, ct);
        var invited = existing?.Invited ?? [];
        if (!invited.Contains(toEmail))
        {
            invited.Add(toEmail);
        }
        await AtomicWriteAsync(
            CeremonyPath(setupId),
            JsonSerializer.SerializeToUtf8Bytes(
                new CeremonyRecord
                {
                    SetupId = setupId,
                    // The FIRST inviter owns the ceremony; a later officer posting into it
                    // cannot take it over and then publish their own key against its quorum.
                    InitiatorEmail = existing?.InitiatorEmail ?? initiatorEmail,
                    Invited = invited,
                    StartedAt = existing?.StartedAt ?? DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                },
                AppJsonContext.Default.CeremonyRecord),
            ct);
    }

    public async Task<CeremonyRecord?> ReadCeremonyAsync(string setupId, CancellationToken ct)
    {
        var path = CeremonyPath(setupId);
        if (!File.Exists(path))
        {
            return null;
        }
        try
        {
            await using var stream = File.OpenRead(path);
            return await JsonSerializer.DeserializeAsync(
                stream, AppJsonContext.Default.CeremonyRecord, ct);
        }
        catch (Exception e) when (e is JsonException or IOException)
        {
            // Unreadable reads as "no such ceremony", which REFUSES a publish rather than
            // allowing one — the safe direction for a guard.
            return null;
        }
    }

    // ---------- break-glass sessions ----------

    private string SessionPath(string sessionId) =>
        Path.Combine(_sessionsDir, sessionId + ".json");

    public async Task WriteSessionAsync(RecoverySession session, CancellationToken ct)
    {
        Directory.CreateDirectory(_sessionsDir);
        Directory.CreateDirectory(_ceremoniesDir);
        await AtomicWriteAsync(
            SessionPath(session.SessionId),
            JsonSerializer.SerializeToUtf8Bytes(session, AppJsonContext.Default.RecoverySession),
            ct);
    }

    public async Task<RecoverySession?> ReadSessionAsync(string sessionId, CancellationToken ct)
    {
        var path = SessionPath(sessionId);
        if (!File.Exists(path))
        {
            return null;
        }
        try
        {
            await using var stream = File.OpenRead(path);
            return await JsonSerializer.DeserializeAsync(
                stream, AppJsonContext.Default.RecoverySession, ct);
        }
        catch (Exception e) when (e is JsonException or IOException)
        {
            return null;
        }
    }

    public void DeleteSession(string sessionId)
    {
        var path = SessionPath(sessionId);
        if (File.Exists(path))
        {
            File.Delete(path);
        }
    }

    /// <summary>Expire sessions past their deadline, contributions and all.</summary>
    public async Task<int> PruneExpiredSessionsAsync(long nowMs, CancellationToken ct)
    {
        if (!Directory.Exists(_sessionsDir))
        {
            return 0;
        }
        var pruned = 0;
        foreach (var path in Directory.EnumerateFiles(_sessionsDir, "*.json"))
        {
            var session = await ReadSessionAsync(Path.GetFileNameWithoutExtension(path), ct);
            if (session is not null && session.ExpiresAt < nowMs)
            {
                File.Delete(path);
                pruned++;
            }
        }
        return pruned;
    }

    // ---------- the audit log ----------

    /// <summary>
    /// Append one line. NDJSON rather than a JSON array so a crash mid-write can cost at most
    /// the line being written, never the readability of every line before it.
    /// </summary>
    public async Task AppendAuditAsync(AuditEntryDto entry, CancellationToken ct)
    {
        Directory.CreateDirectory(_root);
        var line = JsonSerializer.Serialize(entry, AppJsonContext.Default.AuditEntryDto) + "\n";
        await File.AppendAllTextAsync(_auditPath, line, ct);
    }

    /// <summary>Every recorded recovery, newest last. Never pruned — see the maintenance note.</summary>
    public async IAsyncEnumerable<AuditEntryDto> ReadAuditAsync(
        [EnumeratorCancellation] CancellationToken ct)
    {
        if (!File.Exists(_auditPath))
        {
            yield break;
        }
        foreach (var line in await File.ReadAllLinesAsync(_auditPath, ct))
        {
            var entry = TryParseAudit(line);
            if (entry is not null)
            {
                yield return entry;
            }
        }
    }

    private static AuditEntryDto? TryParseAudit(string line)
    {
        if (line.Trim().Length == 0)
        {
            return null;
        }
        try
        {
            return JsonSerializer.Deserialize(line, AppJsonContext.Default.AuditEntryDto);
        }
        catch (JsonException)
        {
            // A torn last line from a crash mid-append. Skipping it must not hide the rest.
            return null;
        }
    }

    // ---------- helpers ----------

    private static IEnumerable<string> SafeDirectories(string root) =>
        Directory.Exists(root) ? Directory.EnumerateDirectories(root) : [];

    private static async Task<EscrowInviteItem?> ReadInviteAsync(string path, CancellationToken ct)
    {
        try
        {
            await using var stream = File.OpenRead(path);
            return await JsonSerializer.DeserializeAsync(
                stream, AppJsonContext.Default.EscrowInviteItem, ct);
        }
        catch (Exception e) when (e is JsonException or IOException)
        {
            // One unreadable invite must not hide the rest of an officer's inbox.
            return null;
        }
    }

    private static async Task AtomicWriteAsync(string path, byte[] content, CancellationToken ct)
    {
        var temp = path + "." + Guid.NewGuid().ToString("N")[..8] + ".tmp";
        await File.WriteAllBytesAsync(temp, content, ct);
        File.Move(temp, path, overwrite: true);
    }
}
