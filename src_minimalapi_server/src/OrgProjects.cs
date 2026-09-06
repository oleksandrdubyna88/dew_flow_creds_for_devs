namespace CredVaultServer;

/// <summary>
/// A project, as this server knows it: a name people are assigned to, and an id everything else
/// cites.
/// </summary>
/// <remarks>
/// <para><b>Archived, never deleted.</b> The event log records assignments and shares by project id
/// and is kept forever, so a deleted project would turn every row that names it into an id nobody
/// can resolve. Archiving keeps the name readable and stops the project being used.</para>
/// </remarks>
public sealed record ProjectRecord(
    string Id,
    string Name,
    string CreatedBy,
    long CreatedAt,
    bool Archived,
    long UpdatedAt,
    string UpdatedBy)
{
    /// <summary>What a project's name may be: something a person can read, on one line.</summary>
    public const int MaxNameLength = 120;

    /// <summary>The complaint about this name, or empty when it is usable.</summary>
    public static string NameProblem(string? name)
    {
        var trimmed = name?.Trim() ?? string.Empty;
        if (trimmed.Length == 0)
        {
            return "A project needs a name.";
        }
        return trimmed.Length > MaxNameLength
            ? $"A project name is at most {MaxNameLength} characters; this one is {trimmed.Length}."
            : string.Empty;
    }
}

/// <summary>A project as any caller sees it. The internal stamps stay on the server.</summary>
public sealed record ProjectDto(string Id, string Name, bool Archived);

/// <summary>What an admin sends to create a project.</summary>
public sealed record CreateProjectRequest(string? Name)
{
    public string Problem() => ProjectRecord.NameProblem(Name);
}

/// <summary>
/// What an admin sends to change one: a new name, a new archived state, or both.
/// </summary>
/// <remarks>
/// <b>Both fields are nullable, and <c>Archived</c> is the one that matters.</b> A positional
/// <c>bool</c> the client omitted binds <c>false</c>, so a plain rename would silently UNARCHIVE the
/// project — the same trap <see cref="SetActiveRequest"/> documents one epic earlier, where the
/// omitted value would have blocked somebody. Null means "leave it as it is".
/// </remarks>
public sealed record UpdateProjectRequest(string? Name, bool? Archived)
{
    /// <summary>The <c>400</c> this request earns, or empty when the server can act on it.</summary>
    public string Problem()
    {
        if (Name is null && Archived is null)
        {
            return "Nothing to change: send name, archived, or both.";
        }
        return Name is null ? string.Empty : ProjectRecord.NameProblem(Name);
    }
}

/// <summary>What an admin sends to assign somebody, or to change their override.</summary>
public sealed record ProjectMemberRequest(string? Share)
{
    /// <summary>The one value that means "whatever this person's role gives them by default".</summary>
    public const string Inherit = "inherit";

    public string Problem() =>
        Share is not null && (Share == Inherit || ShareDefaults.IsKnown(Share))
            ? string.Empty
            : $"Unknown share; the legal values are {Inherit}, {ShareDefaults.LegalValues}.";
}

public static class OrgProjects
{
    /// <summary>
    /// What this person may do in this project — the per-assignment override when there is one, the
    /// role's own default otherwise.
    /// </summary>
    /// <remarks>
    /// <para><b>Somebody who is not assigned may do NOTHING here</b>, and that is the finding the plan
    /// round caught: falling through to their `shareDefault` would have given a member with a
    /// permissive default the run of every project on the server, assigned or not. An absent
    /// assignment is not a missing override — it is the absence of any relationship at all.</para>
    /// <para>The override is `inherit` when an admin assigned somebody without deciding, which is the
    /// common case: it means "whatever their role says", and it is re-read every time rather than
    /// frozen at assignment, so changing a person's role changes their projects with it.</para>
    /// </remarks>
    public static string EffectiveShare(MemberRecord member, string projectId)
    {
        var assignment = member.Projects.FirstOrDefault(p => p.ProjectId == projectId);
        if (assignment is null)
        {
            return ShareDefaults.None;
        }
        return assignment.Share == ProjectMemberRequest.Inherit ? member.ShareDefault : assignment.Share;
    }

    /// <summary>Whether this person is assigned to this project at all.</summary>
    public static bool IsAssigned(MemberRecord member, string projectId) =>
        member.Projects.Any(p => p.ProjectId == projectId);
}
