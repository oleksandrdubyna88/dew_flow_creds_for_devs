using System.Security.Cryptography;

namespace CredVaultServer;

/// <summary>Sealed bytes: the nonce, the tag, and the ciphertext. No format, no file, no clock.</summary>
public sealed record SealedBytes(byte[] Iv, byte[] Tag, byte[] Data);

/// <summary>
/// Sealing and opening bytes under the deployment KEK.
/// </summary>
/// <remarks>
/// <para><b>Extracted, not written.</b> This is exactly what <see cref="LoginKeyStore"/> has done since
/// epic 2, and the backup key needs the same thing done to it. A second copy of an AEAD call is the
/// shape this codebase has already been bitten by three times — a measure applied at SOME of its
/// sites — and the sites here are the two most valuable secrets a deployment has.</para>
///
/// <para><b>The shared half is the CIPHER, not the file.</b> Each store keeps its own on-disk record —
/// <c>SealedLoginKey</c> and <c>SealedBackupKey</c> — because those are formats with their own history
/// and their own fields, and unifying them would rewrite a file every existing deployment already has.
/// What is shared is the part where a mistake is silent: the nonce being fresh, the tag being the
/// library's maximum size, and a failed open being a refusal rather than plausible garbage.</para>
///
/// <para><b>A wrong KEK and a tampered blob are the same answer</b>, deliberately. GCM authenticates,
/// so neither can produce bytes a caller would go on to use, and from outside the two cannot be told
/// apart anyway. The caller says which of its own things could not be opened.</para>
/// </remarks>
public static class KekSeal
{
    /// <summary>Seal these bytes. A fresh nonce every time — the one mistake GCM does not survive.</summary>
    public static SealedBytes Seal(byte[] kek, byte[] plaintext)
    {
        var iv = RandomNumberGenerator.GetBytes(AesGcm.NonceByteSizes.MaxSize);
        var tag = new byte[AesGcm.TagByteSizes.MaxSize];
        var data = new byte[plaintext.Length];
        using var aes = new AesGcm(kek, tag.Length);
        aes.Encrypt(iv, plaintext, data, tag);
        return new SealedBytes(iv, tag, data);
    }

    /// <summary>
    /// Open them, or throw <see cref="CryptographicException"/> — never return something plausible.
    /// </summary>
    public static byte[] Open(byte[] kek, SealedBytes sealedBytes)
    {
        var plaintext = new byte[sealedBytes.Data.Length];
        using var aes = new AesGcm(kek, sealedBytes.Tag.Length);
        aes.Decrypt(sealedBytes.Iv, sealedBytes.Data, sealedBytes.Tag, plaintext);
        return plaintext;
    }
}
