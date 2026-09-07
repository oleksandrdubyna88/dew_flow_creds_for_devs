using System.Text;
using System.Text.Json;
using FluentAssertions;

namespace CredVaultServer.Tests;

/// <summary>
/// The printable key, pinned against the implementation in the other language.
/// </summary>
/// <remarks>
/// <para><c>RC1-</c> shipped first, in TypeScript (<c>src_vs_code/src/recoveryCode.ts</c>), and
/// <c>BK1-</c> is the same construction with its own domain string. Two implementations of one
/// construction drift, and the drift here would be a key that will not type a year from now — so
/// <c>contract/printable-key-v1.json</c> holds the vectors and BOTH suites assert them.</para>
///
/// <para>The vectors are a finite list, which is not enough on its own: a checksum can agree on five
/// cases and disagree on the sixth. So the round trip is also asserted over many random cores, and the
/// BACKUP form's vectors carry the derived 32 bytes — because a checksum can agree while an HKDF call
/// disagrees about its salt, and that failure is an archive nobody can open.</para>
/// </remarks>
public class PrintableKeyTests
{
    private static readonly PrintableKeyForm Recovery = new("RC1", "cred-ssh-manager/recovery-checksum:");

    [Fact]
    public void EveryVectorInTheContractMatchesThisImplementation()
    {
        var vectors = Vectors();
        vectors.Should().NotBeEmpty("the contract file is the point of this test");
        foreach (var vector in vectors)
        {
            var form = FormFor(vector.Prefix);
            PrintableKey.Checksum(form, vector.Core).Should().Be(
                vector.Checksum, $"{vector.Prefix} checksum for {vector.Core}");
            PrintableKey.Format(form, vector.Core).Should().Be(
                vector.Formatted, $"{vector.Prefix} display form for {vector.Core}");
            var parsed = PrintableKey.Parse(form, vector.Formatted);
            parsed.Ok.Should().BeTrue();
            parsed.Core.Should().Be(vector.Core);
        }
    }

    [Fact]
    public void TheBackupVectorsDeriveTheSameThirtyTwoBytesInBothLanguages()
    {
        // The one parameter that is easy to get wrong and impossible to notice: HKDF's salt. An empty
        // salt and an omitted salt are the same in RFC 5869 and different in some libraries, so the
        // derived bytes are in the contract file rather than the intention.
        var backup = Vectors().Where(vector => vector.Prefix == "BK1").ToArray();
        backup.Should().NotBeEmpty();
        foreach (var vector in backup)
        {
            vector.DerivedKeyHex.Should().NotBeEmpty("a backup vector without its derived key pins nothing");
            Convert.ToHexString(BackupKey.KeyFrom(vector.Core)).ToLowerInvariant()
                .Should().Be(vector.DerivedKeyHex, $"the key derived from {vector.Core}");
        }
    }

    [Fact]
    public void AKeyRoundTripsOverManyRandomCores()
    {
        // The vectors pin the construction; this pins the rest of the input space.
        for (var i = 0; i < 500; i++)
        {
            var minted = BackupKey.Mint();
            var parsed = BackupKey.Parse(minted.Formatted);
            parsed.Ok.Should().BeTrue(minted.Formatted);
            BackupKey.KeyFrom(parsed.Core).Should().Equal(minted.Key);
        }
    }

    [Fact]
    public void AKeyTypedByAHumanIsStillTheKey()
    {
        // The whole reason for Crockford Base32: lower case, stray spaces, and the confusables read
        // off somebody's handwriting.
        var minted = BackupKey.Mint();
        var asTyped = minted.Formatted
            .ToLowerInvariant()
            .Replace("-", " ")
            .Replace("0", "O")
            .Replace("1", "l");

        var parsed = BackupKey.Parse(asTyped);

        parsed.Ok.Should().BeTrue(asTyped);
        BackupKey.KeyFrom(parsed.Core).Should().Equal(minted.Key);
    }

    [Fact]
    public void OneWrongCharacterIsAChecksumFailureAndNotAFormatOne()
    {
        // The distinction IS the feature. "That is not a key" sends somebody looking for a different
        // file; "one character is wrong" sends them back to the paper.
        var minted = BackupKey.Mint();
        var symbol = minted.Formatted[5];
        var altered = minted.Formatted.Remove(5, 1).Insert(5, symbol == 'Z' ? "Y" : "Z");

        BackupKey.Parse(altered).Error.Should().Be(PrintableKeyError.BadChecksum);
        BackupKey.Explain(PrintableKeyError.BadChecksum).Should().Contain("checksum");
    }

    [Theory]
    [InlineData("", "nothing at all")]
    [InlineData("hunter2", "a password")]
    [InlineData("RC1-00000-00000-00000-00000-00000-00000-XXXX", "the other form's prefix")]
    [InlineData("BK1-00000-00000-00000", "too short")]
    [InlineData("BK1-00000-00000-00000-00000-00000-00000-XXXXX", "too long")]
    [InlineData("BK1-UUUUU-00000-00000-00000-00000-00000-XXXX", "a letter the alphabet leaves out")]
    public void WhatIsNotShapedLikeAKeyIsAFormatFailure(string typed, string why)
    {
        BackupKey.Parse(typed).Error.Should().Be(PrintableKeyError.BadFormat, why);
    }

    [Fact]
    public void TheEntropyIsExactAndNotRounded()
    {
        // 30 symbols of a 32-symbol alphabet is 150 bits, and 32 is a power of two so there is no
        // modulo bias to hedge about.
        PrintableKey.EntropyBits(BackupKey.Form).Should().Be(150);
        PrintableKey.Alphabet.Should().HaveLength(32);
        PrintableKey.Alphabet.Should().NotContainAny("I", "L", "O", "U");
    }

    [Fact]
    public void TheTwoFormsDoNotShareAChecksum()
    {
        // Same construction, different domain string, so the same core checksums differently. Without
        // this, a recovery code would validate as a backup key and derive a key nobody expects.
        const string core = "0123456789ABCDEFGHJKMNPQRSTVWX";

        PrintableKey.Checksum(BackupKey.Form, core)
            .Should().NotBe(PrintableKey.Checksum(Recovery, core));
    }

    private static PrintableKeyForm FormFor(string prefix) => prefix == "BK1" ? BackupKey.Form : Recovery;

    private sealed record Vector(string Prefix, string Core, string Checksum, string Formatted, string DerivedKeyHex);

    /// <summary>
    /// The contract file, read from the repository rather than copied into this suite.
    /// </summary>
    /// <remarks>
    /// Copying the vectors in would defeat them: the file exists so that ONE edit is visible to two
    /// languages, and a suite holding its own copy would go green while the other went red.
    /// </remarks>
    private static Vector[] Vectors()
    {
        var path = Path.Combine(RepoRoot(), "contract", "printable-key-v1.json");
        File.Exists(path).Should().BeTrue($"the shared vectors must be at {path}");
        using var document = JsonDocument.Parse(File.ReadAllText(path, Encoding.UTF8));
        return [.. document.RootElement.GetProperty("vectors").EnumerateArray().Select(Read)];
    }

    private static Vector Read(JsonElement element) => new(
        element.GetProperty("prefix").GetString() ?? string.Empty,
        element.GetProperty("core").GetString() ?? string.Empty,
        element.GetProperty("checksum").GetString() ?? string.Empty,
        element.GetProperty("formatted").GetString() ?? string.Empty,
        element.TryGetProperty("derivedKeyHex", out var derived) ? derived.GetString() ?? string.Empty : string.Empty);

    /// <summary>Walk up from the test binary until the repository's own marker is there.</summary>
    internal static string RepoRoot()
    {
        var dir = AppContext.BaseDirectory;
        while (dir.Length > 3 && !File.Exists(Path.Combine(dir, "dew_flow_creds_for_devs.slnx")))
        {
            dir = Path.GetDirectoryName(dir) ?? string.Empty;
        }
        dir.Should().NotBeEmpty("the tests run from inside the repository");
        return dir;
    }
}
