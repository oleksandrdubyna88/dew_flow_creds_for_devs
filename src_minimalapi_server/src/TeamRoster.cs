namespace CredVaultServer;

/// <summary>
/// Who a caller may be offered as a recipient, and how much of each colleague they may be told.
/// </summary>
/// <remarks>
/// <para>Pure, and separate from the route for the reason <see cref="ShareRule"/> is: this is the
/// discovery half of the same boundary, and the two must agree. A client that proposes a recipient
/// the share rule will then refuse teaches people the feature is broken.</para>
///
/// <para><b>It agrees with the rule without duplicating it.</b> The rule decides one share against a
/// named project; this decides a list against every project the caller is on. Both ask
/// <see cref="OrgProjects.IsAssigned"/>, which is the one place assignment is read.</para>
/// </remarks>
public static class TeamRoster
{
    /// <summary>
    /// The rows for this caller: everybody discoverable, or — for a developer — the people they share
    /// a project with.
    /// </summary>
    /// <remarks>
    /// <para><b>The caller is always in their own list.</b> Decision 10 of the plan said this happens
    /// by itself, since somebody shares every one of their projects with themselves; the plan round
    /// found the case where it does not — a developer with NO assignments intersects with nothing, and
    /// would vanish from their own roster, taking the tree's "(you)" row with them. It is a branch
    /// now, not an assumption.</para>
    /// <para><b>A developer sees only the projects they share with each colleague.</b> Somebody on A1
    /// with me and on A5 without me hands me "A1" and nothing else: the full list would leak the
    /// engagement names this epic exists to fence, to exactly the role it fences. A member or an
    /// admin, who may read the whole roster through the admin surface anyway, gets the full list.</para>
    /// <para><b>An officer is not a developer</b> and is never looked up, as everywhere else here.</para>
    /// </remarks>
    public static List<TeamMemberDetailDto> For(
        string caller,
        bool callerIsOfficer,
        IReadOnlyList<string> discoverable,
        Func<string, MemberLookupResult> find)
    {
        var self = callerIsOfficer ? MemberLookupResult.NotRegistered : find(caller);
        var narrow = !callerIsOfficer && self is { Status: MemberLookup.Found, Record.Role: MemberRole.Dev };
        // A SET, not a list: this is asked once per colleague per assignment, so on a domain of any
        // size a linear scan here is the whole response's cost multiplied by two roster sizes.
        var mine = new HashSet<string>(narrow ? ShareableProjectsOf(self) : ProjectsOf(self), StringComparer.Ordinal);
        var rows = new List<TeamMemberDetailDto>();
        foreach (var email in discoverable)
        {
            var row = Row(email, find(email), narrow, mine, string.Equals(email, caller, StringComparison.Ordinal));
            if (row is not null)
            {
                rows.Add(row);
            }
        }
        return rows;
    }

    /// <summary>One colleague's row, or nothing when this caller may not be offered them.</summary>
    private static TeamMemberDetailDto? Row(
        string email,
        MemberLookupResult lookup,
        bool narrow,
        HashSet<string> callerProjects,
        bool isSelf)
    {
        var theirs = ProjectsOf(lookup);
        var shared = theirs.Where(callerProjects.Contains).ToList();
        if (narrow && !isSelf && shared.Count == 0)
        {
            return null;
        }
        return new TeamMemberDetailDto(email, RoleOf(lookup), narrow ? shared : theirs);
    }

    /// <summary>
    /// The role to report. A person with no record is a member — the documented default, and the same
    /// answer <c>GET /api/org/me</c> computes for them rather than inventing a third state; a record
    /// this build cannot read reports the default too, because the row exists to name a recipient and
    /// the blocking gate is what decides whether they may receive anything.
    /// </summary>
    private static string RoleOf(MemberLookupResult lookup) =>
        lookup is { Status: MemberLookup.Found, Record: { } record } ? record.Role : MemberRole.Default;

    /// <summary>
    /// The projects a developer may actually SEND from — assignment is not enough.
    /// </summary>
    /// <remarks>
    /// The code round's finding, and it is the difference between agreeing with the assignment and
    /// agreeing with the RULE: a developer whose share for a project is <c>none</c> is on it and can
    /// send nothing into it, so offering them its colleagues proposes recipients the server will
    /// refuse — the exact failure this whole surface exists to prevent. <see cref="ShareRule"/> and
    /// this method therefore ask the same question of the same function.
    /// </remarks>
    private static IReadOnlyList<string> ShareableProjectsOf(MemberLookupResult lookup) =>
        lookup is { Status: MemberLookup.Found, Record: { } record }
            ? [.. record.Projects
                .Select(p => p.ProjectId)
                .Where(id => OrgProjects.EffectiveShare(record, id) == ShareDefaults.Project)]
            : [];

    private static IReadOnlyList<string> ProjectsOf(MemberLookupResult lookup) =>
        lookup is { Status: MemberLookup.Found, Record: { } record }
            ? [.. record.Projects.Select(p => p.ProjectId)]
            : [];
}
