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
