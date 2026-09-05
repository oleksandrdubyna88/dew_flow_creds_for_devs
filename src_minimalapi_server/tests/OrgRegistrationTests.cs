using System.Net;
using FluentAssertions;

namespace CredVaultServer.Tests;

/// <summary>
/// The registration hook's failure semantics. It rides on a vault write that has ALREADY landed, so
/// whatever goes wrong with the registry afterwards is the operator's problem and never the caller's:
/// answering <c>500</c> for a vault that was in fact stored is a worse failure than an unregistered
/// person, who is a state the design already handles.
/// </summary>
/// <remarks>
/// The registry is broken here by making <c>org/members</c> a FILE — nothing under it can then be
/// created or read, on any file system, without a permission trick the test runner may not have.
/// </remarks>
[Collection(ServerCollection.Name)]
public sealed class OrgRegistrationTests
{
    private static string Alice => $"alice@{VaultServer.Domain}";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static string MembersPath(VaultServer server) => Path.Combine(Corp.OrgDir(server), "members");

    private static void BlockTheRegistry(VaultServer server)
    {
        Directory.CreateDirectory(Corp.OrgDir(server));
        File.WriteAllText(MembersPath(server), "a file where the store expects a directory");
    }

    [Fact]
    public async Task AFailedRegistryWriteDoesNotFailTheVaultWrite()
    {
        using var server = Corp.Server();
        BlockTheRegistry(server);
        using var alice = server.ClientFor(Alice);

        var put = await Corp.SyncAsync(alice);

        put.StatusCode.Should().Be(
            HttpStatusCode.NoContent,
            "the vault was stored; a registry that cannot be written is logged, not reported to the caller");
        (await alice.GetByteArrayAsync("/api/vault", Ct)).Should().Equal(Corp.Blob);
        File.Exists(Corp.RecordPath(server, Alice)).Should().BeFalse("nothing could be written under a file");
    }

    [Fact]
    public async Task TheNextVaultWriteRegistersThePersonAfterAll()
    {
        // Idempotent by design, so the retry is the next sync — no queue, no repair job.
        using var server = Corp.Server();
        BlockTheRegistry(server);
        using var alice = server.ClientFor(Alice);
        await Corp.SyncAsync(alice);
        File.Exists(Corp.RecordPath(server, Alice)).Should().BeFalse("precondition: the first sync could not register");

        File.Delete(MembersPath(server)); // the operator fixes the disk
        var put = await Corp.SyncAsync(alice);

        put.StatusCode.Should().Be(HttpStatusCode.NoContent);
        File.Exists(Corp.RecordPath(server, Alice)).Should().BeTrue("the next sync is the retry");
        Corp.ReadRecord(server, Alice).Role.Should().Be(MemberRole.Member);
    }

    [Fact]
    public async Task RegistrationLeavesExactlyOneMemberRegisteredRow()
    {
        // The row is emitted on the write that CREATES the record, and only on that one: a second sync
        // finds the record and appends nothing, or the log would grow by one row per sync per person.
        using var server = Corp.Server();
        using var alice = server.ClientFor(Alice);

        await Corp.SyncAsync(alice);
        await Corp.SyncAsync(alice);

        var registered = Corp.EventRows(server).Where(r => r.Kind == OrgEventKinds.MemberRegistered).ToList();
        registered.Should().ContainSingle();
        registered[0].Actor.Should().Be(Alice, "the person is the actor of their own registration");
        registered[0].Subject.Should().Be(Alice);
        registered[0].Detail.Should().Be(MemberRole.Member, "the row carries the default role");
    }
}
