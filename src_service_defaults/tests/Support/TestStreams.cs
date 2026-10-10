using System.Text;

namespace CredsForDevs.ServiceDefaults.Tests.Support;

/// <summary>A destination that remembers being closed — the signal a child reads as end-of-stream.</summary>
internal sealed class ClosingStream : MemoryStream
{
    internal bool Closed { get; private set; }

    /// <summary>The bytes written, readable after closing — which is when a test asks.</summary>
    internal string Written => Encoding.UTF8.GetString(ToArray());

    protected override void Dispose(bool disposing)
    {
        Closed = true;
        base.Dispose(disposing);
    }
}

/// <summary>
/// A source that yields its bytes and then blocks until it is told the conversation is over — by <see cref="HangUp"/>,
/// or by being disposed, which ends a pending read the way disposing a pipe does. Writes are accepted and kept
/// (<see cref="Written"/>), so it can stand for a socket that is read and written.
/// </summary>
/// <remarks>
/// A <see cref="MemoryStream"/> would answer end-of-stream immediately, which is precisely the state these tests are
/// not about: what is under test is what a pump does while one side is still holding its end open.
/// </remarks>
internal sealed class HeldStream(string content) : Stream
{
    private readonly byte[] _bytes = Encoding.UTF8.GetBytes(content);
    private readonly TaskCompletionSource _hangUp = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly MemoryStream _written = new();
    private int _sent;

    internal bool Disposed { get; private set; }

    /// <summary>What was written into it, as text.</summary>
    internal string Written => Encoding.UTF8.GetString(_written.ToArray());

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
        return Disposed ? throw new ObjectDisposedException(nameof(HeldStream)) : 0;
    }

    protected override void Dispose(bool disposing)
    {
        Disposed = true;
        _hangUp.TrySetResult();
        base.Dispose(disposing);
    }

    public override bool CanRead => true;
    public override bool CanSeek => false;
    public override bool CanWrite => true;
    public override long Length => throw new NotSupportedException();
    public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }
    public override void Flush() { }
    public override int Read(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
    public override void SetLength(long value) => throw new NotSupportedException();
    public override void Write(byte[] buffer, int offset, int count) => _written.Write(buffer, offset, count);
}

/// <summary>A source whose first read FAILS — a broken pipe, a reset — rather than ends; writes into it vanish.</summary>
internal sealed class BrokenStream : Stream
{
    public override ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken token = default) =>
        ValueTask.FromException<int>(new IOException("Broken pipe"));

    public override bool CanRead => true;
    public override bool CanSeek => false;
    public override bool CanWrite => true;
    public override long Length => throw new NotSupportedException();
    public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }
    public override void Flush() { }
    public override int Read(byte[] buffer, int offset, int count) => throw new IOException("Broken pipe");
    public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
    public override void SetLength(long value) => throw new NotSupportedException();
    public override void Write(byte[] buffer, int offset, int count)
    {
        // Nobody is on the other side of a broken pipe.
    }
}
