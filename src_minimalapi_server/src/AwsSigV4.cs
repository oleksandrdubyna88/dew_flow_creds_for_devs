using System.Globalization;
using System.Security.Cryptography;
using System.Text;

namespace CredVaultServer;

/// <summary>One request, reduced to the parts a signature is computed over.</summary>
public sealed record SigV4Request(
    string Method,
    string CanonicalUri,
    string CanonicalQuery,
    IReadOnlyList<(string Name, string Value)> Headers,
    string PayloadHash);

/// <summary>Every intermediate the AWS test suite pins, so a failure says WHERE.</summary>
public sealed record SigV4Signature(
    string CanonicalRequest,
    string StringToSign,
    string Signature,
    string Authorization);

/// <summary>
/// AWS Signature Version 4, by hand.
/// </summary>
/// <remarks>
/// <para><b>Why by hand rather than an SDK.</b> This server publishes Native AOT and its csproj carries
/// exactly one suppression, scoped and reasoned; the AWS SDK is tens of megabytes built on the
/// reflection an AOT binary refuses. The signature itself is about a hundred lines of HMAC — and,
/// crucially, AWS PUBLISHES worked examples of every intermediate step. A hand-rolled signature with
/// those pinned has a failure mode that is a red test; an SDK dependency has one that is a 40 MB
/// binary and a trim warning.</para>
///
/// <para><b>Pure, and pinned at three points.</b> The canonical request, the string to sign and the
/// signature are each returned, because a single end-to-end assertion tells you the signature is wrong
/// and not which of the four places got it wrong. The AWS documentation's own worked example and the
/// <c>aws-sig-v4-test-suite</c> vectors assert all three.</para>
///
/// <para><b>The traps, each of which the vectors catch.</b> Header names are lower-cased and sorted;
/// their values have runs of internal whitespace collapsed and the ends trimmed; the signed-headers
/// list must be the same set in the same order in two places; the query string is sorted by
/// percent-ENCODED name and then value; the path is encoded but its slashes are not; and the payload
/// hash appears both in the canonical request and in an <c>x-amz-content-sha256</c> header.</para>
/// </remarks>
public static class AwsSigV4
{
    public const string Algorithm = "AWS4-HMAC-SHA256";

    /// <summary>
    /// What goes in <c>x-amz-content-sha256</c> for a large PUT instead of the body's hash.
    /// </summary>
    /// <remarks>
    /// Hashing the body into the canonical request means reading a multi-gigabyte archive twice: once
    /// to hash and once to send. This sentinel is AWS's own documented answer, it is what every SDK
    /// uses for large uploads, and it requires HTTPS — which is why an endpoint that is not
    /// <c>https://</c> is refused when a target is saved.
    /// </remarks>
    public const string UnsignedPayload = "UNSIGNED-PAYLOAD";

    /// <summary>The hash of nothing, for the requests that genuinely have no body.</summary>
    public const string EmptyPayloadHash =
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

    public static string Stamp(DateTimeOffset at) =>
        at.UtcDateTime.ToString("yyyyMMdd'T'HHmmss'Z'", CultureInfo.InvariantCulture);

    public static string Day(DateTimeOffset at) =>
        at.UtcDateTime.ToString("yyyyMMdd", CultureInfo.InvariantCulture);

    /// <summary>Sign one request, returning every step the vectors check.</summary>
    public static SigV4Signature Sign(
        SigV4Request request,
        string accessKeyId,
        string secretAccessKey,
        string region,
        string service,
        DateTimeOffset at)
    {
        var headers = Canonicalised(request.Headers);
        var signedHeaders = string.Join(';', headers.Select(header => header.Name));
        var canonical = CanonicalRequest(request, headers, signedHeaders);
        var scope = $"{Day(at)}/{region}/{service}/aws4_request";
        var stringToSign = string.Join(
            '\n', Algorithm, Stamp(at), scope, Hex(SHA256.HashData(Encoding.UTF8.GetBytes(canonical))));
        var signature = Hex(Hmac(SigningKey(secretAccessKey, at, region, service), stringToSign));
        return new SigV4Signature(
            canonical,
            stringToSign,
            signature,
            $"{Algorithm} Credential={accessKeyId}/{scope}, SignedHeaders={signedHeaders}, Signature={signature}");
    }

    /// <summary>
    /// Percent-encoding as SigV4 defines it, which is NOT <c>Uri.EscapeDataString</c>'s.
    /// </summary>
    /// <remarks>
    /// The unreserved set is <c>A-Z a-z 0-9 - _ . ~</c> and everything else is <c>%XX</c> in upper
    /// case. A path keeps its slashes; a query name or value does not. Getting this wrong produces a
    /// signature that is right for every ASCII key anybody tests with and wrong for the first one with
    /// a space in it.
    /// </remarks>
    public static string Encode(string value, bool keepSlashes)
    {
        var encoded = new StringBuilder(value.Length);
        foreach (var b in Encoding.UTF8.GetBytes(value))
        {
            encoded.Append(Unreserved(b) || (keepSlashes && b == (byte)'/')
                ? ((char)b).ToString()
                : $"%{b:X2}");
        }
        return encoded.ToString();
    }

    /// <summary>A query string sorted the way the canonical request wants it: by encoded name, then value.</summary>
    public static string CanonicalQuery(IEnumerable<(string Name, string Value)> parameters) =>
        string.Join(
            '&',
            parameters
                .Select(p => (Name: Encode(p.Name, keepSlashes: false), Value: Encode(p.Value, keepSlashes: false)))
                .OrderBy(p => p.Name, StringComparer.Ordinal)
                .ThenBy(p => p.Value, StringComparer.Ordinal)
                .Select(p => $"{p.Name}={p.Value}"));

    public static string Hex(byte[] bytes) => Convert.ToHexStringLower(bytes);

    private static string CanonicalRequest(
        SigV4Request request, IReadOnlyList<(string Name, string Value)> headers, string signedHeaders) =>
        string.Join(
            '\n',
            request.Method,
            request.CanonicalUri,
            request.CanonicalQuery,
            string.Concat(headers.Select(header => $"{header.Name}:{header.Value}\n")),
            signedHeaders,
            request.PayloadHash);

    /// <summary>
    /// Lower-cased names, trimmed values with internal runs of spaces collapsed, sorted by name.
    /// </summary>
    /// <remarks>
    /// Two headers with the same name are joined with a comma, in the order they were given — which is
    /// what the <c>get-header-value-multiline</c> and <c>get-header-value-order</c> vectors exist to
    /// catch.
    /// </remarks>
    private static IReadOnlyList<(string Name, string Value)> Canonicalised(
        IReadOnlyList<(string Name, string Value)> headers) =>
    [
        .. headers
            .GroupBy(header => header.Name.ToLowerInvariant(), StringComparer.Ordinal)
            .Select(group => (Name: group.Key, Value: string.Join(',', group.Select(h => Collapsed(h.Value)))))
            .OrderBy(header => header.Name, StringComparer.Ordinal),
    ];

    private static string Collapsed(string value)
    {
        var collapsed = new StringBuilder(value.Length);
        var space = false;
        foreach (var symbol in value.Trim())
        {
            space = AppendSymbol(collapsed, symbol, space);
        }
        return collapsed.ToString();
    }

    private static bool AppendSymbol(StringBuilder into, char symbol, bool afterSpace)
    {
        if (symbol is not ' ' and not '\t')
        {
            into.Append(symbol);
            return false;
        }
        if (!afterSpace)
        {
            into.Append(' ');
        }
        return true;
    }

    /// <summary>The four-stage derivation: date, region, service, then the terminator.</summary>
    private static byte[] SigningKey(string secret, DateTimeOffset at, string region, string service)
    {
        var key = Hmac(Encoding.UTF8.GetBytes($"AWS4{secret}"), Day(at));
        key = Hmac(key, region);
        key = Hmac(key, service);
        return Hmac(key, "aws4_request");
    }

    private static byte[] Hmac(byte[] key, string data) =>
        HMACSHA256.HashData(key, Encoding.UTF8.GetBytes(data));

    private static bool Unreserved(byte b) =>
        b is >= (byte)'A' and <= (byte)'Z'
            or >= (byte)'a' and <= (byte)'z'
            or >= (byte)'0' and <= (byte)'9'
            or (byte)'-' or (byte)'_' or (byte)'.' or (byte)'~';
}
