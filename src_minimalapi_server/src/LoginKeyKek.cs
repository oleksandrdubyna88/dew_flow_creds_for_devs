namespace CredVaultServer;

/// <summary>
/// Reading the deployment's login-key encryption key out of configuration — and refusing to guess.
/// </summary>
/// <remarks>
/// <para>Its own type rather than three lines in <c>Program.cs</c> for the reason
/// <see cref="OrgRecoveryConfig.Read"/> is one: "what counts as a usable key, and what an operator is
/// told when theirs is not" is a decision worth reading on its own, and a test can drive it without a
/// server.</para>
///
/// <para><b>Anything not exactly 32 bytes of base64 is no key at all</b> — not a truncated one, not a
/// padded one. A key that is nearly right is the failure that produces vaults sealed under something
/// nobody can reproduce, so the only two outcomes are "this deployment issues login keys" and "it does
/// not, and the log says why".</para>
/// </remarks>
public static class LoginKeyKek
{
    /// <summary>The configured key, or empty when this deployment has none it can use.</summary>
    /// <remarks>
    /// The "base64 of exactly 32 bytes, or nothing" decision lives in <see cref="Key32"/> since the
    /// backup archive came to need the same one. The refusal it encodes is this type's, and the reason
    /// is in the remarks above.
    /// </remarks>
    public static byte[] Read(string? configured) => Key32.Decode(configured);

    /// <summary>
    /// What to say at startup, or empty when there is nothing to say. Silent when nothing is configured
    /// AND corp mode is off: that is the overwhelmingly common case — every personal deployment — and a
    /// line there would train operators to skip the one that matters.
    /// </summary>
    public static string Complaint(string? configured, bool corpMode)
    {
        var trimmed = configured?.Trim() ?? string.Empty;
        if (trimmed.Length == 0)
        {
            return corpMode
                ? "Vault:LoginKey:Kek is not configured, so this server cannot issue developer login keys: "
                  + "GET /api/org/login-key will answer 503. Everything else — vault sync, sharing, the "
                  + "members registry — is unaffected. Set it to base64 of 32 random bytes to enable the feature."
                : string.Empty;
        }
        return Read(trimmed).Length == LoginKeyStore.KeyBytes
            ? string.Empty
            : "Vault:LoginKey:Kek is set but is not base64 of exactly 32 bytes, so it is being IGNORED and "
              + "GET /api/org/login-key will answer 503. A nearly-right key is refused on purpose: sealing "
              + "keys under something an operator cannot reproduce is how a vault becomes unopenable.";
    }

}
