using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

namespace CredsCli;

/// <summary>The broker's answer: the HTTP status, and the raw body for the verb to interpret.</summary>
internal sealed record BrokerReply(int Status, string Body);

/// <summary>
/// Talks to the broker in a VS Code window over its loopback port.
/// </summary>
/// <remarks>
/// <para><b>The health probe is not decoration.</b> A closed window frees its port and the OS
/// hands port numbers out again, so without checking that the port still belongs to a
/// CredsForDevs broker, this bearer token would be posted to whatever unrelated process
/// inherited the number. The probe is unauthenticated precisely so it can happen BEFORE the
/// token leaves this process.</para>
/// <para>Loopback only, and that is the whole of the network story: nothing here can reach
/// another machine, and the socket transport the broker also listens on is reached by the WSL
/// bridge rather than by this path.</para>
/// </remarks>
internal sealed class BrokerClient(BrokerContract contract, HttpClient http) : IDisposable
{
    private static readonly TimeSpan HealthTimeout = TimeSpan.FromSeconds(2);

    /// <summary>Comfortably past the broker's own ceiling, so its clean answer arrives first.</summary>
    private static readonly TimeSpan CallTimeout = TimeSpan.FromMinutes(10);

    internal static BrokerClient Create(BrokerContract contract) =>
        new(contract, new HttpClient { Timeout = Timeout.InfiniteTimeSpan });

    /// <summary>Whether a CredsForDevs broker is still listening on this port.</summary>
    internal async Task<bool> IsOurBrokerAsync(int port)
    {
        try
        {
            using var cts = new CancellationTokenSource(HealthTimeout);
            using var response = await http.GetAsync(Url(port, contract.Health.Path), cts.Token);
            if (!response.IsSuccessStatusCode)
            {
                return false;
            }

            var json = await response.Content.ReadAsStringAsync(cts.Token);
            var health = JsonSerializer.Deserialize(json, CredsJsonContext.Default.HealthResponse);
            return health?.Service == contract.Service;
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException or JsonException)
        {
            return false;
        }
    }

    internal async Task<BrokerReply> PostAsync(GrantToken token, string route, string requestJson)
    {
        using var cts = new CancellationTokenSource(CallTimeout);
        using var request = new HttpRequestMessage(HttpMethod.Post, Url(token.Port, route))
        {
            Content = new StringContent(requestJson, Encoding.UTF8, "application/json"),
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token.Secret);

        using var response = await http.SendAsync(request, cts.Token);
        var body = await response.Content.ReadAsStringAsync(cts.Token);
        return new BrokerReply((int)response.StatusCode, body);
    }

    private static string Url(int port, string path) => $"http://127.0.0.1:{port}{path}";

    public void Dispose() => http.Dispose();
}
