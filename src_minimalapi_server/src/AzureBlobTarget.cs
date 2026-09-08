using System.Text;
using System.Xml.Linq;

namespace CredVaultServer;

/// <summary>Where an Azure Blob container is and what opens it.</summary>
public sealed record AzureTargetConfig(
    string Endpoint,
    string Container,
    string Prefix,
    string AccountName,
    string AccountKey);

/// <summary>
/// An Azure Blob container, over signed REST and nothing else.
/// </summary>
/// <remarks>
/// <para>The same shape as <see cref="S3Target"/> and the same three commitments: every upload is
/// verified by a <c>HEAD</c> comparing the stored length, every listing follows its
/// <c>NextMarker</c>, and the save-time probe WRITES rather than only reading.</para>
///
/// <para><b>Two headers make the difference between working and a 400.</b>
/// <c>x-ms-blob-type: BlockBlob</c> is required by Put Blob and is easy to leave out because nothing
/// else needs it; <c>x-ms-version</c> decides what the service accepts, including the 5000 MiB ceiling
/// for a single Put Blob. Both are signed, which is why they live in one list rather than being added
/// to the request afterwards.</para>
/// </remarks>
public sealed class AzureBlobTarget(
    HttpClient http,
    AzureTargetConfig config,
    TimeProvider clock,
    ArchiveTargets.TargetDeadlines? deadlines = null) : IArchiveTarget
{
    /// <summary>What this target waits, so a test can shorten it without touching the constants.</summary>
    private readonly ArchiveTargets.TargetDeadlines _deadlines = deadlines ?? ArchiveTargets.TargetDeadlines.Default;

    public string Describe => $"azure {config.AccountName}/{config.Container}/{config.Prefix}".TrimEnd('/');

    public long MaxBytes => AzureSharedKey.MaxSingleBlobBytes;

    public async Task<TargetOutcome> PutAsync(string name, Stream body, long length, CancellationToken ct)
    {
        var content = new StreamContent(body);
        content.Headers.ContentLength = length;
        var put = await SendAsync(
            Signed(HttpMethod.Put, Blob(name), [], length, content, blockBlob: true),
            _deadlines.Upload,
            ct);
        return put.Ok ? await VerifiedAsync(name, length, ct) : put;
    }

    public async Task<TargetListing> ListAsync(CancellationToken ct)
    {
        var found = new List<RemoteArchive>();
        var marker = string.Empty;
        do
        {
            var page = await PageAsync(marker, ct);
            if (page.Why.Length > 0)
            {
                // A page that did not arrive makes the WHOLE listing unusable: retention computed over
                // "what came back before the failure" would treat the rest as absent, and the floor that
                // stops it deleting everything would be measuring the wrong set.
                return TargetListing.Failed(page.Why);
            }
            found.AddRange(page.Archives);
            marker = page.Next;
        }
        while (marker.Length > 0);
        return TargetListing.Of(found);
    }

    public Task<TargetOutcome> DeleteAsync(string name, CancellationToken ct) =>
        SendAsync(
            Signed(HttpMethod.Delete, Blob(name), [], 0, null, blockBlob: false),
            _deadlines.Request,
            ct);

    public async Task<TargetOutcome> UsableAsync(CancellationToken ct)
    {
        var probe = Encoding.UTF8.GetBytes("credvault");
        // The probe's deadline, not a run's: somebody is watching this one.
        var put = await SendAsync(
            Signed(
                HttpMethod.Put,
                Blob(ArchiveTargets.ProbeName),
                [],
                probe.Length,
                new ByteArrayContent(probe),
                blockBlob: true),
            _deadlines.Probe,
            ct);
        if (!put.Ok)
        {
            return TargetOutcome.Failed($"this container would not accept a write: {put.Why}");
        }
        var gone = await DeleteAsync(ArchiveTargets.ProbeName, ct);
        return gone.Ok
            ? TargetOutcome.Fine
            : TargetOutcome.Failed(
                $"this container accepted a write and would not accept the matching delete: {gone.Why}. "
                + $"Retention will not be able to remove old archives; the probe blob "
                + $"{ArchiveTargets.ProbeName} is still there.");
    }

    private string Blob(string name) => $"/{config.Container}/{Trimmed(config.Prefix)}{name}";

    private static string Trimmed(string prefix) =>
        prefix.Trim('/').Length == 0 ? string.Empty : prefix.Trim('/') + "/";

    private async Task<TargetOutcome> VerifiedAsync(string name, long length, CancellationToken ct)
    {
        using var response = await TrySendAsync(
            Signed(HttpMethod.Head, Blob(name), [], 0, null, blockBlob: false),
            _deadlines.Request,
            ct);
        if (response.Failure.Length > 0)
        {
            return TargetOutcome.Failed($"the upload was accepted and could not then be checked: {response.Failure}");
        }
        var stored = response.Message!.Content.Headers.ContentLength ?? -1;
        return stored == length
            ? TargetOutcome.Fine
            : TargetOutcome.Failed(
                $"the upload was accepted but the stored blob is {stored} bytes where {length} were "
                + "sent. The archive at this target is not the archive that was made.");
    }

    private async Task<(IReadOnlyList<RemoteArchive> Archives, string Next, string Why)> PageAsync(
        string marker, CancellationToken ct)
    {
        var query = new List<(string, string)>
        {
            ("comp", "list"),
            ("restype", "container"),
        };
        if (Trimmed(config.Prefix).Length > 0)
        {
            query.Add(("prefix", Trimmed(config.Prefix)));
        }
        if (marker.Length > 0)
        {
            query.Add(("marker", marker));
        }
        using var response = await TrySendAsync(
            Signed(HttpMethod.Get, $"/{config.Container}", query, 0, null, blockBlob: false),
            _deadlines.Request,
            ct);
        if (response.Failure.Length > 0)
        {
            return ([], string.Empty, response.Failure);
        }
        var body = await BodyAsync(response, ct);
        return body.Why.Length > 0 ? ([], string.Empty, body.Why) : Parse(body.Text);
    }

    /// <summary>
    /// The body, under the deadline the request was given — or the sentence saying it never came.
    /// </summary>
    /// <remarks>
    /// Reading the body is a SECOND network operation: a service can send its headers and then stall,
    /// and the deadline that then fires arrives here as a cancellation. Without this it escapes as an
    /// exception — and a run talks to every configured target and must record which one failed and
    /// carry on, which an exception at this depth makes impossible. The caller's own token is passed
    /// through, so a real shutdown still propagates rather than being turned into a sentence.
    /// </remarks>
    private async Task<(string Text, string Why)> BodyAsync(Answer answer, CancellationToken ct)
    {
        try
        {
            return (await answer.Message!.Content.ReadAsStringAsync(answer.Deadline), string.Empty);
        }
        catch (Exception e) when (Expected(e, ct))
        {
            return (string.Empty, Trouble(e, _deadlines.Request));
        }
    }

    /// <summary>List Blobs' XML: the names, their sizes, and the marker that says there is more.</summary>
    private static (IReadOnlyList<RemoteArchive> Archives, string Next, string Why) Parse(string xml)
    {
        try
        {
            var document = XDocument.Parse(xml);
            var archives = document.Descendants("Blob")
                .Select(entry => new RemoteArchive(
                    Path.GetFileName((string?)entry.Element("Name") ?? string.Empty),
                    long.TryParse(
                        (string?)entry.Element("Properties")?.Element("Content-Length"), out var size) ? size : 0))
                .Where(archive => archive.Name.Length > 0)
                .ToArray();
            return (archives, (string?)document.Root?.Element("NextMarker") ?? string.Empty, string.Empty);
        }
        catch (System.Xml.XmlException e)
        {
            return ([], string.Empty, $"its listing could not be read: {e.Message}");
        }
    }

    private HttpRequestMessage Signed(
        HttpMethod method,
        string path,
        IReadOnlyList<(string Name, string Value)> query,
        long length,
        HttpContent? content,
        bool blockBlob)
    {
        var at = clock.GetUtcNow();
        var headers = new List<(string Name, string Value)>
        {
            ("x-ms-date", AzureSharedKey.Stamp(at)),
            ("x-ms-version", AzureSharedKey.Version),
        };
        if (blockBlob)
        {
            headers.Add(("x-ms-blob-type", AzureSharedKey.BlockBlob));
        }
        if (content is not null)
        {
            headers.Add(("Content-Type", ArchiveTargets.ArchiveContentType));
        }
        var signed = AzureSharedKey.Sign(
            method.Method, config.AccountName, config.AccountKey, path, headers, query, length);
        var url = $"{config.Endpoint.TrimEnd('/')}{path}"
            + (query.Count > 0
                ? "?" + string.Join('&', query.Select(p => $"{Uri.EscapeDataString(p.Name)}={Uri.EscapeDataString(p.Value)}"))
                : string.Empty);
        var request = new HttpRequestMessage(method, url) { Content = content };
        foreach (var header in headers.Where(h => h.Name.StartsWith("x-ms-", StringComparison.OrdinalIgnoreCase)))
        {
            request.Headers.TryAddWithoutValidation(header.Name, header.Value);
        }
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

    private async Task<Answer> TrySendAsync(HttpRequestMessage request, TimeSpan deadline, CancellationToken ct)
    {
        // The source is OWNED BY THE ANSWER, not disposed here. Disposing it at the end of this
        // method kills its timer, so the token the answer carries into the body read could never
        // fire — a deadline that reads as present in the code and does not exist at run time.
        // Measured on .NET 10: after Dispose(), the token's IsCancellationRequested stays false for
        // ever and Register() does not even throw, so nothing anywhere would have said so.
        var deadlineSource = CancellationTokenSource.CreateLinkedTokenSource(ct);
        deadlineSource.CancelAfter(deadline);
        try
        {
            return await AnsweredAsync(request, deadlineSource);
        }
        catch (Exception e) when (Expected(e, ct))
        {
            deadlineSource.Dispose();
            return Answer.Nothing(Trouble(e, deadline));
        }
        catch
        {
            // Anything the filter above did NOT claim — the caller's own cancellation, most of all,
            // which `Expected` deliberately lets through so a shutdown propagates rather than being
            // reported as a target that timed out. The source is linked to `ct`, so leaving it
            // undisposed leaves a registration on the caller's token; the answer that would have
            // owned it was never built, so this is the only place that can.
            deadlineSource.Dispose();
            throw;
        }
    }

    /// <summary>
    /// The answer, with the deadline source handed over to it.
    /// </summary>
    /// <remarks>
    /// The response is wrapped in an <see cref="Answer"/> BEFORE its error body is read, because
    /// reading that body can throw — the deadline fires, the connection drops — and a response that
    /// never reached an owner is never disposed. Repeated failures would then hold connections until
    /// the pool is exhausted, which presents as a backup that hangs rather than as a leak.
    /// </remarks>
    private async Task<Answer> AnsweredAsync(HttpRequestMessage request, CancellationTokenSource deadline)
    {
        var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, deadline.Token);
        var answer = new Answer(response, string.Empty, deadline);
        if (response.IsSuccessStatusCode)
        {
            return answer;
        }
        try
        {
            return answer with { Failure = await FailureAsync(response, deadline.Token) };
        }
        catch
        {
            answer.Dispose();
            throw;
        }
    }

    /// <summary>A failure this client turns into a sentence, rather than one it must not swallow.</summary>
    private static bool Expected(Exception e, CancellationToken ct) =>
        e is HttpRequestException || (e is OperationCanceledException && !ct.IsCancellationRequested);

    private static string Trouble(Exception e, TimeSpan deadline) => e is HttpRequestException
        ? $"it could not be reached: {e.Message}"
        : $"it did not answer within {Spell(deadline)}. The host accepted the connection; something "
          + "between here and the service is not completing.";

    /// <summary>A deadline in words. Seconds under a minute, because "0 minute(s)" says nothing.</summary>
    private static string Spell(TimeSpan deadline) => deadline < TimeSpan.FromMinutes(1)
        ? $"{deadline.TotalSeconds:0} second(s)"
        : $"{deadline.TotalMinutes:0} minute(s)";

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
    private sealed record Answer(
        HttpResponseMessage? Message, string Failure, CancellationTokenSource? Source) : IDisposable
    {
        public static Answer Nothing(string failure) => new(null, failure, null);

        /// <summary>The deadline the BODY must still be read under. Live until this answer is disposed.</summary>
        public CancellationToken Deadline => Source?.Token ?? CancellationToken.None;

        public void Dispose()
        {
            Message?.Dispose();
            Source?.Dispose();
        }
    }
}
