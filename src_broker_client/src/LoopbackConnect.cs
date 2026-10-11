using System.Net;
using System.Net.Sockets;

namespace CredsBroker;

/// <summary>
/// The connect every port-transport call makes — refused at once on Windows when nobody listens.
/// </summary>
/// <remarks>
/// <para><b>Why this exists — measured, not assumed</b> (research/PLAN_stale_endpoint_files_slow_every_refusal.md §3). On
/// Windows a TCP connect that meets an RST is retried: the stack retransmits the SYN, and only then fails. To a loopback
/// port nobody listens on that costs about <b>2 s</b> from .NET (2041–2163 ms measured), against 0–3 ms from Node on the
/// same ports. A window that crashed leaves an announcement naming exactly such a port, and every walk probed each one:
/// 35 of them made <c>creds config -</c> take 68 s to refuse an unknown key.</para>
/// <para>Node does not pay it because libuv sets <c>SIO_TCP_INITIAL_RTO</c> with no SYN retransmissions before every
/// loopback connect (<c>src/win/tcp.c</c>: "fail instantly if the target port on the localhost is not reachable,
/// instead of waiting for 2s"). This does the same, and only that: same address, same transport, no timeout changed.
/// Loopback only, because only loopback is certain to answer a SYN; on a real network a lost SYN is what the
/// retransmission is for.</para>
/// <para><b>Best effort.</b> Windows before 10.0.16299 does not know the option; the ioctl then fails, the failure is
/// ignored, and the connect is today's — slow on a dead port, still correct. Linux and macOS refuse a loopback connect
/// at once already, so nothing is set there.</para>
/// </remarks>
public static class LoopbackConnect
{
    /// <summary><c>SIO_TCP_INITIAL_RTO</c> = <c>_WSAIOW(IOC_VENDOR, 17)</c>.</summary>
    internal const int SioTcpInitialRto = unchecked((int)0x98000011);

    /// <summary>
    /// <c>TCP_INITIAL_RTO_PARAMETERS { USHORT Rtt = TCP_INITIAL_RTO_UNSPECIFIED_RTT (0xFFFF); UCHAR MaxSynRetransmissions
    /// = TCP_INITIAL_RTO_NO_SYN_RETRANSMISSIONS (0xFE) }</c>, little-endian and padded to the struct's four bytes.
    /// </summary>
    internal static IReadOnlyList<byte> NoSynRetransmissions { get; } = [0xFF, 0xFF, 0xFE, 0x00];

    /// <summary>Whether a connect to this address gets the fast-fail option: loopback, on Windows.</summary>
    internal static bool WantsFastFail(IPAddress address, bool isWindows) => isWindows && IPAddress.IsLoopback(address);

    /// <summary>The <c>SocketsHttpHandler.ConnectCallback</c> for the loopback port transport.</summary>
    public static async ValueTask<Stream> ConnectAsync(SocketsHttpConnectionContext context, CancellationToken ct)
    {
        var target = context.DnsEndPoint;
        var socket = IPAddress.TryParse(target.Host, out var address)
            ? new Socket(address.AddressFamily, SocketType.Stream, ProtocolType.Tcp)
            : new Socket(SocketType.Stream, ProtocolType.Tcp);
        try
        {
            socket.NoDelay = true;
            if (address is not null && WantsFastFail(address, OperatingSystem.IsWindows()))
            {
                TryFailFastOnRefusal(socket);
            }

            await socket.ConnectAsync(address is not null ? new IPEndPoint(address, target.Port) : target, ct).ConfigureAwait(false);
            return new NetworkStream(socket, ownsSocket: true);
        }
        catch
        {
            socket.Dispose();
            throw;
        }
    }

    /// <summary>Ask Windows not to retransmit the SYN; an old Windows that cannot is left as it is.</summary>
    private static void TryFailFastOnRefusal(Socket socket)
    {
        try
        {
            socket.IOControl(SioTcpInitialRto, [.. NoSynRetransmissions], null);
        }
        catch (Exception e) when (e is SocketException or PlatformNotSupportedException or NotSupportedException)
        {
            // Older than 10.0.16299: the connect keeps today's behaviour — slow on a dead port, still correct.
        }
    }
}
