using System.Text;
using FluentAssertions;

namespace CredVaultServer.Tests;

[Collection(ServerCollection.Name)]
public sealed class TeamTests
{
    private static readonly byte[] Blob = Encoding.UTF8.GetBytes("""{"data":"ciphertext"}""");

    private static string Alice => $"alice@{VaultServer.Domain}";

    private static string Bob => $"bob@{VaultServer.Domain}";

    [Fact]
    public async Task TeamListsEveryoneWhoHasStoredAVault()
    {
        using var server = new VaultServer();
        using var alice = server.ClientFor(Alice);
        using var bob = server.ClientFor(Bob);

        await alice.PutAsync(
            "/api/vault", new ByteArrayContent(Blob), TestContext.Current.CancellationToken);
        await bob.PutAsync(
            "/api/vault", new ByteArrayContent(Blob), TestContext.Current.CancellationToken);

        var team = await alice.GetStringAsync("/api/team", TestContext.Current.CancellationToken);

        team.Should().Contain(Alice).And.Contain(Bob);
    }

    [Fact]
    public async Task SomeoneWithNoVaultIsNotInTheTeamList()
    {
        using var server = new VaultServer();
        using var alice = server.ClientFor(Alice);

        await alice.PutAsync(
            "/api/vault", new ByteArrayContent(Blob), TestContext.Current.CancellationToken);

        var team = await alice.GetStringAsync("/api/team", TestContext.Current.CancellationToken);

        team.Should().NotContain(Bob);
    }

    [Fact]
    public async Task DeletingAnAccountDropsItOutOfTheTeamList()
    {
        using var server = new VaultServer();
        using var alice = server.ClientFor(Alice);
        using var bob = server.ClientFor(Bob);

        await alice.PutAsync(
            "/api/vault", new ByteArrayContent(Blob), TestContext.Current.CancellationToken);
        await bob.PutAsync(
            "/api/vault", new ByteArrayContent(Blob), TestContext.Current.CancellationToken);

        await alice.DeleteAsync("/api/vault", TestContext.Current.CancellationToken);

        var team = await bob.GetStringAsync("/api/team", TestContext.Current.CancellationToken);

        team.Should().NotContain(Alice).And.Contain(Bob);
    }

    [Fact]
    public async Task AMalformedEmailSidecarIsSkippedNotFatal()
    {
        using var server = new VaultServer();
        using var alice = server.ClientFor(Alice);
        var ct = TestContext.Current.CancellationToken;

        await alice.PutAsync("/api/vault", new ByteArrayContent(Blob), ct);

        // Drop bogus sidecars straight into the vaults dir, as a hostile or half-written
        // file would look. Team discovery must skip them, not 500.
        var vaultsDir = Path.Combine(server.DataDir, "vaults");
        await File.WriteAllTextAsync(Path.Combine(vaultsDir, "bogus.email"), "not-an-email", ct);
        await File.WriteAllTextAsync(Path.Combine(vaultsDir, "blank.email"), "", ct);

        var resp = await alice.GetAsync("/api/team", ct);

        resp.StatusCode.Should().Be(System.Net.HttpStatusCode.OK);
        (await resp.Content.ReadAsStringAsync(ct)).Should().Contain(Alice);
    }

}
