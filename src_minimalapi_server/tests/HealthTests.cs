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
