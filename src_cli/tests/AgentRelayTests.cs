using CredsBroker;
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
        //
        // The name is SHORT and the length is asserted, because this test is about a corpse and not
        // about the length limit — and it used to be about both by accident. A 32-character GUID
        // under macOS's temporary directory came to 105 characters, one over that platform's cap,
        // so the endpoint's constructor threw before the question was ever asked. It failed on both
        // macOS legs of the 1.7.0 release and blocked the CLI from publishing.
        var path = Path.Combine(Path.GetTempPath(), $"creds-corpse-{Environment.ProcessId}.sock");
        path.Length.Should().BeLessThanOrEqualTo(
            AgentRelay.MaxSocketPathLength,
            "this test is about a corpse, not about the path limit — see APathTooLongForASocketIsNotStale");
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
    
    /// <summary>
    /// A path too long to BE a domain socket is answered, not thrown at.
    /// </summary>
    /// <remarks>
    /// <para>macOS caps a unix socket path at 104 characters and Linux at 108, and .NET enforces
    /// that in <c>UnixDomainSocketEndPoint</c>'s constructor with an
    /// <c>ArgumentOutOfRangeException</c> — which is neither a <c>SocketException</c> nor an
    /// <c>IOException</c>, so it escaped both guards in this file. On macOS the temporary directory
    /// alone is fifty characters, which is how the release found it.</para>
    /// <para>It answers FALSE rather than true. "Stale" means "a corpse we may remove", and this
    /// method's caller deletes what it is told about — so a path nothing could ever have bound must
    /// not be reported as a socket to unlink. Nothing is serving there, and nothing is ours to
    /// delete either.</para>
    /// </remarks>
    [Fact]
    public async Task APathTooLongForASocketIsNotStale()
    {
        var directory = Directory.CreateTempSubdirectory("creds-relay-long");
        var path = Path.Combine(directory.FullName, new string('n', 200) + ".sock");
        await File.WriteAllTextAsync(path, string.Empty, TestContext.Current.CancellationToken);
        try
        {
            path.Length.Should().BeGreaterThan(AgentRelay.MaxSocketPathLength);
            (await AgentRelay.IsStaleAsync(path)).Should().BeFalse();
        }
        finally
        {
            Directory.Delete(directory.FullName, recursive: true);
        }
    }

    [Fact]
    public void TheLengthLimitIsThePlatformOwn()
    {
        // 104 on macOS, 108 elsewhere. Asserted so the constant cannot drift into "whatever number
        // made the test pass on the machine it was written on".
        AgentRelay.MaxSocketPathLength
            .Should().Be(OperatingSystem.IsMacOS() ? 104 : 108);
        AgentRelay.TooLongForSocket(new string('x', AgentRelay.MaxSocketPathLength)).Should().BeFalse();
        AgentRelay.TooLongForSocket(new string('x', AgentRelay.MaxSocketPathLength + 1)).Should().BeTrue();
    }

    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    public void TheRefusalNamesThePathTheLengthTheLimitAndTheWayOut(int over)
    {
        // The BOUNDARY and the overflow, parameterised — 104 and 105 on macOS, 108 and 109
        // elsewhere — rather than whatever length a runner's temporary directory happens to give.
        // Relying on that is how this defect reached a tag: the old test inherited its input from
        // the environment and so tested the corpse case on Linux and the length cap on macOS,
        // without saying either.
        var path = new string('x', AgentRelay.MaxSocketPathLength + over);

        AgentRelay.TooLongForSocket(path).Should().Be(over > 0);

        // And the sentence, because a refusal nobody can act on is a crash with better manners.
        var message = AgentRelay.TooLongMessage(path);
        message.Should().Contain(path.Length.ToString(), "the length they have");
        message.Should().Contain(AgentRelay.MaxSocketPathLength.ToString(), "the length they may have");
        message.Should().Contain(AgentRelay.SocketOverrideVariable, "and what to set to fix it");
    }

    [Fact]
    public async Task APathThatFitsIsNotRefused()
    {
        var fits = new string('x', AgentRelay.MaxSocketPathLength);

        (await AgentRelay.RefuseIfTooLongAsync(fits, BrokerContract.Current)).Should().BeNull(
            "null means carry on — the relay has a path it can bind");
    }

    [Fact]
    public async Task APathThatDoesNotFitIsRefusedWithTheUsageCode()
    {
        // The exit code matters as much as the sentence: the relay is started from a shell profile,
        // and a wrong path is the person's mistake to correct rather than a broker that is down.
        var tooLong = new string('x', AgentRelay.MaxSocketPathLength + 1);

        var refusal = await AgentRelay.RefuseIfTooLongAsync(tooLong, BrokerContract.Current);

        refusal.Should().Be(BrokerContract.Current.Exit("usage"));
    }
}
