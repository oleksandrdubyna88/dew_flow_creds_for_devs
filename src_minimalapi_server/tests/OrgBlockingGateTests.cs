using System.Net;
using System.Text.Json;
using FluentAssertions;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace CredVaultServer.Tests;

/// <summary>
/// The blocking gate — <c>active: false</c> inside <c>RequireCaller</c> itself, so every door shuts the
/// same minute. The five branches the plan fixes are pinned here one by one: corp mode off passes, an
/// officer passes whatever their record says, a never-registered caller passes, an inactive record is
/// <c>403</c> with <c>X-Creds-Reason: account-deactivated</c>, and a record this build cannot read is
/// <c>503</c> — never a pass, because failing open there re-admits somebody a company has just locked out.
/// </summary>
/// <remarks>
/// The routes are enumerated from the server's own <see cref="EndpointDataSource"/>, never retyped: a
/// hand-written list of fifteen paths is a second copy of the route table, and the sixteenth route would
/// be the one the gate forgot. A companion test asserts the enumeration still sees the vault routes, so
/// a scan that matched nothing cannot pass forever.
/// </remarks>
[Collection(ServerCollection.Name)]
public sealed class OrgBlockingGateTests
{
    private static string Alice => $"alice@{VaultServer.Domain}";

    private static string Bob => $"bob@{VaultServer.Domain}";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    /// <summary>The two routes a caller reaches with no token at all — the only ones the gate never sees.</summary>
    private static readonly string[] AnonymousRoutes = ["/api/health", "/api/client-config"];

    private static IReadOnlyList<(string Method, string Path)> EveryRoute(VaultServer server) =>
    [
        .. server.Services.GetRequiredService<EndpointDataSource>().Endpoints
            .OfType<RouteEndpoint>()
            .SelectMany(endpoint => endpoint.Metadata.GetMetadata<HttpMethodMetadata>()!.HttpMethods
                .Select(method => (method, ConcreteRoute(endpoint.RoutePattern.RawText!)))),
    ];

    /// <summary>A template with its parameters filled — the gate runs before any handler reads one.</summary>
    private static string ConcreteRoute(string template) =>
        System.Text.RegularExpressions.Regex.Replace(template, "\\{[^}]+\\}", Guid.NewGuid().ToString());

    private static async Task<HttpResponseMessage> SendAsync(HttpClient client, string method, string path)
    {
        using var request = new HttpRequestMessage(new HttpMethod(method), path);
        if (method is "PUT" or "POST")
        {
            request.Content = new ByteArrayContent([]);
        }
        return await client.SendAsync(request, Ct);
    }

    [Fact]
    public async Task ABlockedCallerIsRefusedOnEveryAuthenticatedRouteWithTheReasonHeader()
    {
        // Bob synced, then his record was set inactive. From that moment every route that opens with
        // RequireCaller — the vault, the team, the shares, the recovery config, the corporate surface, the
        // officer levers — answers 403 with the machine-readable reason, so a client can tell "you were
        // deactivated" from "wrong domain" without matching on prose.
        using var server = Corp.Server();
        using var bob = server.ClientFor(Bob);
        (await Corp.SyncAsync(bob)).StatusCode.Should().Be(HttpStatusCode.NoContent);
        await Corp.WriteActiveByHandAsync(server, Bob, active: false);

        foreach (var (method, path) in EveryRoute(server))
        {
            var response = await SendAsync(bob, method, path);
            if (AnonymousRoutes.Contains(path))
            {
                response.Headers.Contains(CallerStanding.ReasonHeader).Should().BeFalse($"{method} {path} is anonymous and consults nobody");
                continue;
            }
            response.StatusCode.Should().Be(HttpStatusCode.Forbidden, $"{method} {path} must refuse a blocked caller");
            response.Headers.GetValues(CallerStanding.ReasonHeader).Should().Equal(
                [CallerStanding.AccountDeactivated], $"{method} {path} must say WHY in a header a client can match on");
        }
    }

    [Fact]
    public void TheRouteEnumerationStillSeesTheRoutesItIsMeantToGuard()
    {
        // The companion of the scan above: derived from the route table, it would pass forever over an
        // empty enumeration. This pins that the enumeration is alive and reaches the routes the plan names.
        using var server = Corp.Server();

        var routes = EveryRoute(server);

        routes.Should().Contain(("GET", "/api/vault")).And.Contain(("DELETE", "/api/vault"))
            .And.Contain(("POST", "/api/shares")).And.Contain(("GET", "/api/shares/sent"))
            .And.Contain(("GET", "/api/org-recovery/config")).And.Contain(("GET", "/api/org/me"))
            .And.Contain(("GET", "/api/org/members")).And.Contain(("GET", "/api/team"));
        routes.Count.Should().BeGreaterThan(30, "every route the server maps, not a hand-picked subset");
    }

    [Fact]
    public async Task ABlockedCallerCannotDeleteTheirOwnVault()
    {
        // The vault is kept for the officers' break-glass. A blocked person deleting it on the way out is
        // exactly the erasure blocking exists to prevent, so this one route gets its own assertion about
        // what is on disk afterwards.
        using var server = Corp.Server();
        using var bob = server.ClientFor(Bob);
        await Corp.SyncAsync(bob);
        await Corp.WriteActiveByHandAsync(server, Bob, active: false);

        var response = await bob.DeleteAsync("/api/vault", Ct);

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        File.Exists(Path.Combine(server.DataDir, "vaults", VaultStore.KeyFor(Bob) + ".bin")).Should().BeTrue("the vault stays for break-glass");
    }

    [Fact]
    public async Task TheRefusalOnTheCorporateSurfaceIsJsonNamingTheDeactivation()
    {
        // The corporate surface promises a JSON {error} on every refusal; the shared gate sets only a
        // status and a header, so RequireOrgCallerAsync has to know this new case to keep the promise.
        using var server = Corp.Server();
        using var bob = server.ClientFor(Bob);
        await Corp.SyncAsync(bob);
        await Corp.WriteActiveByHandAsync(server, Bob, active: false);

        var response = await bob.GetAsync("/api/org/me", Ct);

        (await Corp.RefusalAsync(response, HttpStatusCode.Forbidden)).Should().ContainEquivalentOf("deactivated");
        response.Headers.GetValues(CallerStanding.ReasonHeader).Should().Equal([CallerStanding.AccountDeactivated]);
    }

    [Fact]
    public async Task ADomainRefusalCarriesNoReasonHeader()
    {
        // The header exists to make the two 403s distinguishable. An outsider's refusal must therefore not
        // carry it — a client purging its key material on the header would otherwise purge for a typo in
        // the server address.
        using var server = Corp.Server();
        using var mallory = server.ClientFor("mallory@outside.test");

        var response = await mallory.GetAsync("/api/vault", Ct);

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        response.Headers.Contains(CallerStanding.ReasonHeader).Should().BeFalse();
    }

    [Fact]
    public async Task ACallerWhoseRecordCannotBeReadIs503WithRetryAfterAndNeverServed()
    {
        // The escalation epic 1 found, one gate later: "cannot read" served as "active" would re-admit
        // somebody a company just locked out because one file is corrupt. So 503 with Retry-After — on the
        // plain routes with no body, on the corporate surface with the JSON sentence /api/org/me already gives.
        using var server = Corp.Server();
        using var bob = server.ClientFor(Bob);
        await Corp.SyncAsync(bob);
        await Corp.CorruptRecordAsync(server, Bob);

        var vault = await bob.GetAsync("/api/vault", Ct);
        var me = await bob.GetAsync("/api/org/me", Ct);

        vault.StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable, "an unreadable record is never a pass");
        vault.Headers.RetryAfter.Should().NotBeNull();
        vault.Headers.Contains(CallerStanding.ReasonHeader).Should().BeFalse("unreadable is not deactivated");
        (await Corp.RefusalAsync(me, HttpStatusCode.ServiceUnavailable)).Should().Contain("administrator");
        me.Headers.RetryAfter.Should().NotBeNull();
    }

    [Fact]
    public async Task AnOfficerWhoseRecordSaysInactiveStillPasses()
    {
        // The roster is configuration. A gate that refused an officer on `active: false` would lock the
        // break-glass quorum out of the only road into a blocked developer's vault — the vault this whole
        // epic is about. The API refuses to write such a record (409); a hand-edit or a restore can.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        await Corp.SyncAsync(cto);
        await Corp.WriteActiveByHandAsync(server, Corp.Cto, active: false);

        var vault = await cto.GetAsync("/api/vault", Ct);
        var metrics = await cto.GetAsync("/api/metrics", Ct);

        vault.StatusCode.Should().Be(HttpStatusCode.OK, "an officer passes whatever their record says");
        vault.Headers.Contains(CallerStanding.ReasonHeader).Should().BeFalse();
        metrics.StatusCode.Should().Be(HttpStatusCode.OK, "the officer levers stay open to the quorum");
    }

    [Fact]
    public async Task AnOfficerWhoseRecordCannotBeReadStillPasses()
    {
        // The same reasoning for the unreadable case: a corrupt file must not be able to take the quorum
        // down. RequireAdmin already admits an officer without consulting the record; the caller gate must too.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        await Corp.SyncAsync(cto);
        await Corp.CorruptRecordAsync(server, Corp.Cto);

        var response = await cto.GetAsync("/api/metrics", Ct);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task ANeverRegisteredCallerPassesAndRegistersNobody()
    {
        // No file means the computed default, and the default is active. And the gate is a read.
        using var server = Corp.Server();
        using var alice = server.ClientFor(Alice);

        var response = await alice.GetAsync("/api/vault", Ct);

        response.StatusCode.Should().Be(HttpStatusCode.NotFound, "no vault yet — but served, not refused");
        response.Headers.Contains(CallerStanding.ReasonHeader).Should().BeFalse();
        Directory.Exists(Corp.OrgDir(server)).Should().BeFalse("passing the gate writes nothing");
    }

    [Fact]
    public async Task PersonalModeConsultsNoRegistryAndIsByteIdenticalWithOrWithoutALeftoverRecord()
    {
        // Two personal servers: one holding a record that says Bob is inactive — written by the test, a
        // leftover from a roster since removed — and one with no org/ at all. Same status, same headers
        // (bar the date), same body: corp mode off has to mean off.
        using var withLeftover = new VaultServer();
        await Corp.WriteActiveByHandAsync(withLeftover, Bob, active: false);
        using var bobWithLeftover = withLeftover.ClientFor(Bob);
        var leftover = await bobWithLeftover.GetAsync("/api/vault", Ct);
        var leftoverBody = await leftover.Content.ReadAsStringAsync(Ct);
        var leftoverHeaders = HeadersOf(leftover);

        using var clean = new VaultServer();
        using var bobClean = clean.ClientFor(Bob);
        var plain = await bobClean.GetAsync("/api/vault", Ct);

        leftover.StatusCode.Should().Be(HttpStatusCode.NotFound, "served — no vault yet — never refused");
        leftover.StatusCode.Should().Be(plain.StatusCode);
        leftoverBody.Should().Be(await plain.Content.ReadAsStringAsync(Ct));
        leftoverHeaders.Should().Equal(HeadersOf(plain));
        leftover.Headers.Contains(CallerStanding.ReasonHeader).Should().BeFalse();
    }

    private static IReadOnlyList<string> HeadersOf(HttpResponseMessage response) =>
    [
        .. response.Headers.Where(h => h.Key != "Date").Select(h => $"{h.Key}: {string.Join(",", h.Value)}").OrderBy(h => h, StringComparer.Ordinal),
    ];

    [Fact]
    public async Task ABlockWrittenUnderneathTheServerIsSeenOnTheVeryNextRequest()
    {
        // The store re-stats before answering from its cache. Bob was served once — the cache says active —
        // and then his record changes on disk by another writer: the next request must meet the 403, and
        // the one after the record flips back must be served again. A stale cache here is the one failure
        // the whole registry was scaffolding against.
        using var server = Corp.Server();
        using var bob = server.ClientFor(Bob);
        await Corp.SyncAsync(bob);
        (await bob.GetAsync("/api/vault", Ct)).StatusCode.Should().Be(HttpStatusCode.OK, "precondition: served, and cached as active");

        await Corp.WriteActiveByHandAsync(server, Bob, active: false);
        var blocked = await bob.GetAsync("/api/vault", Ct);
        await Corp.WriteActiveByHandAsync(server, Bob, active: true);
        var restored = await bob.GetAsync("/api/vault", Ct);

        blocked.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        restored.StatusCode.Should().Be(HttpStatusCode.OK, "unblock is reversible on the very next request");
        restored.Headers.Contains(CallerStanding.ReasonHeader).Should().BeFalse();
    }

    [Fact]
    public async Task TheRateLimiterStillPartitionsABlockedCallerOnTheirOwnBucket()
    {
        // The plan keeps the limiter untouched: it partitions on the email before the gate runs, so a
        // blocked caller's retries punish nobody else. Forty refused requests from Bob, then Alice is served.
        using var server = Corp.Server();
        using var bob = server.ClientFor(Bob);
        using var alice = server.ClientFor(Alice);
        await Corp.SyncAsync(bob);
        await Corp.WriteActiveByHandAsync(server, Bob, active: false);

        for (var i = 0; i < 40; i += 1)
        {
            (await bob.GetAsync("/api/vault", Ct)).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }

        (await alice.GetAsync("/api/vault", Ct)).StatusCode.Should().Be(HttpStatusCode.NotFound, "Alice has her own bucket");
    }

    /// <summary>The five branches as a truth table — the reading of RequireCaller, without a server.</summary>
    public static TheoryData<bool, bool, MemberLookupResult, Standing> TheFiveBranches => new()
    {
        { false, false, MemberLookupResult.Found(Inactive()), Standing.Admitted },   // corp mode off: the record is not even read
        { false, false, MemberLookupResult.Unavailable, Standing.Admitted },
        { true, true, MemberLookupResult.Found(Inactive()), Standing.Admitted },     // an officer, whatever the record says
        { true, true, MemberLookupResult.Unavailable, Standing.Admitted },
        { true, false, MemberLookupResult.NotRegistered, Standing.Admitted },        // never synced: the default, which is active
        { true, false, MemberLookupResult.Found(Active()), Standing.Admitted },
        { true, false, MemberLookupResult.Found(Inactive()), Standing.Deactivated },
        { true, false, MemberLookupResult.Unavailable, Standing.Unavailable },       // never a pass
    };

    private static MemberRecord Active() => MemberRecord.DefaultFor(Bob, now: 1);

    private static MemberRecord Inactive() => Active() with { Active = false };

    [Theory]
    [MemberData(nameof(TheFiveBranches))]
    public void TheGateDecidesEachBranchAsThePlanFixesIt(bool corpMode, bool isOfficer, MemberLookupResult lookup, Standing expected)
    {
        CallerStanding.Decide(corpMode, isOfficer, () => lookup).Should().Be(expected);
    }

    [Fact]
    public void TheRegistryIsNotConsultedForAnOfficerOrOnAPersonalServer()
    {
        // The lookup is a function so it can run only on the branch that needs it: personal mode stays
        // byte-identical whatever org/ holds, and an officer cannot be locked out by their own record.
        var consulted = 0;
        MemberLookupResult Count()
        {
            consulted += 1;
            return MemberLookupResult.Unavailable;
        }

        CallerStanding.Decide(corpMode: false, isOfficer: false, Count).Should().Be(Standing.Admitted);
        CallerStanding.Decide(corpMode: true, isOfficer: true, Count).Should().Be(Standing.Admitted);
        consulted.Should().Be(0);
        CallerStanding.Decide(corpMode: true, isOfficer: false, Count).Should().Be(Standing.Unavailable);
        consulted.Should().Be(1, "and it IS consulted for everybody else");
    }

    [Fact]
    public async Task TheReasonHeaderIsNotOnASuccess()
    {
        using var server = Corp.Server();
        using var bob = server.ClientFor(Bob);
        await Corp.SyncAsync(bob);

        var response = await bob.GetAsync("/api/vault", Ct);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        response.Headers.Contains(CallerStanding.ReasonHeader).Should().BeFalse();
        JsonDocument.Parse(await bob.GetStringAsync("/api/org/me", Ct)).RootElement.GetProperty("active").GetBoolean().Should().BeTrue();
    }
}
