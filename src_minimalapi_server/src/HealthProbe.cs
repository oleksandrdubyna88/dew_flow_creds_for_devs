using System.Net;

namespace CredVaultServer;

/// <summary>
/// The container health probe, inside the binary itself.
///
/// <para>The chiseled runtime image has no shell and no curl — that pair was two hundred
/// megabytes of Debian kept alive for one HTTP GET. <c>HEALTHCHECK</c> now execs
/// <c>CredVaultServer --healthcheck</c>, which asks the running instance for
/// <c>/api/health</c> and maps the answer to an exit code.</para>
/// </summary>
public static class HealthProbe
{
    /// <summary>The URL to probe, from the same variable Kestrel binds on. A wildcard
    /// bind (+ / * / 0.0.0.0) is probed via loopback; unset means the image default.</summary>
    public static string UrlFrom(string? aspnetcoreUrls)
    {
        var first = (aspnetcoreUrls ?? "")
            .Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .FirstOrDefault(u => u.StartsWith("http://", StringComparison.OrdinalIgnoreCase));
        if (first is null)
        {
            return "http://127.0.0.1:8080/api/health";
        }
        var probe = first
            .Replace("://+", "://127.0.0.1")
            .Replace("://*", "://127.0.0.1")
            .Replace("://0.0.0.0", "://127.0.0.1");
        return probe.TrimEnd('/') + "/api/health";
    }

    /// <summary>0 healthy, 1 not — the whole contract of a Docker health command.</summary>
    public static async Task<int> RunAsync()
    {
        using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(4) };
        try
        {
            var response = await client.GetAsync(UrlFrom(Environment.GetEnvironmentVariable("ASPNETCORE_URLS")));
            return response.StatusCode == HttpStatusCode.OK ? 0 : 1;
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            return 1;
        }
    }
}
