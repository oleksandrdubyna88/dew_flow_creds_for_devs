using System.Security.Cryptography;
using System.Text;

namespace CredVaultServer;

/// <summary>One printable form: its prefix, its checksum's domain string, and its shape.</summary>
/// <remarks>
/// <para><b>The checksum info is a parameter, not a template.</b> <c>RC1</c> shipped first, in
/// TypeScript, with the string <c>cred-ssh-manager/recovery-checksum:</c> — the product's old name.
/// Tidying that would change every recovery code ever issued, so the string is data and each form
/// brings its own.</para>
/// </remarks>
public sealed record PrintableKeyForm(
    string Prefix,
    string ChecksumInfo,
    int CoreSymbols = 30,
    int Group = 5,
    int ChecksumSymbols = 4);

/// <summary>
/// Three answers, because "invalid" is the one answer that helps nobody.
/// </summary>
/// <remarks>
/// <c>BadFormat</c> is "this is not shaped like a key" — the wrong prefix, the wrong length, a
/// character outside the alphabet. <c>BadChecksum</c> is "shaped right, one character is off", which
/// is the sentence that sends somebody back to the paper instead of to the archive.
/// </remarks>
public enum PrintableKeyError
{
    None = 0,
    BadFormat = 1,
    BadChecksum = 2,
}

/// <summary>What a typed key parsed to, or why it did not.</summary>
public sealed record PrintableKeyParse(string Core, PrintableKeyError Error)
{
    public static PrintableKeyParse Of(string core) => new(core, PrintableKeyError.None);

    public static PrintableKeyParse Failed(PrintableKeyError error) => new(string.Empty, error);

    public bool Ok => Error == PrintableKeyError.None;
}

/// <summary>
/// A secret a person can read off paper a year later and type back correctly.
/// </summary>
/// <remarks>
/// <para><b>Crockford Base32</b> — the digits and the letters minus <c>I L O U</c>, so the pairs that
/// get mis-read do not both exist. 32 is a power of two, so drawing a symbol at a time from a uniform
/// source has no modulo bias to reason about, and the entropy is exact rather than estimated.</para>
///
/// <para><b>The checksum is why this exists at all.</b> Without it a mis-typed character reaches the
/// cipher, and the cipher's whole vocabulary is "this will not decrypt" — which sends an operator
/// looking for a better copy of an archive that is fine. Four symbols over the core catch a single
/// mistake locally, with a message that says to check the key.</para>
///
/// <para><b>The construction is pinned across languages.</b> <c>RC1</c> is implemented in
/// <c>src_vs_code/src/recoveryCode.ts</c> and this is the same construction; both suites assert the
/// same vectors from <c>contract/printable-key-v1.json</c>, so a drift is a red test in two languages
/// rather than a key that will not type. Pure — no I/O, no clock — so every guarantee here is a unit
/// test.</para>
/// </remarks>
public static class PrintableKey
{
    /// <summary>Crockford Base32: digits and letters, minus the four confusables.</summary>
    public const string Alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

    /// <summary>A fresh core, drawn one symbol at a time from the system's uniform source.</summary>
    public static string Mint(PrintableKeyForm form)
    {
        var core = new StringBuilder(form.CoreSymbols);
        for (var i = 0; i < form.CoreSymbols; i++)
        {
            core.Append(Alphabet[RandomNumberGenerator.GetInt32(Alphabet.Length)]);
        }
        return core.ToString();
    }

    /// <summary>The display form: prefix, the core in groups, then the checksum.</summary>
    public static string Format(PrintableKeyForm form, string core)
    {
        var parts = new List<string> { form.Prefix };
        for (var i = 0; i < core.Length; i += form.Group)
        {
            parts.Add(core.Substring(i, Math.Min(form.Group, core.Length - i)));
        }
        parts.Add(Checksum(form, core));
        return string.Join('-', parts);
    }

    /// <summary>
    /// The first digest bytes mapped into the alphabet. 256 % 32 == 0, so the modulo is unbiased.
    /// </summary>
    public static string Checksum(PrintableKeyForm form, string core)
    {
        var digest = SHA256.HashData(Encoding.UTF8.GetBytes(form.ChecksumInfo + core));
        var out_ = new StringBuilder(form.ChecksumSymbols);
        for (var i = 0; i < form.ChecksumSymbols; i++)
        {
            out_.Append(Alphabet[digest[i] % Alphabet.Length]);
        }
        return out_.ToString();
    }

    /// <summary>Exact, and reported unrounded: 30 symbols of 32 is 150 bits, not "about 150".</summary>
    public static double EntropyBits(PrintableKeyForm form) => form.CoreSymbols * Math.Log2(Alphabet.Length);

    /// <summary>
    /// What a person typed, turned back into a core — or a typed refusal.
    /// </summary>
    /// <remarks>
    /// Case, spaces and dashes are all forgiven, and the Crockford confusables are folded, because the
    /// input is a human reading their own handwriting under pressure. Nothing else is forgiven: the
    /// prefix must be there and the length must be right, or the answer is <c>BadFormat</c>.
    /// </remarks>
    public static PrintableKeyParse Parse(PrintableKeyForm form, string typed)
    {
        var cleaned = Normalise(typed);
        var body = cleaned.StartsWith(form.Prefix, StringComparison.Ordinal)
            ? cleaned[form.Prefix.Length..]
            : string.Empty;
        if (body.Length != form.CoreSymbols + form.ChecksumSymbols || !InAlphabet(body))
        {
            return PrintableKeyParse.Failed(PrintableKeyError.BadFormat);
        }
        var core = body[..form.CoreSymbols];
        return string.Equals(body[form.CoreSymbols..], Checksum(form, core), StringComparison.Ordinal)
            ? PrintableKeyParse.Of(core)
            : PrintableKeyParse.Failed(PrintableKeyError.BadChecksum);
    }

    /// <summary>
    /// Upper case, separators gone, and the confusables folded the way Crockford defines them.
    /// </summary>
    /// <remarks>
    /// <c>O</c> is a zero and <c>I</c> and <c>L</c> are ones — that is the point of leaving them out of
    /// the alphabet, and folding them here is what makes a code readable in someone else's
    /// handwriting.
    /// </remarks>
    private static string Normalise(string typed)
    {
        var cleaned = new StringBuilder(typed.Length);
        foreach (var symbol in typed.ToUpperInvariant())
        {
            cleaned.Append(Folded(symbol));
        }
        return cleaned.ToString();
    }

    private static string Folded(char symbol) => symbol switch
    {
        ' ' or '\t' or '\r' or '\n' or '-' => string.Empty,
        'O' => "0",
        'I' or 'L' => "1",
        _ => symbol.ToString(),
    };

    private static bool InAlphabet(string body) =>
        body.All(symbol => Alphabet.Contains(symbol, StringComparison.Ordinal));
}
