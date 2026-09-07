using System.Security.Cryptography;
using FluentAssertions;

namespace CredVaultServer.Tests;

/// <summary>
/// Opening a backup with the server binary: the arguments, the refusals, and what is printed.
/// </summary>
/// <remarks>
/// Every refusal is asserted on its SENTENCE rather than only on its exit code. The person running
/// this is restoring a server that is gone, usually at a bad hour, and "exit 1" tells them nothing
/// about whether to go and find a different copy of the archive or a different copy of the key.
/// </remarks>
public class BackupArchiveCommandTests
{
    private static readonly DateTimeOffset Noon = DateTimeOffset.Parse("2026-09-07T12:00:00Z");

    [Fact]
    public void ItRestoresAnArchiveAndNamesWhatCameOutOfIt()
    {
        var key = NewKey();
        var archive = ArchiveOf(TreeWithTwoFiles(), key);
        var restored = NewPath();
        var (code, output, _) = Run([BackupArchiveCommand.DecryptVerb, archive, restored, KeyFile(key)]);

        code.Should().Be(0);
        output.Should().Contain("vaults/alice.json").And.Contain("Restored 2 file(s)");
        File.ReadAllText(Path.Combine(restored, "vaults", "alice.json")).Should().Be("alice");
    }

    [Fact]
    public void ItVerifiesAGoodArchiveWithoutWritingAnything()
    {
        var key = NewKey();
        var archive = ArchiveOf(TreeWithTwoFiles(), key);

        var (code, output, _) = Run([BackupArchiveCommand.VerifyVerb, archive, KeyFile(key)]);

        code.Should().Be(0);
        output.Should().Contain("every chunk authenticated").And.Contain("Nothing was written");
    }

    [Fact]
    public void ItRefusesATamperedArchiveWithASentenceAndANonZeroExit()
    {
        // A tree this small is one chunk, so the failure lands on the first — which is where a wrong
        // key lands too, and the message says both because neither can be told from the other without
        // the key. The multi-chunk case, where the position is real information, is asserted in
        // BackupArchiveTests.

        var key = NewKey();
        var archive = ArchiveOf(TreeWithTwoFiles(), key);
        var bytes = File.ReadAllBytes(archive);
        bytes[^1] ^= 0x01;
        File.WriteAllBytes(archive, bytes);

        var (code, _, error) = Run([BackupArchiveCommand.VerifyVerb, archive, KeyFile(key)]);

        code.Should().Be(1);
        error.Should().Contain("will not decrypt");
    }

    [Fact]
    public void AMissingArchiveIsASentenceAndANonZeroExit()
    {
        var (code, _, error) = Run(
            [BackupArchiveCommand.VerifyVerb, NewPath(), KeyFile(NewKey())]);

        code.Should().Be(1);
        error.Should().Contain("archive").And.Contain("does not exist");
    }

    [Fact]
    public void AMissingKeyFileIsASentenceToo()
    {
        var key = NewKey();
        var (code, _, error) = Run(
            [BackupArchiveCommand.VerifyVerb, ArchiveOf(TreeWithTwoFiles(), key), NewPath()]);

        code.Should().Be(1);
        error.Should().Contain("key file").And.Contain("does not exist");
    }

    [Fact]
    public void AKeyFileThatIsNotBase64OfThirtyTwoBytesNamesTheWholeContract()
    {
        // The one refusal that has to be loud: a key that is NEARLY right opens nothing, and an
        // operator who thinks the key is fine goes looking for a fault in the archive instead.
        var path = NewPath();
        File.WriteAllText(path, "hunter2");

        var (code, _, error) = Run(
            [BackupArchiveCommand.VerifyVerb, ArchiveOf(TreeWithTwoFiles(), NewKey()), path]);

        code.Should().Be(1);
        error.Should().Contain("base64 of exactly 32 bytes").And.Contain("nearly right");
    }

    [Fact]
    public void AKeyFileWithATrailingNewlineIsStillTheKey()
    {
        // Every editor on every platform adds one, and a key rejected for it would be a support call
        // during a restore.
        var key = NewKey();
        var path = NewPath();
        File.WriteAllText(path, Convert.ToBase64String(key) + Environment.NewLine);

        Run([BackupArchiveCommand.VerifyVerb, ArchiveOf(TreeWithTwoFiles(), key), path])
            .Code.Should().Be(0);
    }

    [Fact]
    public void TheWrongNumberOfArgumentsPrintsTheUsageAndAnswersTwo()
    {
        var (code, _, error) = Run([BackupArchiveCommand.DecryptVerb, "only-one-argument"]);

        code.Should().Be(2);
        error.Should().Contain("Usage:").And.Contain("<output-directory>");
    }

    [Theory]
    [InlineData(true, BackupArchiveCommand.DecryptVerb)]
    [InlineData(true, BackupArchiveCommand.VerifyVerb)]
    [InlineData(false, "--healthcheck")]
    [InlineData(false, "--urls")]
    public void ItClaimsItsOwnVerbsAndNoOthers(bool handled, string verb)
    {
        BackupArchiveCommand.Handles([verb, "x", "y", "z"]).Should().Be(handled);
    }

    [Fact]
    public void ItLeavesAKitAtAKnownPathSoTheNativeBinaryCanBeCheckedByHand()
    {
        // An ordinary round-trip test that happens to write where somebody can find it. The trim and
        // AOT analysers run on every build, but they prove a pattern is legal, not that it WORKS: tar
        // and gzip under Native AOT are exactly the pair worth watching a real binary do. So this
        // leaves an archive and its key at a fixed path, and the published binary is pointed at them:
        //
        //   CredVaultServer --verify-archive  <temp>/cred-vault-aot-kit/archive.cvbk <temp>/cred-vault-aot-kit/key.b64
        //   CredVaultServer --decrypt-archive <temp>/cred-vault-aot-kit/archive.cvbk <out> <...>/key.b64
        //
        // Overwritten on every run, so it is never a stale artefact pretending to be a fresh one.
        var kit = Path.Combine(Path.GetTempPath(), "cred-vault-aot-kit");
        Directory.CreateDirectory(kit);
        var key = NewKey();
        var archive = Path.Combine(kit, "archive.cvbk");
        File.Delete(archive);
        using (var stream = File.Create(archive))
        {
            BackupArchive.Create(TreeWithTwoFiles(), stream, key, Noon);
        }
        File.WriteAllText(Path.Combine(kit, "key.b64"), Convert.ToBase64String(key));

        var (code, output, _) = Run(
            [BackupArchiveCommand.VerifyVerb, archive, Path.Combine(kit, "key.b64")]);

        code.Should().Be(0);
        output.Should().Contain("2 file(s)");
    }

    [Fact]
    public void ItSealsATreeFromTheCommandLineAndReadsItBack()
    {
        var keyFile = KeyFile(NewKey());
        var archive = NewPath();

        var (sealed_, sealing, _) = Run([BackupArchiveCommand.CreateVerb, TreeWithTwoFiles(), archive, keyFile]);
        var (opened, _, _) = Run([BackupArchiveCommand.VerifyVerb, archive, keyFile]);

        sealed_.Should().Be(0);
        sealing.Should().Contain("Sealed 2 file(s)");
        opened.Should().Be(0);
    }

    [Fact]
    public void ASourceDirectoryThatIsNotThereIsASentence()
    {
        var (code, _, error) = Run(
            [BackupArchiveCommand.CreateVerb, NewPath(), NewPath(), KeyFile(NewKey())]);

        code.Should().Be(1);
        error.Should().Contain("source directory").And.Contain("does not exist");
    }

    [Fact]
    public void ItSaysWhatItIsDoingBeforeItStartsDoingIt()
    {
        // Four silent minutes and a hung process look identical from a terminal. The first line goes
        // out before the work, not after it.
        var key = NewKey();
        var archive = ArchiveOf(TreeWithTwoFiles(), key);

        var (_, verifying, _) = Run([BackupArchiveCommand.VerifyVerb, archive, KeyFile(key)]);

        verifying.Should().StartWith("Verifying ");
        verifying.Should().Contain("vaults/alice.json", "and then one line per entry as it goes");
    }

    [Fact]
    public void AKeyFileTheSizeOfALogIsRefusedWithoutBeingRead()
    {
        // A mistyped path pointing at a gigabyte log would otherwise be allocated in full inside a
        // recovery container before anything decided it was not a key.
        var path = NewPath();
        File.WriteAllText(path, new string('A', 100_000));

        var (code, _, error) = Run(
            [BackupArchiveCommand.VerifyVerb, ArchiveOf(TreeWithTwoFiles(), NewKey()), path]);

        code.Should().Be(1);
        error.Should().Contain("none of it has been read");
    }

    [Fact]
    public void TheStampInTheHeaderComesFromTheClockItWasGivenAndNotFromTheMachine()
    {
        // The stamp is persisted — it is in the archive header and it is associated data for every
        // chunk — so `utc-timestamps.md` applies to it: the clock is injected, never ambient. The
        // assertion is on the byte that ends up in the file, not on the call.
        var keyFile = KeyFile(NewKey());
        var archive = NewPath();
        var output = new StringWriter();

        BackupArchiveCommand.Run(
            [BackupArchiveCommand.CreateVerb, TreeWithTwoFiles(), archive, keyFile],
            new CommandOutput(output, new StringWriter()),
            new FrozenClock(Noon)).Should().Be(0);

        using var file = File.OpenRead(archive);
        BackupHeader.Read(file).Header.CreatedAtUnixMs.Should().Be(Noon.ToUnixTimeMilliseconds());
    }

    /// <summary>A clock that says one thing, so a persisted stamp can be asserted rather than guessed.</summary>
    private sealed class FrozenClock(DateTimeOffset at) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => at;
    }

    private static (int Code, string Output, string Error) Run(string[] args)
    {
        var output = new StringWriter();
        var error = new StringWriter();
        var code = BackupArchiveCommand.Run(args, new CommandOutput(output, error), TimeProvider.System);
        return (code, output.ToString(), error.ToString());
    }

    private static string ArchiveOf(string sourceDir, byte[] key)
    {
        var path = NewPath();
        using var stream = File.Create(path);
        BackupArchive.Create(sourceDir, stream, key, Noon);
        return path;
    }

    private static string KeyFile(byte[] key)
    {
        var path = NewPath();
        File.WriteAllText(path, Convert.ToBase64String(key));
        return path;
    }

    private static string TreeWithTwoFiles()
    {
        var dir = NewPath();
        Directory.CreateDirectory(Path.Combine(dir, "vaults"));
        File.WriteAllText(Path.Combine(dir, "vaults", "alice.json"), "alice");
        File.WriteAllText(Path.Combine(dir, "vaults", "bob.json"), "bob");
        return dir;
    }

    private static byte[] NewKey() => RandomNumberGenerator.GetBytes(Key32.Bytes);

    /// <summary>A fresh path whose parent exists, so a file can be created at it straight away.</summary>
    private static string NewPath()
    {
        var parent = Path.Combine(Path.GetTempPath(), "cred-vault-backup-cli", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(parent);
        return Path.Combine(parent, "item");
    }
}
