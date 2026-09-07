using System.Globalization;
using System.Security.Cryptography;
using System.Text;

namespace CredVaultServer;

/// <summary>Every intermediate Azure's documented example pins, so a failure says where.</summary>
public sealed record SharedKeySignature(string StringToSign, string Signature, string Authorization);

/// <summary>
/// Azure Blob Storage's SharedKey authorisation, by hand.
/// </summary>
/// <remarks>
/// <para><b>Why by hand:</b> the same reason as <see cref="AwsSigV4"/>. The signature is a dozen lines
/// of HMAC over a string Azure documents exactly, and Azure publishes a worked example of it.</para>
///
/// <para><b>The body is not hashed at all</b>, which is why the question SigV4 answers with
/// <c>UNSIGNED-PAYLOAD</c> does not arise here: a multi-gigabyte blob is signed by its
/// <c>Content-Length</c>, not by its contents.</para>
///
/// <para><b>The traps.</b> The string to sign has a FIXED number of lines whether or not the headers
/// they stand for are present — a missing Content-Length is an empty line, not a missing one, and
/// zero is written as empty rather than as "0". The <c>x-ms-</c> headers are lower-cased, sorted, and
/// joined name-colon-value with no space. The canonicalised resource is the account name, then the
/// path, then any query parameters sorted and joined — and the account name comes from the
/// CREDENTIAL, never from the host, so a custom domain does not change it.</para>
///
/// <para><b>Two headers are not optional for a block blob</b>, and both are signed:
/// <c>x-ms-blob-type: BlockBlob</c>, without which Put Blob is a 400; and <c>x-ms-version</c>, which
/// decides what the service will accept — including the maximum size of a single Put Blob, which is
/// 256 MiB before version 2019-12-12 and 5000 MiB from it. This client pins a version rather than
/// letting the service choose one for it.</para>
/// </remarks>
public static class AzureSharedKey
{
    /// <summary>
    /// The REST version this client speaks, pinned rather than left to the service.
    /// </summary>
    /// <remarks>
    /// From 2019-12-12 a single <c>Put Blob</c> may carry 5000 MiB; before it, 256 MiB. Leaving the
    /// version unset means a service default that can change under a deployment and turn a working
    /// nightly upload into a 400 on a Tuesday.
    /// </remarks>
    public const string Version = "2021-12-02";

    /// <summary>5000 MiB — the ceiling for a single Put Blob at <see cref="Version"/>.</summary>
    public const long MaxSingleBlobBytes = 5000L * 1024 * 1024;

    public const string BlockBlob = "BlockBlob";

    public static string Stamp(DateTimeOffset at) =>
        at.UtcDateTime.ToString("R", CultureInfo.InvariantCulture);

    /// <summary>Sign one request for <paramref name="account"/>, returning both steps.</summary>
    public static SharedKeySignature Sign(
        string method,
        string account,
        string accountKey,
        string path,
        IReadOnlyList<(string Name, string Value)> headers,
        IReadOnlyList<(string Name, string Value)> query,
        long contentLength)
    {
        var stringToSign = string.Join(
            '\n',
            method.ToUpperInvariant(),
            Header(headers, "Content-Encoding"),
            Header(headers, "Content-Language"),
            // ZERO is written as empty. Azure documents this as its one irregularity, and a "0" here
            // produces a signature that is wrong only for requests with no body.
            contentLength <= 0 ? string.Empty : contentLength.ToString(CultureInfo.InvariantCulture),
            Header(headers, "Content-MD5"),
            Header(headers, "Content-Type"),
            Header(headers, "Date"),
            Header(headers, "If-Modified-Since"),
            Header(headers, "If-Match"),
            Header(headers, "If-None-Match"),
            Header(headers, "If-Unmodified-Since"),
            Header(headers, "Range"),
            CanonicalHeaders(headers) + CanonicalResource(account, path, query));
        var signature = Convert.ToBase64String(
            HMACSHA256.HashData(Convert.FromBase64String(accountKey), Encoding.UTF8.GetBytes(stringToSign)));
        return new SharedKeySignature(stringToSign, signature, $"SharedKey {account}:{signature}");
    }

    /// <summary>Every <c>x-ms-</c> header, lower-cased, sorted, one per line.</summary>
    private static string CanonicalHeaders(IReadOnlyList<(string Name, string Value)> headers) =>
        string.Concat(
            headers
                .Select(header => (Name: header.Name.ToLowerInvariant(), header.Value))
                .Where(header => header.Name.StartsWith("x-ms-", StringComparison.Ordinal))
                .OrderBy(header => header.Name, StringComparer.Ordinal)
                .Select(header => $"{header.Name}:{header.Value.Trim()}\n"));

    /// <summary>
    /// <c>/account/path</c>, then one line per query parameter, sorted.
    /// </summary>
    /// <remarks>
    /// The account is the credential's, not the host's: a storage account reached through a custom
    /// domain still signs as itself, and taking the name from the URL would break exactly that
    /// deployment.
    /// </remarks>
    private static string CanonicalResource(
        string account, string path, IReadOnlyList<(string Name, string Value)> query) =>
        $"/{account}{path}"
        + string.Concat(
            query
                .Select(p => (Name: p.Name.ToLowerInvariant(), p.Value))
                .OrderBy(p => p.Name, StringComparer.Ordinal)
                .Select(p => $"\n{p.Name}:{p.Value}"));

    private static string Header(IReadOnlyList<(string Name, string Value)> headers, string name) =>
        headers.FirstOrDefault(
            header => string.Equals(header.Name, name, StringComparison.OrdinalIgnoreCase)).Value
        ?? string.Empty;
}
