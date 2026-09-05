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
    private const string Garbage = "{ this is not a record";

    private static string Alice => $"alice@{VaultServer.Domain}";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    /// <summary>
    /// Overwrite Alice's record with something no build can parse — a half-written file, a bad sector, a
    /// restore from a truncated archive — and move its mtime on, as the seconds between a restore and
    /// the next request would, so the server's stat check cannot mistake it for the record it cached.
    /// </summary>
    private static async Task CorruptAsync(VaultServer server, string email)
    {
        var path = Corp.RecordPath(server, email);
        await File.WriteAllTextAsync(path, Garbage, Ct);
        File.SetLastWriteTimeUtc(path, File.GetLastWriteTimeUtc(path).AddSeconds(2));
    }

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
        (await File.ReadAllTextAsync(Corp.RecordPath(server, Alice), Ct)).Should().Be(Garbage);
    }
}
