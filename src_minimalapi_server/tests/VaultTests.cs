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
}
