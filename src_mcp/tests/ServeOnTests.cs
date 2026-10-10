using System.IO.Pipelines;
using System.Runtime.InteropServices;
using CredsBroker;
using CredsForDevs.ServiceDefaults;
using CredsForDevs.ServiceDefaults.Tests.Support;
using CredsMcp;
using CredsMcp.Tests.Support;
using FluentAssertions;
using ModelContextProtocol.Server;

namespace CredsMcp.Tests;

/// <summary>
/// The whole server — options, tools, filter, lifetime — in-process over a pair of pipes, given the captured
/// Claude Code session: the in-process twin of <see cref="ServerEndsWithClientTests"/>.
/// </summary>
/// <remarks>
/// The process test proves the built binary ends; this one runs the same code where a coverage tool can see
/// it (the E1 lesson: Sonar measures only in-process code), and pins the ending the binary logs.
/// </remarks>
public sealed class ServeOnTests
{
    private static readonly TimeSpan Bound = TimeSpan.FromSeconds(10);

    [Fact]
    public async Task A_session_with_an_open_listen_ends_when_its_input_ends()
    {
        var ct = TestContext.Current.CancellationToken;
        var toServer = new Pipe();
        var fromServer = new Pipe();
        await using var transport = new StreamServerTransport(toServer.Reader.AsStream(), fromServer.Writer.AsStream(), "test");
        var sink = new CollectingSink();
        var source = new CallerSource(new CallerRecord(string.Empty, string.Empty, string.Empty, string.Empty));
        var forced = false;
        var signals = new LifetimeSignals(transport.MessageReader.Completion, Task.Delay(Timeout.Infinite, ct), new TaskCompletionSource<PosixSignal>().Task);

        var serving = Program.ServeOnAsync(
            transport, BrokerContract.Current, source, sink.Logger(), signals, LifetimeTimings.Default, _ => forced = true);

        using var replies = new StreamReader(fromServer.Reader.AsStream());
        var writer = new StreamWriter(toServer.Writer.AsStream()) { AutoFlush = true };
        foreach (var line in McpScript.ClaudeCodeHandshake())
        {
            await writer.WriteLineAsync(line.AsMemory(), ct);
        }
        var waiting = new HashSet<string>(McpScript.ClaudeCodeReplyIds);
        while (waiting.Count > 0)
        {
            var read = await replies.ReadLineAsync(ct).AsTask().WaitAsync(Bound, ct);
            waiting.Remove(McpScript.IdOf(read!));
        }
        await toServer.Writer.CompleteAsync();

        (await serving.WaitAsync(Bound, ct)).Should().Be(new HostEnding(0, ExitReason.ClientClosed));
        forced.Should().BeFalse("cancelling the run token is enough; the deadline is for a server that hangs");
        sink.Messages.Should().Contain("stopping the server: clientClosed", "the listen was still open after the drain");
    }
}
