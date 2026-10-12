using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Text;
using FluentAssertions;

namespace CredsBroker.Tests;

/// <summary>
/// What one announcement of a CLOSED window costs the health probe.
/// </summary>
/// <remarks>
/// <para>Measured on the reporting machine (research/PLAN_stale_endpoint_files_slow_every_refusal.md §3): a .NET connect to
/// a loopback port nobody listens on took about <b>2 s</b> on Windows — the stack meets the RST and retransmits the SYN
/// before it gives up — while Node, on the same ports, was refused in a millisecond. With 35 announcements of closed
/// windows, <c>creds config -</c> needed 68 s to refuse an unknown key, and a consumer with a timeout got no key at all.</para>
/// <para>These tests dial real ports the test opened and closed itself. On Linux and macOS a refused loopback connect was
/// always instant, so the timing test is a guard there and the regression test on Windows.</para>
/// </remarks>
public class BrokerClientConnectTests
{
    /// <summary>
    /// Far below the ~2 s the Windows stack spends on a refused loopback connect, far above what a refusal costs
    /// (1–17 ms measured), so a busy machine does not turn this red.
    /// </summary>
    private static readonly TimeSpan PerClosedPortCeiling = TimeSpan.FromMilliseconds(750);

    private const int ClosedPorts = 5;

    [Fact]
    public async Task A_closed_loopback_port_is_refused_at_once_not_after_the_syn_retries()
    {
        var ports = ClosedLoopbackPorts(ClosedPorts + 1);
        using var client = BrokerClient.Create(BrokerContract.Current, socketPath: null);

        // One untimed probe first: the first call also pays the JIT and the handler's start-up, which is not what this
        // measures and could cross the ceiling on a busy runner (own review, 2026-10-11).
        (await client.IsOurBrokerAsync(ports[0], TestContext.Current.CancellationToken)).Should().BeFalse();

        var slowest = TimeSpan.Zero;
        var total = Stopwatch.StartNew();
        foreach (var port in ports.Skip(1))
        {
            var one = Stopwatch.StartNew();
            var ours = await client.IsOurBrokerAsync(port, TestContext.Current.CancellationToken);
            one.Stop();

            ours.Should().BeFalse("nothing listens on port {0} any more", port);
            slowest = one.Elapsed > slowest ? one.Elapsed : slowest;
        }
        total.Stop();

        slowest.Should().BeLessThan(
            PerClosedPortCeiling,
            "a closed window's port must cost a refusal, not the SYN retries — {0} closed ports took {1:N0} ms in total",
            ClosedPorts,
            total.Elapsed.TotalMilliseconds);
    }

    [Fact]
    public void A_broker_client_is_only_built_by_Create_so_every_one_connects_the_same_way()
    {
        // Code round, 2026-10-11: a public constructor taking any HttpClient let a caller build a client whose probes
        // skip LoopbackConnect — and pay the two seconds per closed window again.
        typeof(BrokerClient).GetConstructors().Should().BeEmpty("BrokerClient.Create owns the handler, and with it the connect");
    }

    [Fact]
    public async Task A_live_window_still_passes_the_probe_through_the_same_connect()
    {
        // The fast-fail option is applied before the connect; it must not cost a live listener its answer.
        using var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var port = ((IPEndPoint)listener.LocalEndpoint).Port;
        var serving = AnswerHealthOnceAsync(listener, BrokerContract.Current.Service);
        using var client = BrokerClient.Create(BrokerContract.Current, socketPath: null);

        var ours = await client.IsOurBrokerAsync(port, TestContext.Current.CancellationToken);

        ours.Should().BeTrue();
        await serving;
    }

    [Fact]
    public void The_fast_fail_option_is_asked_for_only_on_windows_and_only_for_loopback()
    {
        LoopbackConnect.WantsFastFail(IPAddress.Loopback, isWindows: true).Should().BeTrue();
        LoopbackConnect.WantsFastFail(IPAddress.IPv6Loopback, isWindows: true).Should().BeTrue();
        LoopbackConnect.WantsFastFail(IPAddress.Parse("192.0.2.10"), isWindows: true).Should().BeFalse(
            "a real network can drop a SYN, and only loopback is certain to answer one");
        LoopbackConnect.WantsFastFail(IPAddress.Loopback, isWindows: false).Should().BeFalse(
            "Linux and macOS refuse a loopback connect at once already");
    }

    [Fact]
    public void The_option_block_is_the_one_libuv_sends()
    {
        // TCP_INITIAL_RTO_PARAMETERS { USHORT Rtt = TCP_INITIAL_RTO_UNSPECIFIED_RTT; UCHAR MaxSynRetransmissions =
        // TCP_INITIAL_RTO_NO_SYN_RETRANSMISSIONS }, little-endian, padded to four bytes.
        LoopbackConnect.NoSynRetransmissions.Should().Equal(0xFF, 0xFF, 0xFE, 0x00);
        unchecked((uint)LoopbackConnect.SioTcpInitialRto).Should().Be(0x98000011u);
    }

    /// <summary>Ports that WERE listening a moment ago and no longer are — what a crashed window leaves behind.</summary>
    private static int[] ClosedLoopbackPorts(int count)
    {
        var listeners = Enumerable.Range(0, count).Select(_ => new TcpListener(IPAddress.Loopback, 0)).ToArray();
        foreach (var listener in listeners)
        {
            listener.Start();
        }
        var ports = listeners.Select(l => ((IPEndPoint)l.LocalEndpoint).Port).ToArray();
        foreach (var listener in listeners)
        {
            listener.Stop();
            listener.Dispose();
        }
        return ports;
    }

    private static async Task AnswerHealthOnceAsync(TcpListener listener, string service)
    {
        using var peer = await listener.AcceptTcpClientAsync(TestContext.Current.CancellationToken);
        var stream = peer.GetStream();
        var head = new StringBuilder();
        var one = new byte[1];
        while (!head.ToString().EndsWith("\r\n\r\n", StringComparison.Ordinal)
            && await stream.ReadAsync(one, TestContext.Current.CancellationToken) == 1)
        {
            head.Append((char)one[0]);
        }
        var body = $$"""{"service":"{{service}}"}""";
        var reply = $"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {body.Length}\r\nConnection: close\r\n\r\n{body}";
        await stream.WriteAsync(Encoding.ASCII.GetBytes(reply), TestContext.Current.CancellationToken);
    }
}
