namespace CredVaultServer;

/// <summary>
/// What the officers' metrics page shows (server-ops item 5, the owner's shape, 2026-08-28):
/// one JSON document, read by a human through the extension — not a scrape target.
/// </summary>
public sealed record MetricsDto(
    string Service,
    string Version,
    string Runtime,
    string RuntimeSupport,
    string StartedAt,
    long UptimeSeconds,
    long Requests,
    long Status4xx,
    long Status5xx,
    long RateLimited,
    long VaultReads,
    long VaultWrites,
    long VaultBytesWritten,
    int Vaults,
    long VaultBytesOnDisk,
    int PendingShares,
    long ShareBytesOnDisk,
    long DataDirFreeBytes);

/// <summary>
/// The counters behind <c>/api/metrics</c>. Process-lifetime, lock-free, and deliberately few:
/// requests by outcome, vault traffic, and what the data directory holds right now. Nothing
/// here names a caller — the page is for officers, and officers do not need to know who synced.
/// </summary>
public sealed class ServerMetrics(DateTimeOffset startedAt)
{
    private long _requests;
    private long _status4xx;
    private long _status5xx;
    private long _rateLimited;
    private long _vaultReads;
    private long _vaultWrites;
    private long _vaultBytesWritten;

    public DateTimeOffset StartedAt { get; } = startedAt;

    /// <summary>Every response, once it has a status code.</summary>
    public void Record(int statusCode, string method, PathString path)
    {
        Interlocked.Increment(ref _requests);
        CountOutcome(statusCode);
        if (statusCode == StatusCodes.Status200OK && method == HttpMethods.Get && path == "/api/vault")
        {
            Interlocked.Increment(ref _vaultReads);
        }
    }

    /// <summary>A vault write that was accepted — counted where the bytes are known.</summary>
    public void VaultWritten(long bytes)
    {
        Interlocked.Increment(ref _vaultWrites);
        Interlocked.Add(ref _vaultBytesWritten, bytes);
    }

    /// <summary>A vault write refused for spending its byte budget (E1).</summary>
    public void RateLimited() => Interlocked.Increment(ref _rateLimited);

    public MetricsDto Snapshot(VaultStore store, string dataDir, DateTimeOffset now, string version, RuntimeSupport.Verdict runtime)
    {
        var vaults = store.VaultFootprint();
        var shares = store.ShareFootprint();
        return new MetricsDto(
            Service: "cred-vault-server",
            Version: version,
            Runtime: runtime.Runtime,
            RuntimeSupport: runtime.Line,
            StartedAt: StartedAt.ToString("O"),
            UptimeSeconds: (long)(now - StartedAt).TotalSeconds,
            Requests: Interlocked.Read(ref _requests),
            Status4xx: Interlocked.Read(ref _status4xx),
            Status5xx: Interlocked.Read(ref _status5xx),
            RateLimited: Interlocked.Read(ref _rateLimited),
            VaultReads: Interlocked.Read(ref _vaultReads),
            VaultWrites: Interlocked.Read(ref _vaultWrites),
            VaultBytesWritten: Interlocked.Read(ref _vaultBytesWritten),
            Vaults: vaults.Count,
            VaultBytesOnDisk: vaults.Bytes,
            PendingShares: shares.Count,
            ShareBytesOnDisk: shares.Bytes,
            DataDirFreeBytes: FreeBytes(dataDir));
    }

    private void CountOutcome(int statusCode)
    {
        switch (statusCode)
        {
            case StatusCodes.Status429TooManyRequests:
                Interlocked.Increment(ref _rateLimited);
                break;
            case >= 500:
                Interlocked.Increment(ref _status5xx);
                break;
            case >= 400:
                Interlocked.Increment(ref _status4xx);
                break;
        }
    }

    private static long FreeBytes(string dataDir)
    {
        try
        {
            return new DriveInfo(Path.GetFullPath(dataDir)).AvailableFreeSpace;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or ArgumentException)
        {
            return -1;
        }
    }
}
