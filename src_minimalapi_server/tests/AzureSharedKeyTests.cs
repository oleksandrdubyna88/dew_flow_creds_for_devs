using FluentAssertions;

namespace CredVaultServer.Tests;

/// <summary>
/// Azure Blob Storage's SharedKey authorisation, pinned at both of its steps.
/// </summary>
/// <remarks>
/// <para>The string to sign and the signature are asserted separately, for the reason the SigV4 suite
/// gives: one end-to-end assertion says the signature is wrong and not which of the thirteen lines got
/// it wrong. The expected values were produced by an INDEPENDENT implementation of the documented
/// algorithm rather than by this one — a vector a suite computes with the code under test pins
/// nothing.</para>
///
/// <para>The account key below is base64 of a fixed sample string. It opens nothing.</para>
/// </remarks>
public class AzureSharedKeyTests
{
    private const string Account = "myaccount";

    private const string Key = "bXlhY2NvdW50a2V5bXlhY2NvdW50a2V5bXlhY2NvdW50a2V5MDA=";

    private static readonly DateTimeOffset At =
        new(2026, 9, 7, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public void APutBlobSignsThirteenLinesAndTheCanonicalResource()
    {
        var signed = AzureSharedKey.Sign(
            "PUT",
            Account,
            Key,
            "/backups/cred-vault-20260907-030405Z.cvbk",
            [
                ("Content-Type", "application/octet-stream"),
                ("x-ms-blob-type", AzureSharedKey.BlockBlob),
                ("x-ms-date", AzureSharedKey.Stamp(At)),
                ("x-ms-version", AzureSharedKey.Version),
            ],
            [],
            1_048_576);

        signed.StringToSign.Should().Be(
            "PUT\n\n\n1048576\n\napplication/octet-stream\n\n\n\n\n\n\n"
            + "x-ms-blob-type:BlockBlob\n"
            + "x-ms-date:Mon, 07 Sep 2026 12:00:00 GMT\n"
            + "x-ms-version:2021-12-02\n"
            + "/myaccount/backups/cred-vault-20260907-030405Z.cvbk");
        signed.Signature.Should().Be("6SzNALRsNbkAVPr3eXbob3YFXgVIbvBJzEz19Fi0VhM=");
        signed.Authorization.Should().Be($"SharedKey myaccount:{signed.Signature}");
    }

    [Fact]
    public void ZeroContentLengthIsAnEMPTYLineAndNotAZero()
    {
        // Azure's one documented irregularity, and the reason it has its own test: a "0" here produces
        // a signature that is correct for every request with a body and wrong for every request
        // without one — which is every HEAD, every list and every delete this client sends.
        var signed = AzureSharedKey.Sign(
            "HEAD", Account, Key, "/backups", [("x-ms-date", AzureSharedKey.Stamp(At))], [], 0);

        signed.StringToSign.Should().StartWith("HEAD\n\n\n\n");
        signed.StringToSign.Should().NotContain("\n0\n");
    }

    [Fact]
    public void TheXMsHeadersAreLowerCasedSortedAndTrimmed()
    {
        var signed = AzureSharedKey.Sign(
            "GET",
            Account,
            Key,
            "/backups",
            [
                ("X-Ms-Version", "  2021-12-02  "),
                ("x-ms-date", AzureSharedKey.Stamp(At)),
                ("X-Ms-Blob-Type", AzureSharedKey.BlockBlob),
                ("Authorization", "must not be signed"),
            ],
            [],
            0);

        signed.StringToSign.Should().Contain(
            "x-ms-blob-type:BlockBlob\nx-ms-date:Mon, 07 Sep 2026 12:00:00 GMT\nx-ms-version:2021-12-02\n");
        signed.StringToSign.Should().NotContain("must not be signed", "only x-ms- headers are canonicalised");
    }

    [Fact]
    public void TheQueryIsSortedAndAppendedToTheResourceOnePerLine()
    {
        // The shape a listing sends: restype, comp, prefix and a continuation token.
        var signed = AzureSharedKey.Sign(
            "GET",
            Account,
            Key,
            "/backups",
            [("x-ms-date", AzureSharedKey.Stamp(At))],
            [("restype", "container"), ("comp", "list"), ("prefix", "cred-vault-")],
            0);

        signed.StringToSign.Should().EndWith(
            "/myaccount/backups\ncomp:list\nprefix:cred-vault-\nrestype:container");
    }

    [Fact]
    public void TheAccountComesFromTheCREDENTIALAndNotFromTheHost()
    {
        // A storage account reached through a custom domain still signs as itself. Taking the name from
        // the URL would break exactly that deployment and nothing else, which is the kind of bug that
        // ships.
        var signed = AzureSharedKey.Sign(
            "GET", "realaccount", Key, "/backups", [("x-ms-date", AzureSharedKey.Stamp(At))], [], 0);

        signed.StringToSign.Should().EndWith("/realaccount/backups");
        signed.Authorization.Should().StartWith("SharedKey realaccount:");
    }

    [Fact]
    public void TheVersionAndTheCeilingAreBothPinned()
    {
        // A single Put Blob is 256 MiB before 2019-12-12 and 5000 MiB from it. Leaving the version to
        // the service means the ceiling can move under a deployment.
        AzureSharedKey.Version.Should().Be("2021-12-02");
        AzureSharedKey.MaxSingleBlobBytes.Should().Be(5000L * 1024 * 1024);
        AzureSharedKey.BlockBlob.Should().Be("BlockBlob");
    }

    [Fact]
    public void TheDateIsRfc1123InGmt()
    {
        AzureSharedKey.Stamp(At).Should().Be("Mon, 07 Sep 2026 12:00:00 GMT");
    }
}
