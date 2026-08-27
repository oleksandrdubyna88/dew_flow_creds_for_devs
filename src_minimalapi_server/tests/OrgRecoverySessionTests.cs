using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using FluentAssertions;

namespace CredVaultServer.Tests;

/// <summary>
/// Break-glass: a quorum opening one vault whose owner is gone.
///
/// <para>The authorization matrix is most of this file, and deliberately so — this is the only
/// place the server hands somebody a vault that is not theirs, and every condition on that gate
/// is load-bearing.</para>
/// </summary>
[Collection(ServerCollection.Name)]
public sealed class OrgRecoverySessionTests
{
    private const string Cto = "cto@example.com";
    private const string Lead = "lead@example.com";
    private const string Devops = "devops@example.com";
    private const string Officers = $"{Cto},{Lead},{Devops}";

    private static string Target => $"departed@{VaultServer.Domain}";

    private static string Outsider => $"alice@{VaultServer.Domain}";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static VaultServer Server() => new(new Dictionary<string, string?>
    {
        ["Vault__CorpRecovery__OfficerEmails"] = Officers,
        ["Vault__CorpRecovery__Threshold"] = "2",
    });

    private static string B64(int bytes, byte fill = 3) =>
        Convert.ToBase64String(Enumerable.Repeat(fill, bytes).ToArray());

    private static object Contribution(byte fill = 3, int shareIndex = 1) => new
    {
        shareIndex,
        ephemeralPublicKey = B64(32, fill),
        salt = B64(16),
        iv = B64(12),
        tag = B64(16),
        data = B64(48, fill),
    };

    /// <summary>Publish a key so sessions may start, and give the target a vault to recover.</summary>
    private static async Task PrepareAsync(VaultServer server)
    {
        var setupId = Guid.NewGuid().ToString();
        using var cto = server.ClientFor(Cto);
        var index = 1;
        foreach (var officer in new[] { Cto, Lead, Devops })
        {
            await cto.PostAsJsonAsync("/api/org-recovery/invites", new
            {
                setupId,
                toEmail = officer,
                shareIndex = index++,
                threshold = 2,
                totalShares = 3,
                salt = B64(16),
                iv = B64(12),
                tag = B64(16),
                data = B64(48),
            }, Ct);
        }
        foreach (var officer in new[] { Cto, Lead, Devops })
        {
            using var client = server.ClientFor(officer);
            var inbox = await client.GetStringAsync("/api/org-recovery/invites", Ct);
            using var parsed = JsonDocument.Parse(inbox);
            foreach (var item in parsed.RootElement.EnumerateArray())
            {
                await client.PostAsync(
                    $"/api/org-recovery/invites/{item.GetProperty("id").GetString()}/ack", null, Ct);
            }
        }
        (await cto.PostAsJsonAsync("/api/org-recovery/setup",
            new { setupId, orgPublicKey = B64(32, 7), rosterFingerprint = "" }, Ct))
            .StatusCode.Should().Be(HttpStatusCode.OK);

        // The departed employee's vault — opaque ciphertext, as far as this server knows.
        using var departed = server.ClientFor(Target);
        var body = new ByteArrayContent(Encoding.UTF8.GetBytes("the-departed-vault"));
        (await departed.PutAsync("/api/vault", body, Ct)).StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    private static async Task<string> StartSessionAsync(VaultServer server)
    {
        using var cto = server.ClientFor(Cto);
        var started = await cto.PostAsJsonAsync(
            "/api/org-recovery/sessions",
            new { targetEmail = Target, sessionPublicKey = B64(32, 9) },
            Ct);
        started.StatusCode.Should().Be(HttpStatusCode.Created);
        using var parsed = JsonDocument.Parse(await started.Content.ReadAsStringAsync(Ct));
        return parsed.RootElement.GetProperty("sessionId").GetString()!;
    }

    private static async Task ContributeAsync(
        VaultServer server, string sessionId, string officer, byte fill, int shareIndex = 1)
    {
        using var client = server.ClientFor(officer);
        var posted = await client.PostAsJsonAsync(
            $"/api/org-recovery/sessions/{sessionId}/contribute", Contribution(fill, shareIndex), Ct);
        posted.StatusCode.Should().Be(HttpStatusCode.NoContent, $"{officer} contributing");
    }

    // ---------------------------------------------------------------- starting

    [Fact]
    public async Task ASessionCannotStartBeforeAKeyExists()
    {
        // Without a published key there is nothing to reconstruct, and a session would be an
        // authorisation to read a vault that nobody could open anyway.
        using var server = Server();
        using var cto = server.ClientFor(Cto);

        var started = await cto.PostAsJsonAsync(
            "/api/org-recovery/sessions",
            new { targetEmail = Target, sessionPublicKey = B64(32, 9) },
            Ct);

        started.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task SomebodyOffTheRosterCannotStartOrSeeASession()
    {
        using var server = Server();
        await PrepareAsync(server);
        var sessionId = await StartSessionAsync(server);
        using var outsider = server.ClientFor(Outsider);

        (await outsider.PostAsJsonAsync("/api/org-recovery/sessions",
            new { targetEmail = Target, sessionPublicKey = B64(32, 9) }, Ct))
            .StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await outsider.GetAsync($"/api/org-recovery/sessions/{sessionId}", Ct))
            .StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    // ---------------------------------------------------------------- the gate

    [Fact]
    public async Task TheTargetVaultIsRefusedUntilTheQuorumHasContributed()
    {
        using var server = Server();
        await PrepareAsync(server);
        var sessionId = await StartSessionAsync(server);
        using var cto = server.ClientFor(Cto);

        var tooEarly = await cto.GetAsync($"/api/org-recovery/sessions/{sessionId}/target-vault", Ct);
        tooEarly.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await tooEarly.Content.ReadAsStringAsync(Ct)).Should().Contain("0 of 2");

        await ContributeAsync(server, sessionId, Cto, 3);
        (await cto.GetAsync($"/api/org-recovery/sessions/{sessionId}/target-vault", Ct))
            .StatusCode.Should().Be(HttpStatusCode.Conflict, "one officer is not a quorum");

        await ContributeAsync(server, sessionId, Lead, 4);
        var served = await cto.GetAsync($"/api/org-recovery/sessions/{sessionId}/target-vault", Ct);

        served.StatusCode.Should().Be(HttpStatusCode.OK);
        (await served.Content.ReadAsStringAsync(Ct)).Should().Be("the-departed-vault");
    }

    [Fact]
    public async Task OneOfficerContributingTwiceIsNotAQuorum()
    {
        // The most tempting way to defeat a threshold: retry until the counter says two. A
        // contribution is upserted by officer, so a retry replaces rather than adds.
        using var server = Server();
        await PrepareAsync(server);
        var sessionId = await StartSessionAsync(server);

        await ContributeAsync(server, sessionId, Cto, 3);
        await ContributeAsync(server, sessionId, Cto, 4);

        using var cto = server.ClientFor(Cto);
        var session = JsonDocument.Parse(
            await cto.GetStringAsync($"/api/org-recovery/sessions/{sessionId}", Ct)).RootElement;
        session.GetProperty("collected").GetInt32().Should().Be(1, "one person is one contribution");
        (await cto.GetAsync($"/api/org-recovery/sessions/{sessionId}/target-vault", Ct))
            .StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task AnOfficerWhoIsNotTheInitiatorCannotReadTheTargetVault()
    {
        // And the answer is 404, not 403: an officer who did not start this session has no
        // business learning that it exists, or whose vault it is about.
        using var server = Server();
        await PrepareAsync(server);
        var sessionId = await StartSessionAsync(server);
        await ContributeAsync(server, sessionId, Cto, 3);
        await ContributeAsync(server, sessionId, Lead, 4);

        using var lead = server.ClientFor(Lead);
        var refused = await lead.GetAsync($"/api/org-recovery/sessions/{sessionId}/target-vault", Ct);

        refused.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    // ---------------------------------------------------------------- writing back

    [Fact]
    public async Task TheRecoveryWritesBackOnce_AndTheSessionIsSpentAfterwards()
    {
        using var server = Server();
        await PrepareAsync(server);
        var sessionId = await StartSessionAsync(server);
        await ContributeAsync(server, sessionId, Cto, 3);
        await ContributeAsync(server, sessionId, Lead, 4);
        using var cto = server.ClientFor(Cto);
        var rekeyed = new ByteArrayContent(Encoding.UTF8.GetBytes("re-keyed-vault"));

        var wrote = await cto.PutAsync($"/api/org-recovery/sessions/{sessionId}/target-vault", rekeyed, Ct);

        wrote.StatusCode.Should().Be(HttpStatusCode.NoContent);
        // The target's own client now reads the re-keyed envelope.
        using var target = server.ClientFor(Target);
        (await target.GetStringAsync("/api/vault", Ct)).Should().Be("re-keyed-vault");

        // And the session is spent: a completed one is not a standing licence to read again.
        (await cto.GetAsync($"/api/org-recovery/sessions/{sessionId}/target-vault", Ct))
            .StatusCode.Should().Be(HttpStatusCode.Conflict);
        var second = new ByteArrayContent(Encoding.UTF8.GetBytes("again"));
        (await cto.PutAsync($"/api/org-recovery/sessions/{sessionId}/target-vault", second, Ct))
            .StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task AVaultThatChangedWhileTheQuorumAssembledIsNotClobbered()
    {
        // The target may still have a machine online and syncing. Break-glass is not a licence
        // to overwrite a write that happened while the officers were being gathered.
        using var server = Server();
        await PrepareAsync(server);
        var sessionId = await StartSessionAsync(server);
        await ContributeAsync(server, sessionId, Cto, 3);
        await ContributeAsync(server, sessionId, Lead, 4);
        using var cto = server.ClientFor(Cto);

        // If-Match is a REQUEST header, so it rides the message rather than the content —
        // adding it to ByteArrayContent throws "Misused header name" rather than being ignored.
        using var request = new HttpRequestMessage(
            HttpMethod.Put, $"/api/org-recovery/sessions/{sessionId}/target-vault")
        {
            Content = new ByteArrayContent(Encoding.UTF8.GetBytes("re-keyed")),
        };
        request.Headers.TryAddWithoutValidation("If-Match", "\"0000000000000000000000000000ffff\"");
        var refused = await cto.SendAsync(request, Ct);

        refused.StatusCode.Should().Be(HttpStatusCode.PreconditionFailed);
        using var target = server.ClientFor(Target);
        (await target.GetStringAsync("/api/vault", Ct)).Should().Be("the-departed-vault");
    }

    // ---------------------------------------------------------------- the record

    [Fact]
    public async Task ACompletedRecoveryIsWrittenDownWhereEveryOfficerCanSeeIt()
    {
        // A recovery nobody else can see is a recovery nobody else can question, and being
        // witnessed is the whole point of a quorum.
        using var server = Server();
        await PrepareAsync(server);
        var sessionId = await StartSessionAsync(server);
        await ContributeAsync(server, sessionId, Cto, 3);
        await ContributeAsync(server, sessionId, Lead, 4);
        using var cto = server.ClientFor(Cto);
        await cto.PutAsync(
            $"/api/org-recovery/sessions/{sessionId}/target-vault",
            new ByteArrayContent(Encoding.UTF8.GetBytes("re-keyed")),
            Ct);

        // Read by an officer who did NOT initiate it.
        using var devops = server.ClientFor(Devops);
        var audit = JsonDocument.Parse(await devops.GetStringAsync("/api/org-recovery/audit", Ct)).RootElement;

        audit.GetArrayLength().Should().Be(1);
        var entry = audit[0];
        entry.GetProperty("initiatorEmail").GetString().Should().Be(Cto);
        entry.GetProperty("targetEmail").GetString().Should().Be(Target);
        entry.GetProperty("contributingOfficers")
            .EnumerateArray().Select(e => e.GetString()).Should().BeEquivalentTo(Cto, Lead);
        entry.GetProperty("completedAt").GetInt64().Should().BeGreaterThan(0);
    }

    [Fact]
    public async Task TheAuditRecordCarriesNoCiphertext()
    {
        // Metadata only. A log that quoted a contribution would be a copy of the shares,
        // readable by every officer, sitting where nobody thinks to look for secrets.
        using var server = Server();
        await PrepareAsync(server);
        var sessionId = await StartSessionAsync(server);
        await ContributeAsync(server, sessionId, Cto, 3);
        await ContributeAsync(server, sessionId, Lead, 4);
        using var cto = server.ClientFor(Cto);
        await cto.PutAsync(
            $"/api/org-recovery/sessions/{sessionId}/target-vault",
            new ByteArrayContent(Encoding.UTF8.GetBytes("re-keyed")),
            Ct);

        var raw = await cto.GetStringAsync("/api/org-recovery/audit", Ct);

        foreach (var field in new[] { "data", "salt", "iv", "tag", "ephemeralPublicKey" })
        {
            raw.Should().NotContain(field, $"the audit log must not carry {field}");
        }
    }

    [Fact]
    public async Task AnInitiatorCanCancelTheirOwnSessionAndNobodyElseCan()
    {
        using var server = Server();
        await PrepareAsync(server);
        var sessionId = await StartSessionAsync(server);

        using var lead = server.ClientFor(Lead);
        (await lead.DeleteAsync($"/api/org-recovery/sessions/{sessionId}", Ct))
            .StatusCode.Should().Be(HttpStatusCode.NotFound);

        using var cto = server.ClientFor(Cto);
        (await cto.DeleteAsync($"/api/org-recovery/sessions/{sessionId}", Ct))
            .StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await cto.GetAsync($"/api/org-recovery/sessions/{sessionId}", Ct))
            .StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
