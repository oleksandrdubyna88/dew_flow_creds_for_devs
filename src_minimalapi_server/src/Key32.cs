using System.Security.Cryptography;

namespace CredVaultServer;

/// <summary>
/// Base64 text to a 256-bit key — or to nothing at all.
/// </summary>
/// <remarks>
/// <para>Extracted from <see cref="LoginKeyKek"/> the moment the backup archive needed the same
/// question answered: "is this text exactly 32 bytes of base64, or is it no key?". Two copies of that
/// answer would have drifted in the one place where drift is unrecoverable — a key that is NEARLY
/// right seals data under something nobody can reproduce, and the data is still there while being
/// permanently unreadable.</para>
///
/// <para><b>The buffer is deliberately two bytes longer than a key.</b> A longer input decodes into it
/// and then fails the length check, rather than being silently truncated into something that would
/// work today and open nothing tomorrow.</para>
///
/// <para><b>What this is NOT, and must never become.</b> It is the base64 primitive and only that. The
/// backup key gains a typed <c>BK1-</c> form — Crockford Base32, confusable folding, a checksum, because
/// its input is a person reading a screen and typing it back a year later — and that parsing belongs to
/// its own type, which may CALL this one for the final 32 bytes. A branch in here for one caller's
/// spelling is how a shared primitive becomes two implementations sharing a name, and the caller that
/// would break is the one that opens every login key in the deployment.</para>
/// </remarks>
public static class Key32
{
    /// <summary>32 bytes, because every cipher in this server is AES-256.</summary>
    public const int Bytes = 32;

    /// <summary>The key those characters spell, or an empty array for anything else.</summary>
    public static byte[] Decode(string? text)
    {
        var trimmed = text?.Trim() ?? string.Empty;
        if (trimmed.Length == 0)
        {
            return [];
        }
        var buffer = new byte[Bytes + 2];
        var key = Convert.TryFromBase64String(trimmed, buffer, out var written) && written == Bytes
            ? buffer[..Bytes]
            : [];
        // The scratch buffer held the key too, and it costs nothing to stop it outliving this call.
        // The returned array is the caller's to keep — this is hygiene on the copy nobody asked for,
        // not a claim that key material never reaches the heap.
        CryptographicOperations.ZeroMemory(buffer);
        return key;
    }
}
