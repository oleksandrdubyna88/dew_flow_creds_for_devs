using System.Net;
using FluentAssertions;

namespace CredVaultServer.Tests;

/// <summary>
/// The limiter exists to stop ONE caller from exhausting the server. If it cannot tell
/// callers apart it does the opposite: the first busy client silently locks out everybody
/// else, and behind a reverse proxy "everybody else" is the whole company.
/// </summary>
[Collection(ServerCollection.Name)]
public sealed class RateLimitTests
{
    private static Dictionary<string, string?> TightLimit(int permits) => new()
    {
        ["Vault__RateLimit__PermitLimit"] = permits.ToString(),
        ["Vault__RateLimit__WindowSeconds"] = "60",
    };

    [Fact]
    public async Task OneCallerBurningTheirBudgetDoesNotLockOutAnother()
    {
        using var server = new VaultServer(TightLimit(4));
        using var alice = server.ClientFor($"alice@{VaultServer.Domain}");
        using var bob = server.ClientFor($"bob@{VaultServer.Domain}");
        var ct = TestContext.Current.CancellationToken;

        // Alice spends her whole allowance and then some.
        for (var i = 0; i < 6; i++)
        {
            await alice.GetAsync("/api/whoami", ct);
        }

        // Bob has made no requests at all — his first must be served.
        var bobsFirstRequest = await bob.GetAsync("/api/whoami", ct);

        bobsFirstRequest.StatusCode.Should().Be(
            HttpStatusCode.OK,
            "the limiter must partition by the authenticated caller, not by a connection "
            + "property every caller shares behind a proxy");
    }

    [Fact]
    public async Task ACallerWhoExceedsTheirOwnBudgetIsThrottled()
    {
        using var server = new VaultServer(TightLimit(3));
        using var alice = server.ClientFor($"alice@{VaultServer.Domain}");
        var ct = TestContext.Current.CancellationToken;

        var statuses = new List<HttpStatusCode>();
        for (var i = 0; i < 8; i++)
        {
            statuses.Add((await alice.GetAsync("/api/whoami", ct)).StatusCode);
        }

        statuses.Should().Contain(HttpStatusCode.TooManyRequests,
            "the limit must still bite for the caller who actually exceeded it");
    }
}
