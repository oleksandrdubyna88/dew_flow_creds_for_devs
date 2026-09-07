namespace CredVaultServer;

/// <summary>What happened when a target was asked to do something.</summary>
public sealed record TargetOutcome(bool Ok, string Why)
{
    public static readonly TargetOutcome Fine = new(true, string.Empty);

    public static TargetOutcome Failed(string why) => new(false, why);
}

/// <summary>One archive as the destination holds it. The NAME carries its instant.</summary>
public sealed record RemoteArchive(string Name, long Bytes);

/// <summary>What a destination holds, or the reason it would not say.</summary>
public sealed record TargetListing(IReadOnlyList<RemoteArchive> Archives, string Why)
{
    public static TargetListing Of(IReadOnlyList<RemoteArchive> archives) => new(archives, string.Empty);

    public static TargetListing Failed(string why) => new([], why);

    public bool Ok => Why.Length == 0;
}

/// <summary>
/// Somewhere off this machine to put an archive.
/// </summary>
/// <remarks>
/// <para>Four operations, because retention needs three of them and honesty needs the fourth: put,
/// list, delete, and "can you be reached with these credentials". The runner does not know which kind
/// it is talking to, which is what keeps one lifecycle rather than two.</para>
/// <para><b>Nothing here throws for a service's answer.</b> A 403 is a target that refused, not an
/// exception: a backup run must record which target failed and carry on with the others, and an
/// exception per HTTP status would make that a try/catch per call site.</para>
/// </remarks>
public interface IArchiveTarget
{
    /// <summary>What to call this in a status or a log — never a credential.</summary>
    string Describe { get; }

    /// <summary>The largest single upload this kind accepts.</summary>
    long MaxBytes { get; }

    Task<TargetOutcome> PutAsync(string name, Stream body, long length, CancellationToken ct);

    /// <summary>
    /// What is there — or why the question could not be answered.
    /// </summary>
    /// <remarks>
    /// An empty listing and a listing that FAILED are different facts, and conflating them is how
    /// retention comes to do nothing while the run reports success: a target whose list permission was
    /// revoked would accumulate archives for ever and say so nowhere. The outcome travels with the
    /// list so the caller can refuse to prune on the strength of an answer it did not get.
    /// </remarks>
    Task<TargetListing> ListAsync(CancellationToken ct);

    Task<TargetOutcome> DeleteAsync(string name, CancellationToken ct);

    /// <summary>
    /// Prove this target can actually be USED, before the settings that name it are saved.
    /// </summary>
    /// <remarks>
    /// A <c>HEAD</c> on the container is not enough and the review round was right about why: both
    /// clouds routinely grant read or list while denying write, so a reachability check that only
    /// reads gives false confidence at save time and discovers the truth at 03:00 in a log nobody
    /// reads. This writes a tiny probe object and deletes it again.
    /// </remarks>
    Task<TargetOutcome> UsableAsync(CancellationToken ct);
}

/// <summary>
/// The rules every target shares, in one place so two clients cannot disagree about them.
/// </summary>
public static class ArchiveTargets
{
    /// <summary>What a probe object is called. Named so an operator who sees one knows what it was.</summary>
    public const string ProbeName = ".credvault-write-probe";

    /// <summary>
    /// One request's deadline.
    /// </summary>
    /// <remarks>
    /// Named rather than left to <c>HttpClient</c>'s ambient 100 seconds, because two of these are on
    /// paths a person is waiting for — saving settings, and a run that must not occupy the queue for an
    /// afternoon because a host accepted a connection and then said nothing.
    /// </remarks>
    public static readonly TimeSpan RequestTimeout = TimeSpan.FromMinutes(2);

    /// <summary>The deadline for an UPLOAD, which is a different size of thing entirely.</summary>
    public static readonly TimeSpan UploadTimeout = TimeSpan.FromHours(2);

    /// <summary>
    /// The deadline for a save-time probe, which is shorter because a person is watching it.
    /// </summary>
    /// <remarks>
    /// Twenty seconds is long enough for a round trip to any cloud region and short enough that a
    /// browser, a reverse proxy and a human are all still waiting. The probes for several targets run
    /// concurrently, so this is the worst case for the whole save rather than per target.
    /// </remarks>
    public static readonly TimeSpan ProbeTimeout = TimeSpan.FromSeconds(20);

    public const string ArchiveContentType = "application/octet-stream";

    /// <summary>
    /// The three deadlines a target works to, as one thing a test can shorten.
    /// </summary>
    /// <remarks>
    /// A deadline nothing can exercise is a deadline nobody can trust, and this feature has already
    /// shipped one that did not work: the token carried into the body read came from a
    /// <c>CancellationTokenSource</c> that had already been disposed, so its timer was dead and the
    /// read had no deadline at all. Nothing could see that, because the only way to observe it is to
    /// let a service stall — which at two minutes is not a test anybody runs.
    /// </remarks>
    public sealed record TargetDeadlines(TimeSpan Request, TimeSpan Upload, TimeSpan Probe)
    {
        public static readonly TargetDeadlines Default = new(RequestTimeout, UploadTimeout, ProbeTimeout);
    }

    /// <summary>
    /// Which objects a retention window would remove — and never all of them.
    /// </summary>
    /// <remarks>
    /// <para>The same floor <c>deploy/backup/backup-once.sh:129</c> encodes and story 3 reproduced
    /// locally: a pass whose every candidate is old deletes NOTHING. A clock that jumped, a server that
    /// was down for a month, or an upload that has not worked must not turn "prune old backups" into
    /// "delete every backup" — and on a destination that is the only copy left, that would be the end
    /// of it.</para>
    /// <para><b>Age comes from the NAME</b>, exactly as it does locally, and not from the service's
    /// <c>LastModified</c>. A re-upload, a lifecycle rule, a tier change or a copy between buckets all
    /// rewrite that timestamp, and a sweep that trusted it would delete a month of archives the first
    /// time somebody moved a bucket.</para>
    /// </remarks>
    public static IReadOnlyList<RemoteArchive> Expired(
        IReadOnlyList<RemoteArchive> all, DateTimeOffset now, int retentionDays)
    {
        if (retentionDays <= 0)
        {
            return [];
        }
        var cutoff = now.AddDays(-retentionDays);
        var ours = all.Where(archive => ArchiveName.InstantOf(archive.Name) is not null).ToArray();
        var old = ours.Where(archive => ArchiveName.InstantOf(archive.Name) < cutoff).ToArray();
        return old.Length == ours.Length ? [] : old;
    }

    /// <summary>
    /// Whether an endpoint may be used, and why not.
    /// </summary>
    /// <remarks>
    /// <para>HTTPS, because S3's <c>UNSIGNED-PAYLOAD</c> requires it — the body is not covered by the
    /// signature, so the transport has to be what protects it — and because an account key travelling
    /// in clear is the whole deployment.</para>
    /// <para><b>Loopback is the exception, and only for plain http</b>: a developer running MinIO on
    /// <c>127.0.0.1</c> has no certificate and nothing to intercept, and refusing that would mean this
    /// feature could not be exercised outside a cloud account. Any OTHER host over plain http is
    /// refused, because "it is on our network" is exactly the assumption that makes an interception
    /// interesting.</para>
    /// <para><b>An https endpoint is accepted wherever it points, private addresses included</b> — a
    /// reviewer read the paragraph above as a claim that <c>https://192.168.1.10</c> is refused. It is
    /// not, and it should not be: this product exists to be self-hosted, and an on-premises
    /// S3-compatible store on a private address with a certificate the deployment trusts is an
    /// ordinary destination. What is refused is the absence of TLS, never the shape of the address.
    /// </para>
    /// </remarks>
    public static string EndpointProblem(string endpoint)
    {
        if (!Uri.TryCreate(endpoint, UriKind.Absolute, out var uri))
        {
            return "that is not a URL. An endpoint looks like https://s3.eu-central-1.amazonaws.com.";
        }
        if (uri.Scheme == Uri.UriSchemeHttps)
        {
            return string.Empty;
        }
        return uri.Scheme == Uri.UriSchemeHttp && uri.IsLoopback
            ? string.Empty
            : "the endpoint must be https. The archive's body is not covered by the request signature, "
              + "so the transport is what protects it, and the credentials would otherwise travel in "
              + "clear. Plain http is accepted for loopback only, where there is nothing between.";
    }
}
