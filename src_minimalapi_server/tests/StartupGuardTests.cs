using FluentAssertions;

namespace CredVaultServer.Tests;

/// <summary>
/// The server refuses to start rather than run in a state that looks like a network
/// fault. Each guard here exists because the alternative is a server that comes up,
/// reports healthy, and answers every request with a status nobody can explain.
/// </summary>
[Collection(ServerCollection.Name)]
public sealed class StartupGuardTests
{
    private static Exception? StartupFailure(Dictionary<string, string?> overrides)
    {
        using var server = new VaultServer(overrides);
        try
        {
            // The host is built lazily; this is what actually runs Program.cs.
            using var client = server.CreateClient();
            return null;
        }
        catch (Exception ex)
        {
            return ex;
        }
    }

    [Fact]
    public void ASigningKeyTooShortForHmacSha256IsRefused()
    {
        // HS256 needs a 256-bit key. A shorter one does not fail loudly: the scheme
        // registers, the server starts, health reports OK — and every single request
        // is rejected with 401, with nothing in the log to say why.
        var failure = StartupFailure(new Dictionary<string, string?>
        {
            ["Auth__Local__SigningKey"] = "far-too-short",
        });

        failure.Should().NotBeNull("a key that makes every request 401 must stop the server, not be accepted");
        (failure!.ToString()).Should().Contain("32", "the message has to say what the requirement is");
    }

    [Fact]
    public void AKeyOfExactlyThirtyTwoBytesIsAccepted()
    {
        var failure = StartupFailure(new Dictionary<string, string?>
        {
            ["Auth__Local__SigningKey"] = new string('k', 32),
        });

        failure.Should().BeNull("32 bytes is the documented minimum, so it must work");
    }

    [Fact]
    public void NoAuthenticationSchemeAtAllIsRefused()
    {
        var failure = StartupFailure(new Dictionary<string, string?>
        {
            ["Auth__Local__SigningKey"] = "",
            ["Auth__Microsoft__Tenant"] = "",
            ["Auth__Google__Enabled"] = "false",
        });

        failure.Should().NotBeNull();
        failure!.ToString().Should().Contain("authentication scheme");
    }

    [Fact]
    public void AnEmptyDomainAllowListWithoutTheExplicitOptOutIsRefused()
    {
        var failure = StartupFailure(new Dictionary<string, string?>
        {
            ["Vault__AllowedDomains"] = "",
            ["Vault__AllowAnyDomain"] = "false",
        });

        failure.Should().NotBeNull();
        failure!.ToString().Should().Contain("AllowedDomains");
    }

    [Fact]
    public void AnEmptyDomainAllowListIsFineWhenItIsAskedForExplicitly()
    {
        var failure = StartupFailure(new Dictionary<string, string?>
        {
            ["Vault__AllowedDomains"] = "",
            ["Vault__AllowAnyDomain"] = "true",
        });

        failure.Should().BeNull("running without a domain boundary is allowed — but only on purpose");
    }
}
