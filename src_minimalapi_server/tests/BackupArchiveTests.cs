using System.Formats.Tar;
using System.Security.Cryptography;
using System.Text;
using FluentAssertions;

namespace CredVaultServer.Tests;

/// <summary>
/// The archive format: what it carries, what it refuses, and what it never lets out.
/// </summary>
/// <remarks>
/// <para>A backup nobody can open is the failure this feature exists to prevent, so the round trip is
/// asserted byte for byte rather than by file count. The rest of these tests are about the other
/// direction — an archive is a list of names somebody else chose, and extraction is where that
/// becomes a path on this disk.</para>
/// </remarks>
public class BackupArchiveTests
{
    private const int SmallChunk = 1024;

    private static readonly DateTimeOffset Noon = DateTimeOffset.Parse("2026-09-07T12:00:00Z");

    [Fact]
    public void AnArchiveRoundTripsTheTreeByteForByte()
    {
        var source = NewDir();
        var files = WriteTree(source);
        var key = NewKey();
        var archive = Seal(source, key);

        var restored = NewPath();
        var summary = BackupArchive.Extract(archive, restored, key);

        summary.Files.Should().Be(files.Count);
        summary.Skipped.Should().Be(0);
        foreach (var (relative, bytes) in files)
        {
            File.ReadAllBytes(Path.Combine(restored, relative)).Should().Equal(
                bytes, $"{relative} came back exactly as it went in");
        }
        Directory.Exists(Path.Combine(restored, "deep", "empty")).Should().BeTrue("an empty directory survives");
    }

    [Fact]
    public void ATemporaryFileAndTheBackupTreeNeverEnterAnArchive()
    {
        // The sealed backup key lives under org/backup, and an archive carrying the key that opens it
        // is the one mistake this whole feature cannot survive. Asserted by listing what came OUT,
        // never by trusting the walk that put it in.
        var source = NewDir();
        WriteFile(source, "vaults/alice.json", "keep me");
        WriteFile(source, "vaults/alice.json.tmp", "a write in flight");
        WriteFile(source, "scratch.tmp/inside.json", "a temporary directory's child");
        WriteFile(source, "org/backup/key.sealed", "the key that opens this archive");
        WriteFile(source, "org/backup/archives/older.cvbk", "an archive inside an archive");
        WriteFile(source, "org/events/2026-09-07.ndjson", "keep me too");
        var key = NewKey();

        var restored = NewPath();
        BackupArchive.Extract(Seal(source, key), restored, key);

        Listing(restored).Should().BeEquivalentTo(
            ["org/events/2026-09-07.ndjson", "vaults/alice.json"],
            "everything else is a write in flight or the key to this archive");
    }

    [Theory]
    [InlineData("vaults/alice.json", false, "an ordinary vault")]
    [InlineData("org/events/2026-09-07.ndjson", false, "the event log travels")]
    [InlineData("org/backups/keep.json", false, "a different directory that merely starts the same way")]
    [InlineData("notes/tmp.json", false, "'tmp' is not the extension '.tmp'")]
    [InlineData("vaults/alice.json.tmp", true, "a write in flight")]
    [InlineData("vaults/ALICE.JSON.TMP", true, "the case of a temporary file is the filesystem's business")]
    [InlineData("scratch.tmp/inside.json", true, "a temporary directory takes its children with it")]
    [InlineData("org/backup", true, "the backup tree itself")]
    [InlineData("org/backup/key.sealed", true, "the key that opens this very archive")]
    public void TheExclusionRuleIsOneFunctionAndItAnswersDirectly(string path, bool excluded, string why)
    {
        BackupArchive.Excluded(path).Should().Be(excluded, why);
    }

    [Fact]
    public void AWrongKeyFailsOnTheFirstChunkAndSaysSoAboutTheKey()
    {
        var archive = Seal(TreeOfOneFile(), NewKey());

        var refused = Refusal(() => BackupArchive.Verify(archive, NewKey()));

        refused.Message.Should().Contain("first chunk").And.Contain("wrong key");
    }

    [Fact]
    public void AFlippedCiphertextByteFailsAtItsOwnChunkAndNotLater()
    {
        // "Chunk 3" rather than "this file is corrupt" is the difference between an operator who knows
        // how much of the archive was authentic and one who knows nothing at all.
        var key = NewKey();
        var archive = Seal(BigTree(), key, SmallChunk);
        var bytes = File.ReadAllBytes(archive);
        var third = OffsetOfChunk(bytes, 3);
        bytes[third + BackupFormat.FramingBytes] ^= 0x01;
        File.WriteAllBytes(archive, bytes);

        Refusal(() => BackupArchive.Verify(archive, key))
            .Message.Should().Contain("Chunk 3 failed authentication");
    }

    [Fact]
    public void ADroppedFinalChunkIsReportedAsTruncationAndNotAsAShorterArchive()
    {
        var key = NewKey();
        var archive = Seal(BigTree(), key, SmallChunk);
        var bytes = File.ReadAllBytes(archive);
        File.WriteAllBytes(archive, bytes[..OffsetOfLastChunk(bytes)]);

        Refusal(() => BackupArchive.Verify(archive, key))
            .Message.Should().Contain("truncated").And.Contain("before any chunk marked as the last");
    }

    [Fact]
    public void TwoChunksSwappedAreRefused()
    {
        // Each chunk on its own is authentic; the counter in the associated data is what makes their
        // ORDER part of what was signed.
        var key = NewKey();
        var archive = Seal(BigTree(), key, SmallChunk);
        var bytes = File.ReadAllBytes(archive);
        var first = OffsetOfChunk(bytes, 0);
        var second = OffsetOfChunk(bytes, 1);
        var third = OffsetOfChunk(bytes, 2);
        var swapped = new List<byte>(bytes[..first]);
        swapped.AddRange(bytes[second..third]);
        swapped.AddRange(bytes[first..second]);
        swapped.AddRange(bytes[third..]);
        File.WriteAllBytes(archive, [.. swapped]);

        Refusal(() => BackupArchive.Verify(archive, key)).Message.Should().Contain("first chunk");
    }

    [Fact]
    public void EditingTheCreatedAtStampBreaksTheArchive()
    {
        // The header is plaintext, so nothing but the associated data stops somebody rewriting when a
        // backup claims to have been taken — which is exactly the field an attacker would edit.
        var key = NewKey();
        var archive = Seal(TreeOfOneFile(), key);
        var bytes = File.ReadAllBytes(archive);
        bytes[34] ^= 0xFF;
        File.WriteAllBytes(archive, bytes);

        Refusal(() => BackupArchive.Verify(archive, key)).Message.Should().Contain("header has been altered");
    }

    [Fact]
    public void AHeaderFromANewerVersionNamesBothVersions()
    {
        var key = NewKey();
        var archive = Seal(TreeOfOneFile(), key);
        var bytes = File.ReadAllBytes(archive);
        bytes[5] = 9;
        File.WriteAllBytes(archive, bytes);

        var refused = Refusal(() => BackupArchive.Verify(archive, key)).Message;
        refused.Should().Contain("version 9").And.Contain("reads version 1");
        refused.Should().Contain(
            "open it with a build from the release that wrote it",
            "the message has to tell the operator what to do, not only what is wrong");
    }

    [Fact]
    public void AnOversizedChunkSizeIsRefusedBeforeAnythingIsAllocated()
    {
        // A crafted header asking for a two-gigabyte buffer is a denial of service written into the
        // format. The bound is checked before the allocation, which is the only place it can help.
        var key = NewKey();
        var archive = Seal(TreeOfOneFile(), key);
        var bytes = File.ReadAllBytes(archive);
        bytes[30] = 0x7F;
        bytes[31] = 0xFF;
        bytes[32] = 0xFF;
        bytes[33] = 0xFF;
        File.WriteAllBytes(archive, bytes);

        Refusal(() => BackupArchive.Verify(archive, key))
            .Message.Should().Contain("chunk size").And.Contain("no buffer has been allocated");
    }

    [Fact]
    public void SomethingThatIsNotAnArchiveIsRefusedAsNotAnArchive()
    {
        var path = NewPath();
        File.WriteAllBytes(path, RandomNumberGenerator.GetBytes(4096));

        Refusal(() => BackupArchive.Verify(path, NewKey())).Message.Should().Contain("CVBK marker");
    }

    [Fact]
    public void AnArchiveOfAnEmptyDirectoryReadsBackEmpty()
    {
        var key = NewKey();
        var archive = Seal(NewDir(), key);

        var restored = NewPath();
        var summary = BackupArchive.Extract(archive, restored, key);

        summary.Should().Be(ArchiveSummary.Empty);
        Directory.EnumerateFileSystemEntries(restored).Should().BeEmpty();
    }

    [Fact]
    public void AnEntryThatEscapesTheOutputDirectoryIsRefusedAndWritesNothing()
    {
        // The archive is authentic — it was written with the real key. Authentic is not the same as
        // safe: a name is a path if the extractor lets it be one.
        var key = NewKey();
        var archive = SealTar(TarOfOneEntry("../escaped.txt", "outside"), key);
        var restored = NewPath();

        Refusal(() => BackupArchive.Extract(archive, restored, key))
            .Message.Should().Contain("escaped.txt").And.Contain("outside the output directory");

        File.Exists(Path.Combine(Path.GetDirectoryName(restored)!, "escaped.txt")).Should().BeFalse();
        Directory.Exists(restored).Should().BeFalse("a refused extraction leaves no directory behind");
    }

    [Fact]
    public void AnAbsoluteEntryNameIsRefusedToo()
    {
        var key = NewKey();
        var archive = SealTar(TarOfOneEntry("/etc/cron.d/evil", "outside"), key);

        Refusal(() => BackupArchive.Extract(archive, NewPath(), key))
            .Message.Should().Contain("outside the output directory");
    }

    [Fact]
    public void ALinkEntryIsRefusedBecauseOnlyFilesAndDirectoriesAreRestored()
    {
        var key = NewKey();
        var archive = SealTar(TarOfALink("link", "/etc/passwd"), key);

        Refusal(() => BackupArchive.Extract(archive, NewPath(), key))
            .Message.Should().Contain("only files and directories are");
    }

    [Fact]
    public void AFailedExtractionLeavesNoPartialTreeBehind()
    {
        // The tamper is late in the archive on purpose: by the time it is found, files have already
        // been written. Everything written went into staging, and staging goes away.
        var key = NewKey();
        var archive = Seal(BigTree(), key, SmallChunk);
        var bytes = File.ReadAllBytes(archive);
        var late = OffsetOfLastChunk(bytes);
        bytes[late + BackupFormat.FramingBytes] ^= 0x01;
        File.WriteAllBytes(archive, bytes);
        var restored = NewPath();

        Refusal(() => BackupArchive.Extract(archive, restored, key));

        Directory.Exists(restored).Should().BeFalse();
        Directory.EnumerateDirectories(Path.GetDirectoryName(restored)!, "*.partial-*")
            .Should().BeEmpty("the staging directory goes with the failure");
    }

    [Fact]
    public void ADestinationThatAlreadyHoldsSomethingIsRefused()
    {
        var key = NewKey();
        var archive = Seal(TreeOfOneFile(), key);
        var restored = NewDir();
        WriteFile(restored, "someone-elses.json", "already here");

        Refusal(() => BackupArchive.Extract(archive, restored, key))
            .Message.Should().Contain("already holds something");
        File.Exists(Path.Combine(restored, "someone-elses.json")).Should().BeTrue("and nothing was touched");
    }

    private static string Seal(string sourceDir, byte[] key, int chunkSize = BackupFormat.DefaultChunkSize)
    {
        var path = NewPath();
        using var output = File.Create(path);
        BackupArchive.Create(sourceDir, output, key, Noon, chunkSize);
        return path;
    }

    private static string SealTar(byte[] tarBytes, byte[] key)
    {
        var path = NewPath();
        using (var output = File.Create(path))
        {
            BackupArchive.SealTar(tarBytes, output, key, Noon, BackupFormat.DefaultChunkSize);
        }
        return path;
    }

    private static byte[] TarOfOneEntry(string name, string content)
    {
        using var buffer = new MemoryStream();
        using (var tar = new TarWriter(buffer, TarEntryFormat.Pax, leaveOpen: true))
        {
            tar.WriteEntry(new PaxTarEntry(TarEntryType.RegularFile, name)
            {
                DataStream = new MemoryStream(Encoding.UTF8.GetBytes(content)),
            });
        }
        return buffer.ToArray();
    }

    private static byte[] TarOfALink(string name, string target)
    {
        using var buffer = new MemoryStream();
        using (var tar = new TarWriter(buffer, TarEntryFormat.Pax, leaveOpen: true))
        {
            tar.WriteEntry(new PaxTarEntry(TarEntryType.SymbolicLink, name) { LinkName = target });
        }
        return buffer.ToArray();
    }

    /// <summary>Where a chunk's framing starts, by walking the records the way a reader does.</summary>
    private static int OffsetOfChunk(byte[] archive, int index)
    {
        var offset = BackupFormat.HeaderBytes;
        for (var i = 0; i < index; i++)
        {
            offset += BackupFormat.FramingBytes + LengthAt(archive, offset) + BackupFormat.TagBytes;
        }
        return offset;
    }

    private static int OffsetOfLastChunk(byte[] archive)
    {
        var offset = BackupFormat.HeaderBytes;
        var previous = offset;
        while (offset < archive.Length)
        {
            previous = offset;
            offset += BackupFormat.FramingBytes + LengthAt(archive, offset) + BackupFormat.TagBytes;
        }
        return previous;
    }

    private static int LengthAt(byte[] archive, int offset) =>
        System.Buffers.Binary.BinaryPrimitives.ReadInt32BigEndian(
            archive.AsSpan(offset + BackupFormat.FlagBytes));

    private static BackupArchiveException Refusal(Action act) =>
        act.Should().Throw<BackupArchiveException>().Which;

    private static byte[] NewKey() => RandomNumberGenerator.GetBytes(Key32.Bytes);

    /// <summary>
    /// A path whose PARENT is unique too: the staging directory a failed extraction leaves behind is
    /// asserted on by listing that parent, and a shared one would read another test's staging as this
    /// test's leak.
    /// </summary>
    private static string NewPath()
    {
        var parent = Path.Combine(Path.GetTempPath(), "cred-vault-backup", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(parent);
        return Path.Combine(parent, "target");
    }

    private static string NewDir()
    {
        var dir = NewPath();
        Directory.CreateDirectory(dir);
        return dir;
    }

    private static Dictionary<string, byte[]> WriteTree(string root)
    {
        var files = new Dictionary<string, byte[]>
        {
            ["vaults/alice.json"] = RandomNumberGenerator.GetBytes(3_000),
            ["vaults/bob.json"] = Encoding.UTF8.GetBytes("{\"vault\":\"bob\"}"),
            ["deep/nested/further/one.bin"] = RandomNumberGenerator.GetBytes(9_000),
            ["empty-file.json"] = [],
        };
        foreach (var (relative, bytes) in files)
        {
            var path = Path.Combine(root, relative.Replace('/', Path.DirectorySeparatorChar));
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            File.WriteAllBytes(path, bytes);
        }
        Directory.CreateDirectory(Path.Combine(root, "deep", "empty"));
        return files;
    }

    private static string TreeOfOneFile()
    {
        var dir = NewDir();
        WriteFile(dir, "vaults/alice.json", "one file is enough");
        return dir;
    }

    /// <summary>Enough incompressible bytes that a small chunk size produces many chunks.</summary>
    private static string BigTree()
    {
        var dir = NewDir();
        var path = Path.Combine(dir, "big.bin");
        File.WriteAllBytes(path, RandomNumberGenerator.GetBytes(40_000));
        return dir;
    }

    private static void WriteFile(string root, string relative, string content)
    {
        var path = Path.Combine(root, relative.Replace('/', Path.DirectorySeparatorChar));
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllText(path, content);
    }

    private static IEnumerable<string> Listing(string root) =>
        Directory.EnumerateFiles(root, "*", SearchOption.AllDirectories)
            .Select(path => Path.GetRelativePath(root, path).Replace('\\', '/'))
            .Order(StringComparer.Ordinal);
}
