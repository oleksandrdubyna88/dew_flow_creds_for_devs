namespace CredVaultServer;

/// <summary>
/// Where a verified caller stands with this deployment, once their token and domain have passed.
/// </summary>
/// <remarks>
/// <list type="bullet">
/// <item><b><see cref="Admitted"/></b> — served. Corp mode off, an officer, a person who never synced, or a
/// record that says <c>active: true</c>.</item>
/// <item><b><see cref="Deactivated"/></b> — <c>403</c> with <see cref="CallerStanding.ReasonHeader"/>: an
/// administrator set the record to <c>active: false</c>.</item>
/// <item><b><see cref="Unavailable"/></b> — <c>503</c> with <c>Retry-After</c>: a record exists and this
/// build cannot read it. Never a pass — see <see cref="CallerStanding.Decide"/>.</item>
/// </list>
/// </remarks>
public enum Standing
{
    Admitted,
    Deactivated,
    Unavailable,
}

/// <summary>
/// The blocking gate's decision and its vocabulary. The decision is a pure function so the five branches
/// are a truth table in the tests rather than a reading of <c>RequireCaller</c>; the gate in
/// <c>Program.cs</c> applies it — a status and a header — and every call site is covered by that one gate.
/// </summary>
public static class CallerStanding
{
    /// <summary>
    /// Why a <c>403</c> was a <c>403</c>. A client that must lock the account and purge local key material
    /// cannot be asked to match English, and a <c>403</c> for a disallowed domain has to stay distinguishable
    /// from one for a blocked person — so the header is present on exactly one of the two.
    /// </summary>
    public const string ReasonHeader = "X-Creds-Reason";

    /// <summary>The one value the header carries today: an administrator set the caller's record to <c>active: false</c>.</summary>
    public const string AccountDeactivated = "account-deactivated";

    /// <summary>
    /// The five branches, and the two that decide something larger than one request.
    /// </summary>
    /// <remarks>
    /// <para><b>Corp mode off → admitted, and the registry is not consulted.</b> Personal mode has to stay
    /// byte-identical whatever a leftover <c>org/</c> holds, which is why <paramref name="find"/> is a
    /// function and not a value: it runs only on the branch that needs it.</para>
    /// <para><b>An officer → admitted, whatever their record says</b> — inactive OR unreadable. The roster
    /// is configuration; a gate that refused an officer on <c>active: false</c> or on a corrupt file would
    /// lock the break-glass quorum out of the only road into a blocked developer's vault, which is the vault
    /// this feature exists for. The API cannot write such a record (an officer target is <c>409</c>); a
    /// hand-edit or a restore can, and this is what stops that from becoming an outage of the quorum.</para>
    /// <para><b>Not registered → admitted.</b> No file means the person never synced; the computed default
    /// applies, and the default is active.</para>
    /// <para><b>Found and inactive → deactivated.</b></para>
    /// <para><b>Unavailable → unavailable, never admitted.</b> Failing open here would mean one corrupt
    /// file — a half-written record, a bad sector, a truncated restore — re-admits somebody a company has
    /// just locked out: the escalation the registry's plan round found, one gate later.</para>
    /// </remarks>
    public static Standing Decide(bool corpMode, bool isOfficer, Func<MemberLookupResult> find) =>
        !corpMode || isOfficer ? Standing.Admitted : Classify(find());

    private static Standing Classify(MemberLookupResult lookup) => lookup switch
    {
        { Status: MemberLookup.Unavailable } => Standing.Unavailable,
        { Status: MemberLookup.Found, Record: { Active: false } } => Standing.Deactivated,
        _ => Standing.Admitted,
    };
}
