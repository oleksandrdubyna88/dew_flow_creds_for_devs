using System.Net;
using System.Text;
using FluentAssertions;

namespace CredVaultServer.Tests;

[Collection(ServerCollection.Name)]
public sealed class VaultTests
{
    private static readonly byte[] Blob =
        Encoding.UTF8.GetBytes("""{"format":"cred-ssh-manager-backup","data":"ciphertext"}""");

    private static string Alice => $"alice@{VaultServer.Domain}";

    private static string Bob => $"bob@{VaultServer.Domain}";

    [Fact]
    public async Task AVaultThatWasNeverWritten_Is404()
    {
        using var server = new VaultServer();
        using var alice = server.ClientFor(Alice);

        var response = await alice.GetAsync("/api/vault", TestContext.Current.CancellationToken);

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task AVaultComesBackByteForByteAsItWasStored()
    {
        using var server = new VaultServer();
        using var alice = server.ClientFor(Alice);

        var put = await alice.PutAsync(
            "/api/vault", new ByteArrayContent(Blob), TestContext.Current.CancellationToken);
        put.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var stored = await alice.GetByteArrayAsync("/api/vault", TestContext.Current.CancellationToken);

        stored.Should().Equal(Blob);
    }

    [Fact]
    public async Task OneCallersVaultIsInvisibleToAnother()
    {
        using var server = new VaultServer();
        using var alice = server.ClientFor(Alice);
        using var bob = server.ClientFor(Bob);

        await alice.PutAsync(
            "/api/vault", new ByteArrayContent(Blob), TestContext.Current.CancellationToken);

        var bobsVault = await bob.GetAsync("/api/vault", TestContext.Current.CancellationToken);

        bobsVault.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task AnEmptyBodyIsRefused()
    {
        using var server = new VaultServer();
        using var alice = server.ClientFor(Alice);

        var response = await alice.PutAsync(
            "/api/vault", new ByteArrayContent([]), TestContext.Current.CancellationToken);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task AVaultOverTheSizeCapIsRefused()
    {
        using var server = new VaultServer();
        using var alice = server.ClientFor(Alice);

        // The cap is 8 MiB; 9 MiB must be refused by the Content-Length precheck.
        var response = await alice.PutAsync(
            "/api/vault",
            new ByteArrayContent(new byte[9 * 1024 * 1024]),
            TestContext.Current.CancellationToken);

        response.StatusCode.Should().BeOneOf(
            HttpStatusCode.BadRequest, HttpStatusCode.RequestEntityTooLarge);
    }

    [Fact]
    public async Task TheServerKeepsServingAfterAnOversizeUpload()
    {
        using var server = new VaultServer();
        using var alice = server.ClientFor(Alice);

        try
        {
            await alice.PutAsync(
                "/api/vault",
                new ByteArrayContent(new byte[9 * 1024 * 1024]),
                TestContext.Current.CancellationToken);
        }
        catch (HttpRequestException)
        {
            // A reset by the body-size ceiling is also a refusal.
        }

        using var probe = server.CreateClient();
        var health = await probe.GetAsync("/api/health", TestContext.Current.CancellationToken);

        health.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task DeletingMyAccountRemovesMyVault()
    {
        using var server = new VaultServer();
        using var alice = server.ClientFor(Alice);

        await alice.PutAsync(
            "/api/vault", new ByteArrayContent(Blob), TestContext.Current.CancellationToken);

        var deleted = await alice.DeleteAsync("/api/vault", TestContext.Current.CancellationToken);
        deleted.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var afterwards = await alice.GetAsync("/api/vault", TestContext.Current.CancellationToken);
        afterwards.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task DeletingAVaultRemovesTheRegistryRecord()
    {
        // The registry cannot outgrow the people it describes: a person leaves by being blocked, and a
        // record is deleted only with their vault. Without this the growth budget is a sentence in a plan.
        using var server = Corp.Server();
        using var alice = server.ClientFor(Alice);
        await alice.PutAsync("/api/vault", new ByteArrayContent(Blob), TestContext.Current.CancellationToken);
        var record = Corp.RecordPath(server, Alice);
        File.Exists(record).Should().BeTrue("precondition: the write registered the caller");

        var deleted = await alice.DeleteAsync("/api/vault", TestContext.Current.CancellationToken);

        deleted.StatusCode.Should().Be(HttpStatusCode.NoContent);
        File.Exists(record).Should().BeFalse("the record goes with the vault");
    }

    /// <summary>
    /// Alice as a DEVELOPER with her login key minted — the only shape in which a vault is sealed to
    /// S, and therefore the only shape in which losing S while the vault survives matters.
    /// </summary>
    private static async Task<string> ADeveloperWithAKeyAsync(VaultServer server, HttpClient alice, CancellationToken ct)
    {
        using var cto = server.ClientFor(Corp.Cto);
        await Corp.SyncAsync(alice);
        (await Corp.SetMemberAsync(cto, Alice, role: "dev")).StatusCode.Should().Be(HttpStatusCode.OK);
        (await Corp.LoginKeyAsync(alice)).StatusCode.Should().Be(HttpStatusCode.OK);
        await alice.PutAsync("/api/vault", new ByteArrayContent(Blob), ct);
        var loginKey = Corp.LoginKeyPath(server, Alice);
        File.Exists(loginKey).Should().BeTrue("the vault is sealed to a key this server issued");
        return loginKey;
    }

    [Fact]
    public async Task AVaultTheOsWillNotReleaseIsReportedAndKeepsItsLoginKey()
    {
        // Audit 2026-09-09, finding #4. `DeleteEverythingFor` swallowed a locked file and returned
        // void, so the endpoint carried on and removed the login key S — and on a corporate server
        // every developer wrap is sealed to S, which makes a vault that outlives its key a vault
        // nobody can OPEN. The helper for exactly this failure already existed and was applied to
        // five sibling paths; never to the vault itself.
        using var server = Corp.Server();
        using var alice = server.ClientFor(Alice);
        var ct = TestContext.Current.CancellationToken;
        var loginKey = await ADeveloperWithAKeyAsync(server, alice, ct);
        var vault = Path.Combine(server.DataDir, "vaults", VaultStore.KeyFor(Alice) + ".bin");

        HttpResponseMessage refused;
        using (Corp.Undeletable(vault))
        {
            refused = await alice.DeleteAsync("/api/vault", ct);
        }

        refused.StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable, "the delete did not happen");
        File.Exists(vault).Should().BeTrue();
        File.Exists(loginKey).Should().BeTrue("a vault that outlives its key is a vault nobody can open");
        File.Exists(Corp.RecordPath(server, Alice)).Should().BeTrue("nothing else was removed either");
    }

    [Fact]
    public async Task ASecondDeleteAfterTheLockClearsFinishesTheJob()
    {
        // A refusal must cost nothing but a retry: the state the first attempt leaves behind is the
        // state it started from.
        using var server = Corp.Server();
        using var alice = server.ClientFor(Alice);
        var ct = TestContext.Current.CancellationToken;
        await ADeveloperWithAKeyAsync(server, alice, ct);
        var vault = Path.Combine(server.DataDir, "vaults", VaultStore.KeyFor(Alice) + ".bin");

        using (Corp.Undeletable(vault))
        {
            (await alice.DeleteAsync("/api/vault", ct)).StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable);
        }
        var second = await alice.DeleteAsync("/api/vault", ct);

        second.StatusCode.Should().Be(HttpStatusCode.NoContent);
        File.Exists(vault).Should().BeFalse();
        File.Exists(Corp.LoginKeyPath(server, Alice)).Should().BeFalse("now the vault is gone, the key may go");
    }

    [Fact]
    public async Task AWriteCannotSlipBetweenTheVaultDeleteAndTheKeyRemoval()
    {
        // Raised by the review gate against the first version of this plan, which released the
        // per-person gate when the vault deletion returned. A PUT landing in that window recreates
        // the vault, and the endpoint then removes S from underneath it — the same "a vault nobody
        // can open" outcome, arriving by a different door. The pair is indivisible now: the gate is
        // held from the vault delete through the key removal.
        using var server = Corp.Server();
        using var alice = server.ClientFor(Alice);
        var ct = TestContext.Current.CancellationToken;
        await ADeveloperWithAKeyAsync(server, alice, ct);
        var gate = VaultStore.GateFor(VaultStore.KeyFor(Alice));

        // Hold the gate, start the delete, and assert what the VAULT is doing — not merely that the
        // request has not finished. The first version of this test asserted the latter and passed
        // against the unfixed code, because the endpoint already blocked further down, on the member
        // record's own gate, long after the vault had been deleted ungated.
        var vault = Path.Combine(server.DataDir, "vaults", VaultStore.KeyFor(Alice) + ".bin");
        await gate.WaitAsync(ct);
        Task<HttpResponseMessage> delete;
        try
        {
            delete = alice.DeleteAsync("/api/vault", ct);
            await Task.Delay(TimeSpan.FromMilliseconds(250), ct);
            File.Exists(vault).Should().BeTrue("the vault delete itself must wait for the per-person gate");
        }
        finally
        {
            gate.Release();
        }

        (await delete).StatusCode.Should().Be(HttpStatusCode.NoContent);
        File.Exists(Corp.LoginKeyPath(server, Alice)).Should().BeFalse();
    }

    [Fact]
    public async Task AFailedRegistryRemovalDoesNotFailTheVaultDelete()
    {
        // Vault first, then the record, and the vault decides the response. A record the OS will not
        // let go of leaves a record with no vault behind — the admin list shows it, the next DELETE or an
        // admin removes it — which is a better state than a 500 for a delete that in fact happened.
        //
        // The caller is an officer, deliberately. On Windows the fixture holds the record open with
        // FileShare.None, which the blocking gate inside RequireCaller (epic 2) reads as "cannot be read"
        // and answers 503 at the door — before the handler this test is about. The gate never consults an
        // officer's record, so the CTO is the one caller who reaches the delete with the file still held.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        var ct = TestContext.Current.CancellationToken;
        await cto.PutAsync("/api/vault", new ByteArrayContent(Blob), ct);
        var record = Corp.RecordPath(server, Corp.Cto);

        HttpResponseMessage deleted;
        using (Corp.Undeletable(record))
        {
            deleted = await cto.DeleteAsync("/api/vault", ct);
        }

        deleted.StatusCode.Should().Be(HttpStatusCode.NoContent, "the vault half happened and is what the caller asked for");
        (await cto.GetAsync("/api/vault", ct)).StatusCode.Should().Be(HttpStatusCode.NotFound);
        File.Exists(record).Should().BeTrue("the surviving state: a record with no vault");
    }

    [Fact]
    public async Task AClientHangingUpDuringTheDeleteDoesNotAbandonTheRegistryRemoval()
    {
        // Once the vault is gone, the registry removal after it is owed whether or not anyone is still
        // listening: cancelled by a disconnect it would leave a record with no vault AND throw out of a
        // handler whose work had already happened.
        //
        // THE ARRANGEMENT CHANGED with audit finding #4, and the reason is worth keeping. This test used
        // to hold the per-person gate and wait for the vault to disappear WHILE it held it — which only
        // worked because the vault delete took no gate at all. It does now (the vault and the login key
        // must be indivisible), so holding the gate would stop the delete before it started and the
        // guarantee under test would never be reached. The hang-up is therefore timed off the vault file
        // itself rather than off a lock: the moment it is gone the handler is past the gate and into the
        // registry removal, which runs on CancellationToken.None.
        using var server = Corp.Server();
        using var alice = server.ClientFor(Alice);
        var ct = TestContext.Current.CancellationToken;
        await alice.PutAsync("/api/vault", new ByteArrayContent(Blob), ct);
        var record = Corp.RecordPath(server, Alice);
        var vault = Path.Combine(server.DataDir, "vaults", VaultStore.KeyFor(Alice) + ".bin");
        using var hangUp = new CancellationTokenSource();

        var delete = alice.DeleteAsync("/api/vault", hangUp.Token);
        await Corp.Eventually(() => !File.Exists(vault), "the handler deleted the vault and reached the registry");
        hangUp.Cancel();
        try
        {
            await delete;
        }
        catch (OperationCanceledException)
        {
            // The client hung up, as arranged. It may also have finished first, which is fine: what is
            // under test is what the SERVER owes after the vault is gone, not who won the race.
        }

        await Corp.Eventually(() => !File.Exists(record), "the registry record was removed after the client left");
    }
}
