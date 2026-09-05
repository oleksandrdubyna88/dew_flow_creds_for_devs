using System.Net;
using FluentAssertions;

namespace CredVaultServer.Tests;

/// <summary>
/// The version handshake: what the server tells every caller, and what it does about the version
/// a caller claims.
/// </summary>
/// <remarks>
/// <para>Built before anything is broken, which is the only time it can be built. A server is
/// updated by one person on one evening; the extension is updated by everyone on their own
/// schedule, so an old client meeting a new server is the normal state of the world. On the day a
/// response shape changes, the old clients are already in the field with no way to say what they
/// speak — so the mechanism has to predate the first breaking change or it never usefully
/// exists.</para>
/// <para>The refusal path is exercised by RAISING the configured minimum rather than by trusting
/// that it would work: with the default minimum equal to the current version there is no client
/// old enough to refuse, and a branch that cannot be reached is a branch that is discovered to be
/// wrong on the day it first matters.</para>
/// </remarks>
[Collection(ServerCollection.Name)]
public sealed class ContractVersionTests
{
    private static string Alice => $"alice@{VaultServer.Domain}";

    private static HttpClient Claiming(HttpClient client, string version)
    {
        client.DefaultRequestHeaders.Add(ContractVersion.Header, version);
        return client;
    }

    [Fact]
    public async Task EveryResponseNamesTheServersContractVersion()
    {
        // On a header rather than in /api/client-config: that endpoint's own documentation argues
        // for having exactly one field, and a header means a client learns the version from a call
        // it was already making instead of from an endpoint someone has to remember to keep.
        using var server = new VaultServer();
        using var client = server.ClientFor(Alice);

        var response = await client.GetAsync("/api/health", TestContext.Current.CancellationToken);

        response.Headers.GetValues(ContractVersion.Header)
            .Should().ContainSingle().Which.Should().Be(ContractVersion.Current.ToString());
    }

    [Fact]
    public async Task AClientThatSaysNothingIsServed()
    {
        // Every extension released before this mechanism existed sends no header. Refusing them
        // would turn a version handshake into an outage.
        using var server = new VaultServer();
        using var client = server.ClientFor(Alice);

        var response = await client.GetAsync("/api/whoami", TestContext.Current.CancellationToken);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task AClientSpeakingTheCurrentVersionIsServed()
    {
        using var server = new VaultServer();
        using var client = Claiming(server.ClientFor(Alice), ContractVersion.Current.ToString());

        var response = await client.GetAsync("/api/whoami", TestContext.Current.CancellationToken);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task AClientNEWERThanTheServerIsStillServed()
    {
        // It knows what it is doing better than an older server does, and it can see the server's
        // version on the response. Refusing here would make every server upgrade a flag day.
        using var server = new VaultServer();
        using var client = Claiming(server.ClientFor(Alice), "99");

        var response = await client.GetAsync("/api/whoami", TestContext.Current.CancellationToken);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task AGarbledHeaderIsServedRatherThanRefused()
    {
        // A proxy mangling a header must not look like an out-of-date extension.
        using var server = new VaultServer();
        using var client = Claiming(server.ClientFor(Alice), "not-a-number");

        var response = await client.GetAsync("/api/whoami", TestContext.Current.CancellationToken);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task AClientBelowTheConfiguredMinimumIsRefusedWithAReason()
    {
        using var server = new VaultServer(
            new Dictionary<string, string?> { ["Vault__MinimumClientContract"] = "2" });
        using var client = Claiming(server.ClientFor(Alice), "1");
        var ct = TestContext.Current.CancellationToken;

        var response = await client.GetAsync("/api/whoami", ct);

        response.StatusCode.Should().Be(HttpStatusCode.UpgradeRequired);
        (await response.Content.ReadAsStringAsync(ct)).Should().Contain("update the extension");
    }

    [Fact]
    public async Task TheRefusalComesBeforeAuthentication()
    {
        // An extension too old to be served should be told THAT, not handed a 401 about a token
        // that was never the problem — which is the message that sends someone re-checking their
        // sign-in for an hour.
        using var server = new VaultServer(
            new Dictionary<string, string?> { ["Vault__MinimumClientContract"] = "2" });
        using var client = Claiming(server.CreateClient(), "1"); // no token at all

        var response = await client.GetAsync("/api/whoami", TestContext.Current.CancellationToken);

        response.StatusCode.Should().Be(HttpStatusCode.UpgradeRequired);
    }

    // ---------------------------------------------------------------- the corp floor

    [Fact]
    public async Task CorpModeFloorsTheMinimumAtThreeEvenWithTheConfiguredDefault()
    {
        // Vault:MinimumClientContract is left at its default of 1. The roster alone raises the floor:
        // a contract-2 client does not know /api/org/me exists, so on a server with a policy it would
        // obey none of it — and nothing on either side would say so.
        using var server = Corp.Server();
        using var client = Claiming(server.ClientFor(Alice), "2");

        var response = await client.GetAsync("/api/whoami", TestContext.Current.CancellationToken);

        response.StatusCode.Should().Be(HttpStatusCode.UpgradeRequired);
    }

    [Fact]
    public async Task TheCorpRefusalNamesTheReason()
    {
        using var server = Corp.Server();
        using var client = Claiming(server.ClientFor(Alice), "2");
        var ct = TestContext.Current.CancellationToken;

        var response = await client.GetAsync("/api/whoami", ct);

        response.StatusCode.Should().Be(HttpStatusCode.UpgradeRequired);
        var body = await response.Content.ReadAsStringAsync(ct);
        body.Should().Contain("policy", "the sentence says WHY, not merely that the client is old");
        body.Should().Contain("update the extension");
    }

    [Fact]
    public async Task PersonalModeIsUnchanged()
    {
        // No roster, no floor: the configured minimum (1 by default) is the whole rule, exactly as
        // before this build. A personal deployment must not notice the corporate surface exists.
        using var server = new VaultServer();
        var ct = TestContext.Current.CancellationToken;

        using var two = Claiming(server.ClientFor(Alice), "2");
        (await two.GetAsync("/api/whoami", ct)).StatusCode.Should().Be(HttpStatusCode.OK);

        using var one = Claiming(server.ClientFor(Alice), "1");
        (await one.GetAsync("/api/whoami", ct)).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task ACorpServerServesAClientThatSpeaksThreeOrSaysNothing()
    {
        // The floor refuses what cannot read the policy. A current client can; a client that predates
        // the whole mechanism sends nothing and is served as legacy here too — refusing it would turn
        // the roster into an outage for every extension released before the header existed.
        using var server = Corp.Server();
        var ct = TestContext.Current.CancellationToken;

        using var current = Claiming(server.ClientFor(Alice), "3");
        (await current.GetAsync("/api/whoami", ct)).StatusCode.Should().Be(HttpStatusCode.OK);

        using var silent = server.ClientFor(Alice);
        (await silent.GetAsync("/api/whoami", ct)).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public void TheFloorNeverLowersAHigherConfiguredMinimum()
    {
        // Math.Max, and a test because the natural slip is an assignment: an operator who set 5
        // must not be handed 3 back by the roster.
        ContractVersion.MinimumFor(configured: 5, corpMode: true).Should().Be(5);
        ContractVersion.MinimumFor(configured: 1, corpMode: true).Should().Be(ContractVersion.OrgPolicyContract);
        ContractVersion.MinimumFor(configured: 1, corpMode: false).Should().Be(1);
    }
}
