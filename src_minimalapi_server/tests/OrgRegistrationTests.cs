using System.Net;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;

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

    private static int RegisteredRows(VaultServer server) =>
        Corp.EventRows(server).Count(r => r.Kind == OrgEventKinds.MemberRegistered);

    [Fact]
    public async Task ASecondSyncAfterRegistrationEmitsNothing()
    {
        // The testable half of the crash window. The record is written and THEN the row appended, so a
        // crash between the two costs one row and can never produce a duplicate: the row rides on
        // `Created`, which UpsertAsync computes inside the lock, and a later sync finds the record.
        using var server = Corp.Server();
        using var alice = server.ClientFor(Alice);
        await Corp.SyncAsync(alice);
        RegisteredRows(server).Should().Be(1, "precondition: the first sync registered");

        await Corp.SyncAsync(alice);

        RegisteredRows(server).Should().Be(1, "a sync that finds a record appends nothing");
    }

    [Fact]
    public async Task TwoConcurrentFirstSyncsLeaveExactlyOneMemberRegisteredRow()
    {
        // Two devices of one person, both syncing for the first time: both see NotRegistered before
        // either writes. The per-member lock inside UpsertAsync is what makes the second one report
        // Created: false — pinned here rather than trusted.
        using var server = Corp.Server();
        using var laptop = server.ClientFor(Alice);
        using var desktop = server.ClientFor(Alice);

        var results = await Task.WhenAll(Corp.SyncAsync(laptop), Corp.SyncAsync(desktop));

        results.Should().OnlyContain(r => r.StatusCode == HttpStatusCode.NoContent);
        RegisteredRows(server).Should().Be(1);
        Directory.GetFiles(Path.Combine(Corp.OrgDir(server), "members")).Should().ContainSingle();
    }

    [Fact]
    public async Task AFailedRegistrationIsLoggedAtError()
    {
        // The swallow is deliberate, and this line is its one visible trace: an operator learns of an
        // unregistered person from the log or not at all. Driven against the hook directly with a
        // captured logger, because the server's own logger is Serilog's and the promise would otherwise
        // live in a comment.
        var dir = Path.Combine(Path.GetTempPath(), "cred-vault-tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(Path.Combine(dir, "org"));
        await File.WriteAllTextAsync(Path.Combine(dir, "org", "members"), "a file where the store expects a directory", Ct);
        var log = new CapturingLogger<OrgEndpointDeps>();
        var deps = new OrgEndpointDeps(
            RequireCaller: _ => null,
            DomainOf: _ => string.Empty,
            OrgRecovery: OrgRecoveryConfig.Read(Corp.Officers.Split(','), 2),
            Members: new OrgMembersStore(dir, NullLogger<OrgMembersStore>.Instance),
            Settings: new OrgSettingsStore(dir, NullLogger<OrgSettingsStore>.Instance),
            Events: new OrgEventLog(dir, NullLogger<OrgEventLog>.Instance, () => DateTimeOffset.UtcNow),
            AllowAnyDomain: false,
            Log: log,
            ServerContract: ContractVersion.Current);
        try
        {
            var act = () => OrgEndpoints.RegisterOnSyncAsync(deps, Alice, Ct);

            await act.Should().NotThrowAsync("the vault write this rides on has already landed");
            log.Errors.Should().ContainSingle(m => m.Contains(Alice), "the operator's signal names the person");
        }
        finally
        {
            Directory.Delete(dir, recursive: true);
        }
    }
}
