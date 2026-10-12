namespace CredVaultServer;

/// <summary>What the startup guards judge — configuration only, read once by <c>Program.cs</c>.</summary>
/// <param name="DataDir">Where blobs live.</param>
/// <param name="AllowNetworkDataDir">The operator's written override of the network-filesystem refusal.</param>
/// <param name="MicrosoftTenant">The Entra tenant; empty means the Microsoft scheme is off.</param>
/// <param name="GoogleEnabled">Whether the Google scheme is on.</param>
/// <param name="LocalSigningKey">The HMAC secret of the Local scheme; empty means it is off.</param>
/// <param name="HasAllowedDomains">Whether <c>Vault:AllowedDomains</c> names at least one domain.</param>
/// <param name="AllowAnyDomain">The explicit opt-out of a domain boundary.</param>
public sealed record StartupSettings(
    string DataDir,
    bool AllowNetworkDataDir,
    string? MicrosoftTenant,
    bool GoogleEnabled,
    string? LocalSigningKey,
    bool HasAllowedDomains,
    bool AllowAnyDomain)
{
    /// <summary>The Local scheme is on when it has a key at all — a short one is refused, not ignored.</summary>
    public bool LocalEnabled => !string.IsNullOrWhiteSpace(LocalSigningKey);
}

/// <summary>
/// The five reasons the server refuses to start rather than run in a state that looks like a network
/// fault — in one place, so <c>Program.cs</c> catches every one of them in one catch, logs it at Fatal,
/// flushes, and exits with <see cref="CredsForDevs.ServiceDefaults.HostRun.RefusedExitCode"/>
/// (research/PLAN_server_startup_refusal_is_logged.md).
/// </summary>
/// <remarks>
/// <para>Each guard throws <see cref="InvalidOperationException"/> with the message it has always had —
/// the messages are what an operator reads, and they did not change when the guards moved here.</para>
/// <para><b>The order is chosen on purpose.</b> The three pure configuration checks run first, then the
/// network-filesystem check, then the writable probe — the only one that touches the disk (it creates
/// the directory and writes a file). A configuration that is refused anyway therefore leaves nothing
/// behind. Before 2026-10-12 the two data-dir checks ran first and the other three after
/// <c>builder.Build()</c>; the only visible difference is which message wins when two things are wrong
/// at once.</para>
/// </remarks>
public static class StartupGuards
{
    /// <summary>Throws the first refusal, or returns when the server may start.</summary>
    /// <param name="settings">The configuration to judge.</param>
    /// <param name="readMounts">The mount table as text (<c>/proc/mounts</c>), or null where there is none.</param>
    public static void Check(StartupSettings settings, Func<string?> readMounts)
    {
        RefuseWithoutAuthentication(settings);
        RefuseWithoutDomainBoundary(settings);
        RefuseShortSigningKey(settings);
        RefuseNetworkDataDir(settings, readMounts);
        RefuseUnwritableDataDir(settings.DataDir);
    }

    private static void RefuseWithoutAuthentication(StartupSettings settings)
    {
        if (string.IsNullOrWhiteSpace(settings.MicrosoftTenant) && !settings.GoogleEnabled && !settings.LocalEnabled)
        {
            throw new InvalidOperationException(
                "No authentication scheme configured — set Auth:Microsoft:Tenant, Auth:Google:Enabled, "
                + "or Auth:Local:SigningKey. Refusing to start a server that would 401 every request.");
        }
    }

    private static void RefuseWithoutDomainBoundary(StartupSettings settings)
    {
        if (!settings.HasAllowedDomains && !settings.AllowAnyDomain)
        {
            throw new InvalidOperationException(
                "Vault:AllowedDomains is empty. Set it to your company domain(s), or set "
                + "Vault:AllowAnyDomain=true to explicitly run without a domain boundary.");
        }
    }

    /// <remarks>
    /// HMAC-SHA256 needs a 256-bit key. A shorter one is the nastiest kind of misconfiguration: the scheme
    /// registers without complaint, the host starts, /api/health reports OK — and every single request is
    /// rejected with 401 with nothing in the log to connect the two. Same reasoning as the guard above.
    /// </remarks>
    private static void RefuseShortSigningKey(StartupSettings settings)
    {
        if (!settings.LocalEnabled)
        {
            return;
        }
        var keyBytes = System.Text.Encoding.UTF8.GetByteCount(settings.LocalSigningKey!);
        if (keyBytes < 32)
        {
            throw new InvalidOperationException(
                $"Auth:Local:SigningKey is {keyBytes} bytes; HMAC-SHA256 requires at least 32. "
                + "A shorter key would start a server that answers 401 to everything. "
                + "Generate one with: openssl rand -base64 48");
        }
    }

    /// <remarks>
    /// Writable is not enough: the store's durability is atomic rename, which a network filesystem does
    /// not promise (server-ops item 2). Refused before a single blob depends on it.
    /// </remarks>
    private static void RefuseNetworkDataDir(StartupSettings settings, Func<string?> readMounts)
    {
        var networkRefusal = DataDirCheck.Judge(settings.DataDir, settings.AllowNetworkDataDir, readMounts);
        if (networkRefusal is not null)
        {
            throw new InvalidOperationException(networkRefusal);
        }
    }

    /// <remarks>
    /// Probe BEFORE constructing the store. VaultStore's constructor creates its two subdirectories, so an
    /// unwritable DataDir used to surface as a raw UnauthorizedAccessException from a stack frame that says
    /// nothing about what to do — and the single most common cause is the ordinary one: a bind-mounted host
    /// directory owned by root while the container runs unprivileged.
    /// </remarks>
    private static void RefuseUnwritableDataDir(string dataDir)
    {
        try
        {
            Directory.CreateDirectory(dataDir);
            var probe = Path.Combine(dataDir, ".startup-probe");
            File.WriteAllText(probe, "ok");
            File.Delete(probe);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            throw new InvalidOperationException(
                $"DataDir '{dataDir}' is not writable by uid {Environment.UserName}: {ex.Message}. "
                + "In Docker this is almost always a host directory owned by root: run "
                + $"`chown -R 10001:10001 <host path>`, or let the stack's `init` service do it.",
                ex);
        }
    }
}
