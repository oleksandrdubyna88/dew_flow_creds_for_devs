using System.Text;

using CredsMcp;
using FluentAssertions;

namespace CredsMcp.Tests;

/// <summary>
/// The two endings of a carried session, which are not symmetrical.
/// </summary>
/// <remarks>
/// <para>What these can cover is the rule the pump applies when one side stops: a client hanging
/// up must not cost the child's last reply, and a child that has gone must not leave this process
/// waiting on a client that may never close its end. Both are decisions made here, on streams,
/// and both were wrong at some point in the design.</para>
/// <para>What they deliberately do NOT claim is that a Windows process on the other side of a
/// kernel boundary actually answers — that is a fact about another machine's process table, and
/// asserting it from here would be the mistake <c>AgentRelayTests</c> names in its own comment.
/// It is covered by <c>scripts/creds-mcp-wsl-itest.cjs</c>, which drives the real binary inside a
/// real distribution against a real window.</para>
/// </remarks>
public sealed class WslPumpTests
{
    /// <summary>A destination that remembers being closed — the signal the child reads as EOF.</summary>
    private sealed class ClosingStream : MemoryStream
    {
        internal bool Closed { get; private set; }

        /// <summary>The bytes written, readable after closing — which is when we ask.</summary>
        internal string Written => Encoding.UTF8.GetString(ToArray());

        protected override void Dispose(bool disposing)
        {
            Closed = true;
            base.Dispose(disposing);
        }
    }

    /// <summary>
    /// A source that yields its bytes and then blocks until it is told the conversation is over.
    /// </summary>
    /// <remarks>
    /// A <see cref="MemoryStream"/> would answer end-of-stream immediately, which is precisely
    /// the state neither test is about: what is under test is what the pump does while one side
    /// is still holding its end open.
    /// </remarks>
    private sealed class HeldStream(string content) : Stream
    {
        private readonly byte[] _bytes = Encoding.UTF8.GetBytes(content);
        private readonly TaskCompletionSource _hangUp = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private int _sent;

        internal void HangUp() => _hangUp.TrySetResult();

        public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken token = default)
        {
            if (_sent < _bytes.Length)
            {
                var count = Math.Min(buffer.Length, _bytes.Length - _sent);
                _bytes.AsMemory(_sent, count).CopyTo(buffer);
                _sent += count;
                return count;
            }
            await _hangUp.Task.WaitAsync(token).ConfigureAwait(false);
            return 0;
        }

        public override bool CanRead => true;
        public override bool CanSeek => false;
        public override bool CanWrite => false;
        public override long Length => throw new NotSupportedException();
        public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }
        public override void Flush() { }
        public override int Read(byte[] buffer, int offset, int count) => throw new NotSupportedException();
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    }

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
}
