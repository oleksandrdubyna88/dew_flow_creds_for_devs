namespace CredVaultServer;

/// <summary>
/// Corporate break-glass recovery, server side — the operator's configuration and the one
/// thing clients read from it. See <c>todo/PLAN_org_recovery.md</c> for the whole design.
///
/// <para><b>The server never holds a share it can open.</b> That is rule 1 of this repository
/// and this feature is the one most likely to be asked to break it. What lives here is an
/// operator-written roster of officer emails and a threshold — public facts, the same category
/// as <c>Vault:AllowedDomains</c> — plus, later, opaque blobs it relays. The organisation's
/// recovery private key exists only as Shamir shares sealed inside the officers' own vaults,
/// and no code path here can assemble one.</para>
/// </summary>
public sealed record OrgRecoveryConfig
{
    /// <summary>Officer emails, lowercased. Empty means the feature is off.</summary>
    public required IReadOnlyList<string> OfficerEmails { get; init; }

    /// <summary>How many officers must contribute to reconstruct the key.</summary>
    public required int Threshold { get; init; }

    public bool Enabled => OfficerEmails.Count > 0;

    public bool IsOfficer(string email) =>
        OfficerEmails.Contains(email.Trim().ToLowerInvariant());

    /// <summary>
    /// A hash of WHO may recover and HOW MANY of them it takes.
    ///
    /// <para>Clients pin this the way they pin a share sender's key: the server is trusted to
    /// relay, never to decide, so an operator quietly adding themselves to the roster is the
    /// attack this makes visible. Sorted before hashing, because the order two operators write
    /// the same four addresses in is not a change and must not read as one.</para>
    /// </summary>
    public string RosterFingerprint()
    {
        var canonical = string.Join('\n', [..OfficerEmails.Order(StringComparer.Ordinal), $"threshold={Threshold}"]);
        return Convert.ToHexStringLower(
            System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(canonical)));
    }

    /// <summary>
    /// Why the minimum is three and not two.
    ///
    /// <para>A 2-of-2 roster has no margin at all: one officer leaving, or losing the YubiKey
    /// their share is sealed under, takes corporate recovery down with them — and it is the
    /// mechanism that exists precisely for the day somebody leaves. Three with a threshold of
    /// two survives exactly one such loss, which is the smallest roster that is not a single
    /// point of failure wearing a quorum's clothes.</para>
    /// </summary>
    public const int MinimumOfficers = 3;

    /// <summary>
    /// Read the roster, refusing a shape that can never reach quorum.
    ///
    /// <para>A misconfigured roster is exactly the failure that must not wait until somebody
    /// needs it: an unreachable threshold looks like a working feature for months and fails on
    /// the one day it is used. Same reasoning as the auth and domain guards beside it.</para>
    /// </summary>
    public static OrgRecoveryConfig Read(IReadOnlyList<string> officerEmails, int threshold)
    {
        var officers = officerEmails
            .Select(e => e.Trim().ToLowerInvariant())
            .Where(e => e.Length > 0)
            .Distinct()
            .ToList();
        if (officers.Count == 0)
        {
            return new OrgRecoveryConfig { OfficerEmails = [], Threshold = threshold };
        }
        if (officers.Count < MinimumOfficers)
        {
            throw new InvalidOperationException(
                $"Vault:CorpRecovery:OfficerEmails names {officers.Count} officer(s); at least "
                + $"{MinimumOfficers} are required. A smaller roster cannot survive one of them "
                + "leaving — which is the event this feature exists for. Leave it empty to run "
                + "without corporate recovery.");
        }
        if (threshold < 2 || threshold > officers.Count)
        {
            throw new InvalidOperationException(
                $"Vault:CorpRecovery:Threshold is {threshold}, which is outside 2..{officers.Count}. "
                + "A threshold of 1 would let any single officer open every vault on this server; "
                + "one above the roster size can never be reached.");
        }
        return new OrgRecoveryConfig { OfficerEmails = officers, Threshold = threshold };
    }
}

/// <summary>
/// One officer's Shamir share, sealed by the initiator and relayed by this server.
///
/// <para><c>FromEmail</c> is stamped from the verified token and never accepted from the body —
/// the same rule as <see cref="ShareItem"/>, and for a stronger reason: an invite a stranger
/// could attribute to the CTO is one an officer might accept into their vault, which would seat
/// an attacker's share where a real one belongs.</para>
///
/// <para>The four crypto fields are opaque. The share inside is sealed under
/// <c>scrypt(recipientEmail + one-time PIN)</c>, and the PIN travels out of band.</para>
/// </summary>
public sealed record EscrowInviteItem
{
    public string Id { get; init; } = Guid.NewGuid().ToString();
    /// <summary>Which ceremony this belongs to — one per generation of the org key.</summary>
    public string SetupId { get; init; } = "";
    public string FromEmail { get; init; } = "";
    public string ToEmail { get; init; } = "";
    /// <summary>The share's x coordinate, 1..255. Meaningless to the server; the client needs it.</summary>
    public int ShareIndex { get; init; }
    public int Threshold { get; init; }
    public int TotalShares { get; init; }
    public long CreatedAt { get; init; }
    public string Salt { get; init; } = "";
    public string Iv { get; init; } = "";
    public string Tag { get; init; } = "";
    public string Data { get; init; } = "";
    public int? KdfN { get; init; }
    public int? KdfR { get; init; }
    public int? KdfP { get; init; }
}

/// <summary>What an initiating officer POSTs, once per fellow officer.</summary>
public sealed record EscrowInviteRequest
{
    public string SetupId { get; init; } = "";
    public string ToEmail { get; init; } = "";
    public int ShareIndex { get; init; }
    public int Threshold { get; init; }
    public int TotalShares { get; init; }
    public string Salt { get; init; } = "";
    public string Iv { get; init; } = "";
    public string Tag { get; init; } = "";
    public string Data { get; init; } = "";
    public int? KdfN { get; init; }
    public int? KdfR { get; init; }
    public int? KdfP { get; init; }

    public bool IsValid() =>
        Guid.TryParse(SetupId, out _)
        && !string.IsNullOrWhiteSpace(ToEmail)
        && ToEmail.Contains('@')
        && ShareIndex is >= 1 and <= 255
        && Threshold >= 2
        && TotalShares >= OrgRecoveryConfig.MinimumOfficers
        && Threshold <= TotalShares
        && IsBase64(Salt)
        && IsBase64(Iv)
        && IsBase64(Tag)
        && IsBase64(Data);

    private static bool IsBase64(string value) =>
        !string.IsNullOrWhiteSpace(value)
        && Convert.TryFromBase64String(value, new byte[value.Length], out _);

    public int PayloadBytes() => Salt.Length + Iv.Length + Tag.Length + Data.Length;
}

/// <summary>Where an initiator's ceremony has got to. Emails only — no ciphertext.</summary>
public sealed record SetupStatusDto(
    string SetupId,
    int Total,
    IReadOnlyList<string> Pending);

/// <summary>What the initiator publishes once every officer has acknowledged.</summary>
public sealed record PublishSetupRequest
{
    public string SetupId { get; init; } = "";
    /// <summary>Raw X25519 public key, base64 — 32 bytes.</summary>
    public string OrgPublicKey { get; init; } = "";
    public string RosterFingerprint { get; init; } = "";

    public bool IsValid() =>
        Guid.TryParse(SetupId, out _)
        && Convert.TryFromBase64String(OrgPublicKey, new byte[64], out var written)
        && written == 32;
}

/// <summary>The published key, as it sits on disk.</summary>
public sealed record OrgRecoverySetup
{
    public string SetupId { get; init; } = "";
    public string OrgPublicKey { get; init; } = "";
    public string OrgPublicKeyFingerprint { get; init; } = "";
    /// <summary>The roster this ceremony was run against — a later change is then detectable.</summary>
    public string RosterFingerprint { get; init; } = "";
    public string PublishedBy { get; init; } = "";
    public long PublishedAt { get; init; }
}

/// <summary>
/// A break-glass session: one officer asking the others to help open one vault.
///
/// <para><c>SessionPublicKey</c> is an ephemeral X25519 public key the initiator minted for
/// this session alone. Contributing officers reseal their shares to it, so a share crosses
/// this server encrypted to a key whose private half exists only in the initiator's memory —
/// the server relays partial shares it could not use even if it kept them.</para>
///
/// <para><b>The threshold gate here is a courtesy, not a security boundary.</b> This server
/// counts contributions and only serves the target's ciphertext once the count is reached, but
/// it cannot verify that a single contribution is genuine — they are opaque. The real gate is
/// on the initiator's machine: Shamir interpolation only reconstructs the true key from a
/// genuinely correct subset, and the integrity tag is what proves it. A maintainer who assumes
/// this server enforces the quorum will be assuming something it structurally cannot.</para>
/// </summary>
public sealed record RecoverySession
{
    public string SessionId { get; init; } = Guid.NewGuid().ToString();
    public string InitiatorEmail { get; init; } = "";
    public string TargetEmail { get; init; } = "";
    public string SessionPublicKey { get; init; } = "";
    public long StartedAt { get; init; }
    public long ExpiresAt { get; init; }
    /// <summary>`open` while collecting, `completed` once the target vault was written back.</summary>
    public string Status { get; init; } = "open";
    public List<SessionContribution> Contributions { get; init; } = [];
}

/// <summary>One officer's share, resealed to the session key. Opaque to this server.</summary>
public sealed record SessionContribution
{
    public string OfficerEmail { get; init; } = "";
    /// <summary>
    /// The share's x coordinate. Not secret — it is a coordinate, not a value — and without it
    /// the initiator cannot interpolate at all: the shares are points on a curve, and a point
    /// with no x is not a point.
    /// </summary>
    public int ShareIndex { get; init; }
    public long ContributedAt { get; init; }
    public string EphemeralPublicKey { get; init; } = "";
    public string Salt { get; init; } = "";
    public string Iv { get; init; } = "";
    public string Tag { get; init; } = "";
    public string Data { get; init; } = "";
}

public sealed record StartSessionRequest
{
    public string TargetEmail { get; init; } = "";
    public string SessionPublicKey { get; init; } = "";

    public bool IsValid() =>
        !string.IsNullOrWhiteSpace(TargetEmail)
        && TargetEmail.Contains('@')
        && Convert.TryFromBase64String(SessionPublicKey, new byte[64], out var written)
        && written == 32;
}

public sealed record ContributeRequest
{
    public int ShareIndex { get; init; }
    public string EphemeralPublicKey { get; init; } = "";
    public string Salt { get; init; } = "";
    public string Iv { get; init; } = "";
    public string Tag { get; init; } = "";
    public string Data { get; init; } = "";

    public bool IsValid() =>
        ShareIndex is >= 1 and <= 255
        && IsBase64(EphemeralPublicKey) && IsBase64(Salt) && IsBase64(Iv) && IsBase64(Tag) && IsBase64(Data);

    private static bool IsBase64(string value) =>
        !string.IsNullOrWhiteSpace(value)
        && Convert.TryFromBase64String(value, new byte[value.Length], out _);

    public int PayloadBytes() =>
        EphemeralPublicKey.Length + Salt.Length + Iv.Length + Tag.Length + Data.Length;
}

/// <summary>What an officer sees of a session. Never the target's ciphertext.</summary>
public sealed record RecoverySessionDto(
    string SessionId,
    string InitiatorEmail,
    string TargetEmail,
    string SessionPublicKey,
    string Status,
    int Threshold,
    int Collected,
    IReadOnlyList<string> ContributingOfficers,
    long StartedAt,
    long ExpiresAt,
    IReadOnlyList<SessionContribution> Contributions);

/// <summary>
/// One line of the append-only record of who opened whose vault.
///
/// <para>Plaintext metadata only — emails, times, a session id. It is readable by every
/// officer, not only the initiator, because a recovery nobody else can see is a recovery
/// nobody else can question, and the whole point of a quorum is that it is witnessed.</para>
/// </summary>
public sealed record AuditEntryDto(
    string SessionId,
    string Kind,
    string InitiatorEmail,
    string TargetEmail,
    IReadOnlyList<string> ContributingOfficers,
    long StartedAt,
    long CompletedAt);

/// <summary>
/// What a client reads to learn whether corporate recovery is on, and whose it is.
///
/// <para>Readable by any allowed caller, not only officers, and that is the transparency
/// requirement rather than an oversight: every account on a server with this configured is
/// automatically enrolled — its vault gains an escrow wrap on the next write — and a person
/// whose secrets can be recovered by a quorum of named colleagues is entitled to know it, and
/// to know which colleagues. A silent escrow is a backdoor by shape even when it is legitimate
/// by intent.</para>
///
/// <para><c>OrgPublicKey</c> is a PUBLIC key and safe to serve: the security of the scheme is
/// entirely in the private half, which this server never sees in any form.
/// <c>SetupComplete</c> is false between "the operator listed officers" and "the officers
/// finished the ceremony" — a window in which clients must not try to enrol.</para>
/// </summary>
public sealed record OrgRecoveryConfigDto(
    bool Enabled,
    IReadOnlyList<string> OfficerEmails,
    int Threshold,
    bool SetupComplete,
    string OrgPublicKey,
    string OrgPublicKeyFingerprint,
    string RosterFingerprint,
    long PublishedAt);
