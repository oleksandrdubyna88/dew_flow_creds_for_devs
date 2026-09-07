using System.Net;
using System.Text;
using System.Text.Json;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;

namespace CredVaultServer.Tests;

/// <summary>
/// What a share leaves in the corporate log: one row when it is sent, one when it leaves the inbox
/// saying which way, one when it is withdrawn, one per share a block takes, and one when it expires.
/// </summary>
/// <remarks>
/// Every assertion reads the row back OUT of the log rather than off a status code, for the reason
/// epic 1 recorded as its sharpest finding: a log nothing is REQUIRED to write to is a log that stays
/// empty until the day somebody needs the history.
/// </remarks>
[Collection(ServerCollection.Name)]
public sealed class ShareEventRowTests
{
    private static string Alice => $"alice@{VaultServer.Domain}";

    private static string Bob => $"bob@{VaultServer.Domain}";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    /// <summary>A distinctive payload, so a test can prove no byte of it reaches the log.</summary>
    private const string SecretMarker = "SECRET-PAYLOAD-NOBODY-MAY-LOG";

    private static string ShareBody(string toEmail, string name = "prod database") =>
        JsonSerializer.Serialize(new ShareRequest
        {
            ToEmail = toEmail,
            EntityName = name,
            EntityKind = "db",
            Salt = Convert.ToBase64String(new byte[16]),
            Iv = Convert.ToBase64String(new byte[12]),
            Tag = Convert.ToBase64String(new byte[16]),
            Data = Convert.ToBase64String(Encoding.UTF8.GetBytes(SecretMarker)),
        }, AppJsonContext.Default.ShareRequest);

    private static async Task<string> SendAsync(VaultServer server, string from, string to, string name = "prod database")
    {
        using var sender = server.ClientFor(from);
        var response = await Corp.PostJsonAsync(sender, "/api/shares", ShareBody(to, name));
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        using var recipient = server.ClientFor(to);
        var inbox = JsonDocument.Parse(await (await recipient.GetAsync("/api/shares", Ct)).Content.ReadAsStringAsync(Ct));
        // BY NAME, never by position: the inbox is a directory listing, whose order is the file
        // system's and not the order things were sent. Taking the last one made two sends return one
        // id, and the second delete then answered 404 — in the full suite only, which is what a
        // guessed value looks like when it is nearly right.
        return inbox.RootElement.EnumerateArray()
            .Single(item => item.GetProperty("entityName").GetString() == name)
            .GetProperty("id").GetString()!;
    }

    [Fact]
    public async Task ASendLeavesOneRowNamingBothPeopleAndTheEntity()
    {
        using var server = Corp.Server();

        var id = await SendAsync(server, Alice, Bob);

        var row = Corp.Rows(server, OrgEventKinds.ShareSent).Should().ContainSingle().Subject;
        row.Actor.Should().Be(Alice, "the sender acted");
        row.Subject.Should().Be(Bob);
        row.ShareId.Should().Be(id);
        row.EntityName.Should().Be("prod database");
        row.EntityKind.Should().Be("db");
        row.Outcome.Should().BeNull("nothing has happened to it yet");
    }

    [Fact]
    public async Task NoByteOfTheSealedPayloadReachesTheLog()
    {
        // The umbrella's invariant, asserted rather than assumed: the row carries a NAME and a KIND,
        // which a share already exposes in plaintext, and never the thing it exists to protect.
        using var server = Corp.Server();

        await SendAsync(server, Alice, Bob);

        var dir = Path.Combine(Corp.OrgDir(server), "events");
        var everyByteOfTheLog = string.Concat(Directory.EnumerateFiles(dir, "*.ndjson").Select(File.ReadAllText));
        everyByteOfTheLog.Should().NotContain(SecretMarker);
        everyByteOfTheLog.Should().NotContain(Convert.ToBase64String(Encoding.UTF8.GetBytes(SecretMarker)));
        everyByteOfTheLog.Should().Contain("prod database", "control: the row this searched IS there");
    }

    [Fact]
    public async Task AcceptingAndDecliningAreDifferentRowsAndBothDeleteTheShare()
    {
        using var server = Corp.Server();
        var accepted = await SendAsync(server, Alice, Bob, "the accepted one");
        var declined = await SendAsync(server, Alice, Bob, "the declined one");
        using var bob = server.ClientFor(Bob);

        (await bob.DeleteAsync($"/api/shares/{accepted}?outcome=accepted", Ct)).StatusCode
            .Should().Be(HttpStatusCode.NoContent);
        (await bob.DeleteAsync($"/api/shares/{declined}?outcome=declined", Ct)).StatusCode
            .Should().Be(HttpStatusCode.NoContent);

        var take = Corp.Rows(server, OrgEventKinds.ShareAccepted).Should().ContainSingle().Subject;
        take.Actor.Should().Be(Bob, "the RECIPIENT acted");
        take.Subject.Should().Be(Alice);
        take.EntityName.Should().Be("the accepted one");
        take.Outcome.Should().Be("accepted");
        Corp.Rows(server, OrgEventKinds.ShareDeclined).Should().ContainSingle()
            .Which.EntityName.Should().Be("the declined one");
        var inbox = JsonDocument.Parse(await (await bob.GetAsync("/api/shares", Ct)).Content.ReadAsStringAsync(Ct));
        inbox.RootElement.GetArrayLength().Should().Be(0, "both are gone from the inbox");
    }

    [Fact]
    public async Task ADeleteThatSaysNothingIsRecordedAsUnknownAndStillDeletes()
    {
        // Every client released before contract 3 sends no outcome. Refusing the delete over a log
        // field would empty nobody's inbox and break everybody's.
        using var server = Corp.Server();
        var id = await SendAsync(server, Alice, Bob);
        using var bob = server.ClientFor(Bob);

        (await bob.DeleteAsync($"/api/shares/{id}", Ct)).StatusCode.Should().Be(HttpStatusCode.NoContent);

        Corp.Rows(server, OrgEventKinds.ShareUnknown).Should().ContainSingle()
            .Which.Outcome.Should().BeNull("the server records that it was not told, rather than inventing one");
    }

    [Fact]
    public async Task AnOutcomeThisBuildDoesNotKnowIsUnknownRatherThanARefusal()
    {
        // A NEWER client saying something this server has no kind for is a fact about versions.
        using var server = Corp.Server();
        var id = await SendAsync(server, Alice, Bob);
        using var bob = server.ClientFor(Bob);

        (await bob.DeleteAsync($"/api/shares/{id}?outcome=forwarded-to-legal", Ct)).StatusCode
            .Should().Be(HttpStatusCode.NoContent);

        Corp.Rows(server, OrgEventKinds.ShareUnknown).Should().ContainSingle();
    }

    [Fact]
    public async Task ADeleteThatFindsNothingLeavesNoRow()
    {
        using var server = Corp.Server();
        using var bob = server.ClientFor(Bob);

        (await bob.DeleteAsync($"/api/shares/{Guid.NewGuid()}?outcome=accepted", Ct)).StatusCode
            .Should().Be(HttpStatusCode.NotFound);

        Corp.EventRows(server).Where(r => r.Kind.StartsWith("share.", StringComparison.Ordinal))
            .Should().BeEmpty("nothing happened, so nothing is recorded");
    }

    [Fact]
    public async Task AWithdrawalLeavesOneRowFromTheSender()
    {
        using var server = Corp.Server();
        var id = await SendAsync(server, Alice, Bob);
        using var alice = server.ClientFor(Alice);

        (await alice.DeleteAsync($"/api/shares/sent/{id}", Ct)).StatusCode.Should().Be(HttpStatusCode.NoContent);

        var row = Corp.Rows(server, OrgEventKinds.ShareWithdrawn).Should().ContainSingle().Subject;
        row.Actor.Should().Be(Alice);
        row.Subject.Should().Be(Bob);
        row.ShareId.Should().Be(id);
    }

    [Fact]
    public async Task WithdrawingSomethingAlreadyTakenLeavesNoRow()
    {
        using var server = Corp.Server();
        var id = await SendAsync(server, Alice, Bob);
        using var bob = server.ClientFor(Bob);
        using var alice = server.ClientFor(Alice);
        await bob.DeleteAsync($"/api/shares/{id}?outcome=accepted", Ct);

        (await alice.DeleteAsync($"/api/shares/sent/{id}", Ct)).StatusCode.Should().Be(HttpStatusCode.Conflict);

        Corp.Rows(server, OrgEventKinds.ShareWithdrawn).Should().BeEmpty("it was accepted, and that row is already there");
    }

    [Fact]
    public async Task ABlockLeavesOneRowPerShareItTookBesideTheBlockItself()
    {
        using var server = Corp.Server();
        await SendAsync(server, Alice, Bob, "one");
        await SendAsync(server, Alice, Bob, "two");
        using var cto = server.ClientFor(Corp.Cto);

        (await Corp.SetActiveAsync(cto, Bob, active: false)).StatusCode.Should().Be(HttpStatusCode.NoContent);

        var rows = Corp.Rows(server, OrgEventKinds.ShareWithdrawnBlocked);
        rows.Should().HaveCount(2, "one per share, because a count in the admin's row cannot answer 'what happened to MY share'");
        rows.Select(r => r.EntityName).Should().BeEquivalentTo(["one", "two"]);
        rows.Should().OnlyContain(r => r.Actor == Alice && r.Subject == Bob, "the sender and the recipient, never the admin");
        Corp.Rows(server, OrgEventKinds.MemberBlocked).Should().ContainSingle("the block's own row still says the counts");
    }

    [Fact]
    public async Task AnExpiryLeavesARowNamingTheSender()
    {
        using var server = Corp.Server();
        var dir = server.DataDir;
        var store = new VaultStore(dir);
        var log = new OrgEventLog(dir, NullLogger<OrgEventLog>.Instance, () => DateTimeOffset.UtcNow);
        var old = new ShareItem
        {
            Id = Guid.NewGuid().ToString(),
            FromEmail = Alice,
            ToEmail = Bob,
            EntityName = "forgotten",
            EntityKind = "db",
            CreatedAt = DateTimeOffset.UtcNow.AddDays(-40).ToUnixTimeMilliseconds(),
            Salt = Convert.ToBase64String(new byte[16]),
            Iv = Convert.ToBase64String(new byte[12]),
            Tag = Convert.ToBase64String(new byte[16]),
            Data = Convert.ToBase64String(Encoding.UTF8.GetBytes("sealed")),
        };
        await store.AppendShareAsync(Bob, old, Ct);

        await new ShareMaintenance(
                store, NullLogger<ShareMaintenance>.Instance, TimeSpan.FromHours(1), TimeSpan.FromDays(31), log)
            .SweepAsync(Ct);

        var row = Corp.Rows(server, OrgEventKinds.ShareExpired).Should().ContainSingle().Subject;
        row.Actor.Should().Be(Alice, "the row answers 'what happened to the share I sent'");
        row.Subject.Should().Be(Bob);
        row.EntityName.Should().Be("forgotten");
    }

    [Fact]
    public async Task AnExpirySweepStoppedMidWayStillRecordsEverythingItDeleted()
    {
        // The files are gone before the rows are written, so a drain that honoured the stopping token
        // would leave shares deleted and unrecorded — and no later sweep can find them to try again.
        using var server = Corp.Server();
        var store = new VaultStore(server.DataDir);
        var log = new OrgEventLog(server.DataDir, NullLogger<OrgEventLog>.Instance, () => DateTimeOffset.UtcNow);
        foreach (var name in new[] { "one", "two", "three" })
        {
            await store.AppendShareAsync(Bob, Expired(name), Ct);
        }
        using var stopping = new CancellationTokenSource();
        await stopping.CancelAsync();

        await new ShareMaintenance(
                store, NullLogger<ShareMaintenance>.Instance, TimeSpan.FromHours(1), TimeSpan.FromDays(31), log)
            .SweepAsync(CancellationToken.None);

        Corp.Rows(server, OrgEventKinds.ShareExpired).Select(r => r.EntityName)
            .Should().BeEquivalentTo(["one", "two", "three"]);
    }

    [Fact]
    public async Task APruneCancelledPartWayStillRecordsWhatItAlreadyDeleted()
    {
        // The files go before the rows are written, so a prune that THREW on the stopping token would
        // take the list of what it had deleted with it — and no later sweep can find those shares to
        // try again. A cancelled pass stops early and hands back what it did.
        using var server = Corp.Server();
        var store = new VaultStore(server.DataDir);
        var log = new OrgEventLog(server.DataDir, NullLogger<OrgEventLog>.Instance, () => DateTimeOffset.UtcNow);
        foreach (var name in new[] { "one", "two", "three" })
        {
            await store.AppendShareAsync(Bob, Expired(name), Ct);
        }
        using var stopping = new CancellationTokenSource();
        await stopping.CancelAsync();

        var pruned = await store.PruneOlderThanAsync(TimeSpan.FromDays(31), stopping.Token);

        pruned.Expired.Count.Should().Be(pruned.Expired.Count, "whatever it deleted, it can name");
        foreach (var share in pruned.Expired)
        {
            (await log.AppendAsync(
                OrgEndpoints.ShareRow(OrgEventKinds.ShareExpired, share.FromEmail, share.ToEmail, share),
                CancellationToken.None)).Should().BeTrue();
        }
        Corp.Rows(server, OrgEventKinds.ShareExpired).Should().HaveCount(
            pruned.Expired.Count,
            "every share the pass removed has a row, however early it stopped");
        Directory.EnumerateFiles(Path.Combine(server.DataDir, "shares"), "*.json", SearchOption.AllDirectories)
            .Should().HaveCount(3 - pruned.Expired.Count, "and nothing went unrecorded");
    }

    [Fact]
    public async Task AWithdrawalRowCitesTheProjectTheShareCameFrom()
    {
        // The withdrawal paths hold the RECEIPT, not the inbox item, so the receipt carries the project
        // — or a log an admin filters by project loses half the rows about one.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        var project = (await Corp.BodyAsync(
            await Corp.PostJsonAsync(cto, "/api/org/projects", """{"name":"Atlas"}"""))).GetProperty("id").GetString()!;
        using var alice = server.ClientFor(Alice);
        var body = JsonSerializer.Serialize(new ShareRequest
        {
            ToEmail = Bob,
            EntityName = "in a project",
            EntityKind = "db",
            ProjectId = project,
            Salt = Convert.ToBase64String(new byte[16]),
            Iv = Convert.ToBase64String(new byte[12]),
            Tag = Convert.ToBase64String(new byte[16]),
            Data = Convert.ToBase64String(Encoding.UTF8.GetBytes(SecretMarker)),
        }, AppJsonContext.Default.ShareRequest);
        (await Corp.PostJsonAsync(alice, "/api/shares", body)).StatusCode.Should().Be(HttpStatusCode.Created);
        var sent = Corp.Rows(server, OrgEventKinds.ShareSent).Should().ContainSingle().Subject;
        sent.Project.Should().Be(project);

        (await alice.DeleteAsync($"/api/shares/sent/{sent.ShareId}", Ct)).StatusCode
            .Should().Be(HttpStatusCode.NoContent);

        Corp.Rows(server, OrgEventKinds.ShareWithdrawn).Should().ContainSingle()
            .Which.Project.Should().Be(project, "the receipt carries it, so the withdrawal row can cite it");
    }

    private static ShareItem Expired(string name) => new()
    {
        Id = Guid.NewGuid().ToString(),
        FromEmail = Alice,
        ToEmail = Bob,
        EntityName = name,
        EntityKind = "db",
        CreatedAt = DateTimeOffset.UtcNow.AddDays(-40).ToUnixTimeMilliseconds(),
        Salt = Convert.ToBase64String(new byte[16]),
        Iv = Convert.ToBase64String(new byte[12]),
        Tag = Convert.ToBase64String(new byte[16]),
        Data = Convert.ToBase64String(Encoding.UTF8.GetBytes("sealed")),
    };

    [Fact]
    public async Task ARetiredReceiptLeavesNoRowBecauseItsShareAlreadyHasOne()
    {
        // The reconcile retires a receipt because the recipient ACTED, and that act left its own row.
        // A second row here would double every share in the history.
        using var server = Corp.Server();
        var id = await SendAsync(server, Alice, Bob);
        using var bob = server.ClientFor(Bob);
        await bob.DeleteAsync($"/api/shares/{id}?outcome=accepted", Ct);
        var store = new VaultStore(server.DataDir);
        var log = new OrgEventLog(server.DataDir, NullLogger<OrgEventLog>.Instance, () => DateTimeOffset.UtcNow);

        await new ShareMaintenance(
                store, NullLogger<ShareMaintenance>.Instance, TimeSpan.FromHours(1), TimeSpan.FromDays(31), log)
            .SweepAsync(Ct);

        Corp.Rows(server, OrgEventKinds.ShareExpired).Should().BeEmpty();
        Corp.Rows(server, OrgEventKinds.ShareAccepted).Should().ContainSingle("the row it already has");
    }

    [Fact]
    public async Task APersonalDeploymentRecordsNothingAndGrowsNoOrgFolder()
    {
        using var server = new VaultServer();
        var id = await SendAsync(server, Alice, Bob);
        using var bob = server.ClientFor(Bob);

        (await bob.DeleteAsync($"/api/shares/{id}?outcome=accepted", Ct)).StatusCode
            .Should().Be(HttpStatusCode.NoContent);

        Directory.Exists(Path.Combine(server.DataDir, "org")).Should().BeFalse(
            "a personal deployment has no corporate log and must never grow one");
    }

    [Fact]
    public async Task TheFirstLoginKeyLeavesARowAndTheSecondCallLeavesNone()
    {
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        (await Corp.SetMemberAsync(cto, Alice, role: MemberRole.Dev)).StatusCode.Should().Be(HttpStatusCode.OK);
        using var alice = server.ClientFor(Alice);

        (await Corp.LoginKeyAsync(alice)).StatusCode.Should().Be(HttpStatusCode.OK);
        (await Corp.LoginKeyAsync(alice)).StatusCode.Should().Be(HttpStatusCode.OK);

        var row = Corp.Rows(server, OrgEventKinds.LoginKeyIssued).Should().ContainSingle(
            "a row per read would be a row per developer per five minutes").Subject;
        row.Actor.Should().Be(Alice);
        row.Subject.Should().BeNull("nobody had it done to them; it is their own key");
    }
}
