using FluentAssertions;

namespace CredVaultServer.Tests;

/// <summary>
/// The role → policy table. Pure, so every row is a fact the suite pins — and it needs pinning: this
/// is the mapping every later corporate epic reads, and the client is told to trust the server's
/// answer rather than re-derive it.
/// </summary>
public sealed class MemberPolicyTests
{
    private static readonly PolicyDto Unrestricted = new(Export: true, Share: ShareDefaults.Any, MoveOutOfProject: true);

    private static readonly PolicyDto DeveloperNoSharing = new(Export: false, Share: ShareDefaults.None, MoveOutOfProject: false);

    [Theory]
    [InlineData(MemberRole.Admin, ShareDefaults.Project)]
    [InlineData(MemberRole.Admin, ShareDefaults.None)]
    [InlineData(MemberRole.Member, ShareDefaults.Project)]
    [InlineData(MemberRole.Member, ShareDefaults.None)]
    public void AnAdminOrMemberMayExportShareWithAnyoneAndMoveFreely_WhateverTheShareDefaultSays(
        string role,
        string shareDefault)
    {
        // The share default is a developer's setting. An admin may store one for a person before
        // demoting them, and until that day it must change nothing.
        MemberPolicy.For(role, shareDefault).Should().Be(Unrestricted);
    }

    [Fact]
    public void ADeveloperWithTheProjectDefaultMayShareInsideAProjectAndNothingElse()
    {
        MemberPolicy.For(MemberRole.Dev, ShareDefaults.Project)
            .Should().Be(new PolicyDto(Export: false, Share: ShareDefaults.Project, MoveOutOfProject: false));
    }

    [Fact]
    public void ADeveloperWithNoSharingMayReceiveAndSendNothing()
    {
        MemberPolicy.For(MemberRole.Dev, ShareDefaults.None).Should().Be(DeveloperNoSharing);
    }

    [Fact]
    public void ADeveloperWithAShareDefaultThisBuildDoesNotKnowGetsNoSharing()
    {
        // A value written by a newer server. Reading it as "project" would grant what this build
        // cannot vouch for; "none" is the honest answer.
        MemberPolicy.For(MemberRole.Dev, "everyone").Should().Be(DeveloperNoSharing);
        MemberPolicy.For(MemberRole.Dev, string.Empty).Should().Be(DeveloperNoSharing);
    }

    [Fact]
    public void AnUnknownRoleGetsTheMostRestrictivePolicy()
    {
        // A role this build cannot understand is one whose permissions it cannot honestly grant, so
        // it takes the developer's shape with sharing off — never the member's, which would be the
        // natural mistake and an escalation for the price of a typo in a newer server.
        MemberPolicy.For("superuser", ShareDefaults.Project).Should().Be(DeveloperNoSharing);
        MemberPolicy.For(string.Empty, ShareDefaults.Project).Should().Be(DeveloperNoSharing);
    }

    [Fact]
    public void TheDefaultRoleIsMemberAndMemberIsUnrestricted()
    {
        // Owner decision 2: a server upgrade changes nobody's rights on its own. If this ever fails,
        // the day a roster is configured every colleague loses export at once.
        MemberRole.Default.Should().Be(MemberRole.Member);
        MemberPolicy.For(MemberRole.Default, ShareDefaults.Default).Should().Be(Unrestricted);
    }
}
