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
/// <para>Two cases, two types — <see cref="NewTargetDecision"/> and <see cref="KeptTargetDecision"/> —
/// rather than one record with a nullable <c>Kept</c> and a <c>Kept!</c> behind it (doctrine §4, raised by
/// CodeRabbit on PR #142). What differs between them is what <see cref="Record"/> writes.</para>
/// </remarks>
public abstract record TargetDecision(BackupTargetRequest Wanted)
{
    /// <summary>The credentials the request carried, nulls flattened.</summary>
    public TargetSecrets Secrets => BackupTargets.Secrets(Wanted);

    /// <summary>Credentials were sent, so a NEW record must be sealed — the only path that needs the KEK.</summary>
    public bool NeedsSeal => !Secrets.Empty;

    /// <summary>Nothing sealed exists for this identity. A new destination always carries its credentials, or was refused.</summary>
    public abstract bool IsNew { get; }

    public abstract bool RegionChanged { get; }

    /// <summary>The record this decision writes: sealed afresh, or the kept one carrying the requested region.</summary>
    public abstract SealedTarget Record(BackupTargets targets);

    /// <summary>A fresh seal of what was asked, under the deployment KEK.</summary>
    protected SealedTarget SealWith(BackupTargets targets) => targets.Seal(
        Wanted.Kind, Wanted.Endpoint, Wanted.Region, Wanted.Bucket, Wanted.Prefix, Secrets);

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

/// <summary>A destination this server has not seen: it is always sealed afresh.</summary>
public sealed record NewTargetDecision(BackupTargetRequest Wanted) : TargetDecision(Wanted)
{
    public override bool IsNew => true;

    public override bool RegionChanged => false;

    /// <remarks>
    /// A new destination without credentials never reaches here — <see cref="BackupTargets.Problem"/>
    /// refuses it as a first save — so an empty seal is an invariant broken upstream, and it says so
    /// rather than writing a record that could never sign a request.
    /// </remarks>
    public override SealedTarget Record(BackupTargets targets) => NeedsSeal
        ? SealWith(targets)
        : throw new InvalidOperationException(
            $"{Describe}: a new destination reached the write with no credentials; the plan should have refused it.");
}

/// <summary>A destination already sealed on this server, under the same identity.</summary>
public sealed record KeptTargetDecision(BackupTargetRequest Wanted, SealedTarget Kept) : TargetDecision(Wanted)
{
    public override bool IsNew => false;

    public override bool RegionChanged => Kept.Region != BackupTargets.Text(Wanted.Region);

    /// <summary>The kept record carrying the requested region — what is written when nothing needs sealing.</summary>
    public SealedTarget KeptWithRegion => Kept with { Region = BackupTargets.Text(Wanted.Region) };

    public override SealedTarget Record(BackupTargets targets) => NeedsSeal ? SealWith(targets) : KeptWithRegion;
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
            decisions.Add(KeptFor(request, existing) is { } kept
                ? new KeptTargetDecision(request, kept)
                : new NewTargetDecision(request));
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
