using System.Text;

using CredsForDevs.ServiceDefaults.Tests.Support;
using CredsMcp;
using FluentAssertions;

namespace CredsMcp.Tests;

/// <summary>
/// The endings of a carried session, which are not symmetrical.
/// </summary>
/// <remarks>
/// <para>What these can cover is the rule the pump applies when one side stops: a client hanging
/// up must not cost the child's last reply, and a child that has gone must not leave this process
/// waiting on a client that may never close its end. Both are decisions made here, on streams,
/// and both were wrong at some point in the design. Since E3 there are two more: a client that hung up
/// is not waited for past a bound (defect B's second half), and a shutdown returns the pump at once.</para>
/// <para>What they deliberately do NOT claim is that a Windows process on the other side of a
/// kernel boundary actually answers — that is a fact about another machine's process table, and
/// asserting it from here would be the mistake <c>AgentRelayTests</c> names in its own comment.
/// It is covered by <c>scripts/creds-mcp-wsl-itest.cjs</c>, which drives the real binary inside a
/// real distribution against a real window — and, for the child's fate, by <c>WslPumpHostTests</c>.</para>
/// </remarks>
public sealed class WslPumpTests
{
    private const string Request = """{"jsonrpc":"2.0","id":1,"method":"initialize"}""";
    private const string Reply = """{"jsonrpc":"2.0","id":1,"result":{}}""";

    [Fact]
    public async Task A_client_that_hangs_up_still_receives_what_the_child_was_saying()
    {
        // The ending that is easy to get wrong: stdin reaching end-of-stream is the client saying
        // "no more requests", not "discard the answer to the last one". Ending the pump there
        // truncates the stream at the exact moment an orderly shutdown was happening.
        var fromClient = new MemoryStream(Encoding.UTF8.GetBytes(Request));
        var toChild = new ClosingStream();
        var fromChild = new HeldStream(Reply);
        var toClient = new MemoryStream();

        var pump = WslPump.PumpAsync(fromClient, toChild, fromChild, toClient);
        pump.IsCompleted.Should().BeFalse("the child had not finished answering");

        fromChild.HangUp();
        await pump.WaitAsync(TimeSpan.FromSeconds(5), TestContext.Current.CancellationToken);

        Encoding.UTF8.GetString(toClient.ToArray()).Should().Be(Reply);
        toChild.Written.Should().Be(Request);
        toChild.Closed.Should().BeTrue("the child must learn the client hung up, or it waits forever");
    }

    [Fact]
    public async Task A_child_that_has_gone_ends_the_pump_without_waiting_for_the_client()
    {
        // The other ending, and the one that hangs a process if it is written symmetrically: an
        // MCP client keeps its end of stdin open for as long as it believes the server is alive,
        // so waiting for it to close would mean waiting for a decision it is waiting on US for.
        var fromClient = new HeldStream(Request);
        var toChild = new ClosingStream();
        var fromChild = new MemoryStream(Encoding.UTF8.GetBytes(Reply));
        var toClient = new MemoryStream();

        await WslPump
            .PumpAsync(fromClient, toChild, fromChild, toClient)
            .WaitAsync(TimeSpan.FromSeconds(5), TestContext.Current.CancellationToken);

        Encoding.UTF8.GetString(toClient.ToArray()).Should().Be(Reply);
    }

    [Fact]
    public async Task A_message_reaches_a_buffering_destination_before_the_stream_ends()
    {
        // The property the pump owns rather than borrows. Whether a short write reaches a child's
        // stdin unflushed is a fact about the runtime's FileStream strategy — measured true on
        // .NET 10, and not promised by anything. A BufferedStream is that assumption made
        // explicit: with the pump's per-message flush the request arrives while both sides are
        // still talking; with a plain CopyToAsync it sits in the buffer and the far side waits
        // for a sentence that has been written but not sent.
        var inner = new ClosingStream();
        var toChild = new BufferedStream(inner, 4096);
        var fromClient = new HeldStream(Request);
        var fromChild = new HeldStream(string.Empty);
        var toClient = new MemoryStream();

        var pump = WslPump.PumpAsync(fromClient, toChild, fromChild, toClient);

        var deadline = DateTime.UtcNow.AddSeconds(5);
        while (inner.Written.Length == 0 && DateTime.UtcNow < deadline)
        {
            await Task.Delay(20, TestContext.Current.CancellationToken);
        }

        inner.Written.Should().Be(Request, "the request must reach the child before it replies, not after");

        fromClient.HangUp();
        fromChild.HangUp();
        await pump.WaitAsync(TimeSpan.FromSeconds(5), TestContext.Current.CancellationToken);
    }

    [Fact]
    public async Task A_client_that_hangs_up_while_the_child_never_closes_stdout_ends_within_the_bound()
    {
        // Defect B's second half: after end-of-stream the pump waited for the child's stdout without a bound,
        // so against a Windows half stuck in defect A an orderly hang-up waited forever. The reply the child
        // did send still arrives; what the client no longer gets is a wrapper that never ends.
        var fromClient = new MemoryStream(Encoding.UTF8.GetBytes(Request));
        var toChild = new ClosingStream();
        var fromChild = new HeldStream(Reply);
        var toClient = new MemoryStream();
        var bound = TimeSpan.FromMilliseconds(300);

        var pump = WslPump.PumpAsync(fromClient, toChild, fromChild, toClient, bound, Serilog.Core.Logger.None, CancellationToken.None);
        var first = await Task.WhenAny(pump, Task.Delay(TimeSpan.FromSeconds(5), TestContext.Current.CancellationToken));

        first.Should().BeSameAs(pump, "a client that hung up must not wait on the child's stdout forever");
        (await pump).Should().Be(WslPump.Ending.ClientClosed);
        Encoding.UTF8.GetString(toClient.ToArray()).Should().Be(Reply, "what the child did say before the bound still reached the client");
        toChild.Closed.Should().BeTrue();
    }

    [Fact]
    public async Task A_shutdown_returns_the_pump_at_once_while_both_sides_are_still_open()
    {
        // SIGINT is Claude Code's way of ending a server (measured): nobody is left to read a reply, so the pump
        // does not wait for either stream — its owner then stops the child.
        var fromClient = new HeldStream(Request);
        var toChild = new ClosingStream();
        var fromChild = new HeldStream(string.Empty);
        var toClient = new MemoryStream();
        using var shutdown = new CancellationTokenSource();

        var pump = WslPump.PumpAsync(fromClient, toChild, fromChild, toClient, TimeSpan.FromHours(1), Serilog.Core.Logger.None, shutdown.Token);
        await Task.Delay(50, TestContext.Current.CancellationToken);
        pump.IsCompleted.Should().BeFalse("both sides are open and nothing has ended the session");

        await shutdown.CancelAsync();
        var first = await Task.WhenAny(pump, Task.Delay(TimeSpan.FromSeconds(5), TestContext.Current.CancellationToken));

        first.Should().BeSameAs(pump, "a shutdown must not wait for a stream that will not end");
        (await pump).Should().Be(WslPump.Ending.Interrupted);
    }

    [Fact]
    public async Task A_shutdown_during_the_wait_for_the_last_reply_is_still_an_interruption()
    {
        var fromClient = new MemoryStream(Encoding.UTF8.GetBytes(Request));
        var toChild = new ClosingStream();
        var fromChild = new HeldStream(string.Empty);
        var toClient = new MemoryStream();
        using var shutdown = new CancellationTokenSource();

        var pump = WslPump.PumpAsync(fromClient, toChild, fromChild, toClient, TimeSpan.FromHours(1), Serilog.Core.Logger.None, shutdown.Token);
        await Task.Delay(50, TestContext.Current.CancellationToken);
        await shutdown.CancelAsync();

        (await pump.WaitAsync(TimeSpan.FromSeconds(5), TestContext.Current.CancellationToken)).Should().Be(WslPump.Ending.Interrupted);
    }

    [Fact]
    public void Each_ending_has_its_reason_word()
    {
        WslPump.ReasonOf(WslPump.Ending.ClientClosed).Should().Be(CredsForDevs.ServiceDefaults.ExitReason.ClientClosed);
        WslPump.ReasonOf(WslPump.Ending.WindowsHalfClosed).Should().Be(CredsForDevs.ServiceDefaults.ExitReason.WindowsHalfClosed);
        WslPump.ReasonOf(WslPump.Ending.Interrupted).Should().Be(CredsForDevs.ServiceDefaults.ExitReason.Signalled, "the lifetime supplies the real one; this is what stands when it cannot");
    }
}
