using System.Net;
using System.Text.Json;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

namespace CredVaultServer.Tests;

/// <summary>
/// The registration hook's failure semantics. It rides on a vault write that has ALREADY landed, so
/// whatever goes wrong with the registry afterwards is the operator's problem and never the caller's:
/// answering <c>500</c> for a vault that was in fact stored is a worse failure than an unregistered
/// person, who is a state the design already handles.
/// </summary>
/// <remarks>
/// <para>The registry is broken here by making <c>org/members</c> a FILE — nothing under it can then
/// be created or read, on any file system, without a permission trick the test runner may not have.</para>
/// <para>Two tests hold a lock the hook has to take, so that "a client hung up right here" and "an admin
/// wrote right here" land in a window that is otherwise microseconds wide. The vault's per-member gate is
/// static and process-wide, so every hold is released in a <c>finally</c>: a leaked gate would stall every
/// later test in the same stripe.</para>
/// </remarks>
[Collection(ServerCollection.Name)]
public sealed class OrgRegistrationTests
{
    private const string Admin = "admin@example.com";

    private static string Alice => $"alice@{VaultServer.Domain}";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static string MembersPath(VaultServer server) => Path.Combine(Corp.OrgDir(server), "members");

    private static void BlockTheRegistry(VaultServer server)
    {
        Directory.CreateDirectory(Corp.OrgDir(server));
        File.WriteAllText(MembersPath(server), "a file where the store expects a directory");
    }

    private static int RegisteredRows(VaultServer server) =>
        Corp.EventRows(server).Count(r => r.Kind == OrgEventKinds.MemberRegistered);

    /// <summary>
    /// The hook driven directly, no host: its dependencies on a throwaway directory, with a captured
    /// logger — the server's own logger is Serilog's, and a promise about a log line would otherwise live
    /// in a comment.
    /// </summary>
    private sealed class HookWorld : IDisposable
    {
        public string Dir { get; } = Path.Combine(Path.GetTempPath(), "cred-vault-tests", Guid.NewGuid().ToString("N"));

        public CapturingLogger<OrgEndpointDeps> Log { get; } = new();

        public OrgEndpointDeps Deps { get; }

        public HookWorld()
        {
            Directory.CreateDirectory(Dir);
            Deps = new OrgEndpointDeps(
                RequireCaller: _ => null,
                // The hook never reaches a gate; a delegate that refuses everything says so.
                RequireAdmin: _ => Task.FromResult<(string Email, string? Name)?>(null),
                DomainOf: _ => string.Empty,
                OrgRecovery: OrgRecoveryConfig.Read(Corp.Officers.Split(','), 2),
                Members: new OrgMembersStore(Dir, NullLogger<OrgMembersStore>.Instance),
                Settings: new OrgSettingsStore(Dir, NullLogger<OrgSettingsStore>.Instance),
                Events: new OrgEventLog(Dir, NullLogger<OrgEventLog>.Instance, () => DateTimeOffset.UtcNow),
                AllowAnyDomain: false,
                Log: Log,
                ServerContract: ContractVersion.Current);
        }

        private string MembersDir => Path.Combine(Dir, "org", "members");

        private string RecordPath(string email) => Path.Combine(MembersDir, VaultStore.KeyFor(email) + ".json");

        public void BreakTheRegistry()
        {
            Directory.CreateDirectory(Path.Combine(Dir, "org"));
            File.WriteAllText(MembersDir, "a file where the store expects a directory");
        }

        /// <summary>An admin's create, landing on disk directly — the store's own write would wait on the gate the test holds.</summary>
        public void WriteRecordAsAdmin(string email)
        {
            Directory.CreateDirectory(MembersDir);
            var record = MemberRecord.DefaultFor(email, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds())
                with { Role = MemberRole.Dev, UpdatedBy = Admin };
            File.WriteAllBytes(RecordPath(email), JsonSerializer.SerializeToUtf8Bytes(record, AppJsonContext.Default.MemberRecord));
        }

        public MemberRecord ReadRecord(string email) =>
            JsonSerializer.Deserialize(File.ReadAllBytes(RecordPath(email)), AppJsonContext.Default.MemberRecord)!;

        public int RegisteredRows()
        {
            var events = Path.Combine(Dir, "org", "events");
            return Directory.Exists(events)
                ? Directory.EnumerateFiles(events, "*.ndjson").SelectMany(File.ReadAllLines).Count(l => l.Contains(OrgEventKinds.MemberRegistered))
                : 0;
        }

        public void Dispose()
        {
            try
            {
                Directory.Delete(Dir, recursive: true);
            }
            catch (IOException)
            {
                // A handle not yet released; the temp sweeper gets it.
            }
        }
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

    [Fact]
    public async Task ASecondSyncAfterRegistrationEmitsNothing()
    {
        // The testable half of the crash window. The record is written and THEN the row appended, so a
        // crash between the two costs one row and can never produce a duplicate: the row rides on
        // `Created`, which the store computes inside the lock, and a later sync finds the record.
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
        // either writes. The per-member lock inside the store is what makes the second one report
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
    public async Task AnAdminCreatingTheRecordInTheHooksWindowKeepsTheirStamp()
    {
        // The window: the hook decides "no record" and only then takes the per-member lock. An admin whose
        // first edit lands in between creates the record — and a sync that then re-stamped it would write
        // updatedBy "" over the admin's name, which is exactly the trail an admin action is supposed to
        // leave. The gate is held here so the hook's decision is forced BEFORE the admin's write and its
        // own write AFTER it: RegisterOnSyncAsync runs synchronously up to its first wait on that gate.
        using var world = new HookWorld();
        var gate = VaultStore.GateFor(VaultStore.KeyFor(Alice));
        Task hook;
        await gate.WaitAsync(Ct);
        try
        {
            hook = OrgEndpoints.RegisterOnSyncAsync(world.Deps, Alice, Ct);
            world.WriteRecordAsAdmin(Alice);
        }
        finally
        {
            gate.Release();
        }
        await hook;

        var record = world.ReadRecord(Alice);
        record.UpdatedBy.Should().Be(Admin, "the sync found a record the moment it held the lock, and left it alone");
        record.Role.Should().Be(MemberRole.Dev);
        world.RegisteredRows().Should().Be(0, "the sync created nothing, so it registered nobody");
        world.Log.Errors.Should().BeEmpty();
    }

    [Fact]
    public async Task AClientHangingUpAfterRegistrationStillGetsItsRow()
    {
        // Once the record is written the row is owed whoever is still listening: cancelled by a
        // disconnect, it is lost for good, because every later sync finds the record and emits nothing.
        // The event log's writer lock is held here so the hang-up lands exactly between the two.
        using var server = Corp.Server();
        using var alice = server.ClientFor(Alice);
        var events = server.Services.GetRequiredService<OrgEventLog>();
        using var hangUp = new CancellationTokenSource();
        Task<HttpResponseMessage> sync;
        await events.Gate.WaitAsync(Ct);
        try
        {
            sync = alice.PutAsync("/api/vault", new ByteArrayContent(Corp.Blob), hangUp.Token);
            await Corp.Eventually(
                () => File.Exists(Corp.RecordPath(server, Alice)),
                "the record was written and the hook reached the event log");
            hangUp.Cancel();
            // The abort lands off the calling thread. A hook that handed the client's token to the append
            // abandons the row and the request completes here; one that did not is still waiting on the
            // gate. Half a second either way, so the release cannot beat the cancellation and prove nothing.
            await Corp.Within(TimeSpan.FromMilliseconds(500), () => sync.IsCompleted);
        }
        finally
        {
            events.Gate.Release();
        }
        try
        {
            await sync;
        }
        catch (OperationCanceledException)
        {
            // The client hung up, as arranged.
        }

        await Corp.Eventually(() => RegisteredRows(server) == 1, "the member.registered row was appended after the client left");
    }

    [Fact]
    public async Task AFailedRegistrationIsLoggedAtError()
    {
        // The swallow is deliberate, and this line is its one visible trace: an operator learns of an
        // unregistered person from the log or not at all.
        using var world = new HookWorld();
        world.BreakTheRegistry();

        var act = () => OrgEndpoints.RegisterOnSyncAsync(world.Deps, Alice, Ct);

        await act.Should().NotThrowAsync("the vault write this rides on has already landed");
        world.Log.Errors.Should().ContainSingle(m => m.Contains(Alice), "the operator's signal names the person");
    }
}
