using CredsCli;
using FluentAssertions;

namespace CredsCli.Tests;

/// <summary>
/// The relay's decisions that can be made without a socket: where it listens, and which
/// announced address it is willing to dial.
/// </summary>
/// <remarks>
/// What these cannot cover is whether the agent ANSWERS — that is a fact about another process,
/// on the other side of a kernel boundary, and asserting it here would be the mistake phase 4a
/// was. It is covered by <c>scripts/wsl-agent-relay-itest.cjs</c>, which drives the real
/// <c>ssh-add</c> and <c>ssh-keygen -Y sign</c> inside WSL against the real agent.
/// </remarks>
public class AgentRelayTests
{
    [Fact]
    public void TheRuntimeDirectoryIsPreferredWhenTheDistributionProvidesOne()
    {
        // Per-user, already 0700, and cleaned up on logout — everything /tmp is not.
        AgentRelay.DefaultSocketPath("/run/user/1000", "jinx")
            .Should().Be(Path.Combine("/run/user/1000", "creds-agent.sock"));
    }

    [Fact]
    public void WithoutOneTheUserIsInTheNameSoTwoAccountsCannotCollide()
    {
        AgentRelay.DefaultSocketPath(null, "jinx").Should().Be("/tmp/creds-agent-jinx.sock");
        AgentRelay.DefaultSocketPath("   ", "jinx").Should().Be("/tmp/creds-agent-jinx.sock");
    }

    [Theory]
    [InlineData("../../etc/cron.d/evil", "etccrondevil")]
    [InlineData("a/b", "ab")]
    [InlineData("user name", "username")]
    [InlineData("ok_name-1", "ok_name-1")]
    public void TheUserComponentCannotLeaveTheDirectoryItNames(string user, string expected)
    {
        // A domain account arrives as DOMAIN\user, and a separator in a socket path is a path
        // somewhere else. Dots go too: no accumulation of them can compose a traversal.
        AgentRelay.SafeUser(user).Should().Be(expected);
    }

    [Fact]
    public void AUserNameWithNothingUsableInItStillYieldsAPath()
    {
        AgentRelay.SafeUser("...").Should().Be("user");
    }

    [Fact]
    public void AnAddressThatIsNotAPipeIsNotTreatedAsOne()
    {
        RelayPipe.PipeName("/run/user/1000/agent.sock").Should().BeNull();
        RelayPipe.PipeName("creds-for-devs-agent-42").Should().BeNull();
    }

    [Fact]
    public void APipeAddressGivesUpJustItsName()
    {
        // The prefix that cost an afternoon: written with one backslash too few it matches
        // nothing, every connection silently takes the unix-socket branch, and the relay reports
        // "announced but none answered" — which reads like a dead window, not a typo.
        RelayPipe.PipeName(@"\\.\pipe\creds-for-devs-agent-42")
            .Should().Be("creds-for-devs-agent-42");
    }

    [Fact]
    public void OnlyWindowsThatAnnouncedAnAgentAreCandidates()
    {
        var endpoints = new[]
        {
            new Endpoint(1, 100, null, "2026-08-26T10:00:00Z", null),
            new Endpoint(2, 200, null, "2026-08-26T11:00:00Z", @"\\.\pipe\a"),
            new Endpoint(3, 300, null, "2026-08-26T12:00:00Z", "   "),
            new Endpoint(4, 400, null, "2026-08-26T13:00:00Z", "/run/b.sock"),
        };

        RelayPipe.AgentAddresses(endpoints).Should().Equal([@"\\.\pipe\a", "/run/b.sock"]);
    }

    [Fact]
    public void TheOrderIsWhateverTheReaderGaveUs()
    {
        // Endpoints.Read already sorts newest first, and re-sorting here would be a second
        // opinion about which window a person means. Every candidate is tried in turn anyway.
        var endpoints = new[]
        {
            new Endpoint(1, 100, null, "2026-08-26T10:00:00Z", "first"),
            new Endpoint(2, 200, null, "2026-08-26T11:00:00Z", "second"),
        };

        RelayPipe.AgentAddresses(endpoints).Should().Equal(["first", "second"]);
    }

    [Fact]
    public async Task APathWithNoFileIsNotStale()
    {
        // Nothing to reclaim, and File.Delete on a missing path would be a needless syscall in
        // the ordinary first-run case.
        var path = Path.Combine(Path.GetTempPath(), $"creds-relay-absent-{Guid.NewGuid():N}.sock");

        (await AgentRelay.IsStaleAsync(path)).Should().BeFalse();
    }

    [Fact]
    public async Task AFileNobodyIsServingIsStale()
    {
        // The common case after a crash: the file outlives the process. Refusing it would mean a
        // manual cleanup every time, which is how a relay becomes something people stop using.
        var path = Path.Combine(Path.GetTempPath(), $"creds-relay-corpse-{Guid.NewGuid():N}.sock");
        await File.WriteAllTextAsync(path, string.Empty, TestContext.Current.CancellationToken);
        try
        {
            (await AgentRelay.IsStaleAsync(path)).Should().BeTrue();
        }
        finally
        {
            File.Delete(path);
        }
    }
}
