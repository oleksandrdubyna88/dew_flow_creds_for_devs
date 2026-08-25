using System.Net;
using System.Net.Http.Headers;
using System.Text;
using FluentAssertions;

namespace CredVaultServer.Tests;

/// <summary>
/// Two of one person's machines syncing at the same time is the ordinary case, not a
/// rare one — a laptop and a desktop both wake up and pull. Without a precondition on
/// the write, the second one overwrites the first at the blob level and the first
/// machine's edits are gone with nothing to show that it happened.
///
/// The extension's causal merge repairs this on the NEXT sync, because each node
/// carries a version vector — but only if the losing side still has its local copy.
/// The precondition closes the window rather than relying on that.
/// </summary>
[Collection(ServerCollection.Name)]
public sealed class ConcurrencyTests
{
    private static string Alice => $"alice@{VaultServer.Domain}";

    private static readonly byte[] First = Encoding.UTF8.GetBytes("laptop-wrote-this");
    private static readonly byte[] Second = Encoding.UTF8.GetBytes("desktop-wrote-this");

    private static HttpRequestMessage Put(byte[] body, string? ifMatch = null)
    {
        var request = new HttpRequestMessage(HttpMethod.Put, "/api/vault")
        {
            Content = new ByteArrayContent(body),
        };
        if (ifMatch is not null)
        {
            request.Headers.TryAddWithoutValidation("If-Match", ifMatch);
        }
        return request;
    }

    [Fact]
    public async Task ReadingAVaultReturnsAnETagToWriteBackWith()
    {
        using var server = new VaultServer();
        using var alice = server.ClientFor(Alice);
        var ct = TestContext.Current.CancellationToken;

        await alice.PutAsync("/api/vault", new ByteArrayContent(First), ct);
        var read = await alice.GetAsync("/api/vault", ct);

        read.Headers.ETag.Should().NotBeNull("a client cannot make a conditional write without one");
        read.Headers.ETag!.Tag.Should().NotBeNullOrWhiteSpace();
    }

    [Fact]
    public async Task TheSameContentAlwaysYieldsTheSameETag()
    {
        using var server = new VaultServer();
        using var alice = server.ClientFor(Alice);
        var ct = TestContext.Current.CancellationToken;

        await alice.PutAsync("/api/vault", new ByteArrayContent(First), ct);
        var a = (await alice.GetAsync("/api/vault", ct)).Headers.ETag!.Tag;
        var b = (await alice.GetAsync("/api/vault", ct)).Headers.ETag!.Tag;

        b.Should().Be(a);
    }

    [Fact]
    public async Task AWriteAgainstTheCurrentVersionSucceeds()
    {
        using var server = new VaultServer();
        using var alice = server.ClientFor(Alice);
        var ct = TestContext.Current.CancellationToken;

        await alice.PutAsync("/api/vault", new ByteArrayContent(First), ct);
        var etag = (await alice.GetAsync("/api/vault", ct)).Headers.ETag!.Tag;

        var response = await alice.SendAsync(Put(Second, etag), ct);

        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await alice.GetByteArrayAsync("/api/vault", ct)).Should().Equal(Second);
    }

    [Fact]
    public async Task AWriteAgainstAStaleVersionIsRefusedInsteadOfLosingTheOtherEdit()
    {
        using var server = new VaultServer();
        using var laptop = server.ClientFor(Alice);
        using var desktop = server.ClientFor(Alice);
        var ct = TestContext.Current.CancellationToken;

        // Both machines pull the same starting state.
        await laptop.PutAsync("/api/vault", new ByteArrayContent(First), ct);
        var sharedStart = (await laptop.GetAsync("/api/vault", ct)).Headers.ETag!.Tag;

        // The laptop writes first and wins.
        var laptopWrite = await laptop.SendAsync(Put(Second, sharedStart), ct);
        laptopWrite.StatusCode.Should().Be(HttpStatusCode.NoContent);

        // The desktop still holds the version it pulled, and must NOT be allowed to
        // overwrite an edit it never saw.
        var desktopWrite = await desktop.SendAsync(
            Put(Encoding.UTF8.GetBytes("desktop-clobbers-everything"), sharedStart), ct);

        desktopWrite.StatusCode.Should().Be(
            HttpStatusCode.PreconditionFailed,
            "the desktop's copy is stale; it must re-read and merge rather than clobber");
        (await laptop.GetByteArrayAsync("/api/vault", ct)).Should().Equal(
            Second, "the laptop's write must survive");
    }

    [Fact]
    public async Task RequiringTheVaultToBeAbsentRefusesWhenItAlreadyExists()
    {
        using var server = new VaultServer();
        using var alice = server.ClientFor(Alice);
        var ct = TestContext.Current.CancellationToken;

        await alice.PutAsync("/api/vault", new ByteArrayContent(First), ct);

        var request = new HttpRequestMessage(HttpMethod.Put, "/api/vault")
        {
            Content = new ByteArrayContent(Second),
        };
        request.Headers.TryAddWithoutValidation("If-None-Match", "*");
        var response = await alice.SendAsync(request, ct);

        response.StatusCode.Should().Be(
            HttpStatusCode.PreconditionFailed,
            "If-None-Match:* is how a client says 'only if I am the first'");
    }

    [Fact]
    public async Task AWriteWithNoPreconditionStillWorksForOlderClients()
    {
        using var server = new VaultServer();
        using var alice = server.ClientFor(Alice);
        var ct = TestContext.Current.CancellationToken;

        await alice.PutAsync("/api/vault", new ByteArrayContent(First), ct);
        var response = await alice.PutAsync("/api/vault", new ByteArrayContent(Second), ct);

        response.StatusCode.Should().Be(
            HttpStatusCode.NoContent,
            "the precondition is opt-in; an extension that predates it must keep working");
    }

    [Fact]
    public async Task AMatchAgainstAVaultThatDoesNotExistIsRefused()
    {
        using var server = new VaultServer();
        using var alice = server.ClientFor(Alice);
        var ct = TestContext.Current.CancellationToken;

        var response = await alice.SendAsync(Put(First, "\"whatever\""), ct);

        response.StatusCode.Should().Be(HttpStatusCode.PreconditionFailed);
    }

    [Fact]
    public async Task TheETagChangesAfterAWrite()
    {
        using var server = new VaultServer();
        using var alice = server.ClientFor(Alice);
        var ct = TestContext.Current.CancellationToken;

        await alice.PutAsync("/api/vault", new ByteArrayContent(First), ct);
        var before = (await alice.GetAsync("/api/vault", ct)).Headers.ETag!.Tag;

        await alice.SendAsync(Put(Second, before), ct);
        var after = (await alice.GetAsync("/api/vault", ct)).Headers.ETag!.Tag;

        after.Should().NotBe(before);
    }

    [Fact]
    public async Task TwoUnconditionalWritesFiredConcurrentlyNeverCorruptTheBlob()
    {
        using var server = new VaultServer();
        using var alice = server.ClientFor(Alice);
        var ct = TestContext.Current.CancellationToken;

        // No If-Match on either — the striped lock + atomic write are the only thing
        // standing between two real parallel writers and a byte-interleaved blob.
        var t1 = alice.PutAsync("/api/vault", new ByteArrayContent(First), ct);
        var t2 = alice.PutAsync("/api/vault", new ByteArrayContent(Second), ct);
        await Task.WhenAll(t1, t2);

        var stored = await (await alice.GetAsync("/api/vault", ct))
            .Content.ReadAsByteArrayAsync(ct);
        (stored.SequenceEqual(First) || stored.SequenceEqual(Second)).Should()
            .BeTrue("the write is all-or-nothing — one whole body, never a mix of the two");
    }

    [Fact]
    public async Task IfMatchWithMultipleCandidatesSucceedsWhenAnyMatches()
    {
        using var server = new VaultServer();
        using var alice = server.ClientFor(Alice);
        var ct = TestContext.Current.CancellationToken;

        await alice.PutAsync("/api/vault", new ByteArrayContent(First), ct);
        var etag = (await alice.GetAsync("/api/vault", ct)).Headers.ETag!.Tag;

        // A wrong candidate AND the real one — matching any is a match.
        var resp = await alice.SendAsync(Put(Second, ifMatch: $"\"nope\", {etag}"), ct);

        resp.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

}
