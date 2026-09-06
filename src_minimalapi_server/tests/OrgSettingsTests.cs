using System.Net;
using FluentAssertions;

namespace CredVaultServer.Tests;

/// <summary>
/// The runtime settings over the wire — <c>GET</c> and <c>PUT /api/org/settings</c>. Runtime because
/// nothing in them has a cryptographic consequence: the offline lease is one PUT away, and <c>0</c> is the
/// legal "strictly online" rather than an error.
/// </summary>
[Collection(ServerCollection.Name)]
public sealed class OrgSettingsTests
{
    private static string Alice => $"alice@{VaultServer.Domain}";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static string SettingsPath(VaultServer server) => Path.Combine(Corp.OrgDir(server), "settings.json");

    [Fact]
    public async Task TheDefaultIsAnsweredWithoutAFileAndNothingIsWritten()
    {
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);

        var response = await cto.GetAsync("/api/org/settings", Ct);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var settings = await Corp.BodyAsync(response);
        settings.GetProperty("offlineLeaseHours").GetInt32().Should().Be(OrgSettingsDto.DefaultOfflineLeaseHours);
        settings.GetProperty("updatedAt").GetInt64().Should().Be(0, "nobody has written it");
        settings.GetProperty("updatedBy").GetString().Should().Be(string.Empty);
        Directory.Exists(Corp.OrgDir(server)).Should().BeFalse("reading a setting grows no org/");
    }

    [Fact]
    public async Task PutThenGetAndEveryClientReadsTheNewLease()
    {
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = server.ClientFor(Alice);

        var put = await Corp.SetOfflineLeaseAsync(cto, 8);

        put.StatusCode.Should().Be(HttpStatusCode.OK);
        var written = await Corp.BodyAsync(put);
        written.GetProperty("offlineLeaseHours").GetInt32().Should().Be(8);
        written.GetProperty("updatedBy").GetString().Should().Be(Corp.Cto, "stamped from the token");
        written.GetProperty("updatedAt").GetInt64().Should().BePositive();
        File.Exists(SettingsPath(server)).Should().BeTrue();

        var read = await Corp.BodyAsync(await cto.GetAsync("/api/org/settings", Ct));
        read.GetProperty("offlineLeaseHours").GetInt32().Should().Be(8);
        read.GetProperty("updatedAt").GetInt64().Should().Be(written.GetProperty("updatedAt").GetInt64());
        var me = await Corp.BodyAsync(await alice.GetAsync("/api/org/me", Ct));
        me.GetProperty("offlineLeaseHours").GetInt32().Should().Be(8, "the document every client reads carries the new lease without a restart");
    }

    [Fact]
    public async Task ZeroIsTheLegalStrictlyOnline()
    {
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);

        var put = await Corp.SetOfflineLeaseAsync(cto, 0);

        put.StatusCode.Should().Be(HttpStatusCode.OK);
        (await Corp.BodyAsync(put)).GetProperty("offlineLeaseHours").GetInt32().Should().Be(0);
    }

    [Fact]
    public async Task ANegativeLeaseIs400AndNothingIsWritten()
    {
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);

        var put = await Corp.SetOfflineLeaseAsync(cto, -1);

        (await Corp.RefusalAsync(put, HttpStatusCode.BadRequest)).Should().Contain("0");
        File.Exists(SettingsPath(server)).Should().BeFalse();
    }

    [Fact]
    public async Task AnOmittedLeaseIs400NotZero()
    {
        // A deserializer does not run defaults: a positional int the client omitted binds to 0, and 0 here
        // means strictly online. An empty body would have switched every client's lease off in silence.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);

        var put = await Corp.PutJsonAsync(cto, "/api/org/settings", "{}");

        (await Corp.RefusalAsync(put, HttpStatusCode.BadRequest)).Should().Contain("offlineLeaseHours");
        File.Exists(SettingsPath(server)).Should().BeFalse();
    }

    [Fact]
    public async Task ANonAdminIs403ForBothVerbs()
    {
        using var server = Corp.Server();
        using var alice = server.ClientFor(Alice);
        await Corp.SyncAsync(alice);

        var get = await alice.GetAsync("/api/org/settings", Ct);
        var put = await Corp.SetOfflineLeaseAsync(alice, 0);

        (await Corp.RefusalAsync(get, HttpStatusCode.Forbidden)).Should().NotBeNullOrWhiteSpace();
        (await Corp.RefusalAsync(put, HttpStatusCode.Forbidden)).Should().NotBeNullOrWhiteSpace();
        File.Exists(SettingsPath(server)).Should().BeFalse("a refused write writes nothing");
    }

    [Fact]
    public async Task AChangeLeavesExactlyOneSettingsChangedRow()
    {
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);

        await Corp.SetOfflineLeaseAsync(cto, 8);

        var row = Corp.Rows(server, OrgEventKinds.SettingsChanged).Should().ContainSingle().Subject;
        row.Actor.Should().Be(Corp.Cto);
        row.Detail.Should().Contain("offlineLeaseHours").And.Contain("24").And.Contain("8", "the field, from and to");
        Corp.EventRows(server).Should().HaveCount(1, "no other kind rides on a settings write");
    }
}
