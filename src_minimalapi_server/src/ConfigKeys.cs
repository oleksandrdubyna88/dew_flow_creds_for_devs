namespace CredVaultServer;

/// <summary>
/// Every configuration key this server reads, named once.
/// </summary>
/// <remarks>
/// <para><b>Why a list exists at all.</b> A restore onto a fresh host has the archive and nothing
/// else: the container never sees <c>.env</c>, so unless the configuration travels WITH the data,
/// recovering the data does not recover the deployment — the KEK is gone, the local signing key is
/// gone, and the vaults are intact and unopenable. So an archive carries a snapshot of the
/// configuration, and a snapshot needs a list of what to snapshot.</para>
///
/// <para><b>Which makes the list a mirror, and a mirror is a thing that drifts.</b> A key added to
/// <c>Program.cs</c> and not here is a value that quietly stops travelling, and the day anyone finds
/// out is the day they are restoring. <c>ConfigKeysTests</c> therefore reads the source and fails on a
/// config-key-shaped literal this list does not name — the list is checked against the code rather
/// than trusted.</para>
///
/// <para><b>Secret keys are in the list on purpose.</b> The snapshot holds resolved values, secrets
/// included, because that is the only thing that makes a restore onto a new host possible. It is also
/// what makes the BACKUP KEY the highest-value secret in the system — higher than the KEK, which is
/// inside the archive while the backup key is not. That is stated here, in
/// <c>research/module_server.md</c>, and in the admin's own screen at the moment the key is shown.</para>
/// </remarks>
public static class ConfigKeys
{
    /// <summary>Where the data lives, and who may use it.</summary>
    public static readonly string[] Vault =
    [
        "Vault:DataDir",
        "Vault:AllowedDomains",
        "Vault:AllowAnyDomain",
        "Vault:MaxVaultBytes",
        "Vault:MaxShareBytes",
        "Vault:MaxInboxItems",
        "Vault:ShareMaxAgeDays",
        "Vault:MaintenanceIntervalMinutes",
        "Vault:MinimumClientContract",
        "Vault:HealthCacheSeconds",
        "Vault:PublishInstanceFile",
        "Vault:RequireForwardedHttps",
        "Vault:RateLimit:PermitLimit",
        "Vault:RateLimit:WindowSeconds",
        "Vault:RateLimit:BytesPerWindow",
        "Vault:RateLimit:ByteWindowSeconds",
    ];

    /// <summary>The corporate half: the officers, their quorum, and the sealing key.</summary>
    public static readonly string[] Corp =
    [
        "Vault:CorpRecovery:OfficerEmails",
        "Vault:CorpRecovery:Threshold",
        "Vault:CorpRecovery:SetupTtlHours",
        "Vault:LoginKey:Kek",
    ];

    /// <summary>Who this server accepts tokens from.</summary>
    public static readonly string[] Auth =
    [
        "Auth:Microsoft:Tenant",
        "Auth:Microsoft:Audiences",
        "Auth:Microsoft:ClientScope",
        "Auth:Google:Enabled",
        "Auth:Google:Audiences",
        "Auth:Local:SigningKey",
    ];

    /// <summary>Where the logs go and how long they stay.</summary>
    public static readonly string[] Logging =
    [
        "Logging:Directory",
        "Logging:RetentionDays",
        "Serilog:MinimumLevel:Default",
    ];

    /// <summary>All of them, in one sequence, for the snapshot to walk.</summary>
    public static IEnumerable<string> All => [.. Vault, .. Corp, .. Auth, .. Logging];

    /// <summary>
    /// The keys whose VALUES are secrets. Named so that a reader of the snapshot knows what it is.
    /// </summary>
    /// <remarks>
    /// This list exists to be said out loud, not to filter: the snapshot carries these values, because
    /// a restore without them is a restore of data nobody can open. What it changes is the sentence an
    /// administrator is shown when the backup key appears.
    /// </remarks>
    public static readonly string[] Secrets =
    [
        "Vault:LoginKey:Kek",
        "Auth:Local:SigningKey",
    ];
}
