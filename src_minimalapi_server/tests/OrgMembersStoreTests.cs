using System.Text.Json;
using FluentAssertions;

namespace CredVaultServer.Tests;

/// <summary>
/// The members registry — the data-format and concurrency contract every later corporate epic reads.
///
/// <para>Driven against the store directly on a throwaway data directory, no host: what is under test
/// is what a file on disk MEANS, and the finding the plan round opened with — a record this build
/// cannot read is a refusal, never the member default.</para>
///
/// <para>Two tests rewrite a record in place with the SAME length and either keep or bump its mtime.
/// That is the weakest trace a real writer leaves, and it separates "answered from memory" from "saw
/// the change" without a test hook in the store.</para>
/// </summary>
public sealed class OrgMembersStoreTests : IDisposable
{
    private const string Anna = "anna@example.com";
    private const string Admin = "admin@example.com";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private readonly string _dir =
        Path.Combine(Path.GetTempPath(), "cred-vault-tests", Guid.NewGuid().ToString("N"));

    private readonly CapturingLogger<OrgMembersStore> _log = new();
    private readonly OrgMembersStore _store;

    public OrgMembersStoreTests()
    {
        Directory.CreateDirectory(_dir);
        _store = new OrgMembersStore(_dir, _log);
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

    private string MembersDir => Path.Combine(_dir, "org", "members");

    /// <summary>The documented layout. The first test that writes asserts the store agrees with it.</summary>
    private string RecordPath(string email) => Path.Combine(MembersDir, VaultStore.KeyFor(email) + ".json");

    private void WriteRaw(string email, string text)
    {
        Directory.CreateDirectory(MembersDir);
        var path = RecordPath(email);
        File.WriteAllText(path, text);
        Touch(path);
    }

    private void WriteRecord(string email, MemberRecord record) =>
        WriteRaw(email, JsonSerializer.Serialize(record, AppJsonContext.Default.MemberRecord));

    /// <summary>
    /// Two writes inside one clock tick can share an mtime, so every out-of-process write here moves it
    /// forward explicitly — as the seconds between a restore and the next request would.
    /// </summary>
    private static void Touch(string path) =>
        File.SetLastWriteTimeUtc(path, File.GetLastWriteTimeUtc(path).AddSeconds(2));

    /// <summary>Rewrite the record so that only the mtime could betray the change.</summary>
    private static void RewriteSameLength(
        string path,
        MemberRecord current,
        Func<MemberRecord, MemberRecord> change,
        bool keepMtime)
    {
        var mtime = File.GetLastWriteTimeUtc(path);
        var length = new FileInfo(path).Length;
        File.WriteAllBytes(path, JsonSerializer.SerializeToUtf8Bytes(change(current), AppJsonContext.Default.MemberRecord));
        new FileInfo(path).Length.Should().Be(length, "the change must be invisible through the length");
        File.SetLastWriteTimeUtc(path, keepMtime ? mtime : mtime.AddSeconds(2));
    }

    // ---------------------------------------------------------------- the cache

    [Fact]
    public async Task FindAnswersFromTheCacheAfterOneRead()
    {
        // The caller gate will call Find on every request (epic 2); a disk read per request is the
        // wrong shape. A same-length rewrite that keeps the mtime is invisible to the stat check, so
        // a second Find that still answers the OLD bytes can only have come from memory.
        await _store.UpsertAsync(Anna, r => r, Admin, Ct);
        var path = RecordPath(Anna);
        File.Exists(path).Should().BeTrue("the layout is DataDir/org/members/KeyFor(email).json");
        var first = _store.Find(Anna);
        first.Status.Should().Be(MemberLookup.Found);

        RewriteSameLength(path, first.Record!, r => r with { LoginKeyVersion = 7 }, keepMtime: true);

        _store.Find(Anna).Record!.LoginKeyVersion.Should().Be(0, "the second answer came from memory, not the disk");
    }

    [Fact]
    public async Task AWriteThroughTheStoreInvalidatesTheCache()
    {
        await _store.UpsertAsync(Anna, r => r, Admin, Ct);
        _store.Find(Anna).Record!.Role.Should().Be(MemberRole.Member);

        await _store.UpsertAsync(Anna, r => r with { Role = MemberRole.Admin }, Admin, Ct);

        _store.Find(Anna).Record!.Role.Should().Be(MemberRole.Admin);
    }

    [Fact]
    public async Task AnAlreadyCachedRecordChangedOnDiskByAnotherWriterIsReRead()
    {
        // A restore, an operator's editor, a second instance in a rolling restart: none of them go
        // through this process, and epic 2's block check would keep admitting somebody blocked minutes
        // ago. The STAT check — not a cache miss — is what notices. Same-length rewrite again, so the
        // mtime is the only signal, which is the least a real write leaves behind.
        await _store.UpsertAsync(Anna, r => r, Admin, Ct);
        var cached = _store.Find(Anna).Record!;

        RewriteSameLength(RecordPath(Anna), cached, r => r with { LoginKeyVersion = 7 }, keepMtime: false);

        _store.Find(Anna).Record!.LoginKeyVersion.Should().Be(7, "the file changed under the cache and the stat check saw it");
    }

    // ---------------------------------------------------------------- the lock

    [Fact]
    public async Task TwoConcurrentUpsertsEditingDifferentFieldsBothSurvive()
    {
        // Atomic replacement stops a torn file, not a lost update. The sleep inside each edit widens
        // the read-modify-write window so that WITHOUT the lock both would read the same baseline and
        // the second write would win whole — the defect the per-member lock exists to prevent.
        await _store.UpsertAsync(Anna, r => r, Admin, Ct);

        var promote = Task.Run(
            () => _store.UpsertAsync(
                Anna,
                r =>
                {
                    Thread.Sleep(150);
                    return r with { Role = MemberRole.Admin };
                },
                Admin,
                Ct),
            Ct);
        var restrict = Task.Run(
            () => _store.UpsertAsync(
                Anna,
                r =>
                {
                    Thread.Sleep(150);
                    return r with { ShareDefault = ShareDefaults.None };
                },
                Admin,
                Ct),
            Ct);
        await Task.WhenAll(promote, restrict);

        var record = _store.Find(Anna).Record!;
        record.Role.Should().Be(MemberRole.Admin);
        record.ShareDefault.Should().Be(ShareDefaults.None);
    }

    // ------------------------------------------------- unreadable is a refusal, never a default

    [Fact]
    public void AMalformedRecordIsUnavailableNeverNotRegistered()
    {
        // The finding the plan round opened with. "Not registered" means the default, the default is
        // member, and a member may export: a half-written file would promote a developer. Unavailable
        // is a refusal a person can see and an operator can fix.
        WriteRaw(Anna, "{ not json");

        var first = _store.Find(Anna);
        var second = _store.Find(Anna);

        first.Status.Should().Be(MemberLookup.Unavailable, "never NotRegistered — that is the escalation");
        second.Status.Should().Be(MemberLookup.Unavailable);
        _log.Errors.Should().ContainSingle(
            m => m.Contains(RecordPath(Anna)),
            "once per file, not once per request, and naming the file");
    }

    [Fact]
    public void AHigherSchemaVersionIsUnavailable()
    {
        // A build that cannot promise it understands a record must not act on it — "unknown fields I
        // will ignore" is a promotion waiting for the field that carries a permission.
        var fromTheFuture = MemberRecord.DefaultFor(Anna, 1) with { SchemaVersion = MemberRecord.CurrentSchemaVersion + 1 };
        WriteRecord(Anna, fromTheFuture);

        _store.Find(Anna).Status.Should().Be(MemberLookup.Unavailable);
        _log.Errors.Should().ContainSingle(m => m.Contains("schema version"));

        // The control: the same record at this build's version is a fixture the code accepts, so the
        // refusal above was about the version and nothing else.
        WriteRecord(Anna, fromTheFuture with { SchemaVersion = MemberRecord.CurrentSchemaVersion });
        _store.Find(Anna).Status.Should().Be(MemberLookup.Found);
    }

    [Fact]
    public async Task AHigherSchemaVersionIsUnavailableEvenWhenEveryFieldIsOneThisBuildKnows()
    {
        // The version is the contract, not the fields. A record above this build's version is refused
        // whole — never read "as far as this build understands it", and never rewritten at the older
        // version by the next edit, which would silently downgrade what the newer build meant.
        var fromTheFuture = MemberRecord.DefaultFor(Anna, 1) with
        {
            SchemaVersion = MemberRecord.CurrentSchemaVersion + 1,
            Role = MemberRole.Dev,
        };
        WriteRecord(Anna, fromTheFuture);
        var bytes = await File.ReadAllBytesAsync(RecordPath(Anna), Ct);

        _store.Find(Anna).Status.Should().Be(MemberLookup.Unavailable, "every field is known; the version alone refuses it");
        var act = () => _store.UpsertAsync(Anna, r => r with { Role = MemberRole.Admin }, Admin, Ct);
        await act.Should().ThrowAsync<MemberRecordUnavailableException>("it is not merged into this build's shape");
        (await File.ReadAllBytesAsync(RecordPath(Anna), Ct)).Should().Equal(bytes, "and not a byte of it was rewritten");
    }

    [Fact]
    public void ARecordWhoseEmailDoesNotMatchItsFilenameIsUnavailable()
    {
        // A restore that mixes files, or an operator editing one by hand: a well-formed record for
        // Bob sitting at Anna's key would otherwise be Found, and Anna would be given Bob's role.
        WriteRecord(Anna, MemberRecord.DefaultFor("bob@example.com", 1) with { Role = MemberRole.Admin });

        var lookup = _store.Find(Anna);

        lookup.Status.Should().Be(MemberLookup.Unavailable, "one person's record must never be applied to another");
        _log.Errors.Should().ContainSingle(
            m => m.Contains(RecordPath(Anna)) && m.Contains("bob@example.com") && m.Contains(Anna),
            "the operator needs the file and both emails to untangle it");
    }

    [Fact]
    public void AnUnregisteredLookupIsAnsweredFromTheCacheOnTheSecondCall()
    {
        // The gate will ask on every request. Somebody with no record — a token that has never
        // synced — must not cost a thrown FileNotFoundException per request.
        _store.Find(Anna).Status.Should().Be(MemberLookup.NotRegistered);
        _store.Find(Anna).Status.Should().Be(MemberLookup.NotRegistered);

        _store.DiskReads.Should().Be(1, "the second answer came from memory");
    }

    [Fact]
    public void ARecordCreatedAfterAnUnregisteredLookupIsSeenOnTheNextFind()
    {
        // The negative answer is cached; the file appearing — a sync on another instance, a restore —
        // must invalidate it, or a registered person would stay unregistered until a restart.
        _store.Find(Anna).Status.Should().Be(MemberLookup.NotRegistered);
        WriteRecord(Anna, MemberRecord.DefaultFor(Anna, 1) with { Role = MemberRole.Dev });

        var found = _store.Find(Anna);

        found.Status.Should().Be(MemberLookup.Found);
        found.Record!.Role.Should().Be(MemberRole.Dev);
    }

    [Fact]
    public async Task AnUnknownFieldRoundTripsByteForByte()
    {
        // A NEWER build added a field without bumping the version — the additive case. This build
        // reads the record, an admin changes the role, and the write-back must carry what it did not
        // understand: System.Text.Json drops unknown properties in silence, and nothing would notice.
        var known = JsonSerializer.Serialize(MemberRecord.DefaultFor(Anna, 1), AppJsonContext.Default.MemberRecord);
        const string future = "\"futureField\":{\"a\":1.5,\"b\":\"x\",\"c\":[true,null]}";
        WriteRaw(Anna, known[..^1] + "," + future + "}");
        _store.Find(Anna).Status.Should().Be(MemberLookup.Found, "an additive field is not a refusal");

        await _store.UpsertAsync(Anna, r => r with { Role = MemberRole.Dev }, Admin, Ct);

        var written = await File.ReadAllTextAsync(RecordPath(Anna), Ct);
        written.Should().Contain(future, "the field this build does not know came back exactly as it went in");
        _store.Find(Anna).Record!.Role.Should().Be(MemberRole.Dev, "and the edit itself landed");
    }

    [Fact]
    public async Task AReadThatCannotOpenTheFileIsUnavailableAndDoesNotPropagate()
    {
        // The gate calls Find on every request; an exception there is a stack trace where a sentence
        // belongs. Another process holding the file exclusively is the ordinary way a read fails.
        await _store.UpsertAsync(Anna, r => r, Admin, Ct);
        MemberLookupResult whileLocked;
        using (new FileStream(RecordPath(Anna), FileMode.Open, FileAccess.ReadWrite, FileShare.None))
        {
            whileLocked = _store.Find(Anna);
        }

        whileLocked.Status.Should().Be(MemberLookup.Unavailable);
        _log.Errors.Should().ContainSingle(m => m.Contains(RecordPath(Anna)));
        _store.Find(Anna).Status.Should().Be(
            MemberLookup.Found,
            "an I/O failure may be transient and is not cached; the next read is the retry");
    }

    [Fact]
    public async Task AnUpsertAgainstAnUnavailableRecordRefusesRatherThanOverwriting()
    {
        // The edit would start from the default, and a default written over a blocked developer's
        // unreadable record is an unblock nobody ordered.
        WriteRaw(Anna, "{ not json");

        var act = () => _store.UpsertAsync(Anna, r => r with { Role = MemberRole.Admin }, Admin, Ct);

        await act.Should().ThrowAsync<MemberRecordUnavailableException>();
        (await File.ReadAllTextAsync(RecordPath(Anna), Ct))
            .Should().Be("{ not json", "the file is left for the operator, never replaced by a default");
    }

    // ---------------------------------------------------------------- the rest of the surface

    [Fact]
    public async Task NothingCreatesTheOrgDirectoryUntilAWrite()
    {
        // This store is constructed on every deployment, personal ones included. An org/ directory
        // on a personal server would tell an operator it has a roster it does not have.
        _store.Find(Anna).Status.Should().Be(MemberLookup.NotRegistered);
        _store.ListForDomain("example.com").Should().BeEmpty();
        await _store.RemoveAsync(Anna, Ct);

        Directory.Exists(Path.Combine(_dir, "org")).Should().BeFalse("reads and a no-op remove leave the disk as they found it");
    }

    [Fact]
    public async Task UpsertReportsCreatedOnceAndStampsTheRecordItself()
    {
        var first = await _store.UpsertAsync(" Anna@Example.COM ", r => r, Anna, Ct);
        var second = await _store.UpsertAsync(
            Anna,
            r => r with { Role = MemberRole.Dev, Email = "someone-else@example.com", UpdatedBy = "forged@example.com" },
            Admin,
            Ct);

        first.Created.Should().BeTrue("the sync hook emits member.registered on exactly this answer");
        second.Created.Should().BeFalse();
        second.Record.Email.Should().Be(Anna, "the key is cut from the email, so the record may not disagree with it");
        second.Record.UpdatedBy.Should().Be(Admin, "who changed it comes from the caller, never from the edit");
        second.Record.SchemaVersion.Should().Be(MemberRecord.CurrentSchemaVersion);
        second.Record.UpdatedAt.Should().BeGreaterThanOrEqualTo(first.Record.UpdatedAt);
        Directory.Exists(MembersDir).Should().BeTrue("the first write is what creates the directory");
    }

    [Fact]
    public async Task ListForDomainAnswersOnlyThatDomain()
    {
        // On a server whose Vault:AllowedDomains names two companies, one company's admin must not
        // see the other's roster.
        await _store.UpsertAsync(Anna, r => r, Admin, Ct);
        await _store.UpsertAsync("boris@other.example", r => r, Admin, Ct);

        _store.ListForDomain("example.com").Select(r => r.Email).Should().Equal(Anna);
        _store.ListForDomain(" EXAMPLE.COM ").Select(r => r.Email)
            .Should().Equal(new[] { Anna }, "domains compare case-insensitively, as DomainOf does");
        _store.ListForDomain("nobody.example").Should().BeEmpty();
    }

    [Fact]
    public async Task ListForDomainAcceptsADomainWrittenWithItsAtSign()
    {
        // "@example.com" is how a domain is often typed. Doubling the sign would match nobody and
        // answer an empty roster with no error — the silent kind of wrong.
        await _store.UpsertAsync(Anna, r => r, Admin, Ct);

        _store.ListForDomain("@example.com").Select(r => r.Email).Should().Equal(Anna);
    }

    [Fact]
    public async Task RemoveTakesTheRecordAndTheNextFindIsNotRegistered()
    {
        // DELETE /api/vault takes the record with the vault, so the registry cannot outgrow the
        // people it describes.
        await _store.UpsertAsync(Anna, r => r, Admin, Ct);
        _store.Find(Anna).Status.Should().Be(MemberLookup.Found);

        await _store.RemoveAsync(Anna, Ct);

        _store.Find(Anna).Status.Should().Be(MemberLookup.NotRegistered);
        File.Exists(RecordPath(Anna)).Should().BeFalse();
    }
}
