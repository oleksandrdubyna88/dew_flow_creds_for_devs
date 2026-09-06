using System.Net;
using System.Text.Json;
using FluentAssertions;

namespace CredVaultServer.Tests;

/// <summary>
/// <c>GET /api/org/login-key</c> — the server's half of a developer's vault key, and the only response
/// on this server that carries key material.
/// </summary>
/// <remarks>
/// The cases that decide something larger than one status code: an active developer is minted a key ONCE
/// and gets the same bytes ever after (a second mint would orphan every wrap sealed to the first); a
/// member who already has one is still served it, because binding is a property of a VERSION and a
/// demoted developer still holds bound versions; a deployment with no KEK degrades this route and
/// nothing else; and a key this server cannot read is a <c>503</c> with nothing replaced.
/// </remarks>
[Collection(ServerCollection.Name)]
public sealed class LoginKeyEndpointTests
{
    private static string Alice => $"alice@{VaultServer.Domain}";

    private static string Bob => $"bob@{VaultServer.Domain}";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static async Task<JsonElement> KeyBodyAsync(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync(Ct)).RootElement.Clone();

    private static async Task<string> KeyOf(HttpResponseMessage response) =>
        (await KeyBodyAsync(response)).GetProperty("loginKey").GetString()!;

    /// <summary>Make somebody a developer the way an admin does, after they have registered.</summary>
    private static async Task MakeDevAsync(VaultServer server, HttpClient admin, HttpClient them, string email)
    {
        await Corp.SyncAsync(them);
        (await Corp.SetMemberAsync(admin, email, role: "dev")).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task ADeveloperIsMintedAKeyAndTheSecondCallReturnsTheSameBytes()
    {
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = server.ClientFor(Alice);
        await MakeDevAsync(server, cto, alice, Alice);

        var first = await Corp.LoginKeyAsync(alice);
        var second = await Corp.LoginKeyAsync(alice);

        first.StatusCode.Should().Be(HttpStatusCode.OK);
        var key = await KeyOf(first);
        Convert.FromBase64String(key).Should().HaveCount(LoginKeyStore.KeyBytes);
        (await KeyOf(second)).Should().Be(key, "a second mint would orphan every wrap sealed to the first");
    }

    [Fact]
    public async Task TheKeyResponseIsNeverCacheable()
    {
        // It carries key material. A proxy or a browser holding this 200 would replay one person's
        // factor to whoever asked next.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = server.ClientFor(Alice);
        await MakeDevAsync(server, cto, alice, Alice);

        var response = await Corp.LoginKeyAsync(alice);

        response.Headers.CacheControl!.NoStore.Should().BeTrue();
    }

    [Fact]
    public async Task TheFingerprintIsSixteenHexCharactersAndTravelsWithTheKey()
    {
        // Story 3's client stores it beside a wrap and compares it on the next unlock, so "the server's
        // key changed under me" is answerable without either side comparing secrets — and a changed key
        // is never reported to a person as a wrong PIN.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = server.ClientFor(Alice);
        await MakeDevAsync(server, cto, alice, Alice);

        var body = await KeyBodyAsync(await Corp.LoginKeyAsync(alice));

        var fingerprint = body.GetProperty("fingerprint").GetString()!;
        fingerprint.Should().MatchRegex("^[0-9a-f]{16}$");
        fingerprint.Should().NotContain(body.GetProperty("loginKey").GetString()!);
    }

    [Fact]
    public async Task AMemberWithNoKeyIs404AndNothingIsMintedForThem()
    {
        // The status is half the guarantee. If the handler took the minting branch for a member, this
        // would still be a 404-shaped failure on a server that had quietly issued a key.
        using var server = Corp.Server();
        using var bob = server.ClientFor(Bob);
        await Corp.SyncAsync(bob);

        var response = await Corp.LoginKeyAsync(bob);

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        File.Exists(Corp.LoginKeyPath(server, Bob)).Should().BeFalse("a member must not be minted a key");
    }

    [Fact]
    public async Task ADemotedDeveloperIsStillServedTheKeyTheirVersionsAreSealedTo()
    {
        // The deadlock the story split found: binding is a property of a VERSION, not of a person. A
        // 403 for "not a dev" would leave a demoted colleague holding a vault nobody can open.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = server.ClientFor(Alice);
        await MakeDevAsync(server, cto, alice, Alice);
        var minted = await KeyOf(await Corp.LoginKeyAsync(alice));

        (await Corp.SetMemberAsync(cto, Alice, role: "member")).StatusCode.Should().Be(HttpStatusCode.OK);

        var after = await Corp.LoginKeyAsync(alice);
        after.StatusCode.Should().Be(HttpStatusCode.OK);
        (await KeyOf(after)).Should().Be(minted);
    }

    [Fact]
    public async Task ABlockedDeveloperIsRefusedTheKeyByTheGate()
    {
        // This is the whole mechanism of blocking a developer: no rotation, no revocation — the server
        // simply stops handing S over, and their bound vault stops opening.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = server.ClientFor(Alice);
        await MakeDevAsync(server, cto, alice, Alice);
        (await Corp.LoginKeyAsync(alice)).StatusCode.Should().Be(HttpStatusCode.OK);

        await Corp.SetActiveAsync(cto, Alice, active: false);

        var refused = await Corp.LoginKeyAsync(alice);
        refused.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        refused.Headers.GetValues(CallerStanding.ReasonHeader).Should().ContainSingle();
    }

    [Fact]
    public async Task AnUnblockedDeveloperGetsTheSameKeyBack()
    {
        // The owner's decision, in a test: rotation would orphan the vault, so re-admission restores the
        // person to the vault they had rather than to a new key and an unopenable file.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = server.ClientFor(Alice);
        await MakeDevAsync(server, cto, alice, Alice);
        var before = await KeyOf(await Corp.LoginKeyAsync(alice));
        await Corp.SetActiveAsync(cto, Alice, active: false);

        await Corp.SetActiveAsync(cto, Alice, active: true);

        (await KeyOf(await Corp.LoginKeyAsync(alice))).Should().Be(before);
    }

    [Fact]
    public async Task WithNoKekTheRouteIs503AndOrdinaryVaultSyncIsUntouched()
    {
        // The lesson the officer roster taught expensively: refusing to boot over an optional feature
        // took ordinary sync down for everyone. One route degrades; the server works.
        using var server = Corp.ServerWithoutKek();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = server.ClientFor(Alice);
        await MakeDevAsync(server, cto, alice, Alice);

        var refused = await Corp.LoginKeyAsync(alice);

        refused.StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable);
        refused.Headers.RetryAfter.Should().NotBeNull("a 503 with no Retry-After invites a client into a tight loop");
        (await Corp.RefusalAsync(refused, HttpStatusCode.ServiceUnavailable)).Should().Contain("Vault:LoginKey:Kek");
        (await Corp.SyncAsync(alice)).StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await alice.GetAsync("/api/vault", Ct)).StatusCode.Should().Be(HttpStatusCode.OK);
        (await alice.GetAsync("/api/team", Ct)).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task AKekThatIsNotThirtyTwoBytesIsRefusedRatherThanTruncated()
    {
        // A nearly-right key is how vaults end up sealed under something nobody can reproduce.
        using var server = Corp.ServerWithoutKek(Convert.ToBase64String(new byte[16]));
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = server.ClientFor(Alice);
        await MakeDevAsync(server, cto, alice, Alice);

        (await Corp.LoginKeyAsync(alice)).StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable);
    }

    [Fact]
    public async Task OnAPersonalServerTheRouteSaysThisDeploymentIssuesNoKeys()
    {
        using var server = new VaultServer();
        using var alice = server.ClientFor(Alice);
        await Corp.SyncAsync(alice);

        var response = await Corp.LoginKeyAsync(alice);

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        Directory.Exists(Path.Combine(server.DataDir, "org", "login-keys"))
            .Should().BeFalse("a personal server grows no org/ tree");
    }

    [Fact]
    public async Task TheKeyOnDiskIsCiphertext()
    {
        // The store's own suite pins the other half — that no log line carries it — where the assertion
        // is deterministic rather than at the mercy of the file sink's flush interval.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = server.ClientFor(Alice);
        await MakeDevAsync(server, cto, alice, Alice);

        var key = await KeyOf(await Corp.LoginKeyAsync(alice));

        var onDisk = await File.ReadAllTextAsync(Corp.LoginKeyPath(server, Alice), Ct);
        onDisk.Should().NotContain(key, "the key is sealed under the deployment KEK, never stored in the clear");
        onDisk.Should().Contain("iv").And.Contain("tag", "the sealed shape, not the key");
    }

    [Fact]
    public async Task DeletingTheVaultRemovesTheLoginKey()
    {
        // Everything that grows has an owner. The key is the last thing removed, so a crash can only
        // ever leave a key without a vault — never a vault without the key that opens it.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = server.ClientFor(Alice);
        await MakeDevAsync(server, cto, alice, Alice);
        await Corp.LoginKeyAsync(alice);
        File.Exists(Corp.LoginKeyPath(server, Alice)).Should().BeTrue("the premise");

        (await alice.DeleteAsync("/api/vault", Ct)).StatusCode.Should().Be(HttpStatusCode.NoContent);

        File.Exists(Corp.LoginKeyPath(server, Alice)).Should().BeFalse();
    }

    [Fact]
    public async Task DeletingTheVaultStillWorksOnAServerThatCannotIssueKeys()
    {
        // Removing a key is not decryption, so it must not depend on the KEK — otherwise configuring
        // the feature badly would break ordinary account removal.
        using var server = Corp.ServerWithoutKek();
        using var alice = server.ClientFor(Alice);
        await Corp.SyncAsync(alice);

        (await alice.DeleteAsync("/api/vault", Ct)).StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task MixedCasingIsOnePersonAndOneKey()
    {
        // The plan round asked for this one. KeyFor lowercases internally and TokenIdentity lowercases
        // the claim, so the two spellings are one identity — pinned, because a second key for the same
        // person is the worst thing this store can do.
        using var server = Corp.Server();
        using var cto = server.ClientFor(Corp.Cto);
        using var alice = server.ClientFor(Alice);
        using var shouty = server.ClientFor(Alice.ToUpperInvariant());
        await MakeDevAsync(server, cto, alice, Alice);

        var lower = await KeyOf(await Corp.LoginKeyAsync(alice));
        var upper = await KeyOf(await Corp.LoginKeyAsync(shouty));

        upper.Should().Be(lower);
        Directory.GetFiles(Path.Combine(Corp.OrgDir(server), "login-keys")).Should().ContainSingle();
    }
}
