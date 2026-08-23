using System.Net;
using System.Net.Http.Headers;
using System.Security.Claims;
using FluentAssertions;

namespace CredVaultServer.Tests;

/// <summary>
/// The server's whole authorization model is "the email comes from a verified token".
/// Every test here presents a token that must NOT be accepted.
/// </summary>
[Collection(ServerCollection.Name)]
public sealed class AuthenticationTests
{
    private static HttpClient WithToken(VaultServer server, string token)
    {
        var client = server.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }

    [Fact]
    public async Task NoToken_Is401()
    {
        using var server = new VaultServer();
        using var client = server.CreateClient();

        var response = await client.GetAsync("/api/vault", TestContext.Current.CancellationToken);

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task CallerOutsideTheAllowedDomain_Is403()
    {
        using var server = new VaultServer();
        using var client = server.ClientFor("eve@evil.example");

        var response = await client.GetAsync("/api/whoami", TestContext.Current.CancellationToken);

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task UnsignedAlgNoneToken_IsRejected()
    {
        using var server = new VaultServer();
        using var client = WithToken(server, Tokens.ForgedNoneAlg($"attacker@{VaultServer.Domain}"));

        var response = await client.GetAsync("/api/whoami", TestContext.Current.CancellationToken);

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task TokenSignedWithAnotherKey_IsRejected()
    {
        using var server = new VaultServer();
        var forged = Tokens.For($"attacker@{VaultServer.Domain}", "a-completely-different-key-32bytes!!");
        using var client = WithToken(server, forged);

        var response = await client.GetAsync("/api/whoami", TestContext.Current.CancellationToken);

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task TokenWithoutAnEmailClaim_IsRejected()
    {
        using var server = new VaultServer();
        var anonymous = Tokens.WithClaims(
            VaultServer.LocalSigningKey, [new Claim("sub", "no-email-here")]);
        using var client = WithToken(server, anonymous);

        var response = await client.GetAsync("/api/whoami", TestContext.Current.CancellationToken);

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task ExpiredToken_IsRejected()
    {
        using var server = new VaultServer();
        var expired = Tokens.WithClaims(
            VaultServer.LocalSigningKey,
            [new Claim("email", $"alice@{VaultServer.Domain}")],
            DateTime.UtcNow.AddMinutes(-5));
        using var client = WithToken(server, expired);

        var response = await client.GetAsync("/api/whoami", TestContext.Current.CancellationToken);

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task WhoAmI_ReturnsTheEmailFromTheToken()
    {
        using var server = new VaultServer();
        using var client = server.ClientFor($"alice@{VaultServer.Domain}", "Alice");

        var body = await client.GetStringAsync("/api/whoami", TestContext.Current.CancellationToken);

        body.Should().Contain($"alice@{VaultServer.Domain}").And.Contain("Alice");
    }
}
