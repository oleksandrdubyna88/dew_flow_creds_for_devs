using System.Text;
using System.Text.Json;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;

namespace CredVaultServer.Tests;

/// <summary>
/// The event log's writer: what the file looks like after appends, day boundaries and failures. The
/// reader belongs to a later epic; what this one can promise is the shape of the file it leaves behind.
/// </summary>
public sealed class OrgEventLogTests : IDisposable
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static readonly DateTimeOffset Noon = new(2026, 3, 1, 12, 0, 0, TimeSpan.Zero);

    private readonly string _dir =
        Path.Combine(Path.GetTempPath(), "cred-vault-tests", Guid.NewGuid().ToString("N"));

    private readonly CapturingLogger<OrgEventLog> _log = new();
    private DateTimeOffset _now = Noon;

    public OrgEventLogTests()
    {
        Directory.CreateDirectory(_dir);
    }

    public void Dispose()
    {
        try
        {
            Directory.Delete(_dir, recursive: true);
        }
        catch (IOException)
        {
            // A handle not yet released; the temp sweeper gets it.
        }
    }

    private OrgEventLog NewLog(TimeSpan? lockWait = null) => new(_dir, _log, () => _now, lockWait);

    private string EventsDir => Path.Combine(_dir, "org", "events");

    private static OrgEventDto Row(string kind) => new(
        At: Noon.ToUnixTimeMilliseconds(),
        Kind: kind,
        Actor: "admin@example.com",
        Subject: "anna@example.com",
        Project: null,
        ShareId: null,
        EntityName: null,
        EntityKind: null,
        Outcome: null,
        Detail: "member -> dev");

    private static OrgEventDto Parse(string line) =>
        JsonSerializer.Deserialize(line, AppJsonContext.Default.OrgEventDto)!;

    [Fact]
    public async Task AppendThenReadTheFileBack()
    {
        var log = NewLog();

        (await log.AppendAsync(Row(OrgEventKinds.MemberRegistered), Ct)).Should().BeTrue();
        (await log.AppendAsync(Row(OrgEventKinds.MemberRoleChanged), Ct)).Should().BeTrue();

        var lines = await File.ReadAllLinesAsync(log.PathForDay(Noon), Ct);
        lines.Should().HaveCount(2, "one row per line, and no blank line between two whole rows");
        Parse(lines[0]).Should().Be(Row(OrgEventKinds.MemberRegistered), "a row round-trips whole");
        Parse(lines[1]).Kind.Should().Be(OrgEventKinds.MemberRoleChanged);
    }

    [Fact]
    public async Task ADayBoundaryStartsANewFile()
    {
        // One file per UTC day is what lets a range query skip whole files. The clock is injected so
        // midnight is a test rather than a wait.
        var log = NewLog();
        _now = new DateTimeOffset(2026, 3, 1, 23, 59, 59, 999, TimeSpan.Zero);
        await log.AppendAsync(Row(OrgEventKinds.SettingsChanged), Ct);
        _now = _now.AddMilliseconds(1);
        await log.AppendAsync(Row(OrgEventKinds.SettingsChanged), Ct);

        Directory.EnumerateFiles(EventsDir, "*.ndjson").Select(f => Path.GetFileName(f)).Order()
            .Should().Equal("2026-03-01.ndjson", "2026-03-02.ndjson");
        (await File.ReadAllLinesAsync(log.PathForDay(_now), Ct)).Should().ContainSingle();
    }

    [Fact]
    public void TheDayIsTheUtcDayWhateverOffsetTheClockCarries()
    {
        // 01:00 at UTC+2 is still the previous day in UTC. A host that happens to run in a timezone
        // must not split one UTC day across two files.
        var offsetClock = new DateTimeOffset(2026, 3, 2, 1, 0, 0, TimeSpan.FromHours(2));

        Path.GetFileName(NewLog().PathForDay(offsetClock)).Should().Be("2026-03-01.ndjson");
    }

    [Fact]
    public async Task AnAppendAfterATornFinalLineStartsOnAFreshLine()
    {
        // A process killed mid-append leaves a partial line with no newline. Appending straight after
        // it would fuse the torn row and the new one into one unparseable line, and the reader would
        // lose two rows where it should lose one.
        var log = NewLog();
        var path = log.PathForDay(Noon);
        await log.AppendAsync(Row(OrgEventKinds.MemberRegistered), Ct);
        const string torn = "{\"at\":1,\"kind\":\"member.role_ch";
        await File.AppendAllTextAsync(path, torn, Ct);

        await log.AppendAsync(Row(OrgEventKinds.MemberShareDefaultChanged), Ct);

        var lines = await File.ReadAllLinesAsync(path, Ct);
        lines.Should().HaveCount(3);
        lines[1].Should().Be(torn, "the torn line is left as it was; repairing it is the reader's decision");
        Parse(lines[2]).Kind.Should().Be(OrgEventKinds.MemberShareDefaultChanged, "the new row is whole, on its own line");
    }

    [Fact]
    public async Task AnUnwritableFolderIsLoggedNotThrown()
    {
        // The row is appended after the mutation has landed; a role change that happened must not be
        // reported as a 500 because the log could not be written.
        Directory.CreateDirectory(Path.Combine(_dir, "org"));
        await File.WriteAllTextAsync(EventsDir, "a file where the folder should be", Ct);
        var log = NewLog();

        var appended = await log.AppendAsync(Row(OrgEventKinds.MemberRoleChanged), Ct);

        appended.Should().BeFalse();
        _log.Errors.Should().ContainSingle(m => m.Contains(log.PathForDay(Noon)), "the operator's signal names the file");
    }

    [Fact]
    public async Task AStuckWriterCostsOneRowNotTheRequest()
    {
        // One lock for every writer: an unbounded wait here is how one stuck writer stalls the server.
        var log = NewLog(lockWait: TimeSpan.FromMilliseconds(50));
        await log.Gate.WaitAsync(Ct);
        bool whileHeld;
        try
        {
            whileHeld = await log.AppendAsync(Row(OrgEventKinds.SettingsChanged), Ct);
        }
        finally
        {
            log.Gate.Release();
        }

        whileHeld.Should().BeFalse();
        _log.Errors.Should().ContainSingle(m => m.Contains("lock"));
        (await log.AppendAsync(Row(OrgEventKinds.SettingsChanged), Ct))
            .Should().BeTrue("the bound is on the wait, not on the log");
    }

    [Fact]
    public async Task TwoInstancesOverOneDirectoryBothAppendAndEveryRowSurvives()
    {
        // A rolling restart has two instances writing the same day file for a while. Each holds its
        // own in-process lock, so nothing but the file's own sharing and append semantics stands
        // between them — and a row refused or overwritten there is a row the company never sees.
        var first = NewLog();
        var second = new OrgEventLog(_dir, _log, () => _now);
        const int perInstance = 200;

        var a = Task.Run(() => AppendManyAsync(first, "a", perInstance), Ct);
        var b = Task.Run(() => AppendManyAsync(second, "b", perInstance), Ct);
        var accepted = await Task.WhenAll(a, b);

        accepted.Sum().Should().Be(2 * perInstance, "neither instance may lose a row to the other");
        var lines = await File.ReadAllLinesAsync(first.PathForDay(Noon), Ct);
        lines.Should().HaveCount(2 * perInstance, "every row is on its own line");
        lines.Select(line => Parse(line).Detail).Should().OnlyHaveUniqueItems("every row is whole and parseable");
    }

    private static async Task<int> AppendManyAsync(OrgEventLog log, string tag, int count)
    {
        var accepted = 0;
        for (var i = 0; i < count; i++)
        {
            if (await log.AppendAsync(Row(OrgEventKinds.MemberRoleChanged) with { Detail = $"{tag}{i}" }, Ct))
            {
                accepted++;
            }
        }
        return accepted;
    }

    [Fact]
    public async Task BothMaintenanceSweepsLeaveOrgEventsAlone()
    {
        // Kept forever, by decision. The controls matter as much as the assertion: each sweep is given
        // something it DOES own and is shown to remove it, so "the log survived" cannot be a sweep that
        // never ran.
        var log = NewLog();
        await log.AppendAsync(Row(OrgEventKinds.MemberRegistered), Ct);
        var path = log.PathForDay(Noon);
        File.SetLastWriteTimeUtc(path, new DateTime(2020, 1, 1, 0, 0, 0, DateTimeKind.Utc));
        var before = await File.ReadAllBytesAsync(path, Ct);

        var vaults = new VaultStore(_dir);
        var share = OldShare();
        await vaults.AppendShareAsync(share.ToEmail, share, Ct);
        var recovery = new OrgRecoveryStore(_dir);
        await recovery.AppendInviteAsync(OldInvite(), Ct);

        await new ShareMaintenance(
                vaults, NullLogger<ShareMaintenance>.Instance, TimeSpan.FromHours(1), TimeSpan.FromDays(1))
            .SweepAsync(Ct);
        await new OrgRecoveryMaintenance(
                recovery, NullLogger<OrgRecoveryMaintenance>.Instance, TimeSpan.FromHours(1), TimeSpan.FromHours(1))
            .SweepAsync(Ct);

        (await vaults.CountSharesAsync(share.ToEmail, Ct)).Should().Be(0, "control: the share sweep ran and pruned what it owns");
        (await CountInvitesAsync(recovery, "lead@example.com")).Should().Be(0, "control: the invite sweep ran and dropped what it owns");
        File.Exists(path).Should().BeTrue("the event log is nobody's to sweep");
        (await File.ReadAllBytesAsync(path, Ct)).Should().Equal(before, "not a byte of it moved");
    }

    private static ShareItem OldShare() => new()
    {
        Id = Guid.NewGuid().ToString(),
        FromEmail = "alice@example.com",
        ToEmail = "bob@example.com",
        EntityName = "old thing",
        EntityKind = "db",
        CreatedAt = DateTimeOffset.UtcNow.AddDays(-40).ToUnixTimeMilliseconds(),
        Salt = Convert.ToBase64String(new byte[16]),
        Iv = Convert.ToBase64String(new byte[12]),
        Tag = Convert.ToBase64String(new byte[16]),
        Data = Convert.ToBase64String(Encoding.UTF8.GetBytes("sealed")),
    };

    private static EscrowInviteItem OldInvite() => new()
    {
        SetupId = Guid.NewGuid().ToString(),
        FromEmail = "cto@example.com",
        ToEmail = "lead@example.com",
        ShareIndex = 1,
        Threshold = 2,
        TotalShares = 3,
        CreatedAt = DateTimeOffset.UtcNow.AddHours(-100).ToUnixTimeMilliseconds(),
        Salt = Convert.ToBase64String(new byte[16]),
        Iv = Convert.ToBase64String(new byte[12]),
        Tag = Convert.ToBase64String(new byte[16]),
        Data = Convert.ToBase64String(new byte[48]),
    };

    private static async Task<int> CountInvitesAsync(OrgRecoveryStore store, string email)
    {
        var seen = 0;
        await foreach (var _ in store.ListInvitesAsync(email, Ct))
        {
            seen++;
        }
        return seen;
    }
}
