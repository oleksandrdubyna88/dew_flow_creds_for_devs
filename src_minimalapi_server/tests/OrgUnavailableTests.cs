using System.Net;
using System.Text.Json;
using FluentAssertions;

namespace CredVaultServer.Tests;

/// <summary>
/// A record this build cannot read, met on the request path. The plan round's finding: "unparseable
/// means not registered" is a privilege escalation with a corrupted file as its trigger — not
/// registered means the default, the default is <c>member</c>, and a member may export. So the endpoint
/// fails CLOSED, and this suite is what keeps it there.
/// </summary>
[Collection(ServerCollection.Name)]
public sealed class OrgUnavailableTests
{
    private static string Alice => $"alice@{VaultServer.Domain}";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    // The corruption itself is Corp.CorruptRecordAsync: the admin gate suite breaks records the same way.
    private static Task CorruptAsync(VaultServer server, string email) => Corp.CorruptRecordAsync(server, email);

    [Fact]
    public async Task ACorruptedRecordMakesOrgMeAnswer503NeverTheMemberDefault()
    {
        using var server = Corp.Server();
        using var alice = server.ClientFor(Alice);
        await Corp.SyncAsync(alice);
        await CorruptAsync(server, Alice);

        var response = await alice.GetAsync("/api/org/me", Ct);

        response.StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable);
        response.Headers.RetryAfter.Should().NotBeNull("the client is told when to ask again");
        response.Content.Headers.ContentType!.MediaType.Should().Be("application/json");
        var body = await response.Content.ReadAsStringAsync(Ct);
        body.Should().NotContain("\"role\"", "the member default is the escalation this status exists to prevent");
        JsonDocument.Parse(body).RootElement.GetProperty("error").GetString().Should().NotBeNullOrWhiteSpace();
    }

    [Fact]
    public async Task ASyncNeverOverwritesARecordItCannotRead()
    {
        // The hook's idempotent write starts from the default when it finds no record. A default written
        // over an unreadable one is an unblock nobody ordered — so the corrupt bytes stay, the vault
        // write still lands, and the operator fixes the file.
        using var server = Corp.Server();
        using var alice = server.ClientFor(Alice);
        await Corp.SyncAsync(alice);
        await CorruptAsync(server, Alice);

        var put = await Corp.SyncAsync(alice);

        put.StatusCode.Should().Be(HttpStatusCode.NoContent, "the vault write is not the registry's hostage");
        (await File.ReadAllTextAsync(Corp.RecordPath(server, Alice), Ct)).Should().Be(Corp.Garbage);
    }

    [Fact]
    public async Task TheUnavailableBodySaysAnAdministratorMustRepairIt()
    {
        // "Cannot be read" alone leaves a person retrying into the same wall. The body names who can end
        // it — an administrator — and still not the file: the path is the operator's business and is in
        // the server log, written once by the store.
        using var server = Corp.Server();
        using var alice = server.ClientFor(Alice);
        await Corp.SyncAsync(alice);
        await CorruptAsync(server, Alice);

        var response = await alice.GetAsync("/api/org/me", Ct);

        response.StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable);
        var error = JsonDocument.Parse(await response.Content.ReadAsStringAsync(Ct)).RootElement.GetProperty("error").GetString()!;
        error.Should().Contain("administrator", "the person is told who can end this");
        error.Should().NotContain("org/members", "the file stays in the log");
    }
}
