using System.Net;
using System.Text.Json;
using FluentAssertions;

namespace CredVaultServer.Tests;

/// <summary>
/// Who may read <c>GET /api/org/me</c>, and as whom. The gate is the shared <c>RequireCaller</c>; what is
/// pinned here is the corporate surface's own promise on top of it — every refusal is a JSON
/// <c>{error}</c> — and that the registry knows one person under one key however their token spells them.
/// </summary>
[Collection(ServerCollection.Name)]
public sealed class OrgMeAuthorizationTests
{
    private static string Alice => $"alice@{VaultServer.Domain}";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static async Task<string> RefusalAsync(HttpResponseMessage response, HttpStatusCode expected)
    {
        response.StatusCode.Should().Be(expected);
        response.Content.Headers.ContentType!.MediaType.Should().Be("application/json", "an admin UI has to show WHY");
        var body = await response.Content.ReadAsStringAsync(Ct);
        return JsonDocument.Parse(body).RootElement.GetProperty("error").GetString()!;
    }

    [Fact]
    public async Task WithoutATokenOrgMeIs401WithAJsonBody()
    {
        using var server = Corp.Server();
        using var anonymous = server.CreateClient();

        var response = await anonymous.GetAsync("/api/org/me", Ct);

        (await RefusalAsync(response, HttpStatusCode.Unauthorized)).Should().NotBeNullOrWhiteSpace();
    }

    [Fact]
    public async Task FromOutsideTheAllowedDomainOrgMeIs403WithAJsonBody()
    {
        // 403, not 401: the token is valid and the caller is simply not from a domain this deployment
        // serves. RequireCaller refuses before the handler runs, so nothing here enrols an outsider.
        using var server = Corp.Server();
        using var mallory = server.ClientFor("mallory@outside.test");

        var response = await mallory.GetAsync("/api/org/me", Ct);

        (await RefusalAsync(response, HttpStatusCode.Forbidden)).Should().NotBeNullOrWhiteSpace();
        Directory.Exists(Corp.OrgDir(server)).Should().BeFalse("a refused caller registers nothing");
    }

    [Fact]
    public async Task AnEmailDifferingOnlyInCaseAndSpaceResolvesToTheSameRecord()
    {
        // The whole registry is keyed through VaultStore.KeyFor, which trims and lowercases — and the
        // token's email is normalised before it ever reaches a handler. Proved end to end: a second
        // record for "the same person, spelt differently" is how one colleague would get two roles.
        using var server = Corp.Server();
        using var shouted = server.ClientFor("  Alice@Example.COM  ");
        using var alice = server.ClientFor(Alice);

        (await Corp.SyncAsync(shouted)).StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await Corp.SyncAsync(alice)).StatusCode.Should().Be(HttpStatusCode.NoContent);

        foreach (var client in new[] { shouted, alice })
        {
            var response = await client.GetAsync("/api/org/me", Ct);
            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var me = JsonDocument.Parse(await response.Content.ReadAsStringAsync(Ct)).RootElement;
            me.GetProperty("email").GetString().Should().Be(Alice, "one spelling across the whole registry");
        }
        Directory.GetFiles(Path.Combine(Corp.OrgDir(server), "members")).Should().ContainSingle("one person, one record");
        Corp.EventRows(server).Where(r => r.Kind == OrgEventKinds.MemberRegistered).Should().ContainSingle();
    }
}
