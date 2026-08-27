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
    private readonly string _setupPath;

    public OrgRecoveryStore(string dataDir)
    {
        _root = Path.Combine(dataDir, "org-recovery");
        _invitesDir = Path.Combine(_root, "invites");
        _setupPath = Path.Combine(_root, "setup.json");
        Directory.CreateDirectory(_invitesDir);
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
