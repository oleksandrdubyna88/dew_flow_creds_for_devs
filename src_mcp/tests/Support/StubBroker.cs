using System.Net;
using System.Net.Sockets;
using System.Text;
using CredsBroker;

namespace CredsMcp.Tests.Support;

/// <summary>
/// A loopback "window" that passes the health probe and then never answers a POST — so a test can watch
/// whether the client hangs on, or lets go.
/// </summary>
/// <remarks>
/// <para>A raw <see cref="TcpListener"/> rather than a web host: what this observes is the CONNECTION — the
/// moment the client side closes it — and a framework would answer, buffer or time out on its own terms. The
/// health GET is answered with the contract's own service name; every POST is read whole and then held open
/// until the peer closes it, which is what a broker waiting on a consent modal looks like from outside.</para>
/// <para>It announces itself the way a window does: a <c>window-*.json</c> file in a directory the test points
/// <c>CREDS_ENDPOINT_DIR</c> at.</para>
/// </remarks>
internal sealed class StubBroker : IAsyncDisposable
{
    private readonly TcpListener _listener = new(IPAddress.Loopback, 0);
    private readonly CancellationTokenSource _stop = new();
    private readonly TaskCompletionSource _postArrived = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly TaskCompletionSource _postClosed = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly Task _accepting;

    internal StubBroker()
    {
        _listener.Start();
        _accepting = AcceptAsync();
    }

    internal int Port => ((IPEndPoint)_listener.LocalEndpoint).Port;

    /// <summary>Completes when a POST has been received in full and is being held.</summary>
    internal Task PostArrived => _postArrived.Task;

    /// <summary>Completes when the client closed the connection a held POST arrived on.</summary>
    internal Task PostClosed => _postClosed.Task;

    /// <summary>Write the announcement a window writes, into <paramref name="directory"/>.</summary>
    internal void Announce(string directory)
    {
        Directory.CreateDirectory(directory);
        File.WriteAllText(
            Path.Combine(directory, "window-stub.json"),
            $$"""{"pid":{{Environment.ProcessId}},"port":{{Port}},"socket":null,"startedAt":"2026-10-10T00:00:00.000Z"}""");
    }

    /// <summary>The endpoint the announcement names, for an in-process caller that skips the directory.</summary>
    internal Endpoint Endpoint => new(Environment.ProcessId, Port, null, "2026-10-10T00:00:00.000Z");

    private async Task AcceptAsync()
    {
        try
        {
            while (true)
            {
                var client = await _listener.AcceptTcpClientAsync(_stop.Token);
                _ = ServeAsync(client);
            }
        }
        catch (Exception e) when (e is OperationCanceledException or ObjectDisposedException or SocketException)
        {
            // Stopped.
        }
    }

    private async Task ServeAsync(TcpClient client)
    {
        using (client)
        {
            var stream = client.GetStream();
            var head = await ReadHeadAsync(stream);
            if (head.StartsWith("GET ", StringComparison.Ordinal))
            {
                await AnswerHealthAsync(stream);
                return;
            }
            await SkipBodyAsync(stream, ContentLength(head));
            _postArrived.TrySetResult();
            await HoldUntilClosedAsync(stream);
            _postClosed.TrySetResult();
        }
    }

    private static async Task<string> ReadHeadAsync(NetworkStream stream)
    {
        var head = new StringBuilder();
        var one = new byte[1];
        while (!head.ToString().EndsWith("\r\n\r\n", StringComparison.Ordinal) && await stream.ReadAsync(one) == 1)
        {
            head.Append((char)one[0]);
        }
        return head.ToString();
    }

    private static int ContentLength(string head) =>
        head.Split("\r\n")
            .Where(line => line.StartsWith("Content-Length:", StringComparison.OrdinalIgnoreCase))
            .Select(line => int.Parse(line["Content-Length:".Length..].Trim(), System.Globalization.CultureInfo.InvariantCulture))
            .FirstOrDefault();

    private static async Task SkipBodyAsync(NetworkStream stream, int length)
    {
        var buffer = new byte[Math.Max(length, 1)];
        var read = 0;
        while (read < length)
        {
            var n = await stream.ReadAsync(buffer.AsMemory(read, length - read));
            if (n == 0)
            {
                return;
            }
            read += n;
        }
    }

    private static async Task AnswerHealthAsync(NetworkStream stream)
    {
        var body = $$"""{"ok":true,"service":"{{BrokerContract.Current.Service}}"}""";
        var reply = $"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {Encoding.UTF8.GetByteCount(body)}\r\nConnection: close\r\n\r\n{body}";
        await stream.WriteAsync(Encoding.UTF8.GetBytes(reply));
    }

    /// <summary>Never answer; return when the peer closes (a read of 0 bytes) or the connection fails.</summary>
    private static async Task HoldUntilClosedAsync(NetworkStream stream)
    {
        var buffer = new byte[256];
        try
        {
            while (await stream.ReadAsync(buffer) > 0)
            {
                // Anything more the client sends is ignored; only its closing matters.
            }
        }
        catch (IOException)
        {
            // A reset is a close too.
        }
    }

    public async ValueTask DisposeAsync()
    {
        await _stop.CancelAsync();
        _listener.Stop();
        await _accepting;
        _stop.Dispose();
    }
}
