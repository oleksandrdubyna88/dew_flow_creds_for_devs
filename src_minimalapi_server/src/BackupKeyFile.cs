using System.Text;

namespace CredVaultServer;

/// <summary>
/// The key FILE: two accepted forms, decided by the prefix, never by sniffing.
/// </summary>
/// <remarks>
/// <para><b>Two forms, because two different things hand a key over.</b> A person holds
/// <c>BK1-XXXXX-…</c>; a script or a secret manager holds base64 of 32 bytes. Both open the same
/// archive, and refusing either would send somebody converting a key by hand at the worst possible
/// moment.</para>
///
/// <para><b>The prefix decides, and the decision happens before any normalising.</b> The printable
/// form folds <c>O</c> to <c>0</c> and <c>I</c>/<c>L</c> to <c>1</c> — which is exactly right for
/// Crockford Base32 and would silently corrupt base64, where all six characters are distinct and
/// meaningful. So the raw text is tested for the prefix first; only then does the folding happen. And
/// a file that starts with the prefix is judged AS a printable key: a checksum failure is "one
/// character is wrong", not an invitation to try reading the same bytes as base64.</para>
///
/// <para><b>The size is checked before the read.</b> A key file has a known length; pointed at a
/// gigabyte log by a mistyped path, an unbounded read would allocate the whole thing inside a recovery
/// container before deciding it was not a key.</para>
/// </remarks>
public static class BackupKeyFile
{
    /// <summary>The longest either form can be, plus room for an editor's newline.</summary>
    public const int MaxBytes = 256;

    /// <summary>The 32 bytes this file stands for, whichever of the two forms it holds.</summary>
    public static byte[] Read(string path)
    {
        RefuseMissing(path);
        return KeyFrom(path, Bounded(path));
    }

    /// <summary>
    /// At most <see cref="MaxBytes"/> from one handle, and a refusal if there is more.
    /// </summary>
    /// <remarks>
    /// Checking the length and then reading the file are two operations on a path, and between them the
    /// file can be replaced — so a size check followed by an unbounded read is a bound a replacement
    /// walks straight past. One handle, one buffer of the size a key can be, and one byte past it is
    /// the refusal: whatever the path pointed at when it was opened, nothing larger than a key is ever
    /// allocated for it.
    /// </remarks>
    private static string Bounded(string path)
    {
        using var file = File.OpenRead(path);
        var buffer = new byte[MaxBytes + 1];
        var read = file.ReadAtLeast(buffer, buffer.Length, throwOnEndOfStream: false);
        if (read > MaxBytes)
        {
            throw BackupArchiveException.KeyFileTooLarge(path, file.Length);
        }
        return Encoding.UTF8.GetString(buffer, 0, read).Trim();
    }

    private static byte[] KeyFrom(string path, string text) =>
        LooksPrintable(text) ? FromPrintable(path, text) : FromBase64(path, text);

    /// <summary>
    /// The prefix AND its dash, on the RAW text, before anything is folded.
    /// </summary>
    /// <remarks>
    /// <para>Case-insensitive, because a key typed in lower case is the same key — that is the whole
    /// premise of the printable form.</para>
    /// <para><b>The dash is not decoration.</b> Base64 of 32 bytes is 44 characters drawn from an
    /// alphabet that includes <c>B</c>, <c>K</c> and <c>1</c>, so a perfectly good base64 key can begin
    /// <c>BK1</c> — about one in a quarter of a million of them does. Testing the prefix alone would
    /// route that key to the printable parser and refuse it with a message about a format it was never
    /// in. <c>BK1-</c> cannot occur in base64 at all.</para>
    /// </remarks>
    private static bool LooksPrintable(string text) =>
        text.StartsWith($"{BackupKey.Form.Prefix}-", StringComparison.OrdinalIgnoreCase);

    private static byte[] FromPrintable(string path, string text)
    {
        var parsed = BackupKey.Parse(text);
        return parsed.Ok
            ? BackupKey.KeyFrom(parsed.Core)
            : throw BackupArchiveException.BadPrintableKeyFile(path, parsed.Error);
    }

    private static byte[] FromBase64(string path, string text)
    {
        var key = Key32.Decode(text);
        return key.Length == Key32.Bytes ? key : throw BackupArchiveException.BadKeyFile(path);
    }

    private static void RefuseMissing(string path)
    {
        if (!File.Exists(path))
        {
            throw BackupArchiveException.Missing("key file", path);
        }
    }

}
