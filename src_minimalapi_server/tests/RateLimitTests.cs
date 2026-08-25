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

    /// <summary>
    /// The anonymous half of the same bug. The app publishes no port — every request
    /// reaches it through nginx — so `RemoteIpAddress` is nginx's container address for
    /// every caller alive, and one bucket held the entire internet: enough unauthenticated
    /// traffic from one sender and the public health check and every legitimate 401/403
    /// start answering 429.
    ///
    /// nginx appends the true remote address to `X-Forwarded-For` ($proxy_add_x_forwarded_for),
    /// so the RIGHTMOST entry is the one it observed and the one worth partitioning on.
    /// A client that supplies its own left-hand entries cannot move it.
    /// </summary>
    [Fact]
    public async Task TwoAnonymousCallersFromDifferentAddressesDoNotShareOneBudget()
    {
        using var server = new VaultServer(TightLimit(4));
        using var first = server.CreateClient();
        using var second = server.CreateClient();
        first.DefaultRequestHeaders.Add("X-Forwarded-For", "203.0.113.7");
        second.DefaultRequestHeaders.Add("X-Forwarded-For", "198.51.100.9");
        var ct = TestContext.Current.CancellationToken;

        for (var i = 0; i < 8; i++)
        {
            await first.GetAsync("/api/whoami", ct);
        }
        var secondsFirstRequest = await second.GetAsync("/api/whoami", ct);

        secondsFirstRequest.StatusCode.Should().NotBe(
            HttpStatusCode.TooManyRequests,
            "an anonymous caller must not spend another anonymous caller's budget");
    }

    /// <summary>
    /// The other direction, which is what makes trusting the header safe rather than a
    /// new hole: a caller cannot mint themselves a fresh budget by prepending addresses
    /// of their own. Only the entry nginx appended counts.
    /// </summary>
    [Fact]
    public async Task AnAnonymousCallerCannotEscapeTheirBudgetByForgingTheHeader()
    {
        using var server = new VaultServer(TightLimit(3));
        using var client = server.CreateClient();
        var ct = TestContext.Current.CancellationToken;

        var statuses = new List<HttpStatusCode>();
        for (var i = 0; i < 8; i++)
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, "/api/whoami");
            // A different forged left-hand entry every time; the real one is appended
            // by the proxy and never changes.
            request.Headers.Add("X-Forwarded-For", $"10.9.9.{i}, 203.0.113.7");
            statuses.Add((await client.SendAsync(request, ct)).StatusCode);
        }

        statuses.Should().Contain(HttpStatusCode.TooManyRequests,
            "the partition must come from the address the proxy observed, not from what the caller wrote");
    }
}
