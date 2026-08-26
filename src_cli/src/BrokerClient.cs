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

    /// <summary>
    /// Set on a Remote-SSH host by the bridge: the forwarded unix socket to speak through.
    /// </summary>
    /// <remarks>
    /// On that host there is no loopback port to dial — the broker is on somebody's laptop at the
    /// other end of an <c>ssh -R</c>. The token's port half is simply unused there; the secret
    /// half still authorizes, and the consent modal still appears on the laptop.
    /// </remarks>
    internal const string SocketVariable = "CREDS_BROKER_SOCKET";

    internal static string? SocketPath() =>
        Environment.GetEnvironmentVariable(SocketVariable) is { Length: > 0 } p ? p : null;

    internal static BrokerClient Create(BrokerContract contract) => Create(contract, SocketPath());

    internal static BrokerClient Create(BrokerContract contract, string? socketPath)
    {
        var handler = new SocketsHttpHandler();
        if (socketPath is not null)
        {
            // Every request goes to the socket regardless of the URL's authority, so the rest of
            // this class composes the same `http://127.0.0.1:<port>/…` it always did and nothing
            // downstream needs to know which transport it is on.
            handler.ConnectCallback = async (_, token) =>
            {
                var socket = new System.Net.Sockets.Socket(
                    System.Net.Sockets.AddressFamily.Unix,
                    System.Net.Sockets.SocketType.Stream,
                    System.Net.Sockets.ProtocolType.Unspecified);
                await socket.ConnectAsync(new System.Net.Sockets.UnixDomainSocketEndPoint(socketPath), token);
                return new System.Net.Sockets.NetworkStream(socket, ownsSocket: true);
            };
        }

        return new BrokerClient(contract, new HttpClient(handler) { Timeout = Timeout.InfiniteTimeSpan });
    }

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

    /// <summary>
    /// An alias call: no <c>Authorization</c> header, because there is no token to send.
    /// </summary>
    /// <remarks>
    /// The absence of the header is the whole difference, and it is why the route is a separate
    /// prefix rather than the same one with an optional field: a reader of either side can tell
    /// at a glance which calls carry a copied secret and which lean on the consent modal.
    /// </remarks>
    internal async Task<BrokerReply> PostAliasAsync(int port, string route, string requestJson)
    {
        using var cts = new CancellationTokenSource(CallTimeout);
        using var content = new StringContent(requestJson, Encoding.UTF8, "application/json");
        using var response = await http.PostAsync(Url(port, route), content, cts.Token);
        var body = await response.Content.ReadAsStringAsync(cts.Token);
        return new BrokerReply((int)response.StatusCode, body);
    }

    private static string Url(int port, string path) => $"http://127.0.0.1:{port}{path}";

    public void Dispose() => http.Dispose();
}
