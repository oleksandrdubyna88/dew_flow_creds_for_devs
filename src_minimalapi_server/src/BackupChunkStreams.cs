using System.Buffers.Binary;
using System.Security.Cryptography;

namespace CredVaultServer;

/// <summary>
/// A write stream that seals what is written to it, one chunk at a time.
/// </summary>
/// <remarks>
/// <para>A <see cref="Stream"/> rather than a method taking a byte array, because the thing on the
/// other side of it is <c>GZipStream</c> wrapping <c>TarWriter</c>, and those PUSH. Holding a whole
/// archive in memory to hand it over in one call is exactly what the chunking exists to avoid, so the
/// pipeline has to be a pipeline all the way down.</para>
///
/// <para><b>Disposal is not optional and not cosmetic.</b> The final chunk — the only one carrying the
/// is-last flag — is written on dispose. A stream that is abandoned instead produces an archive that
/// reads as truncated, which is the correct answer: it IS truncated.</para>
/// </remarks>
internal sealed class ChunkWriteStream(
    Stream destination,
    byte[] key,
    BackupHeader header,
    byte[] headerBytes) : Stream
{
    private readonly AesGcm _aes = new(BackupFormat.DeriveKey(key, header.Salt), BackupFormat.TagBytes);
    private readonly byte[] _aad = BackupFormat.NewAad(headerBytes);
    private readonly byte[] _plain = new byte[header.ChunkSize];
    private int _filled;
    private uint _counter;
    private bool _closed;

    public override bool CanRead => false;

    public override bool CanSeek => false;

    public override bool CanWrite => true;

    public override long Length => throw new NotSupportedException();

    public override long Position
    {
        get => throw new NotSupportedException();
        set => throw new NotSupportedException();
    }

    public override void Write(ReadOnlySpan<byte> buffer)
    {
        var rest = buffer;
        while (!rest.IsEmpty)
        {
            var take = Math.Min(rest.Length, _plain.Length - _filled);
            rest[..take].CopyTo(_plain.AsSpan(_filled));
            _filled += take;
            rest = rest[take..];
            EmitWhenFull();
        }
    }

    public override void Write(byte[] buffer, int offset, int count) =>
        Write(buffer.AsSpan(offset, count));

    public override void Flush() => destination.Flush();

    public override int Read(byte[] buffer, int offset, int count) => throw new NotSupportedException();

    public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();

    public override void SetLength(long value) => throw new NotSupportedException();

    protected override void Dispose(bool disposing)
    {
        if (disposing && !_closed)
        {
            _closed = true;
            Emit(last: true);
            _aes.Dispose();
        }
        base.Dispose(disposing);
    }

    private void EmitWhenFull()
    {
        if (_filled == _plain.Length)
        {
            Emit(last: false);
        }
    }

    /// <summary>flags(1) | length(4) | ciphertext | tag(16), with the counter and flag in the AAD.</summary>
    private void Emit(bool last)
    {
        RefuseAnotherChunk(last);
        var flags = last ? BackupFormat.LastChunkFlag : (byte)0;
        BinaryPrimitives.WriteUInt32BigEndian(_aad.AsSpan(BackupFormat.HeaderBytes), _counter);
        _aad[^1] = flags;
        var cipher = new byte[_filled];
        var tag = new byte[BackupFormat.TagBytes];
        _aes.Encrypt(
            BackupFormat.NonceFor(header.NoncePrefix, _counter), _plain.AsSpan(0, _filled), cipher, tag, _aad);
        Span<byte> framing = stackalloc byte[BackupFormat.FramingBytes];
        framing[0] = flags;
        BinaryPrimitives.WriteInt32BigEndian(framing[BackupFormat.FlagBytes..], _filled);
        destination.Write(framing);
        destination.Write(cipher);
        destination.Write(tag);
        _counter++;
        _filled = 0;
    }

    /// <summary>
    /// The counter is 32 bits, and a repeated (key, nonce) pair is the one catastrophic mistake in GCM.
    /// At the default chunk size this is four petabytes; it is still a refusal rather than a wrap.
    /// </summary>
    private void RefuseAnotherChunk(bool last)
    {
        if (!last && _counter == uint.MaxValue)
        {
            throw BackupArchiveException.TooManyChunks();
        }
    }
}

/// <summary>
/// A read stream that opens one chunk at a time, and refuses the archive the moment one does not.
/// </summary>
/// <remarks>
/// <para>Nothing is returned to the caller before its chunk's tag has been checked, so a partial
/// restore cannot be assembled out of an archive that fails half way — the failure arrives before the
/// bytes do.</para>
/// </remarks>
internal sealed class ChunkReadStream(
    Stream source,
    byte[] key,
    BackupHeader header,
    byte[] headerBytes) : Stream
{
    private readonly AesGcm _aes = new(BackupFormat.DeriveKey(key, header.Salt), BackupFormat.TagBytes);
    private readonly byte[] _aad = BackupFormat.NewAad(headerBytes);
    private readonly byte[] _plain = new byte[header.ChunkSize];
    private int _available;
    private int _taken;
    private uint _counter;
    private bool _finished;

    public override bool CanRead => true;

    public override bool CanSeek => false;

    public override bool CanWrite => false;

    public override long Length => throw new NotSupportedException();

    public override long Position
    {
        get => throw new NotSupportedException();
        set => throw new NotSupportedException();
    }

    public override int Read(Span<byte> buffer)
    {
        // A chunk carrying no bytes is legal framing and says nothing about the end, so the loop asks
        // for the next one rather than reporting an end of stream the archive has not declared.
        while (_taken == _available && Fill())
        {
        }
        var take = Math.Min(buffer.Length, _available - _taken);
        _plain.AsSpan(_taken, take).CopyTo(buffer);
        _taken += take;
        return take;
    }

    public override int Read(byte[] buffer, int offset, int count) =>
        Read(buffer.AsSpan(offset, count));

    public override void Flush()
    {
    }

    public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();

    public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();

    public override void SetLength(long value) => throw new NotSupportedException();

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _aes.Dispose();
        }
        base.Dispose(disposing);
    }

    /// <summary>The next chunk, or false once the one marked last has been read.</summary>
    private bool Fill()
    {
        if (_finished)
        {
            return false;
        }
        var framing = Exactly(BackupFormat.FramingBytes);
        var length = LengthFrom(framing);
        Decrypt(framing[0], length, Exactly(length + BackupFormat.TagBytes));
        _finished = framing[0] != 0;
        RefuseTrailingData();
        _counter++;
        return true;
    }

    /// <summary>Every short read is a truncation, wherever in the framing it lands.</summary>
    private byte[] Exactly(int count)
    {
        var buffer = new byte[count];
        if (source.ReadAtLeast(buffer, count, throwOnEndOfStream: false) < count)
        {
            throw BackupArchiveException.Truncated(_counter);
        }
        return buffer;
    }

    /// <summary>Bounded before the buffer for it is asked for, which is the point of the bound.</summary>
    private int LengthFrom(byte[] framing)
    {
        var length = BinaryPrimitives.ReadInt32BigEndian(framing.AsSpan(BackupFormat.FlagBytes));
        if (length < 0 || length > header.ChunkSize)
        {
            throw BackupArchiveException.BadChunkLength(_counter, length, header.ChunkSize);
        }
        return length;
    }

    private void Decrypt(byte flags, int length, byte[] body)
    {
        BinaryPrimitives.WriteUInt32BigEndian(_aad.AsSpan(BackupFormat.HeaderBytes), _counter);
        _aad[^1] = flags;
        try
        {
            _aes.Decrypt(
                BackupFormat.NonceFor(header.NoncePrefix, _counter),
                body.AsSpan(0, length),
                body.AsSpan(length),
                _plain.AsSpan(0, length),
                _aad);
        }
        catch (CryptographicException)
        {
            // The first chunk is where a wrong key and an edited header both land, and neither can be
            // told from the other without the key. Later chunks can only be the archive itself.
            throw _counter == 0 ? BackupArchiveException.WrongKey() : BackupArchiveException.Tampered(_counter);
        }
        _available = length;
        _taken = 0;
    }

    private void RefuseTrailingData()
    {
        if (!_finished)
        {
            return;
        }
        Span<byte> extra = stackalloc byte[1];
        if (source.ReadAtLeast(extra, 1, throwOnEndOfStream: false) > 0)
        {
            throw BackupArchiveException.TrailingData();
        }
    }
}
