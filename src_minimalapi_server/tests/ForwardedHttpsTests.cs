using System.Net;
using FluentAssertions;

namespace CredVaultServer.Tests;

/// <summary>
/// <c>Vault:RequireForwardedHttps</c> is the switch an operator flips when the server sits
/// behind a TLS-terminating proxy. Its whole job is to make sure a request that did NOT
/// arrive over TLS is refused — so the interesting case is a request that says nothing at
/// all about its scheme, which is exactly what a plaintext request from anywhere looks like.
/// </summary>
[Collection(ServerCollection.Name)]
public sealed class ForwardedHttpsTests
{
    private static readonly Dictionary<string, string?> HttpsRequired = new()
    {
        ["Vault__RequireForwardedHttps"] = "true",
    };

    [Fact]
    public async Task WithHttpsRequired_ARequestCarryingNoProtocolHeaderIsRefused()
    {
        using var server = new VaultServer(HttpsRequired);
        using var alice = server.ClientFor($"alice@{VaultServer.Domain}");

        var response = await alice.GetAsync("/api/whoami", TestContext.Current.CancellationToken);

        response.StatusCode.Should().Be(
            HttpStatusCode.Forbidden,
            "omitting X-Forwarded-Proto must not be an easier way past the check than setting it to http");
    }

    [Fact]
    public async Task WithHttpsRequired_APlainHttpForwardIsRefused()
    {
        using var server = new VaultServer(HttpsRequired);
        using var alice = server.ClientFor($"alice@{VaultServer.Domain}");
        alice.DefaultRequestHeaders.Add("X-Forwarded-Proto", "http");

        var response = await alice.GetAsync("/api/whoami", TestContext.Current.CancellationToken);

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task WithHttpsRequired_AProperlyForwardedHttpsRequestIsServed()
    {
        using var server = new VaultServer(HttpsRequired);
        using var alice = server.ClientFor($"alice@{VaultServer.Domain}");
        alice.DefaultRequestHeaders.Add("X-Forwarded-Proto", "https");

        var response = await alice.GetAsync("/api/whoami", TestContext.Current.CancellationToken);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task WithHttpsRequired_TheHealthProbeStillAnswersOverPlainHttp()
    {
        // The container's own healthcheck talks to the app directly, inside the network,
        // with no proxy in front of it to add the header. Health carries no secret, so it
        // is the one endpoint exempt from the requirement.
        using var server = new VaultServer(HttpsRequired);
        using var client = server.CreateClient();

        var response = await client.GetAsync("/api/health", TestContext.Current.CancellationToken);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }
}
