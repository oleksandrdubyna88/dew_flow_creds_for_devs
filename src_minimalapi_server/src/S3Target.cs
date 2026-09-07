using System.Globalization;
using System.Net;
using System.Text;
using System.Xml.Linq;

namespace CredVaultServer;

/// <summary>Where an S3-compatible target is and what opens it.</summary>
public sealed record S3TargetConfig(
    string Endpoint,
    string Region,
    string Bucket,
    string Prefix,
    string AccessKeyId,
    string SecretAccessKey);

/// <summary>
/// An S3-compatible bucket, over signed REST and nothing else.
/// </summary>
/// <remarks>
/// <para><b>Path-style addressing</b> (<c>endpoint/bucket/key</c>) rather than virtual-hosted. AWS
/// itself accepts both; MinIO, Ceph and every other S3-compatible service accept path style and only
/// some accept the other, and this is the one choice that decides whether "S3-compatible" means what
/// an operator thinks it means.</para>
///
/// <para><b>Every upload is verified after the fact.</b> <c>UNSIGNED-PAYLOAD</c> leaves the body out
/// of the signature, so a 200 means the service accepted a request rather than that it stored the
/// bytes; a <c>HEAD</c> comparing the stored length against what was sent is what turns that into a
/// fact. The review round was right that without it a truncated upload reads as a good backup, and
/// the only moment anybody would find out is a restore.</para>
///
/// <para><b>Listings follow their continuation token.</b> A bucket answers 1000 keys at a time, and
/// retention over the first page only would leave everything past it for ever — while the floor that
/// protects against deleting everything would be computing against a set that is not the set.</para>
/// </remarks>
public sealed class S3Target(HttpClient http, S3TargetConfig config, TimeProvider clock) : IArchiveTarget
{
    /// <summary>5 GiB — the largest single PUT S3 accepts. Multipart is not built.</summary>
    public const long MaxSinglePutBytes = 5L * 1024 * 1024 * 1024;

    public string Describe => $"s3 {config.Bucket}/{config.Prefix}".TrimEnd('/');

    public long MaxBytes => MaxSinglePutBytes;

    public async Task<TargetOutcome> PutAsync(string name, Stream body, long length, CancellationToken ct)
    {
        var put = await SendAsync(
            Signed(HttpMethod.Put, Key(name), [], AwsSigV4.UnsignedPayload, length, Body(body, length)),
            ArchiveTargets.UploadTimeout,
            ct);
        return put.Ok ? await VerifiedAsync(name, length, ct) : put;
    }

    public async Task<TargetListing> ListAsync(CancellationToken ct)
    {
        var found = new List<RemoteArchive>();
        var token = string.Empty;
        do
        {
            var page = await PageAsync(token, ct);
            if (page.Why.Length > 0)
            {
                // A page that did not arrive makes the WHOLE listing unusable: retention computed over
                // "what came back before the failure" would treat the rest as absent, and the floor that
                // stops it deleting everything would be measuring the wrong set.
                return TargetListing.Failed(page.Why);
            }
            found.AddRange(page.Archives);
            token = page.Next;
        }
        while (token.Length > 0);
        return TargetListing.Of(found);
    }

    public Task<TargetOutcome> DeleteAsync(string name, CancellationToken ct) =>
        SendAsync(
            Signed(HttpMethod.Delete, Key(name), [], AwsSigV4.EmptyPayloadHash, 0, null),
            ArchiveTargets.RequestTimeout,
            ct);

    /// <summary>Write a probe object and delete it, because reading proves nothing about writing.</summary>
    public async Task<TargetOutcome> UsableAsync(CancellationToken ct)
    {
        var probe = Encoding.UTF8.GetBytes("credvault");
        // The probe's deadline, not a run's: somebody is watching this one.
        var put = await SendAsync(
            Signed(
                HttpMethod.Put,
                Key(ArchiveTargets.ProbeName),
                [],
                AwsSigV4.UnsignedPayload,
                probe.Length,
                new ByteArrayContent(probe)),
            ArchiveTargets.ProbeTimeout,
            ct);
        if (!put.Ok)
        {
            return TargetOutcome.Failed($"this bucket would not accept a write: {put.Why}");
        }
        var gone = await DeleteAsync(ArchiveTargets.ProbeName, ct);
        return gone.Ok
            ? TargetOutcome.Fine
            : TargetOutcome.Failed(
                $"this bucket accepted a write and would not accept the matching delete: {gone.Why}. "
                + $"Retention will not be able to remove old archives; the probe object "
                + $"{ArchiveTargets.ProbeName} is still there.");
    }

    private string Key(string name) => $"{config.Prefix.TrimEnd('/')}/{name}".TrimStart('/');

    private static HttpContent? Body(Stream body, long length)
    {
        var content = new StreamContent(body);
        content.Headers.ContentLength = length;
        return content;
    }

    /// <summary>A HEAD that compares what is stored against what was sent.</summary>
    private async Task<TargetOutcome> VerifiedAsync(string name, long length, CancellationToken ct)
    {
        using var response = await TrySendAsync(
            Signed(HttpMethod.Head, Key(name), [], AwsSigV4.EmptyPayloadHash, 0, null),
            ArchiveTargets.RequestTimeout,
            ct);
        if (response.Failure.Length > 0)
        {
            return TargetOutcome.Failed($"the upload was accepted and could not then be checked: {response.Failure}");
        }
        var stored = response.Message!.Content.Headers.ContentLength ?? -1;
        return stored == length
            ? TargetOutcome.Fine
            : TargetOutcome.Failed(
                $"the upload was accepted but the stored object is {stored} bytes where {length} were "
                + "sent. The archive at this target is not the archive that was made.");
    }

    private async Task<(IReadOnlyList<RemoteArchive> Archives, string Next, string Why)> PageAsync(
        string token, CancellationToken ct)
    {
        var query = new List<(string, string)>
        {
            ("list-type", "2"),
            ("prefix", config.Prefix.TrimStart('/')),
        };
        if (token.Length > 0)
        {
            query.Add(("continuation-token", token));
        }
        using var response = await TrySendAsync(
            Signed(HttpMethod.Get, string.Empty, query, AwsSigV4.EmptyPayloadHash, 0, null),
            ArchiveTargets.RequestTimeout,
            ct);
        return response.Failure.Length > 0
            ? ([], string.Empty, response.Failure)
            : Parse(await response.Message!.Content.ReadAsStringAsync(response.Deadline));
    }

    /// <summary>ListObjectsV2's XML: the keys, their sizes, and the token that says there is more.</summary>
    private static (IReadOnlyList<RemoteArchive> Archives, string Next, string Why) Parse(string xml)
    {
        try
        {
            var document = XDocument.Parse(xml);
            var ns = document.Root?.Name.Namespace ?? XNamespace.None;
            var archives = document.Descendants(ns + "Contents")
                .Select(entry => new RemoteArchive(
                    Path.GetFileName((string?)entry.Element(ns + "Key") ?? string.Empty),
                    long.TryParse((string?)entry.Element(ns + "Size"), out var size) ? size : 0))
                .Where(archive => archive.Name.Length > 0)
                .ToArray();
            var truncated = string.Equals(
                (string?)document.Root?.Element(ns + "IsTruncated"), "true", StringComparison.OrdinalIgnoreCase);
            return (archives, truncated
                ? (string?)document.Root?.Element(ns + "NextContinuationToken") ?? string.Empty
                : string.Empty,
                string.Empty);
        }
        catch (System.Xml.XmlException e)
        {
            // A service that answered 200 with something that is not a listing. Reporting it as a
            // FAILURE rather than as an empty page is what keeps retention from doing nothing while the
            // run says everything went well.
            return ([], string.Empty, $"its listing could not be read: {e.Message}");
        }
    }

    private HttpRequestMessage Signed(
        HttpMethod method,
        string key,
        IReadOnlyList<(string Name, string Value)> query,
        string payloadHash,
        long length,
        HttpContent? content)
    {
        var at = clock.GetUtcNow();
        var host = new Uri(config.Endpoint).Authority;
        var path = $"/{config.Bucket}{(key.Length > 0 ? "/" + key : string.Empty)}";
        var canonicalQuery = AwsSigV4.CanonicalQuery(query);
        var headers = new List<(string, string)>
        {
            ("host", host),
            ("x-amz-content-sha256", payloadHash),
            ("x-amz-date", AwsSigV4.Stamp(at)),
        };
        if (content is not null)
        {
            headers.Add(("content-type", ArchiveTargets.ArchiveContentType));
        }
        var signed = AwsSigV4.Sign(
            new SigV4Request(
                method.Method,
                AwsSigV4.Encode(path, keepSlashes: true),
                canonicalQuery,
                headers,
                payloadHash),
            config.AccessKeyId,
            config.SecretAccessKey,
            config.Region,
            "s3",
            at);
        var request = new HttpRequestMessage(
            method,
            $"{config.Endpoint.TrimEnd('/')}{path}{(canonicalQuery.Length > 0 ? "?" + canonicalQuery : string.Empty)}")
        {
            Content = content,
        };
        request.Headers.TryAddWithoutValidation("x-amz-content-sha256", payloadHash);
        request.Headers.TryAddWithoutValidation("x-amz-date", AwsSigV4.Stamp(at));
        request.Headers.TryAddWithoutValidation("Authorization", signed.Authorization);
        if (content is not null)
        {
            content.Headers.TryAddWithoutValidation("Content-Type", ArchiveTargets.ArchiveContentType);
            content.Headers.ContentLength = length;
        }
        return request;
    }

    private async Task<TargetOutcome> SendAsync(
        HttpRequestMessage request, TimeSpan deadline, CancellationToken ct)
    {
        using var response = await TrySendAsync(request, deadline, ct);
        return response.Failure.Length > 0 ? TargetOutcome.Failed(response.Failure) : TargetOutcome.Fine;
    }

    /// <summary>
    /// One request, with its own deadline, and every failure as a SENTENCE rather than an exception.
    /// </summary>
    /// <remarks>
    /// A backup run talks to every configured target and must record which one failed and carry on;
    /// exceptions per HTTP status would make that a try/catch at every call site. The deadline is
    /// explicit because an endpoint that accepts a connection and then says nothing would otherwise
    /// occupy the run for <c>HttpClient</c>'s ambient hundred seconds — or, for an upload, for ever.
    /// </remarks>
    private async Task<Answer> TrySendAsync(HttpRequestMessage request, TimeSpan deadline, CancellationToken ct)
    {
        using var deadlineSource = CancellationTokenSource.CreateLinkedTokenSource(ct);
        deadlineSource.CancelAfter(deadline);
        try
        {
            var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, deadlineSource.Token);
            return response.IsSuccessStatusCode
                ? new Answer(response, string.Empty, deadlineSource.Token)
                : new Answer(
                    response,
                    await FailureAsync(response, deadlineSource.Token),
                    deadlineSource.Token);
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            return new Answer(
                null,
                $"it did not answer within {deadline.TotalMinutes:0} minute(s). The host accepted the "
                + "connection; something between here and the service is not completing.",
                CancellationToken.None);
        }
        catch (HttpRequestException e)
        {
            return new Answer(null, $"it could not be reached: {e.Message}", CancellationToken.None);
        }
    }

    /// <summary>The service's own words, bounded — an error body is not a place to read a novel from.</summary>
    private static async Task<string> FailureAsync(HttpResponseMessage response, CancellationToken ct)
    {
        var said = await response.Content.ReadAsStringAsync(ct);
        var trimmed = said.Length > 400 ? said[..400] + "…" : said;
        return $"it answered {(int)response.StatusCode} {response.StatusCode}. {trimmed}".Trim();
    }

    /// <summary>
    /// One answer, and the token whose deadline it was fetched under.
    /// </summary>
    /// <remarks>
    /// The deadline travels with the response because reading the BODY is a second network operation:
    /// a service can send headers and then never finish, and a body read on the caller's token would
    /// sit past the deadline the request was given.
    /// </remarks>
    private sealed record Answer(HttpResponseMessage? Message, string Failure, CancellationToken Deadline)
        : IDisposable
    {
        public void Dispose() => Message?.Dispose();
    }
}
