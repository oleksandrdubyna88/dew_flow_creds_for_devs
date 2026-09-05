using System.Net;
using System.Text.Json;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;

namespace CredVaultServer.Tests;

/// <summary>
/// <c>/api/team</c> on a corp server: filtered, not replaced. A colleague whose record says
/// <c>active: false</c> cannot be picked as a recipient; everything else about the answer — the DTO
/// most of all — is exactly what it was, because epic 3 owns the wider shape and two plans describing
/// one change is how neither builds it.
/// </summary>
[Collection(ServerCollection.Name)]
public sealed class TeamCorpTests
{
    private static string Alice => $"alice@{VaultServer.Domain}";

    private static string Bob => $"bob@{VaultServer.Domain}";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    /// <summary>What epic 2's block will do, done by hand: the record says inactive.</summary>
    private static Task BlockAsync(VaultServer server, string email) =>
        new OrgMembersStore(server.DataDir, NullLogger<OrgMembersStore>.Instance)
            .UpsertAsync(email, r => r with { Active = false }, "admin@example.com", Ct);

    private static async Task<string> TeamSeenByAliceAfterBothSyncedAndBobWasBlocked(VaultServer server)
    {
        using var alice = server.ClientFor(Alice);
        using var bob = server.ClientFor(Bob);
        await Corp.SyncAsync(alice);
        await Corp.SyncAsync(bob);
        await BlockAsync(server, Bob);
        return await alice.GetStringAsync("/api/team", Ct);
    }

    [Fact]
    public async Task AnInactiveMemberIsAbsentInCorpModeAndPresentInPersonalMode()
    {
        using (var corp = Corp.Server())
        {
            var team = await TeamSeenByAliceAfterBothSyncedAndBobWasBlocked(corp);
            team.Should().Contain(Alice).And.NotContain(Bob, "a blocked colleague cannot be offered as a recipient");
        }

        using (var personal = new VaultServer())
        {
            // The same record on disk, written by the test — the server never would — and ignored:
            // personal mode consults no registry, whatever a leftover file says.
            var team = await TeamSeenByAliceAfterBothSyncedAndBobWasBlocked(personal);
            team.Should().Contain(Alice).And.Contain(Bob, "personal mode has no registry to consult");
        }
    }

    [Fact]
    public async Task TheTeamShapeIsUnchangedForAnOldClient()
    {
        // An old client sends no contract header and is served as legacy — on a corp server too. What it
        // gets must be the shape it was written against: an array of {email} and no other field, and the
        // very same bytes a personal server answers for the same owners.
        string corp;
        using (var server = Corp.Server())
        {
            using var alice = server.ClientFor(Alice);
            await Corp.SyncAsync(alice);
            var response = await alice.GetAsync("/api/team", Ct);
            response.StatusCode.Should().Be(HttpStatusCode.OK);
            corp = await response.Content.ReadAsStringAsync(Ct);
        }

        string personal;
        using (var server = new VaultServer())
        {
            using var alice = server.ClientFor(Alice);
            await Corp.SyncAsync(alice);
            personal = await alice.GetStringAsync("/api/team", Ct);
        }

        corp.Should().Be(personal, "byte-identical: the filter changes who is listed, never how");
        var members = JsonDocument.Parse(corp).RootElement;
        members.GetArrayLength().Should().Be(1);
        members[0].EnumerateObject().Select(p => p.Name).Should().Equal("email");
        members[0].GetProperty("email").GetString().Should().Be(Alice);
    }
}
