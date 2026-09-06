using FluentAssertions;

namespace CredVaultServer.Tests;

/// <summary>
/// The project share rule as a truth table — the one boundary of epic 3 the server itself enforces.
/// </summary>
/// <remarks>
/// A table rather than a reading of the endpoint, for the reason <c>CallerStandingTests</c> gives: the
/// interesting part is the set of branches, and a branch nobody enumerated is the one that fails open.
/// Three outcomes, never a bool — a record this build cannot read must not be able to read as "not on
/// that project".
/// </remarks>
public sealed class ShareRuleTests
{
    private const string Project = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    private const string Other = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

    private static MemberRecord Member(string role, string share, params string[] projects) =>
        MemberRecord.DefaultFor("someone@example.com", 0) with
        {
            Role = role,
            ShareDefault = share,
            Projects = [.. projects.Select(p => new ProjectAssignment(p, ProjectMemberRequest.Inherit))],
        };

    private static ShareRuleFacts Facts(
        MemberLookupResult sender,
        string? projectId = Project,
        ProjectResult? project = null,
        MemberLookupResult? recipient = null,
        bool corpMode = true,
        bool senderIsOfficer = false) =>
        new(
            corpMode,
            senderIsOfficer,
            sender,
            projectId,
            () => project ?? ProjectResult.Of(new ProjectRecord(Project, "Atlas", "cto@example.com", 0, false, 0, "cto@example.com")),
            () => recipient ?? MemberLookupResult.Found(Member(MemberRole.Member, ShareDefaults.Project, Project)));

    private static MemberLookupResult Dev(params string[] projects) =>
        MemberLookupResult.Found(Member(MemberRole.Dev, ShareDefaults.Project, projects));

    [Fact]
    public void APersonalServerAsksNothingAndAllowsEverything()
    {
        // The registry is not consulted at all in personal mode: the facts carry a lookup that would
        // refuse, and the answer is still allow. Byte-identical behaviour is the promise.
        var facts = Facts(Dev(), projectId: null, corpMode: false);

        ShareRule.Decide(facts).Verdict.Should().Be(ShareVerdict.Allow);
    }

    [Fact]
    public void AnOfficerIsAllowedWithoutBeingLookedUp()
    {
        // An officer has no member record by construction, and the break-glass quorum must not be
        // lockable out of the road into a developer's vault by the very rule that fenced the developer.
        var facts = Facts(MemberLookupResult.NotRegistered, projectId: null, senderIsOfficer: true);

        ShareRule.Decide(facts).Verdict.Should().Be(ShareVerdict.Allow);
    }

    [Fact]
    public void AMemberSharesAsTheyDoToday()
    {
        // Decision 9 of the epic: members and admins are not fenced. The field is carried for them —
        // epic 4 logs it and story 4 binds it — but it gates nothing.
        var member = MemberLookupResult.Found(Member(MemberRole.Member, ShareDefaults.Project));

        ShareRule.Decide(Facts(member, projectId: null)).Verdict.Should().Be(ShareVerdict.Allow);
        ShareRule.Decide(Facts(member, projectId: Project)).Verdict.Should().Be(ShareVerdict.Allow);
        ShareRule.Decide(Facts(member, projectId: Other)).Verdict.Should().Be(ShareVerdict.Allow,
            "a member sharing out of a project they are not on is today's behaviour, untouched");
    }

    [Fact]
    public void SomebodyWhoNeverSyncedIsAMemberAndIsAllowed()
    {
        ShareRule.Decide(Facts(MemberLookupResult.NotRegistered, projectId: null))
            .Verdict.Should().Be(ShareVerdict.Allow);
    }

    [Fact]
    public void ASenderWhoseOwnRecordCannotBeReadIsUnavailable()
    {
        // The first question the rule asks is "is this person a developer", and a build that cannot
        // read the record cannot answer it. Fail closed, as every other gate here does.
        ShareRule.Decide(Facts(MemberLookupResult.Unavailable, projectId: null))
            .Verdict.Should().Be(ShareVerdict.Unavailable);
        ShareRule.Decide(Facts(MemberLookupResult.Unavailable, projectId: Project))
            .Verdict.Should().Be(ShareVerdict.Unavailable);
    }

    [Fact]
    public void ADeveloperSharingFromNoProjectIsRefused()
    {
        var decision = ShareRule.Decide(Facts(Dev(Project), projectId: null));

        decision.Verdict.Should().Be(ShareVerdict.Refuse);
        decision.Message.Should().Contain("project folder");
    }

    [Fact]
    public void ABlankProjectIdIsNoProjectRatherThanALookup()
    {
        foreach (var blank in new[] { "", "   " })
        {
            ShareRule.Decide(Facts(Dev(Project), projectId: blank))
                .Verdict.Should().Be(ShareVerdict.Refuse, $"'{blank}' names no project");
        }
    }

    [Fact]
    public void ADeveloperSharingFromAProjectTheyAreOnToSomebodyOnItIsAllowed()
    {
        ShareRule.Decide(Facts(Dev(Project))).Verdict.Should().Be(ShareVerdict.Allow);
    }

    [Fact]
    public void ADeveloperSharingFromAProjectTheyAreNotOnIsRefused()
    {
        // EffectiveShare answers `none` for an absent assignment — story 1's rule, and the reason it
        // does not fall through to the person's own default.
        var decision = ShareRule.Decide(Facts(Dev(Other)));

        decision.Verdict.Should().Be(ShareVerdict.Refuse);
        decision.Message.Should().Contain("may not share");
    }

    [Fact]
    public void ADeveloperWhoseAssignmentSaysNoneIsRefused()
    {
        var denied = MemberLookupResult.Found(
            MemberRecord.DefaultFor("dev@example.com", 0) with
            {
                Role = MemberRole.Dev,
                ShareDefault = ShareDefaults.Project,
                Projects = [new ProjectAssignment(Project, ShareDefaults.None)],
            });

        ShareRule.Decide(Facts(denied)).Verdict.Should().Be(ShareVerdict.Refuse);
    }

    [Fact]
    public void ADeveloperWhoseRoleDefaultIsNoneIsRefusedOnAnInheritedAssignment()
    {
        var inherited = MemberLookupResult.Found(Member(MemberRole.Dev, ShareDefaults.None, Project));

        ShareRule.Decide(Facts(inherited)).Verdict.Should().Be(ShareVerdict.Refuse,
            "`inherit` re-reads the role's default every time rather than freezing it at assignment");
    }

    [Fact]
    public void AProjectThatIsGoneOrClosedRefusesADevelopersShare()
    {
        var archived = ProjectResult.Of(
            new ProjectRecord(Project, "Atlas", "cto@example.com", 0, true, 0, "cto@example.com"));

        ShareRule.Decide(Facts(Dev(Project), project: ProjectResult.Absent))
            .Verdict.Should().Be(ShareVerdict.Refuse);
        ShareRule.Decide(Facts(Dev(Project), project: archived))
            .Verdict.Should().Be(ShareVerdict.Refuse, "a closed engagement is not a channel");
    }

    [Fact]
    public void AProjectFileThisBuildCannotReadIsUnavailableAndNeverARefusal()
    {
        ShareRule.Decide(Facts(Dev(Project), project: ProjectResult.Unreadable))
            .Verdict.Should().Be(ShareVerdict.Unavailable);
    }

    [Fact]
    public void ARecipientWhoIsNotOnTheProjectIsRefused()
    {
        var outsider = MemberLookupResult.Found(Member(MemberRole.Member, ShareDefaults.Project, Other));

        var decision = ShareRule.Decide(Facts(Dev(Project), recipient: outsider));

        decision.Verdict.Should().Be(ShareVerdict.Refuse);
        decision.Message.Should().Contain("recipient");
    }

    [Fact]
    public void ARecipientWhoNeverSyncedIsNotOnTheProject()
    {
        ShareRule.Decide(Facts(Dev(Project), recipient: MemberLookupResult.NotRegistered))
            .Verdict.Should().Be(ShareVerdict.Refuse);
    }

    [Fact]
    public void ARecipientRecordThisBuildCannotReadIsUnavailable()
    {
        // The escalation this rule is shaped to avoid: read as "not on the project", one corrupt file
        // becomes a refusal a person would read as a policy decision about a colleague.
        ShareRule.Decide(Facts(Dev(Project), recipient: MemberLookupResult.Unavailable))
            .Verdict.Should().Be(ShareVerdict.Unavailable);
    }

    [Fact]
    public void EveryRefusalSaysSomethingAPersonCanActOn()
    {
        var refusals = new[]
        {
            ShareRule.Decide(Facts(Dev(Project), projectId: null)),
            ShareRule.Decide(Facts(Dev(Other))),
            ShareRule.Decide(Facts(Dev(Project), project: ProjectResult.Absent)),
            ShareRule.Decide(Facts(Dev(Project), recipient: MemberLookupResult.NotRegistered)),
        };

        refusals.Should().AllSatisfy(r => r.Message.Length.Should().BeGreaterThan(20));
    }

    [Fact]
    public void NobodyExceptADeveloperCostsALookup()
    {
        // The project and the recipient are functions for this reason: an ordinary member's share is
        // the overwhelmingly common request here, and it used to read three registry files to reach a
        // branch that consults none of them — one of which the blocking gate had just read.
        var projectReads = 0;
        var recipientReads = 0;
        ShareRuleFacts Counting(MemberLookupResult sender, string? projectId) => new(
            CorpMode: true,
            SenderIsOfficer: false,
            Sender: sender,
            ProjectId: projectId,
            Project: () => { projectReads++; return ProjectResult.Absent; },
            Recipient: () => { recipientReads++; return MemberLookupResult.NotRegistered; });

        var member = MemberLookupResult.Found(Member(MemberRole.Member, ShareDefaults.Project, Project));
        ShareRule.Decide(Counting(member, Project)).Verdict.Should().Be(ShareVerdict.Allow);
        ShareRule.Decide(Counting(MemberLookupResult.NotRegistered, Project)).Verdict.Should().Be(ShareVerdict.Allow);
        ShareRule.Decide(Counting(Dev(Project), null)).Verdict.Should().Be(ShareVerdict.Refuse);

        projectReads.Should().Be(0, "nothing above reached the project");
        recipientReads.Should().Be(0, "and nothing above reached the recipient");

        ShareRule.Decide(Counting(Dev(Project), Project)).Verdict.Should().Be(ShareVerdict.Refuse);
        projectReads.Should().Be(1, "a developer naming a project reads it");
        recipientReads.Should().Be(0, "but stops at a project that is not there");
    }
}
