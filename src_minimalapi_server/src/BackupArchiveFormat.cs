using System.Buffers.Binary;
using System.Security.Cryptography;

namespace CredVaultServer;

/// <summary>
/// What a backup archive IS: its marker, its version, its bounds, and the key it is sealed under.
/// </summary>
/// <remarks>
/// <para><b>Chunked AES-256-GCM, not one-shot.</b> <see cref="AesGcm"/> encrypts a whole buffer in one
/// call, so a one-shot archive means holding the entire thing in memory inside a container whose limit
/// is 512 MiB. AES-CTR with a separate HMAC streams too, but it is two primitives whose failure modes
/// are ordering and comparison mistakes; per-chunk GCM is one AEAD call per chunk with the library
/// doing the hard part.</para>
///
/// <para><b>The header is plaintext, versioned, and authenticated.</b> Plaintext because a reader must
/// learn the salt before it can derive a key; versioned so that a build meeting an archive it cannot
/// read says exactly that instead of reporting corruption; and authenticated because otherwise the
/// created-at stamp, the chunk size and the nonce prefix could all be edited without breaking a single
/// tag. Every one of the header's bytes is associated data for every chunk, so a single altered bit
/// anywhere in it fails the first chunk.</para>
///
/// <para><b>The nonce is a per-archive random prefix plus the chunk counter</b>, never a fresh random
/// nonce per chunk: a repeated (key, nonce) pair is the one catastrophic mistake in GCM, and a counter
/// cannot repeat inside an archive. The archive's key is itself unique — HKDF from a fresh 16-byte
/// salt — so one archive's key is not the secret that opens every archive ever taken.</para>
///
/// <para><b>Every length is bounded before anything is allocated.</b> A crafted header could otherwise
/// declare a multi-gigabyte chunk and make the reader ask for that buffer before a single tag has been
/// checked, which is a denial of service written into the format itself.</para>
/// </remarks>
internal static class BackupFormat
{
    /// <summary>The four bytes every archive starts with.</summary>
    public static ReadOnlySpan<byte> Magic => "CVBK"u8;

    /// <summary>The format this build writes, and the only one it reads.</summary>
    public const ushort Version = 1;

    public const int SaltBytes = 16;
    public const int NoncePrefixBytes = 8;
    public const int CounterBytes = 4;
    public const int TagBytes = 16;
    public const int FlagBytes = 1;
    public const int LengthBytes = 4;

    /// <summary>magic(4) + version(2) + salt(16) + noncePrefix(8) + chunkSize(4) + createdAt(8).</summary>
    public const int HeaderBytes = 4 + 2 + SaltBytes + NoncePrefixBytes + 4 + 8;

    /// <summary>flags(1) + length(4), the framing in front of every chunk's ciphertext.</summary>
    public const int FramingBytes = FlagBytes + LengthBytes;

    /// <summary>1 MiB: large enough that the per-chunk overhead vanishes, small enough to hold twice.</summary>
    public const int DefaultChunkSize = 1 << 20;

    /// <summary>The bounds a declared chunk size must be inside before any buffer is asked for.</summary>
    public const int MinChunkSize = 1 << 10;

    public const int MaxChunkSize = 1 << 23;

    /// <summary>Set on the last chunk, and bound into its associated data so it cannot be moved.</summary>
    public const byte LastChunkFlag = 1;

    private static readonly byte[] Info = "credvault-backup-archive-v1"u8.ToArray();

    /// <summary>This archive's own key, derived from the long-lived one and the archive's salt.</summary>
    public static byte[] DeriveKey(byte[] key, byte[] salt)
    {
        RefuseUnusableKey(key);
        return HKDF.DeriveKey(HashAlgorithmName.SHA256, key, Key32.Bytes, salt, Info);
    }

    /// <summary>prefix(8) || counter(4), big-endian. Unique within an archive by construction.</summary>
    public static byte[] NonceFor(byte[] noncePrefix, uint counter)
    {
        var nonce = new byte[NoncePrefixBytes + CounterBytes];
        noncePrefix.CopyTo(nonce, 0);
        BinaryPrimitives.WriteUInt32BigEndian(nonce.AsSpan(NoncePrefixBytes), counter);
        return nonce;
    }

    /// <summary>The whole header, then room for the counter and the is-last flag: the AAD of every chunk.</summary>
    public static byte[] NewAad(byte[] headerBytes)
    {
        var aad = new byte[HeaderBytes + CounterBytes + FlagBytes];
        headerBytes.CopyTo(aad, 0);
        return aad;
    }

    /// <summary>A power of two inside the bounds, or nothing is read and nothing is allocated.</summary>
    public static void RefuseUnusableChunkSize(int chunkSize)
    {
        if (chunkSize < MinChunkSize || chunkSize > MaxChunkSize || (chunkSize & (chunkSize - 1)) != 0)
        {
            throw BackupArchiveException.BadChunkSize(chunkSize);
        }
    }

    private static void RefuseUnusableKey(byte[] key)
    {
        if (key.Length != Key32.Bytes)
        {
            throw BackupArchiveException.BadKey(key.Length);
        }
    }
}

/// <summary>
/// The plaintext header at the front of an archive, and the bytes it was read from.
/// </summary>
/// <remarks>
/// The BYTES are kept rather than re-serialised, because they are the associated data: authenticating
/// a re-serialisation would prove only that this reader can write what it just read.
/// </remarks>
internal readonly record struct BackupHeader(
    ushort Version,
    byte[] Salt,
    byte[] NoncePrefix,
    int ChunkSize,
    long CreatedAtUnixMs)
{
    /// <summary>A header for a new archive: fresh salt, fresh nonce prefix.</summary>
    public static BackupHeader NewFor(DateTimeOffset createdAt, int chunkSize)
    {
        BackupFormat.RefuseUnusableChunkSize(chunkSize);
        return new BackupHeader(
            BackupFormat.Version,
            RandomNumberGenerator.GetBytes(BackupFormat.SaltBytes),
            RandomNumberGenerator.GetBytes(BackupFormat.NoncePrefixBytes),
            chunkSize,
            createdAt.ToUnixTimeMilliseconds());
    }

    public byte[] ToBytes()
    {
        var bytes = new byte[BackupFormat.HeaderBytes];
        BackupFormat.Magic.CopyTo(bytes);
        BinaryPrimitives.WriteUInt16BigEndian(bytes.AsSpan(4), Version);
        Salt.CopyTo(bytes, 6);
        NoncePrefix.CopyTo(bytes, 22);
        BinaryPrimitives.WriteInt32BigEndian(bytes.AsSpan(30), ChunkSize);
        BinaryPrimitives.WriteInt64BigEndian(bytes.AsSpan(34), CreatedAtUnixMs);
        return bytes;
    }

    /// <summary>Read and validate a header, refusing anything this build cannot open.</summary>
    public static (BackupHeader Header, byte[] Bytes) Read(Stream source)
    {
        var bytes = new byte[BackupFormat.HeaderBytes];
        RefuseShortHeader(source, bytes);
        RefuseForeignFile(bytes);
        var version = BinaryPrimitives.ReadUInt16BigEndian(bytes.AsSpan(4));
        RefuseUnknownVersion(version);
        var chunkSize = BinaryPrimitives.ReadInt32BigEndian(bytes.AsSpan(30));
        BackupFormat.RefuseUnusableChunkSize(chunkSize);
        return (
            new BackupHeader(
                version,
                bytes[6..22],
                bytes[22..30],
                chunkSize,
                BinaryPrimitives.ReadInt64BigEndian(bytes.AsSpan(34))),
            bytes);
    }

    private static void RefuseShortHeader(Stream source, byte[] bytes)
    {
        if (source.ReadAtLeast(bytes, bytes.Length, throwOnEndOfStream: false) < bytes.Length)
        {
            throw BackupArchiveException.NotAnArchive("it is too short to hold a header");
        }
    }

    private static void RefuseForeignFile(byte[] bytes)
    {
        if (!bytes.AsSpan(0, 4).SequenceEqual(BackupFormat.Magic))
        {
            throw BackupArchiveException.NotAnArchive("it does not begin with the CVBK marker");
        }
    }

    private static void RefuseUnknownVersion(ushort version)
    {
        if (version != BackupFormat.Version)
        {
            throw BackupArchiveException.WrongVersion(version);
        }
    }
}
