namespace CredVaultServer;

/// <summary>What the project rule says about one share.</summary>
/// <remarks>
/// Three outcomes rather than a bool, for the reason <see cref="Standing"/> has three: a record this
/// build cannot read must not be able to read as <see cref="Refuse"/>. One corrupt file would then
/// present itself to a person as a policy decision about a colleague — and, on the other side, an
/// unreadable project would quietly close a channel nobody closed.
/// </remarks>
public enum ShareVerdict
{
    /// <summary>Carry on: the sender is not fenced, or the share is inside the fence.</summary>
    Allow,

    /// <summary><c>403</c> with the sentence.</summary>
    Refuse,

    /// <summary><c>503</c>: a record exists and this build cannot read it. Never a pass.</summary>
    Unavailable,
}

/// <summary>The rule's answer, and what to tell the sender when it is no.</summary>
public readonly record struct ShareDecision(ShareVerdict Verdict, string Message)
{
    public static readonly ShareDecision Allow = new(ShareVerdict.Allow, string.Empty);

    public static readonly ShareDecision Unavailable = new(
        ShareVerdict.Unavailable,
        "This server cannot check the project right now; try again shortly.");

    public static ShareDecision Refuse(string message) => new(ShareVerdict.Refuse, message);
}

/// <summary>
/// Everything the rule needs, gathered by the endpoint so the rule itself touches no disk.
/// </summary>
/// <remarks>
/// <para>Lookups arrive as RESULTS rather than as functions, unlike <see cref="CallerStanding.Decide"/>:
/// there the point was that a personal server must not stat a file, and the branch that skips the read
/// is inside the decision. Here the endpoint already holds the sender's record for other reasons and
/// the corp-mode branch is checked before the facts are built, so passing values keeps the rule a
/// table. The endpoint's own guard is what stops a personal server reading anything.</para>
/// </remarks>
/// <param name="CorpMode">Whether this deployment has a roster at all.</param>
/// <param name="SenderIsOfficer">From configuration, never from a record.</param>
/// <param name="Sender">The sender's registry record, or why there is none.</param>
/// <param name="ProjectId">What the client said the entity came out of; null or blank means none.</param>
/// <param name="Project">The project that id names — only consulted when there is one.</param>
/// <param name="Recipient">The addressee's registry record, after the blocking gate has passed them.</param>
public readonly record struct ShareRuleFacts(
    bool CorpMode,
    bool SenderIsOfficer,
    MemberLookupResult Sender,
    string? ProjectId,
    ProjectResult Project,
    MemberLookupResult Recipient);

/// <summary>
/// The one boundary of epic 3 that the server enforces rather than asks an honest client to obey.
/// </summary>
/// <remarks>
/// <para><b>It fences DEVELOPERS, and carries the project for everybody else.</b> The client sends
/// <c>projectId</c> for any entity under a project folder whatever the sender's role, so a rule keyed
/// on "this request names a project" would refuse a MEMBER sharing out of one — a regression on
/// exactly the behaviour this epic promises to leave alone. Members and admins share as they did
/// yesterday; the field is data for them, and epic 4 logs it.</para>
///
/// <para><b>It runs AFTER the blocking gate's recipient check and never re-reads <c>active</c>.</b>
/// <c>RecipientRefused</c> already answers <c>403</c> for a deactivated recipient and <c>503</c> for a
/// record it cannot read. A second reading here would answer <c>403</c> where the gate answers
/// <c>503</c> — reading *unavailable* as *not a member*, which is the fail-open this codebase has
/// caught three times now. This rule asks about project membership and nothing else.</para>
///
/// <para><b>Pure.</b> No <c>HttpContext</c>, no store, so the branches are a truth table in the tests
/// rather than a reading of the endpoint — the shape <see cref="CallerStanding"/> established.</para>
/// </remarks>
public static class ShareRule
{
    /// <summary>The whole rule, in the order the questions have to be asked.</summary>
    public static ShareDecision Decide(ShareRuleFacts facts)
    {
        if (!facts.CorpMode || facts.SenderIsOfficer)
        {
            return ShareDecision.Allow;
        }
        return facts.Sender.Status switch
        {
            // "Is this person a developer" is the first question, and a build that cannot read the
            // record cannot answer it.
            MemberLookup.Unavailable => ShareDecision.Unavailable,
            MemberLookup.Found when facts.Sender.Record is { Role: MemberRole.Dev } dev => ForDeveloper(facts, dev),
            _ => ShareDecision.Allow,
        };
    }

    /// <summary>Whether this request names a project at all.</summary>
    public static bool NamesAProject(string? projectId) => !string.IsNullOrWhiteSpace(projectId);

    private static ShareDecision ForDeveloper(ShareRuleFacts facts, MemberRecord developer)
    {
        if (!NamesAProject(facts.ProjectId))
        {
            return ShareDecision.Refuse(
                "Developers may share only what is inside a project folder. Move the entry into one, "
                + "or ask an administrator to assign you to the project it belongs to.");
        }
        var available = ProjectAvailable(facts.Project);
        if (available.Verdict != ShareVerdict.Allow)
        {
            return available;
        }
        return OrgProjects.EffectiveShare(developer, facts.ProjectId!) == ShareDefaults.Project
            ? RecipientOnProject(facts)
            : ShareDecision.Refuse(
                "You may not share entities from this project. An administrator decides that per "
                + "project, and yours is set to no sharing.");
    }

    /// <summary>
    /// A project has to exist and be open. Archived is a refusal rather than a silence: an engagement
    /// that has closed is not a channel, and story 1 already refuses to assign anybody new to one.
    /// </summary>
    private static ShareDecision ProjectAvailable(ProjectResult project) => project switch
    {
        { Status: ProjectLookup.Unreadable } => ShareDecision.Unavailable,
        { Status: ProjectLookup.Found, Record: { Archived: false } } => ShareDecision.Allow,
        _ => ShareDecision.Refuse(
            "That project is not available on this server. It may have been archived, in which case "
            + "nothing more can be shared out of it."),
    };

    /// <summary>
    /// The recipient must be on the same project. "Replying to somebody outside it is refused" needs
    /// no branch of its own — it is this check with the two people swapped.
    /// </summary>
    private static ShareDecision RecipientOnProject(ShareRuleFacts facts) => facts.Recipient switch
    {
        { Status: MemberLookup.Unavailable } => ShareDecision.Unavailable,
        { Status: MemberLookup.Found, Record: { } record } when OrgProjects.IsAssigned(record, facts.ProjectId!)
            => ShareDecision.Allow,
        _ => ShareDecision.Refuse(
            "The recipient is not on that project, so this share would cross an engagement boundary."),
    };
}
