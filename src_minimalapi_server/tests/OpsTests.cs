using System.Net;
using System.Text.Json;
using FluentAssertions;

namespace CredVaultServer.Tests;

/// <summary>
/// Server-ops items 2, 5 and 6 and roadmap E1 (2026-08-28): the health verdict is cached while
/// good, a network data directory is refused at startup, the officers' metrics page answers
/// officers only, vault writes have a byte budget, and the runtime's support window is a line.
/// </summary>
public sealed class HealthCacheTests
{
    [Fact]
    public void AGoodVerdictIsServedFromMemoryInsideTheWindow_AndProbedAgainAfterIt()
    {
        var cache = new HealthCache(TimeSpan.FromSeconds(5));
        var t0 = new DateTimeOffset(2026, 8, 28, 12, 0, 0, TimeSpan.Zero);
        cache.Check(() => true, t0).Should().BeTrue();
        cache.Check(() => true, t0.AddSeconds(1)).Should().BeTrue();
        cache.Check(() => true, t0.AddSeconds(4)).Should().BeTrue();
        cache.Probes.Should().Be(1, "three calls inside the window hit the disk once");
        cache.Check(() => true, t0.AddSeconds(5)).Should().BeTrue();
        cache.Probes.Should().Be(2, "the window turned");
    }

    [Fact]
    public void AFailureIsNeverCached_EveryCallProbesUntilItIsGoodAgain()
    {
        var cache = new HealthCache(TimeSpan.FromSeconds(5));
        var t0 = new DateTimeOffset(2026, 8, 28, 12, 0, 0, TimeSpan.Zero);
        cache.Check(() => false, t0).Should().BeFalse();
        cache.Check(() => false, t0.AddMilliseconds(100)).Should().BeFalse();
        cache.Probes.Should().Be(2, "a bad verdict is re-checked on every call (the owner: 'every call')");
        cache.Check(() => true, t0.AddMilliseconds(200)).Should().BeTrue();
        cache.Check(() => false, t0.AddMilliseconds(300)).Should().BeTrue("the good verdict is cached for the window");
        cache.Probes.Should().Be(3);
    }
}

public sealed class DataDirCheckTests
{
    private const string Mounts =
        "sysfs /sys sysfs rw 0 0\n"
        + "/dev/sda1 / ext4 rw,relatime 0 0\n"
        + "nas:/export/vault /mnt/vault nfs4 rw,vers=4.2 0 0\n"
        + "//fileserver/share /mnt/smb cifs rw 0 0\n"
        + "/dev/sdb1 /mnt/local\\040disk ext4 rw 0 0\n";

    [Theory]
    [InlineData("/mnt/vault/data", "nfs4")]
    [InlineData("/mnt/vault", "nfs4")]
    [InlineData("/mnt/smb/creds", "cifs")]
    public void ANetworkMountIsNamedByItsFilesystemType(string path, string expected)
    {
        DataDirCheck.NetworkMountOf(path, Mounts).Should().Be(expected);
    }

    [Theory]
    [InlineData("/var/lib/cred-vault")]
    [InlineData("/mnt/local disk/data")]
    [InlineData("/mnt/vaultx")]
    public void ALocalMountIsNotNetwork_AndAPrefixIsNotAMatch(string path)
    {
        DataDirCheck.NetworkMountOf(path, Mounts).Should().BeNull();
    }

    [Fact]
    public void AUncPathIsRefused_ANetworkMountIsRefused_TheOverrideAllowsBoth()
    {
        DataDirCheck.Judge(@"\\nas\vault", allowNetwork: false, () => null).Should().Contain("UNC");
        DataDirCheck.Judge("/mnt/vault/data", allowNetwork: false, () => Mounts).Should().Contain("nfs4").And.Contain(DataDirCheck.OverrideKey);
        DataDirCheck.Judge("/var/lib/cred-vault", allowNetwork: false, () => Mounts).Should().BeNull();
        DataDirCheck.Judge("/var/lib/cred-vault", allowNetwork: false, () => null).Should().BeNull("no mount table, no verdict beyond UNC");
        DataDirCheck.Judge(@"\\nas\vault", allowNetwork: true, () => null).Should().BeNull();
        DataDirCheck.Judge("/mnt/vault/data", allowNetwork: true, () => Mounts).Should().BeNull();
    }

    [Fact]
    public void TheServerRefusesToStartOnANetworkDataDir_UnlessTold()
    {
        var unc = @"\\nas\vault\data";
        var refused = () =>
        {
            using var server = new VaultServer(new Dictionary<string, string?> { ["Vault__DataDir"] = unc });
            server.CreateClient();
        };
        refused.Should().Throw<Exception>().WithMessage("*atomic rename*");
    }
}

public sealed class ByteBudgetTests
{
    private static readonly DateTimeOffset T0 = new(2026, 8, 28, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public void WritesAreChargedPerCaller_TheOneOverTheBudgetIsRefusedWithTheSecondsUntilTheWindowTurns()
    {
        var budget = new ByteBudget(1000, TimeSpan.FromMinutes(10));
        budget.TryConsume("alice", 600, T0).Allowed.Should().BeTrue();
        budget.TryConsume("alice", 400, T0.AddSeconds(30)).Allowed.Should().BeTrue("exactly the budget is allowed");
        var refused = budget.TryConsume("alice", 1, T0.AddSeconds(60));
        refused.Allowed.Should().BeFalse();
        refused.RetryAfterSeconds.Should().Be(540, "the window started at T0 and is ten minutes long");
        budget.TryConsume("bob", 1000, T0.AddSeconds(60)).Allowed.Should().BeTrue("another caller has a budget of their own");
    }

    [Fact]
    public void ARefusedWriteSpendsNothing_AndTheWindowTurns()
    {
        var budget = new ByteBudget(1000, TimeSpan.FromMinutes(10));
        budget.TryConsume("alice", 1000, T0);
        budget.TryConsume("alice", 500, T0.AddSeconds(1)).Allowed.Should().BeFalse();
        budget.TryConsume("alice", 1000, T0.AddMinutes(10)).Allowed.Should().BeTrue("a new window, a full budget — the refused write did not count");
    }
}

public sealed class RuntimeSupportTests
{
    [Fact]
    public void AKnownLtsSaysUntilWhen_AndHowManyDays()
    {
        var verdict = RuntimeSupport.Describe(new Version(10, 0, 3), new DateOnly(2026, 8, 28));
        verdict.Runtime.Should().Be(".NET 10.0.3");
        verdict.SupportEnds.Should().Be(new DateOnly(2028, 11, 14));
        verdict.Urgent.Should().BeFalse();
        verdict.Line.Should().Contain("LTS").And.Contain("2028-11-14").And.Contain("days left");
    }

    [Fact]
    public void InsideTheLastQuarterItIsUrgent_PastTheEndItSaysSo()
    {
        RuntimeSupport.Describe(new Version(8, 0, 0), new DateOnly(2026, 9, 1)).Urgent.Should().BeTrue("70 days left");
        var past = RuntimeSupport.Describe(new Version(9, 0, 0), new DateOnly(2026, 8, 28));
        past.DaysLeft.Should().BeNegative();
        past.Line.Should().Contain("PAST end of support");
    }

    [Fact]
    public void AnUnknownMajorIsUnknown_NotGuessed()
    {
        var verdict = RuntimeSupport.Describe(new Version(12, 0, 0), new DateOnly(2026, 8, 28));
        verdict.SupportEnds.Should().BeNull();
        verdict.Line.Should().Contain("unknown");
    }
}

[Collection(ServerCollection.Name)]
public sealed class MetricsEndpointTests
{
    private const string Cto = "cto@example.com";
    private const string Lead = "lead@example.com";
    private const string Devops = "devops@example.com";

    private static VaultServer Server() => new(new Dictionary<string, string?>
    {
        ["Vault__CorpRecovery__OfficerEmails"] = $"{Cto},{Lead},{Devops}",
        ["Vault__CorpRecovery__Threshold"] = "2",
    });

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task AnOfficerReadsTheMetrics_WithTheVaultsAndTheRequestsCounted()
    {
        using var server = Server();
        using var alice = server.ClientFor("alice@example.com");
        await alice.PutAsync("/api/vault", new ByteArrayContent(new byte[2048]), Ct);

        using var officer = server.ClientFor(Cto);
        var response = await officer.GetAsync("/api/metrics", Ct);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(Ct));
        var root = doc.RootElement;
        root.GetProperty("service").GetString().Should().Be("cred-vault-server");
        root.GetProperty("vaults").GetInt32().Should().Be(1);
        root.GetProperty("vaultBytesOnDisk").GetInt64().Should().Be(2048);
        root.GetProperty("vaultWrites").GetInt64().Should().Be(1);
        root.GetProperty("vaultBytesWritten").GetInt64().Should().Be(2048);
        root.GetProperty("requests").GetInt64().Should().BeGreaterThanOrEqualTo(1, "the PUT was counted before this GET was answered");
        root.GetProperty("runtimeSupport").GetString().Should().Contain(".NET");
        root.GetProperty("uptimeSeconds").GetInt64().Should().BeGreaterThanOrEqualTo(0);
    }

    [Fact]
    public async Task AMemberIsRefused_AnAnonymousCallerToo()
    {
        using var server = Server();
        using var member = server.ClientFor("alice@example.com");
        (await member.GetAsync("/api/metrics", Ct)).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        using var nobody = server.CreateClient();
        (await nobody.GetAsync("/api/metrics", Ct)).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task WithoutARoster_ThereAreNoOfficers_AndTheEndpointIs403ForEveryone()
    {
        using var server = new VaultServer();
        using var alice = server.ClientFor("alice@example.com");
        (await alice.GetAsync("/api/metrics", Ct)).StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }
}

[Collection(ServerCollection.Name)]
public sealed class ByteBudgetEndpointTests
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task TheWriteThatSpendsTheBudgetIs429_WithARetryAfter()
    {
        using var server = new VaultServer(new Dictionary<string, string?>
        {
            ["Vault__RateLimit__BytesPerWindow"] = "3000",
            ["Vault__RateLimit__ByteWindowSeconds"] = "600",
        });
        using var alice = server.ClientFor("alice@example.com");
        (await alice.PutAsync("/api/vault", new ByteArrayContent(new byte[2000]), Ct)).StatusCode.Should().Be(HttpStatusCode.NoContent);
        var refused = await alice.PutAsync("/api/vault", new ByteArrayContent(new byte[2000]), Ct);
        refused.StatusCode.Should().Be(HttpStatusCode.TooManyRequests);
        refused.Headers.RetryAfter.Should().NotBeNull();
        refused.Headers.RetryAfter!.Delta!.Value.TotalSeconds.Should().BeInRange(1, 600);
        (await alice.PutAsync("/api/vault", new ByteArrayContent(new byte[900]), Ct)).StatusCode.Should().Be(HttpStatusCode.NoContent, "a refused write spent nothing — 1000 bytes were still free");
    }
}
