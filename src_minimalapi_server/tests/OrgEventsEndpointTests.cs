using System.Net;
using System.Text.Json;
using FluentAssertions;

namespace CredVaultServer.Tests;

/// <summary>
/// <c>GET /api/org/events</c> over the wire: who sees whose rows, and what each refusal says.
/// </summary>
/// <remarks>
/// The rows are put on disk by the endpoints that own them — a project created, a role changed — so
/// the reader is exercised against what the server actually writes rather than against a fixture
/// somebody typed. The one guarantee worth naming twice is the scoped one: a member asking for a
/// colleague BY NAME must get their own rows, never an error and never the colleague's.
/// </remarks>
[Collection(ServerCollection.Name)]
public sealed class OrgEventsEndpointTests
{
    private static string Alice => $"alice@{VaultServer.Domain}";

    private static string Bob => $"bob@{VaultServer.Domain}";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static async Task<JsonElement> PageAsync(HttpClient client, string query = "")
    {
        var response = await client.GetAsync("/api/org/events" + query, Ct);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync(Ct)).RootElement.Clone();
    }

    private static IReadOnlyList<string> Kinds(JsonElement page) =>
        [.. page.GetProperty("items").EnumerateArray().Select(row => row.GetProperty("kind").GetString()!)];

    private static IReadOnlyList<string?> Subjects(JsonElement page) =>
        [.. page.GetProperty("items").EnumerateArray().Select(row => row.GetProperty("subject").GetString())];

    /// <summary>Two rows about Alice and one about Bob, written by the routes that own them.</summary>
    private static async Task SeedAsync(VaultServer server)
    {
        using var cto = server.ClientFor(Corp.Cto);
        (await Corp.SetMemberAsync(cto, Alice, role: MemberRole.Dev)).StatusCode.Should().Be(HttpStatusCode.OK);
        (await Corp.SetMemberAsync(cto, Bob, role: MemberRole.Member)).StatusCode.Should().Be(HttpStatusCode.OK);
        (await Corp.SetActiveAsync(cto, Alice, active: false)).StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task AnOfficerReadsRowsAboutEverybody()
    {
        using var server = Corp.Server();
        await SeedAsync(server);
        using var cto = server.ClientFor(Corp.Cto);

        var page = await PageAsync(cto);

        Subjects(page).Should().Contain(Alice).And.Contain(Bob);
        Kinds(page).Should().Contain(OrgEventKinds.MemberBlocked);
        page.GetProperty("nextCursor").ValueKind.Should().Be(JsonValueKind.Null, "there is nothing older to ask for");
    }

    [Fact]
    public async Task ARegistryAdminReadsThemToo()
    {
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        (await Corp.SetMemberAsync(cto, Bob, role: MemberRole.Admin)).StatusCode.Should().Be(HttpStatusCode.OK);
        (await Corp.SetMemberAsync(cto, Alice, role: MemberRole.Dev)).StatusCode.Should().Be(HttpStatusCode.OK);
        using var bob = server.ClientFor(Bob);

        Subjects(await PageAsync(bob)).Should().Contain(Alice, "an admin by their record reads the domain");
    }

    [Fact]
    public async Task AMemberSeesOnlyRowsThatNameThem()
    {
        using var server = Corp.Server();
        await SeedAsync(server);
        using var bob = server.ClientFor(Bob);

        var page = await PageAsync(bob);

        Subjects(page).Should().OnlyContain(subject => subject == Bob);
        Subjects(page).Should().NotBeEmpty("their own rows are theirs to read");
    }

    [Fact]
    public async Task AMemberAskingForAColleagueByNameGetsTheirOwnRowsNotTheColleaguesAndNotAnError()
    {
        // The scope is a parameter of the query the reader applies BEFORE any filter, so a filter can
        // only narrow it. Asking by name for somebody they share no row with is an empty page.
        using var server = Corp.Server();
        await SeedAsync(server);
        using var bob = server.ClientFor(Bob);

        var byPerson = await PageAsync(bob, $"?person={Uri.EscapeDataString(Alice)}");
        var byActor = await PageAsync(bob, $"?actor={Uri.EscapeDataString(Corp.Cto)}");

        byPerson.GetProperty("items").GetArrayLength().Should().Be(0, "no row names both of them");
        Subjects(byActor).Should().OnlyContain(subject => subject == Bob, "the admin acted on both, and Bob may see only his own");
    }

    [Fact]
    public async Task SomebodyWhoNeverSyncedIsAMemberAndReadsTheirOwnRows()
    {
        using var server = Corp.Server();
        await SeedAsync(server);
        using var stranger = server.ClientFor($"nobody@{VaultServer.Domain}");

        (await PageAsync(stranger)).GetProperty("items").GetArrayLength()
            .Should().Be(0, "not registered is a member, and this member is in no row");
    }

    [Fact]
    public async Task ARecordThisBuildCannotReadIs503RatherThanAGuessedScope()
    {
        using var server = Corp.Server();
        await SeedAsync(server);
        await Corp.CorruptRecordAsync(server, Bob);
        using var bob = server.ClientFor(Bob);

        var response = await bob.GetAsync("/api/org/events", Ct);

        (await Corp.RefusalAsync(response, HttpStatusCode.ServiceUnavailable)).Should().Contain("record");
    }

    [Fact]
    public async Task APersonalDeploymentAnswersAnEmptyPage()
    {
        using var server = new VaultServer();
        using var alice = server.ClientFor(Alice);

        var page = await PageAsync(alice);

        page.GetProperty("items").GetArrayLength().Should().Be(0);
        page.GetProperty("nextCursor").ValueKind.Should().Be(JsonValueKind.Null);
        Directory.Exists(Path.Combine(server.DataDir, "org")).Should().BeFalse("reading creates nothing");
    }

    [Fact]
    public async Task WithoutATokenItIs401WithASentence()
    {
        using var server = Corp.Server();
        using var anonymous = server.CreateClient();

        (await Corp.RefusalAsync(await anonymous.GetAsync("/api/org/events", Ct), HttpStatusCode.Unauthorized))
            .Should().NotBeEmpty();
    }

    [Fact]
    public async Task TheCursorRoundTripsOverTheWire()
    {
        using var server = Corp.Server();
        await SeedAsync(server);
        using var cto = server.ClientFor(Corp.Cto);

        var first = await PageAsync(cto, "?limit=1");
        var cursor = first.GetProperty("nextCursor").GetString();
        cursor.Should().NotBeNullOrEmpty();
        var second = await PageAsync(cto, $"?limit=1&cursor={Uri.EscapeDataString(cursor!)}");

        second.GetProperty("items").GetArrayLength().Should().Be(1);
        second.GetProperty("items")[0].GetProperty("at").GetInt64()
            .Should().BeLessThanOrEqualTo(first.GetProperty("items")[0].GetProperty("at").GetInt64());
    }

    [Fact]
    public async Task ALimitAboveTheCapIsCappedRatherThanRefused()
    {
        using var server = Corp.Server();
        await SeedAsync(server);
        using var cto = server.ClientFor(Corp.Cto);

        var response = await cto.GetAsync($"/api/org/events?limit={OrgEventQuery.MaxLimit + 1000}", Ct);

        response.StatusCode.Should().Be(HttpStatusCode.OK, "a client asking for more than the server serves gets the server's most");
    }

    [Theory]
    [InlineData("?limit=0", "limit")]
    [InlineData("?limit=-3", "limit")]
    [InlineData("?limit=lots", "limit")]
    [InlineData("?cursor=yesterday", "cursor")]
    [InlineData("?cursor=2026-03-01", "cursor")]
    [InlineData("?since=soon", "since")]
    [InlineData("?since=2&until=1", "until")]
    public async Task AParameterThisServerCannotReadIs400NamingIt(string query, string named)
    {
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);

        var refusal = await Corp.RefusalAsync(await cto.GetAsync("/api/org/events" + query, Ct), HttpStatusCode.BadRequest);

        refusal.Should().Contain(named);
    }

    [Fact]
    public async Task AFilterLongerThanAnythingItCouldNameIsRefused()
    {
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);

        var refusal = await Corp.RefusalAsync(
            await cto.GetAsync("/api/org/events?q=" + new string('x', OrgEventQuery.MaxFilterLength + 1), Ct),
            HttpStatusCode.BadRequest);

        refusal.Should().Contain("q");
    }

    [Fact]
    public async Task TheKindFilterSelectsAGroupOverTheWire()
    {
        using var server = Corp.Server();
        await SeedAsync(server);
        using var cto = server.ClientFor(Corp.Cto);

        var page = await PageAsync(cto, "?kind=member.");

        Kinds(page).Should().NotBeEmpty().And.OnlyContain(kind => kind.StartsWith("member.", StringComparison.Ordinal));
    }
}
