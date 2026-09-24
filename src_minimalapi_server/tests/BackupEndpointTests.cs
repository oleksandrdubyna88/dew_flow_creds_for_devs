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
        (await alice.GetAsync("/api/org/backup/targets", Ct)).StatusCode.Should().Be(HttpStatusCode.Forbidden);
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
        status.GetProperty("lastSuccessAt").GetInt64().Should().Be(0, "nothing has ever succeeded here, and 0 is how that is spelled");
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
        status.GetProperty("lastSuccessAt").GetInt64().Should().BeGreaterThanOrEqualTo(
            status.GetProperty("lastRunAt").GetInt64(), "an ok run is the last success, stamped when it finished");
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
                    [],
                    0),
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

    [Fact]
    public async Task ASettingsSaveThatOMITSTargetsLeavesThemAlone()
    {
        // A client that predates targets — the extension before story 5, a script written against
        // story 3 — sends no `targets` member at all. Treating that as "remove every destination" would
        // silently turn a configured deployment back into a local-only one on the next schedule edit.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        var store = Store(server);
        var kek = Convert.FromBase64String(Corp.Kek);
        var targets = new BackupTargets(
            kek, new OneClient(), TimeProvider.System, Microsoft.Extensions.Logging.Abstractions.NullLogger.Instance);
        await store.WriteSettingsAsync(
            new BackupSettings(
                3,
                30,
                [targets.Seal("s3", "https://s3.example.com", "eu", "vaults", "backups",
                    new TargetSecrets("AKIDEXAMPLE", "secret", string.Empty, string.Empty))]),
            Ct);

        (await Corp.PutJsonAsync(cto, "/api/org/backup/settings", """{"scheduleHourUtc":6,"retentionDays":21}"""))
            .StatusCode.Should().Be(HttpStatusCode.NoContent);

        var after = await store.ReadSettingsAsync(Ct);
        after.ScheduleHourUtc.Should().Be(6, "the schedule did change");
        after.Targets.Should().ContainSingle("and the destination did not go with it");
    }

    [Fact]
    public async Task AnEmptyTargetsArrayDoesRemoveThemAll()
    {
        // The other half of the rule: omitted is unchanged, an explicit [] is "remove them".
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        var store = Store(server);
        var targets = new BackupTargets(
            Convert.FromBase64String(Corp.Kek),
            new OneClient(),
            TimeProvider.System,
            Microsoft.Extensions.Logging.Abstractions.NullLogger.Instance);
        await store.WriteSettingsAsync(
            new BackupSettings(
                3,
                30,
                [targets.Seal("s3", "https://s3.example.com", "eu", "vaults", "backups",
                    new TargetSecrets("AKIDEXAMPLE", "secret", string.Empty, string.Empty))]),
            Ct);

        (await Corp.PutJsonAsync(
            cto, "/api/org/backup/settings", """{"scheduleHourUtc":6,"retentionDays":21,"targets":[]}"""))
            .StatusCode.Should().Be(HttpStatusCode.NoContent);

        (await store.ReadSettingsAsync(Ct)).Targets.Should().BeEmpty();
    }

    [Fact]
    public async Task HalfACredentialIsRefusedByNameRatherThanReachingTheCipher()
    {
        // An account name with no key used to make "did they send credentials?" answer yes, and the
        // probe then handed an empty string to a base64 decoder — a 500 where a sentence belongs.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);

        var refusal = await Corp.RefusalAsync(
            await Corp.PutJsonAsync(
                cto,
                "/api/org/backup/settings",
                """
                {"scheduleHourUtc":3,"retentionDays":30,"targets":[
                  {"kind":"azure-blob","endpoint":"https://acct.blob.core.windows.net","region":"",
                   "bucket":"vaults","prefix":"backups","accountName":"acct"}]}
                """),
            HttpStatusCode.BadRequest);

        refusal.Should().Contain("accountKey is missing");
    }

    [Fact]
    public async Task TheStatusNamesTheKindsThatAreCONFIGURED_BeforeAnyRunHasHappened()
    {
        // `targets[]` is the LAST RUN's per-destination outcomes, so a deployment that has SAVED a
        // destination and not run yet answers `[]` — and "to which kinds does this server back up"
        // is then unanswerable in exactly the state where it matters most: freshly configured, never
        // run. The configured kinds are a second, separate list because they answer a second,
        // separate question. Written through the store rather than the route because the PUT proves
        // every destination over the network before it writes one.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        await Store(server).WriteSettingsAsync(new BackupSettings(3, 30, TwoBucketsAndAContainer()), Ct);

        var status = await StatusAsync(cto);

        Kinds(status).Should().Equal(
            ["azure-blob", "s3"], "distinct and ordered — two S3 buckets are one KIND");
        status.GetProperty("targets").GetArrayLength().Should().Be(
            0, "nothing has run, which is the whole reason the configured list exists");
    }

    [Fact]
    public async Task TheStatusNeverNamesADestinationsCredentials()
    {
        // The new field is a list of kinds, forever. A bucket and a prefix are operational detail that
        // belongs on the backup tab (SealedTarget.Describe already draws them there); a credential
        // belongs nowhere a page polls.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        await Store(server).WriteSettingsAsync(new BackupSettings(3, 30, TwoBucketsAndAContainer()), Ct);

        var status = await StatusAsync(cto);
        var raw = status.GetRawText();

        Kinds(status).Should().Equal(["azure-blob", "s3"], "a KIND list, and only ever a kind list");
        raw.Should().NotContain("AKIDEXAMPLE").And.NotContain("accessKeyId").And.NotContain("accountKey");
        raw.Should().NotContain("vaults", "a bucket name is not a kind")
            .And.NotContain("nightly", "and neither is a prefix");
    }

    [Fact]
    public async Task ADestinationCannotBeSavedWithoutAKekAndTheRefusalNamesTheSetting()
    {
        // The mint route answers 409 with a sentence naming Vault:LoginKey:Kek for this deployment; the
        // settings route handed an empty key to AesGcm and answered 500 with a stack trace — for a
        // request that is well formed by the contract's own documentation.
        using var server = Corp.ServerWithoutKek();
        using var cto = server.ClientFor(Corp.Cto);

        var refusal = await Corp.RefusalAsync(
            await Corp.PutJsonAsync(
                cto,
                "/api/org/backup/settings",
                """
                {"scheduleHourUtc":3,"retentionDays":30,"targets":[
                  {"kind":"s3","endpoint":"https://s3.example.com","region":"eu-central-1",
                   "bucket":"vaults","prefix":"backups",
                   "accessKeyId":"AKIDEXAMPLE","secretAccessKey":"secret"}]}
                """),
            HttpStatusCode.Conflict);

        refusal.Should().Contain("Vault:LoginKey:Kek", "the sentence names what to set");
        (await Store(server).ReadSettingsAsync(Ct)).Targets.Should().BeEmpty("and nothing was written");
    }

    [Fact]
    public async Task AKeysOmittedEditSavesWithoutAKek()
    {
        // The other half of the guard (plan gate, codex): a destination re-sent with its keys left out
        // KEEPS the sealed record and needs no cipher, so a deployment with no KEK may still change its
        // schedule while re-sending the list a client always sends whole. Refusing here would make
        // every edit on such a deployment impossible until an operator sets a key the edit never used.
        using var server = Corp.ServerWithoutKek();
        using var cto = server.ClientFor(Corp.Cto);
        var sealedElsewhere = SealedUnder(Corp.Kek, "backups");
        await Store(server).WriteSettingsAsync(new BackupSettings(3, 30, [sealedElsewhere]), Ct);

        (await Corp.PutJsonAsync(
            cto,
            "/api/org/backup/settings",
            """
            {"scheduleHourUtc":5,"retentionDays":30,"targets":[
              {"kind":"s3","endpoint":"https://s3.example.com","region":"eu-central-1",
               "bucket":"vaults","prefix":"backups"}]}
            """)).StatusCode.Should().Be(HttpStatusCode.NoContent);

        var after = await Store(server).ReadSettingsAsync(Ct);
        after.ScheduleHourUtc.Should().Be(5);
        after.Targets.Should().ContainSingle().Which.Should().Be(sealedElsewhere, "kept byte for byte");
    }

    [Fact]
    public async Task EditingTheRegionWhileKeepingTheKeysSavesTheNewRegion()
    {
        // Fix 1 of #134. The identity that decides "kept" is kind|endpoint|bucket|prefix, and the kept
        // record used to be written back WHOLE — so a save that changed only the region wrote the old
        // region back, silently, and S3 signs with the region, so the next run answered 400 from the bucket.
        var stub = new StubTransport();
        var targets = Corp.StubTargets(stub);
        using var server = Corp.ServerWith(targets);
        using var cto = server.ClientFor(Corp.Cto);
        var before = targets.Seal("s3", "https://s3.example.com", "eu-central-1", "vaults", "backups", S3Secrets);
        await Store(server).WriteSettingsAsync(new BackupSettings(3, 30, [before]), Ct);

        (await Corp.PutJsonAsync(
            cto,
            "/api/org/backup/settings",
            """
            {"scheduleHourUtc":3,"retentionDays":30,"targets":[
              {"kind":"s3","endpoint":"https://s3.example.com","region":"eu-west-1",
               "bucket":"vaults","prefix":"backups"}]}
            """)).StatusCode.Should().Be(HttpStatusCode.NoContent);

        var after = (await Store(server).ReadSettingsAsync(Ct)).Targets.Should().ContainSingle().Subject;
        after.Region.Should().Be("eu-west-1", "the edit is the edit");
        (after.Iv, after.Tag, after.Data).Should().Be(
            (before.Iv, before.Tag, before.Data), "and the sealed credentials were kept, not re-sealed");
    }

    [Fact]
    public async Task ASaveThatLeavesADestinationUnchangedSendsItNoProbe()
    {
        // S3 of #134, an owner assumption recorded in the plan: a destination whose identity, keys and
        // region are all unchanged is written back as it was and NOT proved again — editing the schedule
        // used to write-and-delete a probe object in every bucket, and a bucket that was unreachable
        // for a minute blocked a change to an unrelated setting.
        var stub = new StubTransport();
        var targets = Corp.StubTargets(stub);
        using var server = Corp.ServerWith(targets);
        using var cto = server.ClientFor(Corp.Cto);
        await Store(server).WriteSettingsAsync(
            new BackupSettings(
                3, 30, [targets.Seal("s3", "https://s3.example.com", "eu-central-1", "vaults", "backups", S3Secrets)]),
            Ct);

        (await Corp.PutJsonAsync(
            cto,
            "/api/org/backup/settings",
            """
            {"scheduleHourUtc":5,"retentionDays":30,"targets":[
              {"kind":"s3","endpoint":"https://s3.example.com","region":"eu-central-1",
               "bucket":"vaults","prefix":"backups"}]}
            """)).StatusCode.Should().Be(HttpStatusCode.NoContent);

        stub.Sent.Should().BeEmpty("nothing about this destination changed, so nothing was asked of it");
        (await Store(server).ReadSettingsAsync(Ct)).ScheduleHourUtc.Should().Be(5);
    }

    [Fact]
    public async Task ASaveWithNewKeysOrANewRegionProbesThatDestination()
    {
        // The other half, so the test above cannot pass by never probing anything: a change to what
        // the run will sign with IS proved before it is written.
        var stub = new StubTransport();
        var targets = Corp.StubTargets(stub);
        using var server = Corp.ServerWith(targets);
        using var cto = server.ClientFor(Corp.Cto);
        await Store(server).WriteSettingsAsync(
            new BackupSettings(
                3, 30, [targets.Seal("s3", "https://s3.example.com", "eu-central-1", "vaults", "backups", S3Secrets)]),
            Ct);

        (await Corp.PutJsonAsync(
            cto,
            "/api/org/backup/settings",
            """
            {"scheduleHourUtc":3,"retentionDays":30,"targets":[
              {"kind":"s3","endpoint":"https://s3.example.com","region":"eu-west-1",
               "bucket":"vaults","prefix":"backups"}]}
            """)).StatusCode.Should().Be(HttpStatusCode.NoContent);
        stub.Sent.Should().HaveCount(2, "a region change is proved: the probe's PUT and its DELETE");

        (await Corp.PutJsonAsync(
            cto,
            "/api/org/backup/settings",
            """
            {"scheduleHourUtc":3,"retentionDays":30,"targets":[
              {"kind":"s3","endpoint":"https://s3.example.com","region":"eu-west-1",
               "bucket":"vaults","prefix":"backups","accessKeyId":"AKIDNEW","secretAccessKey":"rotated"}]}
            """)).StatusCode.Should().Be(HttpStatusCode.NoContent);
        stub.Sent.Should().HaveCount(4, "and so are new credentials");
        stub.Sent[2].RequestUri!.ToString().Should().Be(
            "https://s3.example.com/vaults/backups/" + ArchiveTargets.ProbeName);
    }

    [Fact]
    public async Task EditingOneDestinationLeavesAnUnopenableSiblingInPlaceAndUnprobed()
    {
        // Plan gate (gemini), and against the probe-all code it was a real break: a sibling whose
        // credentials this server cannot open — a KEK that changed, a settings file restored from
        // elsewhere — was probed on every save, its probe failed with "cannot open the credentials", and
        // the save of the UNRELATED destination failed with it. Re-sent unchanged, it is kept as it is
        // and asked nothing; the form says "re-enter" on its own row.
        var stub = new StubTransport();
        var targets = Corp.StubTargets(stub);
        using var server = Corp.ServerWith(targets);
        using var cto = server.ClientFor(Corp.Cto);
        var unopenable = SealedUnder(Corp.OtherKek, "old");
        await Store(server).WriteSettingsAsync(new BackupSettings(3, 30, [unopenable]), Ct);

        (await Corp.PutJsonAsync(
            cto,
            "/api/org/backup/settings",
            """
            {"scheduleHourUtc":3,"retentionDays":30,"targets":[
              {"kind":"s3","endpoint":"https://s3.example.com","region":"eu-central-1",
               "bucket":"vaults","prefix":"old"},
              {"kind":"s3","endpoint":"https://s3.example.com","region":"eu-central-1",
               "bucket":"vaults","prefix":"nightly","accessKeyId":"AKIDEXAMPLE","secretAccessKey":"secret"}]}
            """)).StatusCode.Should().Be(HttpStatusCode.NoContent);

        stub.Sent.Should().HaveCount(2).And.OnlyContain(
            request => request.RequestUri!.ToString().Contains("/vaults/nightly/"),
            "only the new destination was proved");
        var after = await Store(server).ReadSettingsAsync(Ct);
        after.Targets.Should().HaveCount(2);
        after.Targets[0].Should().Be(unopenable, "the sibling nobody touched is exactly what it was");
    }

    [Fact]
    public async Task TheSettingsRowNamesTheDestinationsAddedAndRemovedAndNeverAKey()
    {
        // S6 of #134: the history said "04:00Z, 14 day(s)" about a save that replaced every
        // destination. Where each one is — by SealedTarget.Describe, the same words the page uses —
        // and never what opens it.
        var stub = new StubTransport();
        var targets = Corp.StubTargets(stub);
        using var server = Corp.ServerWith(targets);
        using var cto = server.ClientFor(Corp.Cto);
        await Store(server).WriteSettingsAsync(
            new BackupSettings(
                3, 30, [targets.Seal("s3", "https://s3.example.com", "eu-central-1", "vaults", "old", S3Secrets)]),
            Ct);

        (await Corp.PutJsonAsync(
            cto,
            "/api/org/backup/settings",
            """
            {"scheduleHourUtc":4,"retentionDays":14,"targets":[
              {"kind":"s3","endpoint":"https://s3.example.com","region":"eu-central-1",
               "bucket":"vaults","prefix":"nightly","accessKeyId":"AKIDEXAMPLE","secretAccessKey":"secret"}]}
            """)).StatusCode.Should().Be(HttpStatusCode.NoContent);

        var detail = Corp.Rows(server, OrgEventKinds.BackupSettingsChanged).Should().ContainSingle().Subject.Detail!;
        detail.Should().Contain("04:00Z").And.Contain("14 day(s)", "the schedule half is unchanged");
        detail.Should().Contain("+s3 vaults/nightly", "what was added");
        detail.Should().Contain("-s3 vaults/old", "what was removed");
        detail.Should().NotContain("AKIDEXAMPLE").And.NotContain("secret").And.NotContain("s3.example.com");
    }

    [Fact]
    public async Task TwoDestinationsWithOneIdentityAreRefused()
    {
        // The keep-the-keys rule matches by identity, so two records with one identity would leave
        // every later edit matching the first and the second unreachable for ever. Refused before any
        // probe — the stub is here so a regression fails on the sentence rather than on DNS.
        var stub = new StubTransport();
        using var server = Corp.ServerWith(Corp.StubTargets(stub));
        using var cto = server.ClientFor(Corp.Cto);

        var refusal = await Corp.RefusalAsync(
            await Corp.PutJsonAsync(
                cto,
                "/api/org/backup/settings",
                """
                {"scheduleHourUtc":3,"retentionDays":30,"targets":[
                  {"kind":"s3","endpoint":"https://s3.example.com","region":"eu-central-1",
                   "bucket":"vaults","prefix":"backups","accessKeyId":"a","secretAccessKey":"b"},
                  {"kind":"s3","endpoint":"https://s3.example.com","region":"eu-west-1",
                   "bucket":"vaults","prefix":"backups","accessKeyId":"c","secretAccessKey":"d"}]}
                """),
            HttpStatusCode.BadRequest);

        refusal.Should().Contain("s3 vaults/backups").And.Contain("twice");
        stub.Sent.Should().BeEmpty("checkable without a request, so checked without one");
    }

    [Fact]
    public async Task AFreshDeploymentListsNoDestinationsAsAnEmptyArrayAndNeverNull()
    {
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);

        var listed = await TargetsAsync(cto);

        listed.ValueKind.Should().Be(JsonValueKind.Array, "a list, so a client iterates without a null check");
        listed.GetArrayLength().Should().Be(0);
    }

    [Fact]
    public async Task TheTargetsRouteListsWhereEachDestinationIsAndNeverWhatOpensIt()
    {
        // The read that makes editing ONE destination possible — and the property that makes it safe to
        // exist: where each destination is, whether this server can open its sealed half, and not one
        // byte of that half or of a credential, in any spelling.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        await Store(server).WriteSettingsAsync(new BackupSettings(3, 30, TwoBucketsAndAContainer()), Ct);

        var response = await cto.GetAsync("/api/org/backup/targets", Ct);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var raw = await response.Content.ReadAsStringAsync(Ct);
        var listed = JsonDocument.Parse(raw).RootElement;
        listed.GetArrayLength().Should().Be(3, "every configured destination, in the order they are saved");
        var first = listed[0];
        first.GetProperty("kind").GetString().Should().Be("s3");
        first.GetProperty("endpoint").GetString().Should().Be("https://s3.example.com");
        first.GetProperty("region").GetString().Should().Be("eu-central-1");
        first.GetProperty("bucket").GetString().Should().Be("vaults");
        first.GetProperty("prefix").GetString().Should().Be("nightly");
        first.GetProperty("credentials").GetString().Should().Be("sealed", "this server sealed them, so it can open them");
        first.EnumerateObject().Select(field => field.Name).Should().BeEquivalentTo(
            ["kind", "endpoint", "region", "bucket", "prefix", "credentials"], "and nothing else");
        raw.Should().NotContain("\"iv\"").And.NotContain("\"tag\"").And.NotContain("\"data\"", "the sealed half stays on disk");
        raw.Should().NotContain("AKIDEXAMPLE").And.NotContain("shh").And.NotContain("a2V5")
            .And.NotContain("accessKeyId").And.NotContain("accountKey", "and no credential in any spelling");
    }

    [Fact]
    public async Task ATargetSealedUnderAnotherKekIsListedAsUnopenableSoTheFormCanSayReEnter()
    {
        // A settings file restored from another deployment, or a KEK that changed under it: the form has
        // to say "re-enter" on THAT row and nothing about the others. The listing is asked quietly —
        // BackupTargets.Opens, not Open — so an unopenable record does not write the same error line
        // every time a tab opens.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        await Store(server).WriteSettingsAsync(
            new BackupSettings(3, 30, [SealedUnder(Corp.OtherKek, "elsewhere"), SealedUnder(Corp.Kek, "here")]), Ct);

        var listed = await TargetsAsync(cto);

        listed[0].GetProperty("credentials").GetString().Should().Be("unopenable");
        listed[1].GetProperty("credentials").GetString().Should().Be("sealed", "per row, not all-or-nothing");
    }

    [Fact]
    public async Task TheTargetsRouteAnswersTheSharedFixtureShape()
    {
        // contract/backup-targets-v1.json is the EXACT array the route answers, and what BOTH
        // implementations assert: this seeds the two destinations it describes and compares the
        // route's answer to the whole document; the extension feeds the same bytes to readTargets.
        // One file, so a field renamed on one side goes red on the other (plan gate, codex). The LIVE
        // check between the two is src_vs_code/scripts/backup-targets-live.cjs, in the .http job.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        var mine = new BackupTargets(
            Convert.FromBase64String(Corp.Kek), new OneClient(), TimeProvider.System,
            Microsoft.Extensions.Logging.Abstractions.NullLogger.Instance);
        var theirs = new BackupTargets(
            Convert.FromBase64String(Corp.OtherKek), new OneClient(), TimeProvider.System,
            Microsoft.Extensions.Logging.Abstractions.NullLogger.Instance);
        await Store(server).WriteSettingsAsync(
            new BackupSettings(
                3,
                30,
                [
                    mine.Seal("s3", "https://s3.example.com", "eu-central-1", "vaults", "nightly", S3Secrets),
                    theirs.Seal(
                        "azure-blob", "https://acct.blob.core.windows.net", string.Empty, "vaults", "nightly",
                        new TargetSecrets(string.Empty, string.Empty, "acct", "a2V5")),
                ]),
            Ct);
        var fixture = JsonDocument.Parse(
            File.ReadAllText(Path.Combine(PrintableKeyTests.RepoRoot(), "contract", "backup-targets-v1.json")));

        var answered = await TargetsAsync(cto);

        JsonSerializer.Serialize(answered).Should().Be(
            JsonSerializer.Serialize(fixture.RootElement),
            "the route answers exactly the document the extension asserts it can read");
    }

    private static async Task<JsonElement> TargetsAsync(HttpClient client)
    {
        var response = await client.GetAsync("/api/org/backup/targets", Ct);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync(Ct)).RootElement.Clone();
    }

    private static readonly TargetSecrets S3Secrets = new("AKIDEXAMPLE", "secret", string.Empty, string.Empty);

    /// <summary>One S3 destination at <c>vaults/{prefix}</c>, sealed under the given KEK — not necessarily the server's.</summary>
    private static SealedTarget SealedUnder(string kek, string prefix) =>
        new BackupTargets(
                Convert.FromBase64String(kek),
                new OneClient(),
                TimeProvider.System,
                Microsoft.Extensions.Logging.Abstractions.NullLogger.Instance)
            .Seal("s3", "https://s3.example.com", "eu-central-1", "vaults", prefix, S3Secrets);

    /// <summary>Two S3 buckets and one Azure container, sealed — three destinations, two kinds.</summary>
    private static IReadOnlyList<SealedTarget> TwoBucketsAndAContainer()
    {
        var targets = new BackupTargets(
            Convert.FromBase64String(Corp.Kek),
            new OneClient(),
            TimeProvider.System,
            Microsoft.Extensions.Logging.Abstractions.NullLogger.Instance);
        var s3 = new TargetSecrets("AKIDEXAMPLE", "shh", string.Empty, string.Empty);
        return
        [
            targets.Seal("s3", "https://s3.example.com", "eu-central-1", "vaults", "nightly", s3),
            targets.Seal("s3", "https://s3.example.com", "eu-central-1", "vaults", "weekly", s3),
            targets.Seal(
                "azure-blob", "https://acct.blob.core.windows.net", string.Empty, "vaults", "nightly",
                new TargetSecrets(string.Empty, string.Empty, "acct", "a2V5")),
        ];
    }

    /// <summary>The configured kinds, read off the status document.</summary>
    private static IEnumerable<string?> Kinds(JsonElement status) =>
        status.GetProperty("configuredTargetKinds").EnumerateArray().Select(kind => kind.GetString());

    /// <summary>A client factory for the tests that only need a target SEALED, never sent to.</summary>
    private sealed class OneClient : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new();
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
