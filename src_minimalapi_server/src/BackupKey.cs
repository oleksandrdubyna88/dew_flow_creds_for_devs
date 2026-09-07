using System.Security.Cryptography;
using System.Text;

namespace CredVaultServer;

/// <summary>A key just minted: the form a person keeps, and the bytes the server uses.</summary>
public sealed record MintedBackupKey(string Formatted, byte[] Key, double EntropyBits);

/// <summary>
/// The backup key: <c>BK1-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-CCCC</c>.
/// </summary>
/// <remarks>
/// <para><b>The printable form is the secret; the 32 bytes are derived from it.</b> That order matters
/// in two directions. It means a person holds something they can write down and type back — 150 bits
/// of Crockford Base32 with a checksum — rather than 44 characters of case-sensitive base64 containing
/// <c>I</c>, <c>l</c>, <c>O</c> and <c>0</c>. And it means "shown once" is a fact rather than a policy:
/// what the server keeps is the DERIVED key, HKDF is one-way, so nothing on this disk can reconstruct
/// the words the administrator wrote down. A server that could re-show the key would be a server whose
/// compromise hands over every archive ever taken.</para>
///
/// <para><b>Every parameter of the derivation is spelled out</b>, because the failure mode is silent
/// and permanent. HKDF-SHA256; the input keying material is the UTF-8 bytes of the 30-symbol core, not
/// the display form with its dashes and checksum; the salt is EMPTY — zero-length, which RFC 5869
/// treats identically to omitting it and which some libraries do not; the info string is
/// <c>credvault-backup-key-v1</c> as UTF-8; the output is 32 bytes. The derived bytes for five fixed
/// cores are in <c>contract/printable-key-v1.json</c> and asserted by this repository's C# suite and by
/// the generator that wrote them, so a library that disagrees about the salt is a red test rather than
/// an archive nobody can open.</para>
///
/// <para>150 bits is far more than an offline attacker can spend, and it is reported unrounded, the
/// same ethos <c>recoveryCode.ts</c> and <c>pinPolicy.ts</c> state for their own numbers.</para>
/// </remarks>
public static class BackupKey
{
    /// <summary>The form. Its checksum string is its own — never the recovery code's.</summary>
    public static readonly PrintableKeyForm Form = new("BK1", "credvault/backup-key-checksum:");

    private static readonly byte[] DeriveInfo = "credvault-backup-key-v1"u8.ToArray();

    /// <summary>Zero-length, deliberately, and written down because "omitted" is ambiguous.</summary>
    private static readonly byte[] EmptySalt = [];

    /// <summary>A new key: the words to keep, and the bytes to seal.</summary>
    public static MintedBackupKey Mint()
    {
        var core = PrintableKey.Mint(Form);
        return new MintedBackupKey(
            PrintableKey.Format(Form, core), KeyFrom(core), PrintableKey.EntropyBits(Form));
    }

    /// <summary>The 32 bytes this core stands for.</summary>
    public static byte[] KeyFrom(string core) =>
        HKDF.DeriveKey(HashAlgorithmName.SHA256, Encoding.UTF8.GetBytes(core), Key32.Bytes, EmptySalt, DeriveInfo);

    /// <summary>What somebody typed, as a core — or a typed refusal.</summary>
    public static PrintableKeyParse Parse(string typed) => PrintableKey.Parse(Form, typed);

    /// <summary>The sentence a person gets for each way a key can be wrong.</summary>
    public static string Explain(PrintableKeyError error) => error switch
    {
        PrintableKeyError.BadChecksum =>
            "That key is shaped correctly but its checksum does not match, which means one character is "
            + "wrong. Read it off the paper again — the checksum exists so that this is caught here "
            + "rather than as an archive that will not open.",
        _ =>
            $"That is not a backup key. One looks like {Form.Prefix}- followed by six groups of "
            + $"{Form.Group} characters and a {Form.ChecksumSymbols}-character checksum; case, spaces "
            + "and dashes do not matter.",
    };
}
