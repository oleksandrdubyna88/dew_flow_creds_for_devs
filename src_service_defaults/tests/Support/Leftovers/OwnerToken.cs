using System.Buffers.Binary;
using System.Security.Cryptography;
using System.Text;

namespace CredsForDevs.Tests.Leftovers;

/// <summary>The owner token of rule §1: the OS user whose process creates the resource — <c>u&lt;uid&gt;</c> on POSIX
/// (the REAL uid, never the effective one), <c>w&lt;digits&gt;</c> on Windows. The token SELECTS; the kernel owner
/// authorises (rule §3). <c>TESTSTODELETE_OWNER</c> overrides it when set to the grammar and THROWS when set to
/// anything else — an invalid value refuses, it never falls back, and nothing is created.</summary>
public static class OwnerToken
{
    private const string OverrideVariable = "TESTSTODELETE_OWNER";

    private static readonly Lazy<string> Current = new(() => OperatingSystem.IsWindows()
        ? Compute(windows: true, uid: null, Environment.UserName, Environment.GetEnvironmentVariable)
        : Compute(windows: false, Native.GetUid(), accountName: null, Environment.GetEnvironmentVariable));

    /// <summary>This process's owner token, computed once. Throws when <c>TESTSTODELETE_OWNER</c> is set and invalid.</summary>
    public static string This => Current.Value;

    /// <summary>The pure form, tested: the override when set and non-empty (an empty value is no value), else the
    /// platform's token. Nothing is trimmed: <c>u1\n</c> is invalid and <c>\z</c> sees the line end.</summary>
    public static string Compute(bool windows, uint? uid, string? accountName, Func<string, string?> env)
    {
        var given = env(OverrideVariable);
        if (!string.IsNullOrEmpty(given))
        {
            return Owned.OwnerGrammar.IsMatch(given)
                ? given
                : throw new InvalidOperationException($"owned: {OverrideVariable} \"{given}\" is not an owner token ({Owned.OwnerGrammar})");
        }

        if (windows) return Windows(accountName ?? throw new InvalidOperationException("owned: no account name to derive a Windows owner token from"));
        return "u" + (uid ?? throw new InvalidOperationException("owned: no uid to derive an owner token from"));
    }

    /// <summary><c>w</c> and the first four bytes of SHA-256 over the UTF-8 bytes of the account name (without its
    /// domain, ASCII letters lower-cased, no line end), read as a big-endian unsigned integer, in decimal. A collision
    /// confers no authority: the file's owner does.</summary>
    public static string Windows(string accountName) =>
        "w" + BinaryPrimitives.ReadUInt32BigEndian(SHA256.HashData(Encoding.UTF8.GetBytes(AsciiLower(accountName))));

    /// <summary>The ASCII letters A–Z lower-cased and nothing else changed — never <c>ToLowerInvariant</c>, which folds
    /// <c>Ø</c> and <c>Ü</c> and would give another token than the Node helper and the janitor.</summary>
    public static string AsciiLower(string text) =>
        string.Create(text.Length, text, static (span, source) =>
        {
            for (var i = 0; i < source.Length; i++) span[i] = source[i] is >= 'A' and <= 'Z' ? (char)(source[i] + 32) : source[i];
        });
}
