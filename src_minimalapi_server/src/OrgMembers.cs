using System.Text.Json;
using System.Text.Json.Serialization;

namespace CredVaultServer;

/// <summary>
/// Who the people on this server are, as records with no I/O.
///
/// <para>The server's model of a person used to be one sentence: the email in a verified token.
/// That is the right model for a team of peers and the wrong one for a company, where somebody
/// administers, somebody may not export, and somebody has left. This file is that second model —
/// deliberately small and free of behaviour, so the rules over it are pure functions and therefore
/// tests.</para>
///
/// <para><b>Nothing here is a secret.</b> A role, a flag, a project id and a timestamp: the same
/// class of data as the recovery roster, which this server already stores in plaintext because it
/// has to act on it. No field in this file could help anybody decrypt anything, which is what keeps
/// the whole corporate surface on the right side of rule 1.</para>
/// </summary>
public static class MemberRole
{
    /// <summary>May manage people, projects and settings, and read the whole event log.</summary>
    public const string Admin = "admin";

    /// <summary>What every account is today — and the default for everyone, see below.</summary>
    public const string Member = "member";

    /// <summary>A developer: no export, no local backup, sharing only inside a project.</summary>
    public const string Dev = "dev";

    /// <summary>
    /// The role a person has before anybody has said otherwise.
    ///
    /// <para><b><c>member</c>, and that is a decision rather than a fallback.</b> The alternative —
    /// default to <c>dev</c> so nothing is permitted until an admin permits it — would mean that on
    /// the day a server gains a recovery roster, every colleague loses export and sharing at once,
    /// over a role nobody assigned them. A control plane that changes what people may do before
    /// anyone has configured it is a control plane that gets switched off.</para>
    /// </summary>
    public const string Default = Member;

    /// <summary>
    /// The one list. <see cref="IsKnown"/> reads it and so does the <c>400</c> that names the legal
    /// values — a second spelling of the same three names is how a fourth role gets added to one of them.
    /// </summary>
    public static readonly IReadOnlyList<string> All = [Admin, Member, Dev];

    public static string LegalValues => string.Join(", ", All);

    public static bool IsKnown(string? role) => role is not null && All.Contains(role);
}

/// <summary>
/// What a developer may do about sharing when no project assignment says otherwise.
/// </summary>
/// <remarks>
/// Plural, unlike the property it fills: a type and a property of the same name compile only
/// under fully qualified references, and code that has to name its own namespace to say
/// <c>ShareDefault.Project</c> reads as though something clever is happening. Nothing is.
/// </remarks>
public static class ShareDefaults
{
    /// <summary>May share, but only inside a project both people belong to.</summary>
    public const string Project = "project";

    /// <summary>May receive shares and send none.</summary>
    public const string None = "none";

    public const string Default = Project;

    /// <summary>What the server reports for a role that is not a developer at all.</summary>
    public const string Any = "any";

    /// <summary>The values a record may hold — <see cref="Any"/> is reported, never stored, so it is not here.</summary>
    public static readonly IReadOnlyList<string> All = [Project, None];

    public static string LegalValues => string.Join(", ", All);

    public static bool IsKnown(string? value) => value is not null && All.Contains(value);
}

/// <summary>How one project assignment modifies a developer's own share default.</summary>
public static class ProjectShare
{
    public const string Inherit = "inherit";
    public const string Allow = "allow";
    public const string Deny = "deny";

    public const string Default = Inherit;

    public static bool IsKnown(string? value) => value is Inherit or Allow or Deny;
}

/// <summary>One person's assignment to one project. Epic 3 gives it behaviour.</summary>
public sealed record ProjectAssignment(string ProjectId, string Share);

/// <summary>
/// An instruction the client has not carried out yet: remove this project's folder from the
/// person's own vault. Epic 3 gives it behaviour; the field is reserved here so the record's shape
/// does not change under a store that is already writing files.
/// </summary>
public sealed record PendingFolderRemoval(string ProjectId, bool DeleteFolder, long At);

/// <summary>
/// One person, as this server knows them.
/// </summary>
/// <remarks>
/// <para>Fields whose BEHAVIOUR belongs to a later epic are still written here, each with a value
/// meaning "nothing has happened yet": <c>Active</c> and <c>LoginKeyVersion</c> (epic 2, blocking
/// and the login key), <c>Projects</c> and <c>PendingFolderRemovals</c> (epic 3). Reserving them
/// costs a few bytes per person; adding them later would mean a migration across records this
/// store has already written, which is the more expensive half of the same decision.</para>
/// <para><b>A record from a NEWER build must round-trip through this one.</b> <c>SchemaVersion</c>
/// says whether this build may act on a record at all; <see cref="Unknown"/> carries whatever a newer
/// build added, so that writing the record back — which every role change does — strips nothing.
/// The extension learned the same rule about key wraps: a wrap this build cannot use is one it must
/// carry.</para>
/// </remarks>
public sealed record MemberRecord(
    int SchemaVersion,
    string Email,
    string Role,
    bool Active,
    string ShareDefault,
    IReadOnlyList<ProjectAssignment> Projects,
    IReadOnlyList<PendingFolderRemoval> PendingFolderRemovals,
    int LoginKeyVersion,
    long UpdatedAt,
    string UpdatedBy)
{
    /// <summary>
    /// The version this build writes, and the highest it will read.
    ///
    /// <para>Bumped only when a change alters what an OLDER build would DO with a record — a field
    /// whose absence changes a permission, a value that means something new. A new optional field does
    /// not bump it: an older build carries it in <see cref="Unknown"/> and writes it back untouched, and
    /// bumping for an additive change would lock every older instance out of every record for no
    /// protection gained. A record without the field reads as <c>0</c> and is accepted — it names
    /// nothing this build does not know.</para>
    /// </summary>
    public const int CurrentSchemaVersion = 1;

    /// <summary>
    /// Properties this build does not know, carried so it can write them back.
    ///
    /// <para><see cref="System.Text.Json"/> drops an unknown property in silence, so an older server
    /// reading a record a newer one wrote and writing it back would strip whatever the newer build
    /// added, and nothing would notice.</para>
    /// <para>In the body, with a plain <c>set</c>, and both halves are forced. The serializer refuses an
    /// extension-data property that binds to a constructor argument; and the source generator turns an
    /// <c>init</c>-only property that is not a constructor parameter into exactly such an argument (an
    /// object-initializer pseudo-parameter — read off the generated metadata, where it appeared as
    /// <c>Position = 10</c>). So <c>init</c> fails at runtime the same way a positional parameter does.
    /// Nothing in this repository assigns it; <c>with</c> copies it like any other member.</para>
    /// </summary>
    [JsonExtensionData]
    public IDictionary<string, JsonElement>? Unknown { get; set; }

    /// <summary>
    /// The record a person has before one is written for them.
    ///
    /// <para>Computed rather than persisted, so <c>GET /api/org/me</c> answers correctly for a
    /// caller who has never synced without creating a file for a token that stored nothing. The
    /// same discipline as <see cref="OrgRecoveryConfig"/>'s "off is the shape, not a flag".</para>
    /// </summary>
    public static MemberRecord DefaultFor(string email, long now) => new(
        SchemaVersion: CurrentSchemaVersion,
        Email: Normalize(email),
        Role: MemberRole.Default,
        Active: true,
        ShareDefault: ShareDefaults.Default,
        Projects: [],
        PendingFolderRemovals: [],
        LoginKeyVersion: 0,
        UpdatedAt: now,
        UpdatedBy: string.Empty);

    /// <summary>One spelling of an email across the whole registry, and the one the key is cut from.</summary>
    public static string Normalize(string email) => email.Trim().ToLowerInvariant();

    /// <summary>
    /// Whether a record read off disk is one this build can act on.
    /// </summary>
    /// <remarks>
    /// <para>A record that fails this is <see cref="MemberLookup.Unavailable"/> — never "not
    /// registered", and not a person with no rights either. The first draft of this remark said a
    /// malformed record "is treated as not registered, which means the default", and the review round
    /// showed that sentence to be a privilege escalation in a defensive coat: the default is
    /// <c>member</c>, and a member may export, so corrupting one file promoted a developer.</para>
    /// <para>Every caller fails closed instead: the admin gate refuses, <c>GET /api/org/me</c> answers
    /// <c>503</c>, and the log names the file at Error. One bad file costs one person a refusal an
    /// operator can fix — not the company a permission nobody granted.</para>
    /// </remarks>
    public bool IsWellFormed() =>
        !string.IsNullOrWhiteSpace(Email)
        && MemberRole.IsKnown(Role)
        && ShareDefaults.IsKnown(ShareDefault)
        && Projects is not null
        && PendingFolderRemovals is not null;
}

/// <summary>
/// The three answers a registry lookup can give — and the reason there are three.
/// </summary>
/// <remarks>
/// <list type="bullet">
/// <item><b><see cref="Found"/></b> — a record this build can act on.</item>
/// <item><b><see cref="NotRegistered"/></b> — no file. The person has never synced, so the computed
/// default applies; that is why <c>GET /api/org/me</c> can answer before the disk agrees.</item>
/// <item><b><see cref="Unavailable"/></b> — a file exists and this build could not read it: malformed
/// JSON, an I/O error, a schema version it refuses. Every caller fails CLOSED — the admin gate refuses,
/// <c>GET /api/org/me</c> answers <c>503</c> with <c>Retry-After</c>, and the log names the file at
/// Error. A refusal a person can see and an operator can fix beats a silent promotion nobody can.</item>
/// </list>
/// <para>Two answers would have been the natural shape, and "unreadable means not registered" the
/// natural mapping. It is the escalation described on <see cref="MemberRecord.IsWellFormed"/>: a
/// corrupt file — a half-written record, a bad sector, a restore from a truncated archive — would turn
/// a developer into a member. The third state exists so that no caller can collapse it back to two.</para>
/// </remarks>
public enum MemberLookup
{
    Found,
    NotRegistered,
    Unavailable,
}

/// <summary>
/// A lookup's answer. <see cref="Record"/> is present exactly when <see cref="Status"/> is
/// <see cref="MemberLookup.Found"/>; callers switch on the status, never on the null — a null here is
/// what the escalation above was made of.
/// </summary>
public readonly record struct MemberLookupResult(MemberLookup Status, MemberRecord? Record)
{
    public static MemberLookupResult Found(MemberRecord record) => new(MemberLookup.Found, record);

    public static MemberLookupResult NotRegistered => new(MemberLookup.NotRegistered, null);

    public static MemberLookupResult Unavailable => new(MemberLookup.Unavailable, null);
}

/// <summary>
/// What an upsert did: the record as written, whether it CREATED it, and the record it started from.
/// Two callers emit <c>member.registered</c> only on a create — the sync hook, and an admin who sets a
/// role before the person's first sync — and neither can tell from the record alone.
/// </summary>
/// <remarks>
/// <see cref="Before"/> is the record the edit was applied to, read INSIDE the per-member lock — the
/// default record when the upsert created one. The admin routes emit <c>member.role_changed</c> only when
/// the value actually differs, and "differs from what" has to be the record the write replaced: a lookup
/// before the call would compare against whatever a concurrent admin had not yet written, and two
/// admins changing one person could then log the same transition twice or a transition that never
/// happened. The store already holds the baseline; handing it back costs nothing.
/// </remarks>
public readonly record struct UpsertResult(MemberRecord Record, bool Created, MemberRecord Before);

/// <summary>
/// What a client may do, derived from the role every time it is asked.
/// </summary>
/// <remarks>
/// <para><b>Derived, never stored.</b> A stored copy of a rule is a second source of truth, and the
/// two drift the first time somebody changes the rule without migrating the copies.</para>
/// <para><b>Half of this is a courtesy and the plan says which half.</b> The server enforces what
/// it can see — who may share with whom, who is blocked. Export, local backup and moving an entry
/// out of a project folder happen inside the extension, where the server has no visibility, so this
/// document is what an honest client obeys rather than a boundary it cannot cross. Written down
/// here because the natural mistake is to later "fix" a client-side ban by moving it to a server
/// that cannot observe the thing it would be banning.</para>
/// </remarks>
public sealed record PolicyDto(bool Export, string Share, bool MoveOutOfProject);

public static class MemberPolicy
{
    /// <summary>
    /// The policy for a role.
    ///
    /// <para>An unknown role — a record written by a NEWER server than this build — takes the
    /// developer's shape with sharing off, never the member's. Failing closed is the whole reason
    /// the branch exists: a role this build cannot understand is one whose permissions it cannot
    /// honestly grant.</para>
    /// </summary>
    public static PolicyDto For(string role, string shareDefault) => role switch
    {
        MemberRole.Admin or MemberRole.Member => new PolicyDto(true, ShareDefaults.Any, true),
        MemberRole.Dev => new PolicyDto(false, NormalizeShare(shareDefault), false),
        _ => new PolicyDto(false, ShareDefaults.None, false),
    };

    private static string NormalizeShare(string shareDefault) =>
        ShareDefaults.IsKnown(shareDefault) ? shareDefault : ShareDefaults.None;
}

/// <summary>
/// One project assignment as the client sees it. Only what THIS epic can know — the assignment; the
/// project's <c>Name</c> joins in epic 3, which owns the project store. Named there as a build item,
/// because a field in a documented response that no epic can fill is how a shape becomes a lie.
/// </summary>
public sealed record ProjectSelfDto(string ProjectId, string Share)
{
    public static ProjectSelfDto From(ProjectAssignment assignment) => new(assignment.ProjectId, assignment.Share);
}

/// <summary>
/// The document every client reads each cycle — <c>GET /api/org/me</c>: who the caller is to this
/// server, and what an honest client does about it.
/// </summary>
/// <remarks>
/// <para><c>CorpMode</c> first, because it decides how the rest is read: <c>false</c> means every other
/// field is the inert default and the client shows no corporate UI at all. <c>IsOfficer</c> rides
/// beside <c>Role</c> because the two are different facts from different sources — the roster is
/// configuration, the role is a record — and the client's admin predicate is
/// <c>role === 'admin' || isOfficer</c>. <c>ServerContract</c> repeats the response header so a client
/// that keeps the document can tell which server wrote it.</para>
/// </remarks>
public sealed record MemberSelfDto(
    bool CorpMode,
    string Email,
    string Role,
    bool Active,
    bool IsOfficer,
    string ShareDefault,
    IReadOnlyList<ProjectSelfDto> Projects,
    IReadOnlyList<PendingFolderRemoval> PendingFolderRemovals,
    PolicyDto Policy,
    int OfflineLeaseHours,
    int LoginKeyVersion,
    int ServerContract)
{
    /// <summary>The document for a record — stored or computed, the endpoint does not care which.</summary>
    public static MemberSelfDto For(
        MemberRecord record,
        bool corpMode,
        bool isOfficer,
        int offlineLeaseHours,
        int serverContract) => new(
            CorpMode: corpMode,
            Email: record.Email,
            Role: record.Role,
            Active: record.Active,
            IsOfficer: isOfficer,
            ShareDefault: record.ShareDefault,
            Projects: [.. record.Projects.Select(ProjectSelfDto.From)],
            PendingFolderRemovals: record.PendingFolderRemovals,
            Policy: MemberPolicy.For(record.Role, record.ShareDefault),
            OfflineLeaseHours: offlineLeaseHours,
            LoginKeyVersion: record.LoginKeyVersion,
            ServerContract: serverContract);

    /// <summary>
    /// What a server with no roster answers: the default record, no officer, the default lease. Computed
    /// from constants and nothing else, so it cannot differ between a personal server that never had an
    /// <c>org/</c> and one whose roster was removed — "corp mode off" has to mean off.
    /// </summary>
    public static MemberSelfDto Personal(string email, int serverContract) =>
        For(
            MemberRecord.DefaultFor(email, now: 0),
            corpMode: false,
            isOfficer: false,
            offlineLeaseHours: OrgSettingsDto.DefaultOfflineLeaseHours,
            serverContract: serverContract);
}

/// <summary>
/// One row of the admin's roster — <c>GET /api/org/members</c>. The record's facts, plus the one the
/// record cannot hold: whether the person is on the recovery roster. That comes from configuration,
/// and it is reported here because an officer cannot be given a registry role (the <c>409</c>), so a
/// list that showed the CTO as a plain <c>member</c> would invite exactly the edit the server refuses.
/// </summary>
public sealed record MemberListEntryDto(
    string Email,
    string Role,
    bool Active,
    string ShareDefault,
    IReadOnlyList<string> ProjectIds,
    bool IsOfficer,
    long UpdatedAt,
    string UpdatedBy)
{
    public static MemberListEntryDto For(MemberRecord record, bool isOfficer) => new(
        Email: record.Email,
        Role: record.Role,
        Active: record.Active,
        ShareDefault: record.ShareDefault,
        ProjectIds: [.. record.Projects.Select(p => p.ProjectId)],
        IsOfficer: isOfficer,
        UpdatedAt: record.UpdatedAt,
        UpdatedBy: record.UpdatedBy);
}

/// <summary>
/// What an admin sends to <c>PUT /api/org/members/{email}</c>: a role, a share default, or both.
/// </summary>
/// <remarks>
/// <para><b>Both null is a <c>400</c></b>, not a <c>200</c> that changes nothing: a client that sent an
/// empty body has a bug, and a success answer would hide it behind a re-stamped record.</para>
/// <para><b>A share default for somebody who is not a developer is stored, not refused.</b> It takes
/// effect only for <c>dev</c> — exactly as <see cref="MemberPolicy.For"/> reads it — and refusing it
/// would stop an admin from setting the shape first and demoting the person second, which is the
/// order that never leaves a developer with a share default nobody chose.</para>
/// <para>Nothing here can name who made the change: <c>updatedBy</c> is stamped from the verified
/// token, and a property in the body that claims otherwise is ignored by the deserializer.</para>
/// </remarks>
public sealed record SetMemberRequest(string? Role, string? ShareDefault)
{
    /// <summary>
    /// The <c>400</c> this request earns, or empty when the server can act on it. Names the legal
    /// values rather than echoing what was sent: the sentence is for an admin UI, not a log.
    /// </summary>
    public string Problem() =>
        NothingToChange() ?? RoleProblem() ?? ShareDefaultProblem() ?? string.Empty;

    /// <summary>The record as this request leaves it; a null field leaves that field alone.</summary>
    public MemberRecord ApplyTo(MemberRecord record) => record with
    {
        Role = Role ?? record.Role,
        ShareDefault = ShareDefault ?? record.ShareDefault,
    };

    private string? NothingToChange() =>
        Role is null && ShareDefault is null ? "Nothing to change: send a role, a shareDefault, or both." : null;

    private string? RoleProblem() =>
        Role is not null && !MemberRole.IsKnown(Role) ? $"Unknown role; the legal values are {MemberRole.LegalValues}." : null;

    private string? ShareDefaultProblem() =>
        ShareDefault is not null && !ShareDefaults.IsKnown(ShareDefault)
            ? $"Unknown shareDefault; the legal values are {ShareDefaults.LegalValues}."
            : null;
}
