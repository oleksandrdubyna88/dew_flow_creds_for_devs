using System.Net;
using System.Security.Cryptography;
using System.Text;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;

namespace CredVaultServer.Tests;

/// <summary>
/// The two cloud clients, over a stubbed transport: what they send, and what they make of the answer.
/// </summary>
/// <remarks>
/// <para>A stub rather than a live bucket, because what is under test is the REQUEST — the method, the
/// path, the signed headers, the continuation token — and a live service would test somebody's network
/// and a set of credentials nobody should commit. The signatures themselves are pinned separately
/// against the published vectors in <c>AwsSigV4Tests</c> and <c>AzureSharedKeyTests</c>.</para>
/// <para>What none of this covers is a real service's answer to a real request. That gap is named in
/// <c>research/module_tests.md</c> rather than papered over: nothing here proves AWS accepts what this
/// client sends, only that it sends what the specification says.</para>
/// </remarks>
public class BackupTargetTests
{
    private static readonly DateTimeOffset Noon = DateTimeOffset.Parse("2026-09-07T12:00:00Z").ToUniversalTime();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task AnS3UploadIsAPathStylePutThatIsThenVerified()
    {
        // Path style, because every S3-compatible service accepts it and only some accept the other —
        // that one choice decides whether "S3-compatible" means what an operator thinks it does.
        var stub = new StubTransport()
            .Answer(HttpStatusCode.OK)
            .Answer(HttpStatusCode.OK, headers: [("Content-Length", "9")]);
        var target = S3(stub);

        var outcome = await target.PutAsync("cred-vault-20260907-030405Z.cvbk", Body(), 9, Ct);

        outcome.Ok.Should().BeTrue(outcome.Why);
        stub.Sent.Should().HaveCount(2);
        stub.Sent[0].Method.Should().Be(HttpMethod.Put);
        stub.Sent[0].RequestUri!.ToString().Should().Be(
            "https://s3.example.com/vaults/backups/cred-vault-20260907-030405Z.cvbk");
        stub.Sent[0].Headers.GetValues("Authorization").Single().Should().StartWith("AWS4-HMAC-SHA256 Credential=");
        stub.Sent[0].Headers.GetValues("x-amz-content-sha256").Single().Should().Be(AwsSigV4.UnsignedPayload);
        stub.Sent[1].Method.Should().Be(HttpMethod.Head, "an accepted upload is not a stored one until it is checked");
    }

    [Fact]
    public async Task AnUploadTheServiceStoredSHORTIsAFailureAndNotASuccess()
    {
        // UNSIGNED-PAYLOAD leaves the body out of the signature, so a 200 means the request was
        // accepted rather than that the bytes are there. Without the check, a truncated upload reads as
        // a good backup and the only moment anybody finds out is a restore.
        var stub = new StubTransport()
            .Answer(HttpStatusCode.OK)
            .Answer(HttpStatusCode.OK, headers: [("Content-Length", "5")]);

        var outcome = await S3(stub).PutAsync("cred-vault-20260907-030405Z.cvbk", Body(), 9, Ct);

        outcome.Ok.Should().BeFalse();
        outcome.Why.Should().Contain("5 bytes where 9 were sent");
    }

    [Fact]
    public async Task AServicesRefusalBecomesASentenceAndNeverAnException()
    {
        // A run talks to every configured target and must record which one failed and carry on. An
        // exception per HTTP status would make that a try/catch at every call site.
        var stub = new StubTransport().Answer(HttpStatusCode.Forbidden, "<Error><Code>AccessDenied</Code></Error>");

        var outcome = await S3(stub).PutAsync("x.cvbk", Body(), 9, Ct);

        outcome.Ok.Should().BeFalse();
        outcome.Why.Should().Contain("403").And.Contain("AccessDenied");
    }

    [Fact]
    public async Task AnS3ListingFollowsItsContinuationToken()
    {
        // A bucket answers 1000 keys at a time. Retention over the first page only would leave
        // everything past it for ever — and the floor that protects against deleting everything would
        // be computing against a set that is not the set.
        var stub = new StubTransport()
            .Answer(HttpStatusCode.OK, Page("cred-vault-20260101-030000Z.cvbk", truncated: true, next: "MORE"))
            .Answer(HttpStatusCode.OK, Page("cred-vault-20260901-030000Z.cvbk", truncated: false, next: ""));

        var found = await S3(stub).ListAsync(Ct);

        found.Ok.Should().BeTrue(found.Why);
        found.Archives.Should().HaveCount(2);
        found.Archives.Select(archive => archive.Name).Should().Contain("cred-vault-20260901-030000Z.cvbk");
        stub.Sent[1].RequestUri!.Query.Should().Contain("continuation-token=MORE");
    }

    [Fact]
    public async Task TheSaveTimeProbeWRITESAndThenDeletes()
    {
        // A HEAD is not enough: both clouds routinely grant read while denying write, so a check that
        // only reads gives false confidence at save time and finds out at 03:00.
        var stub = new StubTransport().Answer(HttpStatusCode.OK).Answer(HttpStatusCode.NoContent);

        (await S3(stub).UsableAsync(Ct)).Ok.Should().BeTrue();

        stub.Sent[0].Method.Should().Be(HttpMethod.Put);
        stub.Sent[0].RequestUri!.ToString().Should().EndWith(ArchiveTargets.ProbeName);
        stub.Sent[1].Method.Should().Be(HttpMethod.Delete);
    }

    [Fact]
    public async Task ATargetThatAcceptsAWriteAndRefusesTheDeleteIsRefusedWithBothFacts()
    {
        // Retention would silently stop working. Better to refuse the target than to accept one whose
        // archives can only accumulate.
        var stub = new StubTransport().Answer(HttpStatusCode.OK).Answer(HttpStatusCode.Forbidden);

        var usable = await S3(stub).UsableAsync(Ct);

        usable.Ok.Should().BeFalse();
        usable.Why.Should().Contain("would not accept the matching delete").And.Contain(ArchiveTargets.ProbeName);
    }

    [Fact]
    public async Task AnAzureUploadCarriesTheTwoHeadersWithoutWhichItIsA400()
    {
        var stub = new StubTransport()
            .Answer(HttpStatusCode.Created)
            .Answer(HttpStatusCode.OK, headers: [("Content-Length", "9")]);

        var outcome = await Azure(stub).PutAsync("cred-vault-20260907-030405Z.cvbk", Body(), 9, Ct);

        outcome.Ok.Should().BeTrue(outcome.Why);
        stub.Sent[0].Headers.GetValues("x-ms-blob-type").Single().Should().Be("BlockBlob");
        stub.Sent[0].Headers.GetValues("x-ms-version").Single().Should().Be(AzureSharedKey.Version);
        stub.Sent[0].Headers.GetValues("Authorization").Single().Should().StartWith("SharedKey myaccount:");
    }

    [Fact]
    public async Task AnAzureListingFollowsItsNextMarker()
    {
        var stub = new StubTransport()
            .Answer(HttpStatusCode.OK, Blobs("cred-vault-20260101-030000Z.cvbk", next: "MORE"))
            .Answer(HttpStatusCode.OK, Blobs("cred-vault-20260901-030000Z.cvbk", next: ""));

        var found = await Azure(stub).ListAsync(Ct);

        found.Ok.Should().BeTrue(found.Why);
        found.Archives.Should().HaveCount(2);
        stub.Sent[1].RequestUri!.Query.Should().Contain("marker=MORE");
    }

    [Theory]
    [InlineData("https://s3.eu-central-1.amazonaws.com", "https is what the signature relies on")]
    [InlineData("http://127.0.0.1:9000", "loopback has nothing between, and MinIO has no certificate")]
    [InlineData("http://[::1]:9000", "the other loopback, which a developer's stack may well use")]
    public void AnEndpointThatIsSafeEnoughIsAccepted(string endpoint, string why)
    {
        ArchiveTargets.EndpointProblem(endpoint).Should().BeEmpty(why);
    }

    [Theory]
    [InlineData("http://s3.example.com", "must be https", "a hostname on the LAN is exactly the assumption to distrust")]
    [InlineData("http://10.0.0.4:9000", "must be https", "a private address is still a network")]
    [InlineData("not a url", "not a URL", "and the message says what one looks like")]
    public void AnythingElseIsRefusedWithTheReason(string endpoint, string expected, string why)
    {
        ArchiveTargets.EndpointProblem(endpoint).Should().Contain(expected, why);
    }

    [Fact]
    public async Task AListingThatFAILEDIsNotAnEmptyListing()
    {
        // Conflating them is how retention comes to do nothing while the run reports success: a target
        // whose list permission was revoked would accumulate archives for ever and say so nowhere.
        var refused = await S3(new StubTransport().Answer(HttpStatusCode.Forbidden, "denied")).ListAsync(Ct);

        refused.Ok.Should().BeFalse();
        refused.Why.Should().Contain("403");
        refused.Archives.Should().BeEmpty("and it hands back nothing to prune against");
    }

    [Fact]
    public async Task ABodyThatIsNotAListingIsAFailureAndNotAnEmptyPage()
    {
        var nonsense = await S3(new StubTransport().Answer(HttpStatusCode.OK, "<<not xml")).ListAsync(Ct);

        nonsense.Ok.Should().BeFalse();
        nonsense.Why.Should().Contain("could not be read");
    }

    [Fact]
    public async Task APageThatFailsPartWayThroughDiscardsTheWholeListing()
    {
        // Retention computed over "what came back before the failure" would treat the rest as absent,
        // and the floor that stops it deleting everything would be measuring the wrong set.
        var stub = new StubTransport()
            .Answer(HttpStatusCode.OK, Page("cred-vault-20260101-030000Z.cvbk", truncated: true, next: "MORE"))
            .Answer(HttpStatusCode.InternalServerError, "boom");

        var listing = await S3(stub).ListAsync(Ct);

        listing.Ok.Should().BeFalse();
        listing.Archives.Should().BeEmpty("half a listing is worse than none");
    }

    [Fact]
    public void DestinationRetentionNeverEmptiesTheDestination()
    {
        // The shell backup's floor, applied where it matters most: on a destination that may be the
        // only copy left, deleting everything old is deleting everything.
        var all = new[]
        {
            new RemoteArchive("cred-vault-20260101-030000Z.cvbk", 10),
            new RemoteArchive("cred-vault-20260102-030000Z.cvbk", 10),
        };

        ArchiveTargets.Expired(all, Noon, 30).Should().BeEmpty("every one of them is old");
    }

    [Fact]
    public void DestinationRetentionRemovesWhatAgedOutAndLeavesWhatItCannotAccountFor()
    {
        var all = new[]
        {
            new RemoteArchive("cred-vault-20260101-030000Z.cvbk", 10),
            new RemoteArchive("cred-vault-20260906-030000Z.cvbk", 10),
            new RemoteArchive("somebody-elses-object.bin", 10),
        };

        var expired = ArchiveTargets.Expired(all, Noon, 30);

        expired.Should().ContainSingle().Which.Name.Should().Be("cred-vault-20260101-030000Z.cvbk");
    }

    [Fact]
    public void TheSingleUploadCeilingsAreTheOnesEachServiceDocuments()
    {
        S3(new StubTransport()).MaxBytes.Should().Be(5L * 1024 * 1024 * 1024, "S3's single PUT");
        Azure(new StubTransport()).MaxBytes.Should().Be(5000L * 1024 * 1024, "Put Blob at the pinned version");
    }

    [Fact]
    public void AKindThisServerDoesNotImplementIsSKIPPEDAndNeverBuiltAsAnother()
    {
        // The trap the second review round named: the factory was a ternary, so everything that was
        // not S3 became Azure. Nothing can SAVE an unknown kind — the request validator refuses it —
        // and that is not the case this guards. A settings.json restored from a deployment that has
        // the drive targets of the next plan carries one, and a ternary would have uploaded the
        // company's archive to Azure with credentials meant for somebody else entirely.
        var kek = RandomNumberGenerator.GetBytes(Key32.Bytes);
        var targets = new BackupTargets(
            kek, new OneClient(new StubTransport()), new FrozenClock(), NullLogger<BackupTargets>.Instance);
        var future = targets.Seal(
            "onedrive",
            "https://graph.microsoft.com",
            string.Empty,
            "vaults",
            "backups",
            new TargetSecrets("id", "secret", string.Empty, string.Empty));

        var built = targets.Build(future);

        built.Client.Should().BeNull("this server has no OneDrive client, and Azure is not a stand-in");
        built.Why.Should().Contain("onedrive").And.Contain("will not guess");
    }

    [Fact]
    public void ABuiltTargetForAKindThisServerHASIsTheClientForTHATKind()
    {
        // The other half, so the test above cannot pass by refusing everything.
        var kek = RandomNumberGenerator.GetBytes(Key32.Bytes);
        var targets = new BackupTargets(
            kek, new OneClient(new StubTransport()), new FrozenClock(), NullLogger<BackupTargets>.Instance);

        targets.Build(
                targets.Seal(
                    TargetKinds.S3, "https://s3.example.com", "eu-central-1", "vaults", "backups",
                    new TargetSecrets("AKIDEXAMPLE", "secret", string.Empty, string.Empty)))
            .Client.Should().BeOfType<S3Target>();
        targets.Build(
                targets.Seal(
                    TargetKinds.AzureBlob, "https://myaccount.blob.core.windows.net", string.Empty,
                    "vaults", "backups",
                    new TargetSecrets(string.Empty, string.Empty, "myaccount", "a2V5")))
            .Client.Should().BeOfType<AzureBlobTarget>();
    }

    /// <summary>A factory that hands every caller the same stubbed transport.</summary>
    private sealed class OneClient(StubTransport transport) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(transport, disposeHandler: false);
    }

    private static Stream Body() => new MemoryStream(Encoding.UTF8.GetBytes("some bytes"[..9]));

    private static S3Target S3(StubTransport stub) => new(
        new HttpClient(stub),
        new S3TargetConfig(
            "https://s3.example.com", "eu-central-1", "vaults", "backups", "AKIDEXAMPLE", "secret"),
        new FrozenClock());

    private static AzureBlobTarget Azure(StubTransport stub) => new(
        new HttpClient(stub),
        new AzureTargetConfig(
            "https://myaccount.blob.core.windows.net",
            "vaults",
            "backups",
            "myaccount",
            "bXlhY2NvdW50a2V5bXlhY2NvdW50a2V5bXlhY2NvdW50a2V5MDA="),
        new FrozenClock());

    private static string Page(string key, bool truncated, string next) =>
        $"""
        <?xml version="1.0" encoding="UTF-8"?>
        <ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
          <IsTruncated>{(truncated ? "true" : "false")}</IsTruncated>
          <NextContinuationToken>{next}</NextContinuationToken>
          <Contents><Key>backups/{key}</Key><Size>4096</Size></Contents>
        </ListBucketResult>
        """;

    private static string Blobs(string name, string next) =>
        $"""
        <?xml version="1.0" encoding="utf-8"?>
        <EnumerationResults>
          <Blobs><Blob><Name>backups/{name}</Name>
            <Properties><Content-Length>4096</Content-Length></Properties>
          </Blob></Blobs>
          <NextMarker>{next}</NextMarker>
        </EnumerationResults>
        """;

    private sealed class FrozenClock : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => Noon;
    }
}
