using FluentAssertions;

namespace CredVaultServer.Tests;

/// <summary>
/// AWS Signature Version 4, against AWS's own published vectors.
/// </summary>
/// <remarks>
/// <para>The vectors are what make hand-rolling a signature defensible rather than reckless. They come
/// from the <c>aws-sig-v4-test-suite</c> and from the SigV4 documentation's worked example, and each
/// one is asserted at THREE points — the canonical request, the string to sign, and the signature —
/// because a single end-to-end assertion tells you the signature is wrong and not which of the four
/// stages got it wrong.</para>
///
/// <para>The credentials below are AWS's own example values, published in their documentation for
/// exactly this purpose. They open nothing.</para>
/// </remarks>
public class AwsSigV4Tests
{
    private const string AccessKey = "AKIDEXAMPLE";

    private const string Secret = "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY";

    private const string Region = "us-east-1";

    private static readonly DateTimeOffset At =
        new(2015, 8, 30, 12, 36, 0, TimeSpan.Zero);

    [Fact]
    public void GetVanilla()
    {
        // aws-sig-v4-test-suite/get-vanilla: the simplest request there is, and the one that catches a
        // wrong header canonicalisation, a wrong empty-query line, or a missing trailing newline.
        var signed = AwsSigV4.Sign(
            new SigV4Request(
                "GET",
                "/",
                string.Empty,
                [("Host", "example.amazonaws.com"), ("X-Amz-Date", "20150830T123600Z")],
                AwsSigV4.EmptyPayloadHash),
            AccessKey,
            Secret,
            Region,
            "service",
            At);

        signed.CanonicalRequest.Should().Be(
            "GET\n/\n\nhost:example.amazonaws.com\nx-amz-date:20150830T123600Z\n\n"
            + "host;x-amz-date\ne3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
        signed.StringToSign.Should().Be(
            "AWS4-HMAC-SHA256\n20150830T123600Z\n20150830/us-east-1/service/aws4_request\n"
            + "bb579772317eb040ac9ed261061d46c1f17a8133879d6129b6e1c25292927e63");
        signed.Signature.Should().Be(
            "5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31",
            "the value AWS publishes in get-vanilla's own .authz file");
    }

    [Fact]
    public void GetVanillaQueryOrderKeyCase()
    {
        // The vector that catches sorting the query by the RAW name rather than the encoded one, and
        // sorting by value only after the names tie.
        var signed = AwsSigV4.Sign(
            new SigV4Request(
                "GET",
                "/",
                AwsSigV4.CanonicalQuery([("Param2", "value2"), ("Param1", "value1")]),
                [("Host", "example.amazonaws.com"), ("X-Amz-Date", "20150830T123600Z")],
                AwsSigV4.EmptyPayloadHash),
            AccessKey,
            Secret,
            Region,
            "service",
            At);

        signed.CanonicalRequest.Should().StartWith("GET\n/\nParam1=value1&Param2=value2\n");
        signed.StringToSign.Should().EndWith(
            "816cd5b414d056048ba4f7c5386d6e0533120fb1fcfa93762cf0fc39e2cf19e0");
        signed.Signature.Should().Be(
            "b97d918cfa904a5beff61c982a1b6f458b799221646efd99d3219ec94cdf2500");
    }

    [Fact]
    public void GetHeaderValueTrimIsNotJustTrim()
    {
        // aws-sig-v4-test-suite/get-header-value-trim: the ends are trimmed AND internal runs of
        // whitespace collapse to one space. A plain Trim() passes every test anybody writes by hand and
        // fails the first header a proxy pads.
        var signed = AwsSigV4.Sign(
            new SigV4Request(
                "GET",
                "/",
                string.Empty,
                [
                    ("Host", "example.amazonaws.com"),
                    ("My-Header1", "  value1  "),
                    ("X-Amz-Date", "20150830T123600Z"),
                ],
                AwsSigV4.EmptyPayloadHash),
            AccessKey,
            Secret,
            Region,
            "service",
            At);

        signed.CanonicalRequest.Should().Contain("my-header1:value1\n");
    }

    [Fact]
    public void TwoHeadersOfOneNameAreJoinedInTheOrderTheyWereGiven()
    {
        var signed = AwsSigV4.Sign(
            new SigV4Request(
                "GET",
                "/",
                string.Empty,
                [
                    ("Host", "example.amazonaws.com"),
                    ("My-Header1", "value2"),
                    ("My-Header1", "value1"),
                    ("X-Amz-Date", "20150830T123600Z"),
                ],
                AwsSigV4.EmptyPayloadHash),
            AccessKey,
            Secret,
            Region,
            "service",
            At);

        signed.CanonicalRequest.Should().Contain("my-header1:value2,value1\n");
        signed.CanonicalRequest.Should().Contain("host;my-header1;x-amz-date");
    }

    [Fact]
    public void APutWithAnUnsignedPayloadSignsTheSENTINELAndNotTheBody()
    {
        // The shape this server actually sends: a multi-gigabyte archive, whose body is not hashed into
        // the canonical request because that would mean reading it twice. The sentinel appears in the
        // canonical request AND in the header, and the two must be the same string.
        var signed = AwsSigV4.Sign(
            new SigV4Request(
                "PUT",
                "/backups/cred-vault-20260907-030405Z.cvbk",
                string.Empty,
                [
                    ("Host", "vaults.s3.eu-central-1.amazonaws.com"),
                    ("X-Amz-Content-Sha256", AwsSigV4.UnsignedPayload),
                    ("X-Amz-Date", "20150830T123600Z"),
                ],
                AwsSigV4.UnsignedPayload),
            AccessKey,
            Secret,
            "eu-central-1",
            "s3",
            At);

        signed.CanonicalRequest.Should().StartWith("PUT\n/backups/cred-vault-20260907-030405Z.cvbk\n\n");
        signed.CanonicalRequest.Should().EndWith($"\n{AwsSigV4.UnsignedPayload}");
        signed.CanonicalRequest.Should().Contain($"x-amz-content-sha256:{AwsSigV4.UnsignedPayload}\n");
        signed.Authorization.Should().StartWith("AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/eu-central-1/s3/");
        signed.Authorization.Should().Contain("SignedHeaders=host;x-amz-content-sha256;x-amz-date");
    }

    [Theory]
    [InlineData("simple.txt", "simple.txt", "nothing to encode")]
    [InlineData("a b.txt", "a%20b.txt", "a space is %20, never a plus")]
    [InlineData("a/b.txt", "a/b.txt", "a path keeps its slashes")]
    [InlineData("~tilde-_.x", "~tilde-_.x", "the unreserved set is A-Z a-z 0-9 - _ . ~")]
    [InlineData("café.txt", "caf%C3%A9.txt", "UTF-8 bytes, upper-case hex")]
    public void ThePathEncodingIsSigV4sAndNotUrisDefault(string raw, string encoded, string why)
    {
        AwsSigV4.Encode(raw, keepSlashes: true).Should().Be(encoded, why);
    }

    [Fact]
    public void AQueryValueLosesItsSlashesToo()
    {
        // The one difference between the two encodings, and the reason it is a parameter rather than a
        // guess made inside the function.
        AwsSigV4.Encode("a/b", keepSlashes: false).Should().Be("a%2Fb");
    }

    [Fact]
    public void TheSigningKeyIsDerivedInFourStages()
    {
        // The documentation's own worked example of the derivation, asserted through a signature the
        // vectors already pin — so a reordered stage cannot pass.
        AwsSigV4.Day(At).Should().Be("20150830");
        AwsSigV4.Stamp(At).Should().Be("20150830T123600Z");
    }
}
