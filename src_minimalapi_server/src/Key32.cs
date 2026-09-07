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
        return Convert.TryFromBase64String(trimmed, buffer, out var written) && written == Bytes
            ? buffer[..Bytes]
            : [];
    }
}
