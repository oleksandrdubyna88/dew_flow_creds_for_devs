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
public sealed class AzureBlobTarget(HttpClient http, AzureTargetConfig config, TimeProvider clock) : IArchiveTarget
{
    public string Describe => $"azure {config.AccountName}/{config.Container}/{config.Prefix}".TrimEnd('/');

    public long MaxBytes => AzureSharedKey.MaxSingleBlobBytes;

    public async Task<TargetOutcome> PutAsync(string name, Stream body, long length, CancellationToken ct)
    {
        var content = new StreamContent(body);
        content.Headers.ContentLength = length;
        var put = await SendAsync(
            Signed(HttpMethod.Put, Blob(name), [], length, content, blockBlob: true),
            ArchiveTargets.UploadTimeout,
            ct);
        return put.Ok ? await VerifiedAsync(name, length, ct) : put;
    }

    public async Task<IReadOnlyList<RemoteArchive>> ListAsync(CancellationToken ct)
    {
        var found = new List<RemoteArchive>();
        var marker = string.Empty;
        do
        {
            var page = await PageAsync(marker, ct);
            found.AddRange(page.Archives);
            marker = page.Next;
        }
        while (marker.Length > 0);
        return found;
    }

    public Task<TargetOutcome> DeleteAsync(string name, CancellationToken ct) =>
        SendAsync(
            Signed(HttpMethod.Delete, Blob(name), [], 0, null, blockBlob: false),
            ArchiveTargets.RequestTimeout,
            ct);

    public async Task<TargetOutcome> UsableAsync(CancellationToken ct)
    {
        var probe = Encoding.UTF8.GetBytes("credvault");
        var put = await SendAsync(
            Signed(
                HttpMethod.Put,
                Blob(ArchiveTargets.ProbeName),
                [],
                probe.Length,
                new ByteArrayContent(probe),
                blockBlob: true),
            ArchiveTargets.RequestTimeout,
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
                $"the upload was accepted but the stored blob is {stored} bytes where {length} were "
                + "sent. The archive at this target is not the archive that was made.");
    }

    private async Task<(IReadOnlyList<RemoteArchive> Archives, string Next)> PageAsync(
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
            ArchiveTargets.RequestTimeout,
            ct);
        return response.Failure.Length > 0
            ? ([], string.Empty)
            : Parse(await response.Message!.Content.ReadAsStringAsync(ct));
    }

    /// <summary>List Blobs' XML: the names, their sizes, and the marker that says there is more.</summary>
    private static (IReadOnlyList<RemoteArchive> Archives, string Next) Parse(string xml)
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
            return (archives, (string?)document.Root?.Element("NextMarker") ?? string.Empty);
        }
        catch (System.Xml.XmlException)
        {
            return ([], string.Empty);
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
        using var deadlineSource = CancellationTokenSource.CreateLinkedTokenSource(ct);
        deadlineSource.CancelAfter(deadline);
        try
        {
            var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, deadlineSource.Token);
            return response.IsSuccessStatusCode
                ? new Answer(response, string.Empty)
                : new Answer(response, await FailureAsync(response, ct));
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            return new Answer(
                null,
                $"it did not answer within {deadline.TotalMinutes:0} minute(s). The host accepted the "
                + "connection; something between here and the service is not completing.");
        }
        catch (HttpRequestException e)
        {
            return new Answer(null, $"it could not be reached: {e.Message}");
        }
    }

    private static async Task<string> FailureAsync(HttpResponseMessage response, CancellationToken ct)
    {
        var said = await response.Content.ReadAsStringAsync(ct);
        var trimmed = said.Length > 400 ? said[..400] + "…" : said;
        return $"it answered {(int)response.StatusCode} {response.StatusCode}. {trimmed}".Trim();
    }

    private sealed record Answer(HttpResponseMessage? Message, string Failure) : IDisposable
    {
        public void Dispose() => Message?.Dispose();
    }
}
