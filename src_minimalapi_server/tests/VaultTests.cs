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

    [Fact]
    public async Task AFailedRegistryRemovalDoesNotFailTheVaultDelete()
    {
        // Vault first, then the record, and the vault decides the response. A record the OS will not
        // let go of leaves a record with no vault behind — the admin list shows it, the next DELETE or an
        // admin removes it — which is a better state than a 500 for a delete that in fact happened.
        using var server = Corp.Server();
        using var alice = server.ClientFor(Alice);
        var ct = TestContext.Current.CancellationToken;
        await alice.PutAsync("/api/vault", new ByteArrayContent(Blob), ct);
        var record = Corp.RecordPath(server, Alice);

        HttpResponseMessage deleted;
        using (Corp.Undeletable(record))
        {
            deleted = await alice.DeleteAsync("/api/vault", ct);
        }

        deleted.StatusCode.Should().Be(HttpStatusCode.NoContent, "the vault half happened and is what the caller asked for");
        (await alice.GetAsync("/api/vault", ct)).StatusCode.Should().Be(HttpStatusCode.NotFound);
        File.Exists(record).Should().BeTrue("the surviving state: a record with no vault");
    }

    [Fact]
    public async Task AClientHangingUpDuringTheDeleteDoesNotAbandonTheRegistryRemoval()
    {
        // The vault is gone the moment DeleteEverythingFor returns; the registry removal after it is owed
        // whether or not anyone is still listening. Cancelled by a disconnect it would leave a record
        // with no vault AND throw out of a handler whose work had already happened. The per-member lock
        // the removal waits on is held here so the hang-up lands exactly in that window; the gate is
        // process-wide, hence the finally.
        using var server = Corp.Server();
        using var alice = server.ClientFor(Alice);
        var ct = TestContext.Current.CancellationToken;
        await alice.PutAsync("/api/vault", new ByteArrayContent(Blob), ct);
        var record = Corp.RecordPath(server, Alice);
        var vault = Path.Combine(server.DataDir, "vaults", VaultStore.KeyFor(Alice) + ".bin");
        var gate = VaultStore.GateFor(VaultStore.KeyFor(Alice));
        using var hangUp = new CancellationTokenSource();
        Task<HttpResponseMessage> delete;
        await gate.WaitAsync(ct);
        try
        {
            delete = alice.DeleteAsync("/api/vault", hangUp.Token);
            await Corp.Eventually(() => !File.Exists(vault), "the handler deleted the vault and reached the registry");
            hangUp.Cancel();
            // The test host raises RequestAborted off the calling thread and completes the client's task
            // only when the pipeline ends. A handler that honoured the token dies here and that task
            // completes; one that ignores it is still waiting on the gate, so the task cannot be awaited
            // before the release without a deadlock. Half a second is given for the abort to land either
            // way — releasing sooner would hand the gate to a waiter not yet cancelled and prove nothing.
            await Corp.Within(TimeSpan.FromMilliseconds(500), () => delete.IsCompleted);
        }
        finally
        {
            gate.Release();
        }
        try
        {
            await delete;
        }
        catch (OperationCanceledException)
        {
            // The client hung up, as arranged.
        }

        await Corp.Eventually(() => !File.Exists(record), "the registry record was removed after the client left");
    }
}
