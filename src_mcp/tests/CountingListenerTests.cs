using System.Diagnostics;
using System.Net.Sockets;
using CredsForDevs.ServiceDefaults.Tests.Support;
using FluentAssertions;

namespace CredsMcp.Tests;

/// <summary>
/// The test helper that counts probes must stop cleanly at any moment — including the one right after it has counted
/// a connection, when its accept loop is about to ask a listener that <see cref="CountingListener.DisposeAsync"/> has
/// just stopped.
/// </summary>
/// <remarks>
/// <para>Measured on a macOS CI leg (#234): <c>A_live_pid_on_a_port_that_is_not_ours_is_still_probed</c> failed in its
/// dispose with <c>InvalidOperationException: Not listening. You must call the Start() method</c> — the accept loop
/// caught only cancellation, disposal and socket errors, and a stopped <c>TcpListener</c> answers with none of them.</para>
/// <para>What this proves is exactly that: a REQUESTED stop never throws. It does not exercise an
/// <c>InvalidOperationException</c> raised before any stop — the helper's <c>when</c> filter is what keeps that one
/// loud, and it is read, not tested.</para>
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
