using System.Net;
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
