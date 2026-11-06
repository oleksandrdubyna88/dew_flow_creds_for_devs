using System.Diagnostics;
using System.Net.Sockets;
using CredsForDevs.ServiceDefaults.Tests.Support;
using FluentAssertions;

namespace CredsMcp.Tests;

/// <summary>
/// The test helper that counts probes must stop cleanly at any moment — including the one right after it has counted
/// a connection, when its accept loop is on its way to the next accept.
/// </summary>
/// <remarks>
/// <para>Measured twice. On a macOS CI leg (#234) <c>A_live_pid_on_a_port_that_is_not_ours_is_still_probed</c> failed in
/// its dispose with <c>InvalidOperationException: Not listening. You must call the Start() method</c>, and a catch was
/// added for it. On a Linux CI job (#302) this test failed at round 80 with a <c>NullReferenceException</c> inside
/// <c>TcpListener.AcceptSocketAsync</c>. Both were one race: <see cref="CountingListener.DisposeAsync"/> stopped the
/// listener while the loop was still running.</para>
/// <para>The helper now ends the loop first and has no catch for either exception, so any meeting with a stopped
/// listener fails this test. With the stop before the wait it went red in 14 of 14 local Linux runs, at rounds from 2 to
/// 157; with the wait first, green in 30 of 30.</para>
/// <para>Not tested: an accept that cancelling does not end. The helper's bound on that wait is read, because forcing it
/// would need a seam in the helper for a case no platform has shown.</para>
/// </remarks>
public sealed class CountingListenerTests
{
    private const int Rounds = 300;

    private static readonly TimeSpan CountedWithin = TimeSpan.FromSeconds(5);

    [Fact]
    public async Task Disposing_right_after_a_counted_connection_never_throws()
    {
        var ct = TestContext.Current.CancellationToken;
        for (var round = 0; round < Rounds; round++)
        {
            var listener = new CountingListener();
            try
            {
                using var client = new TcpClient();
                await client.ConnectAsync("127.0.0.1", listener.Port, ct);
                var waited = Stopwatch.StartNew();
                while (listener.Connections == 0)
                {
                    waited.Elapsed.Should().BeLessThan(CountedWithin, $"round {round}: the connection was never counted");
                    await Task.Yield();
                }
            }
            finally
            {
                var dispose = async () => await listener.DisposeAsync();
                await dispose.Should().NotThrowAsync($"round {round} of {Rounds}: the helper stopped while its loop was between two accepts");
            }
        }
    }
}
