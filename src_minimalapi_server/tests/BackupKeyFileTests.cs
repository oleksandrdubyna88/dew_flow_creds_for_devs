using System.Security.Cryptography;
using FluentAssertions;

namespace CredVaultServer.Tests;

/// <summary>
/// The key file: two accepted forms, and the refusals that tell them apart.
/// </summary>
/// <remarks>
/// Two forms because two different things hand a key over — a person from paper, a script from a
/// secret manager — and both have to open the same archive. What must never happen is the parser
/// GUESSING: the printable form folds <c>O</c> to <c>0</c> and <c>I</c>/<c>L</c> to <c>1</c>, which is
/// right for Crockford Base32 and would silently corrupt base64.
/// </remarks>
public class BackupKeyFileTests
{
    [Fact]
    public void ThePrintableFormAndTheBase64FormOfOneKeyReadAsTheSameBytes()
    {
        var minted = BackupKey.Mint();

        var fromWords = BackupKeyFile.Read(FileOf(minted.Formatted));
        var fromBase64 = BackupKeyFile.Read(FileOf(Convert.ToBase64String(minted.Key)));

        fromWords.Should().Equal(minted.Key);
        fromBase64.Should().Equal(minted.Key, "the same key, handed over the other way");
    }

    [Theory]
    [InlineData("bk1", "lower case, because the whole point is that case does not matter")]
    [InlineData("BK1", "as it is shown")]
    public void ThePrefixIsRecognisedWhateverItsCase(string prefix, string why)
    {
        var minted = BackupKey.Mint();
        var typed = prefix + minted.Formatted[3..].ToLowerInvariant();

        BackupKeyFile.Read(FileOf(typed)).Should().Equal(minted.Key, why);
    }

    [Fact]
    public void AWhitespaceHabitDoesNotCostAnybodyARestore()
    {
        // Every editor adds a trailing newline; a person pasting a key adds a leading space.
        var minted = BackupKey.Mint();

        BackupKeyFile.Read(FileOf($"  {minted.Formatted}\r\n")).Should().Equal(minted.Key);
        BackupKeyFile.Read(FileOf($"{Convert.ToBase64String(minted.Key)}\n")).Should().Equal(minted.Key);
    }

    [Fact]
    public void APrintableKeyWithOneCharacterWrongIsAChecksumFailureAndSaysSo()
    {
        // The decision the two forms make possible: a file that starts with the prefix is judged AS a
        // printable key. Falling back to base64 here would turn "one character is wrong" into "that is
        // not a key" and send somebody looking for a different file.
        var minted = BackupKey.Mint();
        var symbol = minted.Formatted[^1];
        var mistyped = minted.Formatted[..^1] + (symbol == 'Z' ? 'Y' : 'Z');

        var refused = Refusal(() => BackupKeyFile.Read(FileOf(mistyped)));

        refused.Message.Should().Contain("checksum").And.NotContain("base64");
    }

    [Fact]
    public void SomethingThatIsNeitherFormNamesBothOfThem()
    {
        var refused = Refusal(() => BackupKeyFile.Read(FileOf("hunter2")));

        refused.Message.Should().Contain("BK1-").And.Contain("base64 of exactly 32 bytes");
    }

    [Fact]
    public void Base64OfTheWrongNumberOfBytesIsRefusedRatherThanStretched()
    {
        var refused = Refusal(() => BackupKeyFile.Read(FileOf(Convert.ToBase64String(new byte[16]))));

        refused.Message.Should().Contain("base64 of exactly 32 bytes");
    }

    [Fact]
    public void AFileTheSizeOfALogIsRefusedWithoutBeingRead()
    {
        var refused = Refusal(() => BackupKeyFile.Read(FileOf(new string('A', BackupKeyFile.MaxBytes + 1))));

        refused.Message.Should().Contain("none of it has been read");
    }

    [Fact]
    public void AKeyFileThatIsNotThereIsASentence()
    {
        Refusal(() => BackupKeyFile.Read(Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N"))))
            .Message.Should().Contain("key file").And.Contain("does not exist");
    }

    [Fact]
    public void AnArchiveSealedFromTheWordsOpensWithTheBytesAndTheOtherWayRound()
    {
        // The two halves have to meet at the archive, not only at the key: this is the property an
        // administrator actually depends on a year later.
        var minted = BackupKey.Mint();
        var source = Path.Combine(TempDir(), "data");
        Directory.CreateDirectory(source);
        File.WriteAllText(Path.Combine(source, "vault.json"), "sealed with the words");
        var archive = Path.Combine(TempDir(), "archive.cvbk");

        BackupArchive.CreateFile(source, archive, BackupKeyFile.Read(FileOf(minted.Formatted)), DateTimeOffset.UtcNow);
        var restored = Path.Combine(TempDir(), "restored");
        BackupArchive.Extract(archive, restored, BackupKeyFile.Read(FileOf(Convert.ToBase64String(minted.Key))));

        File.ReadAllText(Path.Combine(restored, "vault.json")).Should().Be("sealed with the words");
    }

    [Fact]
    public void ABase64KeyThatHappensToBeginBK1IsStillABase64Key()
    {
        // Base64 of 32 bytes is 44 characters over an alphabet containing B, K and 1, so about one key
        // in a quarter of a million begins BK1. Testing the prefix without its dash would route that
        // key to the printable parser and refuse it about a format it was never in.
        var key = Convert.FromBase64String("BK1" + Convert.ToBase64String(RandomNumberGenerator.GetBytes(Key32.Bytes))[3..]);

        BackupKeyFile.Read(FileOf(Convert.ToBase64String(key))).Should().Equal(key);
    }

    [Fact]
    public void TheBoundIsOnTheHandleAndNotOnAStatBeforeIt()
    {
        // A size check and then a read are two operations on a PATH, and a file can be replaced between
        // them. The bound is the buffer the read is given, so nothing larger than a key is ever
        // allocated whatever the path pointed at when it was opened.
        var refused = Refusal(() => BackupKeyFile.Read(FileOf(new string('A', BackupKeyFile.MaxBytes * 4))));

        refused.Message.Should().Contain("none of it has been read");
    }

    private static BackupArchiveException Refusal(Action act) =>
        act.Should().Throw<BackupArchiveException>().Which;

    private static string FileOf(string content)
    {
        var path = Path.Combine(TempDir(), "key.txt");
        File.WriteAllText(path, content);
        return path;
    }

    private static string TempDir()
    {
        var dir = Path.Combine(Path.GetTempPath(), "cred-vault-key-file", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        return dir;
    }
}
