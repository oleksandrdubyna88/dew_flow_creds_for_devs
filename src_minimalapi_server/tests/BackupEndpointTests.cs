using System.Net;
using System.Text.Json;
using FluentAssertions;

namespace CredVaultServer.Tests;

/// <summary>
/// <c>/api/org/backup/*</c> over the wire: who may press these, and what each answer says.
/// </summary>
/// <remarks>
/// <para>The backup key opens every vault the server holds and the download is a copy of all of them,
/// so the gate is the first thing asserted on every route — a developer reading this surface would be
/// a developer reading the company.</para>
/// <para>And the one rule 8 asks for: a status read after a restart must show the terminal state,
/// never the in-flight one. That is asserted here rather than only in the runner's own suite, because
/// what the page reads is this route.</para>
/// </remarks>
[Collection(ServerCollection.Name)]
public sealed class BackupEndpointTests
{
    private static string Alice => $"alice@{VaultServer.Domain}";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task ADeveloperIsRefusedOnEveryBackupRoute()
    {
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        (await Corp.SetMemberAsync(cto, Alice, role: MemberRole.Dev)).StatusCode.Should().Be(HttpStatusCode.OK);
        using var alice = server.ClientFor(Alice);

        (await alice.GetAsync("/api/org/backup/status", Ct)).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await alice.GetAsync("/api/org/backup/archive", Ct)).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await alice.PostAsync("/api/org/backup/run", null, Ct)).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await alice.PostAsync("/api/org/backup/key", null, Ct)).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await alice.PostAsync("/api/org/backup/key/rotate", null, Ct)).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await Corp.PutJsonAsync(alice, "/api/org/backup/settings", """{"scheduleHourUtc":3,"retentionDays":30}"""))
            .StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task AFreshDeploymentReportsNoKeyAndNoArchive()
    {
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);

        var status = await StatusAsync(cto);

        status.GetProperty("configured").GetBoolean().Should().BeTrue("this server has a KEK");
        status.GetProperty("keyState").GetString().Should().Be(nameof(BackupKeyLookup.Absent));
        status.GetProperty("running").GetBoolean().Should().BeFalse();
        status.GetProperty("lastResult").GetString().Should().Be(BackupRunResults.NeverRun);
        status.GetProperty("localArchiveName").GetString().Should().BeEmpty();
    }

    [Fact]
    public async Task MintingHandsOverTheWordsOnceAndTheStatusThenSaysReady()
    {
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);

        var minted = await Corp.BodyAsync(await cto.PostAsync("/api/org/backup/key", null, Ct));

        minted.GetProperty("key").GetString().Should().StartWith("BK1-");
        minted.GetProperty("entropyBits").GetDouble().Should().Be(150);
        (await StatusAsync(cto)).GetProperty("keyState").GetString()
            .Should().Be(nameof(BackupKeyLookup.Ready), "delivering the words IS the acknowledgement");
    }

    [Fact]
    public async Task AskingForASecondKeyIsRefusedWithTheReasonItCannotBeShownAgain()
    {
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        (await cto.PostAsync("/api/org/backup/key", null, Ct)).StatusCode.Should().Be(HttpStatusCode.OK);

        var refusal = await Corp.RefusalAsync(
            await cto.PostAsync("/api/org/backup/key", null, Ct), HttpStatusCode.Conflict);

        refusal.Should().Contain("cannot be produced a second time");
    }

    [Fact]
    public async Task TheSettingsRouteBoundsTheHourAndTheWindowAndLeavesARow()
    {
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);

        (await Corp.PutJsonAsync(cto, "/api/org/backup/settings", """{"scheduleHourUtc":4,"retentionDays":14}"""))
            .StatusCode.Should().Be(HttpStatusCode.NoContent);
        var status = await StatusAsync(cto);
        status.GetProperty("scheduleHourUtc").GetInt32().Should().Be(4);
        status.GetProperty("retentionDays").GetInt32().Should().Be(14);

        (await Corp.RefusalAsync(
            await Corp.PutJsonAsync(cto, "/api/org/backup/settings", """{"scheduleHourUtc":24,"retentionDays":14}"""),
            HttpStatusCode.BadRequest)).Should().Contain("0 to 23");
        (await Corp.RefusalAsync(
            await Corp.PutJsonAsync(cto, "/api/org/backup/settings", """{"scheduleHourUtc":4,"retentionDays":0}"""),
            HttpStatusCode.BadRequest)).Should().Contain("at least one day");

        Corp.Rows(server, OrgEventKinds.BackupSettingsChanged).Should().ContainSingle()
            .Which.Detail.Should().Contain("04:00Z");
    }

    [Fact]
    public async Task RunningTakesAnArchiveAndTheStatusSaysSoAfterwards()
    {
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        (await cto.PostAsync("/api/org/backup/key", null, Ct)).StatusCode.Should().Be(HttpStatusCode.OK);

        (await cto.PostAsync("/api/org/backup/run", null, Ct)).StatusCode.Should().Be(HttpStatusCode.Accepted);

        await Corp.Eventually(
            () => Result(server) == BackupRunResults.Succeeded, "the detached run finished and said so");
        var status = await StatusAsync(cto);
        status.GetProperty("localArchiveName").GetString().Should().StartWith("cred-vault-").And.EndWith(".cvbk");
        status.GetProperty("localArchiveBytes").GetInt64().Should().BeGreaterThan(0);
        status.GetProperty("running").GetBoolean().Should().BeFalse();
        Corp.Rows(server, OrgEventKinds.BackupTaken).Should().ContainSingle();
    }

    [Fact]
    public async Task RunningWithNoKeyIsRefusedInTheRESPONSERatherThanInSilence()
    {
        // The refusal is decided inside the request, so it comes back as an answer. An earlier version
        // detached the whole run and answered 202 to everything — an administrator pressing a button
        // and getting a cheerful 202 for a run that never started has no way to tell "refused" from
        // "broken", and would have had to go and read a status to find out.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);

        var refusal = await Corp.RefusalAsync(
            await cto.PostAsync("/api/org/backup/run", null, Ct), HttpStatusCode.Conflict);

        refusal.Should().Contain("no backup key yet");
        var status = await StatusAsync(cto);
        status.GetProperty("lastResult").GetString()
            .Should().Be(BackupRunResults.NeverRun, "and nothing was recorded, because nothing happened");
        status.GetProperty("localArchiveName").GetString().Should().BeEmpty();
    }

    [Fact]
    public async Task ThePageReloadedTheInstantAfterTheButtonAlreadyReadsRunning()
    {
        // Rule 8, at the moment it actually matters. The claim and the in-progress status are written
        // INSIDE the request, so there is no window where a reload sees "never run" for a backup that
        // was just started. The .http contract suite found that window; this is what closes it.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        (await cto.PostAsync("/api/org/backup/key", null, Ct)).StatusCode.Should().Be(HttpStatusCode.OK);
        using var held = Store(server).TryClaim();

        // The claim is held, so the run cannot proceed past Begin — which is exactly the window under
        // test. Releasing it and re-asking proves the status was written before the response.
        (await cto.PostAsync("/api/org/backup/run", null, Ct)).StatusCode.Should().Be(HttpStatusCode.Conflict);
        held.Dispose();
        (await cto.PostAsync("/api/org/backup/run", null, Ct)).StatusCode.Should().Be(HttpStatusCode.Accepted);

        var immediately = await StatusAsync(cto);
        immediately.GetProperty("lastResult").GetString().Should().BeOneOf(
            BackupRunResults.InProgress,
            BackupRunResults.Succeeded);
        immediately.GetProperty("lastRunAt").GetInt64().Should().BeGreaterThan(
            0, "the run said when it started before the response was sent");
    }

    [Fact]
    public async Task ASecondRunWhileOneIsLiveAnswers409()
    {
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        (await cto.PostAsync("/api/org/backup/key", null, Ct)).StatusCode.Should().Be(HttpStatusCode.OK);
        using var held = Store(server).TryClaim();

        var refusal = await Corp.RefusalAsync(
            await cto.PostAsync("/api/org/backup/run", null, Ct), HttpStatusCode.Conflict);

        refusal.Should().Contain("already running");
    }

    [Fact]
    public async Task DownloadingWithNoArchiveIsA404ThatSaysHowToGetOne()
    {
        // Not a 202 that starts a run: a GET with a side effect is wrong HTTP, and a client that
        // retries it would start a run per attempt.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);

        var refusal = await Corp.RefusalAsync(
            await cto.GetAsync("/api/org/backup/archive", Ct), HttpStatusCode.NotFound);

        refusal.Should().Contain("POST /api/org/backup/run");
    }

    [Fact]
    public async Task DownloadingStreamsTheArchiveWithALengthAndAFileName()
    {
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        (await cto.PostAsync("/api/org/backup/key", null, Ct)).StatusCode.Should().Be(HttpStatusCode.OK);
        (await cto.PostAsync("/api/org/backup/run", null, Ct)).StatusCode.Should().Be(HttpStatusCode.Accepted);
        await Corp.Eventually(() => Result(server) == BackupRunResults.Succeeded, "the run finished");

        var response = await cto.GetAsync("/api/org/backup/archive", Ct);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        response.Content.Headers.ContentLength.Should().BeGreaterThan(0);
        response.Content.Headers.ContentDisposition!.FileName.Should().Contain("cred-vault-");
        var bytes = await response.Content.ReadAsByteArrayAsync(Ct);
        bytes.Length.Should().Be((int)response.Content.Headers.ContentLength!.Value);
        System.Text.Encoding.ASCII.GetString(bytes, 0, 4).Should().Be("CVBK", "it is the archive itself");
    }

    [Fact]
    public async Task AStatusReadAfterARestartShowsTheTerminalStateAndNeverTheSpinner()
    {
        // Rule 8, on the route the page actually reads. The in-flight status is written to disk on
        // purpose, and the sweep at startup is what stops it outliving the process that wrote it.
        using var first = Corp.Server();
        using (var cto = first.ClientFor(Corp.Cto))
        {
            (await cto.PostAsync("/api/org/backup/key", null, Ct)).StatusCode.Should().Be(HttpStatusCode.OK);
            // Stamped TODAY, which is what an interrupted run's status actually looks like — and it also
            // keeps the restarted server's scheduler quiet, so what this test observes is the sweep
            // rather than a fresh nightly run. The first attempt used a 2023 stamp and watched the
            // scheduler correctly decide the day's backup was still owed, which is a different fact.
            //
            // The instant comes from TimeProvider rather than DateTimeOffset.UtcNow: the same clock the
            // server takes its own from, per utc-timestamps.md. It cannot be a FROZEN one here, because
            // "today" is the day the running server is in and that is the fact this fixture depends on.
            await Store(first).WriteStatusAsync(
                new BackupStatus(
                    TimeProvider.System.GetUtcNow().ToUnixTimeMilliseconds(),
                    BackupRunResults.InProgress,
                    string.Empty,
                    0,
                    []),
                Ct);
            (await StatusAsync(cto)).GetProperty("running").GetBoolean()
                .Should().BeTrue("that is what a page reloaded mid-run must see");
        }

        using var restarted = Corp.RestartedOn(first.DataDir);
        using var again = restarted.ClientFor(Corp.Cto);

        await Corp.Eventually(
            () => Result(restarted) == BackupRunResults.Failed,
            "the startup sweep turned the interrupted run into a failure");
        var swept = await StatusAsync(again);
        swept.GetProperty("running").GetBoolean().Should().BeFalse("and the page no longer shows a spinner");
        swept.GetProperty("lastError").GetString().Should().Contain("the server stopped");
    }

    [Fact]
    public async Task RotatingTheKeyAnswers501WithTheDecisionRatherThan404()
    {
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);

        var refusal = await Corp.RefusalAsync(
            await cto.PostAsync("/api/org/backup/key/rotate", null, Ct), HttpStatusCode.NotImplemented);

        refusal.Should().Contain("orphans all of them");
    }

    [Fact]
    public async Task ATargetThatCannotBeReachedIsRefusedWhenItIsSAVEDAndNotAtThreeInTheMorning()
    {
        // The whole point of proving a target at save time: a typo, a revoked key or a bucket that is
        // not there becomes a sentence on the admin's screen instead of a line in a 03:00 log nobody
        // reads. The host below does not resolve, which is the cheapest true version of unreachable.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);

        var refusal = await Corp.RefusalAsync(
            await Corp.PutJsonAsync(
                cto,
                "/api/org/backup/settings",
                """
                {"scheduleHourUtc":3,"retentionDays":30,"targets":[
                  {"kind":"s3","endpoint":"https://nowhere.invalid","region":"eu-central-1",
                   "bucket":"vaults","prefix":"backups",
                   "accessKeyId":"AKIDEXAMPLE","secretAccessKey":"secret"}]}
                """),
            HttpStatusCode.BadRequest);

        refusal.Should().Contain("s3 vaults/backups", "the refusal names WHICH target");
        (await StatusAsync(cto)).GetProperty("targets").GetArrayLength()
            .Should().Be(0, "and nothing was saved");
    }

    [Fact]
    public async Task ATargetWithAPlainHttpEndpointIsRefusedBeforeAnyRequestIsMade()
    {
        // Checkable without a round trip, so it is checked without one. The archive's body is not
        // covered by the request signature, which is why the transport has to be.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);

        var refusal = await Corp.RefusalAsync(
            await Corp.PutJsonAsync(
                cto,
                "/api/org/backup/settings",
                """
                {"scheduleHourUtc":3,"retentionDays":30,"targets":[
                  {"kind":"s3","endpoint":"http://s3.example.com","region":"eu-central-1",
                   "bucket":"vaults","prefix":"backups",
                   "accessKeyId":"AKIDEXAMPLE","secretAccessKey":"secret"}]}
                """),
            HttpStatusCode.BadRequest);

        refusal.Should().Contain("must be https");
    }

    [Fact]
    public async Task AnUnknownKindIsRefusedWithTheTwoThisServerTakes()
    {
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);

        var refusal = await Corp.RefusalAsync(
            await Corp.PutJsonAsync(
                cto,
                "/api/org/backup/settings",
                """
                {"scheduleHourUtc":3,"retentionDays":30,"targets":[
                  {"kind":"ftp","endpoint":"https://example.com","region":"","bucket":"vaults",
                   "prefix":"","accessKeyId":"a","secretAccessKey":"b"}]}
                """),
            HttpStatusCode.BadRequest);

        refusal.Should().Contain("s3").And.Contain("azure-blob");
    }

    [Fact]
    public async Task ATargetSavedWithNoCredentialsAtAllIsRefusedWithWhatTheFirstSaveNeeds()
    {
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);

        var refusal = await Corp.RefusalAsync(
            await Corp.PutJsonAsync(
                cto,
                "/api/org/backup/settings",
                """
                {"scheduleHourUtc":3,"retentionDays":30,"targets":[
                  {"kind":"s3","endpoint":"https://s3.example.com","region":"eu-central-1",
                   "bucket":"vaults","prefix":"backups"}]}
                """),
            HttpStatusCode.BadRequest);

        refusal.Should().Contain("required the first time this target is saved");
        refusal.Should().Contain("keeps the ones already here", "and it says what a later edit does");
    }

    [Fact]
    public async Task TheStatusNeverCarriesACredentialInAnyShape()
    {
        // Write-only means write-only: not in the status, not in an error, not anywhere a page polls.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);

        var status = (await StatusAsync(cto)).GetRawText();

        status.Should().NotContain("accessKeyId").And.NotContain("secretAccessKey");
        status.Should().NotContain("accountKey").And.NotContain("AKIDEXAMPLE");
    }

    /// <summary>The store the server itself is using, for the states only a restart can produce.</summary>
    private static BackupStore Store(VaultServer server) =>
        (BackupStore)server.Services.GetService(typeof(BackupStore))!;

    /// <summary>The persisted result, read off the disk — what a restarted process would read.</summary>
    private static string Result(VaultServer server) =>
        Store(server).ReadStatusAsync(CancellationToken.None).GetAwaiter().GetResult().LastResult;

    private static async Task<JsonElement> StatusAsync(HttpClient client)
    {
        var response = await client.GetAsync("/api/org/backup/status", Ct);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync(Ct)).RootElement.Clone();
    }
}
