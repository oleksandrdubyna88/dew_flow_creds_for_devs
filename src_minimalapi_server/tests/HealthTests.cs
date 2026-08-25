using System.Net;
using System.Text.Json;
using FluentAssertions;

namespace CredVaultServer.Tests;

[Collection(ServerCollection.Name)]
public sealed class HealthTests
{
    [Fact]
    public async Task Health_IsReachableWithoutAToken()
    {
        using var server = new VaultServer();
        using var client = server.CreateClient();

        var response = await client.GetAsync("/api/health", TestContext.Current.CancellationToken);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Health_ReportsStorageWritable()
    {
        using var server = new VaultServer();
        using var client = server.CreateClient();

        var body = await client.GetStringAsync("/api/health", TestContext.Current.CancellationToken);

        body.Should().Contain("writable");
    }
}

/// <summary>
/// The self-probe that replaced curl in the container image: chiseled images have no
/// shell and no curl, so HEALTHCHECK execs the binary itself with --healthcheck and
/// the binary must know which URL it is serving from the same variable Kestrel reads.
/// </summary>
public sealed class HealthProbeUrlTests
{
    [Fact]
    public void BindAllBecomesLoopback()
    {
        Assert.Equal("http://127.0.0.1:8080/api/health", HealthProbe.UrlFrom("http://+:8080"));
        Assert.Equal("http://127.0.0.1:8080/api/health", HealthProbe.UrlFrom("http://*:8080"));
        Assert.Equal("http://127.0.0.1:8080/api/health", HealthProbe.UrlFrom("http://0.0.0.0:8080"));
    }

    [Fact]
    public void ConcreteHostIsKept()
    {
        Assert.Equal("http://127.0.0.1:5911/api/health", HealthProbe.UrlFrom("http://127.0.0.1:5911"));
    }

    [Fact]
    public void FirstOfSeveralUrlsWins()
    {
        Assert.Equal(
            "http://127.0.0.1:8080/api/health",
            HealthProbe.UrlFrom("http://+:8080;https://+:8443"));
    }

    [Fact]
    public void UnsetFallsBackToTheImageDefault()
    {
        Assert.Equal("http://127.0.0.1:8080/api/health", HealthProbe.UrlFrom(null));
        Assert.Equal("http://127.0.0.1:8080/api/health", HealthProbe.UrlFrom("  "));
    }

}

/// <summary>
/// The anonymous endpoint a client reads BEFORE it can sign in.
///
/// <para>Its own class because it is not a health probe: it exists so nobody has to
/// paste a scope into every developer's settings.json by hand, and it is separate from
/// /api/health because nginx exempts that path from rate limiting.</para>
/// </summary>
[Collection(ServerCollection.Name)]
public sealed class ClientConfigTests
{
    /// <summary>
    /// A client cannot authenticate until it knows which scope to ask Entra for, so
    /// this endpoint has to answer without a token. It is the one anonymous route
    /// besides health, and the reason it exists separately from health is that nginx
    /// exempts health from rate limiting.
    /// </summary>
    [Fact]
    public async Task TheClientConfigIsReadableWithoutSigningIn()
    {
        using var server = new VaultServer(new Dictionary<string, string?>
        {
            ["Auth__Microsoft__ClientScope"] = "api://d0757763-25f7-4ef0-bee9-b1b54af7831d/vault.access",
        });
        using var anonymous = server.CreateClient();
        var ct = TestContext.Current.CancellationToken;

        var response = await anonymous.GetAsync("/api/client-config", ct);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadAsStringAsync(ct);
        body.Should().Contain("api://d0757763-25f7-4ef0-bee9-b1b54af7831d/vault.access");
    }

    /// <summary>
    /// One field, and it stays one field. The next value somebody would be tempted to
    /// add is the allowed email domains, which on an anonymous endpoint tells an
    /// attacker whose addresses this server entertains.
    /// </summary>
    [Fact]
    public async Task TheClientConfigLeaksNothingBesidesTheScope()
    {
        using var server = new VaultServer();
        using var anonymous = server.CreateClient();
        var ct = TestContext.Current.CancellationToken;

        var body = await (await anonymous.GetAsync("/api/client-config", ct)).Content.ReadAsStringAsync(ct);

        using var parsed = JsonDocument.Parse(body);
        parsed.RootElement.EnumerateObject().Select(p => p.Name)
            .Should().BeEquivalentTo(["microsoftScope"]);
        body.Should().NotContain(VaultServer.Domain, "the allowed domains are not a client's business");
    }

    /// <summary>An unconfigured server answers with an empty scope rather than an error.</summary>
    [Fact]
    public async Task AnUnconfiguredScopeIsEmptyRatherThanAFailure()
    {
        using var server = new VaultServer();
        using var anonymous = server.CreateClient();
        var ct = TestContext.Current.CancellationToken;

        var body = await (await anonymous.GetAsync("/api/client-config", ct)).Content.ReadAsStringAsync(ct);

        using var parsed = JsonDocument.Parse(body);
        parsed.RootElement.GetProperty("microsoftScope").GetString().Should().BeEmpty();
    }
}
