namespace CredVaultServer;

/// <summary>
/// What to do with ONE requested destination: keep the record already sealed, or seal afresh — and
/// whether to prove it before the settings are written.
/// </summary>
/// <remarks>
/// <para><b>Kept</b> is the record already on disk with the same identity (kind, endpoint, bucket,
/// prefix), or nothing for a destination this server has not seen. <b>Credentials left out keep the
/// sealed ones</b>: nothing ever returns them, so an administrator editing a prefix cannot copy them
/// out of a GET and paste them back, and without this rule a schedule edit would silently wipe them.</para>
/// <para><b>The region is a SETTING of a destination, not what makes it a different one</b> — the same
/// bucket in a different region is the same bucket — so a kept record carries the requested region
/// rather than its own. Writing the kept record back whole was fix 1 of #134: a save that changed only
/// the region wrote the old region back, silently, and S3 signs with the region.</para>
/// </remarks>
public sealed record TargetDecision(BackupTargetRequest Wanted, SealedTarget? Kept)
{
    /// <summary>The credentials the request carried, nulls flattened.</summary>
    public TargetSecrets Secrets => BackupTargets.Secrets(Wanted);

    /// <summary>Credentials were sent, so a NEW record must be sealed — the only path that needs the KEK.</summary>
    public bool NeedsSeal => !Secrets.Empty;

    /// <summary>Nothing sealed exists for this identity. A new destination always carries its credentials, or was refused.</summary>
    public bool IsNew => Kept is null;

    public bool RegionChanged => Kept is not null && Kept.Region != BackupTargets.Text(Wanted.Region);

    /// <summary>
    /// Proved before the write when something the run will sign with changed. A destination whose
    /// identity, keys and region are all unchanged is written back as it was, unprobed.
    /// </summary>
    /// <remarks>
    /// An owner assumption, recorded in the plan for #134 so it can be reversed: re-proving an untouched
    /// destination on every schedule edit catches a key revoked since, at the price of every edit
    /// depending on every other destination being reachable now — and the nightly run reports a revoked
    /// key within a day anyway. It is also what keeps a destination this server cannot OPEN from failing
    /// the save of a sibling: unchanged, it is not asked anything, and its own row says re-enter.
    /// </remarks>
    public bool Probe => NeedsSeal || RegionChanged;

    /// <summary>The record to write when nothing needs sealing: the kept one, carrying the requested region.</summary>
    public SealedTarget KeptWithRegion => Kept! with { Region = BackupTargets.Text(Wanted.Region) };

    /// <summary>Where this destination is, in the words the page and the run use. Never what opens it.</summary>
    public string Describe => SealedTarget.DescribeAs(
        BackupTargets.Text(Wanted.Kind), BackupTargets.Text(Wanted.Bucket), BackupTargets.Text(Wanted.Prefix));

    /// <summary><c>+</c> added, <c>~</c> re-keyed or re-regioned, nothing when unchanged.</summary>
    public string Mark => MarkOf();

    private string MarkOf()
    {
        if (IsNew)
        {
            return "+";
        }
        return Probe ? "~" : string.Empty;
    }
}

/// <summary>
/// A settings save's destinations, decided before anything is sealed, probed or written.
/// </summary>
/// <remarks>
/// <para>Pure: the endpoint hands in what was asked and what is on disk, and gets back one decision per
/// requested destination, the records the save REMOVES, and the sentence for the event row. Sealing
/// and probing stay in the endpoint, which has the KEK and the network; deciding does not need either,
/// which is what makes every branch here a unit test rather than a request.</para>
/// <para>Everything checkable without a request is checked first and for ALL destinations, so a typo
/// never costs a round trip to somebody else's service.</para>
/// </remarks>
public sealed record BackupTargetPlan(
    IReadOnlyList<TargetDecision> Decisions,
    IReadOnlyList<SealedTarget> Removed,
    string Problem)
{
    public static BackupTargetPlan Of(IReadOnlyList<BackupTargetRequest> wanted, IReadOnlyList<SealedTarget> existing)
    {
        // No capacity hint: `wanted.Count` is the CLIENT's number, and a list sized from user input is
        // the shape a memory-allocation DoS takes. The request body ceiling already bounds it; the
        // list grows as it is filled, which for single-digit destinations costs nothing.
        var decisions = new List<TargetDecision>();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var request in wanted)
        {
            var problem = ProblemWith(request, existing, seen);
            if (problem.Length > 0)
            {
                return new BackupTargetPlan([], [], problem);
            }
            decisions.Add(new TargetDecision(request, KeptFor(request, existing)));
        }
        return new BackupTargetPlan(
            decisions, [.. existing.Where(target => !seen.Contains(target.Identity))], string.Empty);
    }

    /// <summary>Whether any decision seals — the one thing that needs the deployment KEK.</summary>
    public bool NeedsSeal => Decisions.Any(decision => decision.NeedsSeal);

    /// <summary>
    /// The event row's words: what was added, changed and removed, by <see cref="SealedTarget.Describe"/>.
    /// Never a key, never an endpoint, never anything sealed.
    /// </summary>
    public string Delta
    {
        get
        {
            var words = Decisions
                .Where(decision => decision.Mark.Length > 0)
                .Select(decision => decision.Mark + decision.Describe)
                .Concat(Removed.Select(removed => "-" + removed.Describe));
            var said = string.Join(" ", words);
            return said.Length == 0 ? "destinations unchanged" : $"destinations {said}";
        }
    }

    /// <summary>The request's own words for a refusal — the kind VERBATIM, because it may be one this server does not know.</summary>
    public static string Named(BackupTargetRequest target) =>
        $"{BackupTargets.Text(target.Kind)} {BackupTargets.Text(target.Bucket)}/{BackupTargets.Text(target.Prefix)}".TrimEnd('/');

    private static SealedTarget? KeptFor(BackupTargetRequest request, IReadOnlyList<SealedTarget> existing) =>
        existing.FirstOrDefault(target => target.Identity == BackupTargets.IdentityOf(request));

    /// <summary>
    /// What is wrong with one requested destination, or nothing — including the one problem only the
    /// whole list can show.
    /// </summary>
    /// <remarks>
    /// Two destinations with one identity would leave every later edit matching the first and the
    /// second unreachable for ever, because the keep-the-keys rule matches by identity. Refused by name.
    /// </remarks>
    private static string ProblemWith(
        BackupTargetRequest request, IReadOnlyList<SealedTarget> existing, HashSet<string> seen)
    {
        if (!seen.Add(BackupTargets.IdentityOf(request)))
        {
            return $"{Named(request)}: appears twice. Two destinations share one identity — kind, endpoint, "
                + "bucket and prefix — and an edit could only ever match the first of them.";
        }
        var problem = BackupTargets.Problem(request, KeptFor(request, existing) is not null);
        return problem.Length == 0 ? string.Empty : $"{Named(request)}: {problem}";
    }
}
