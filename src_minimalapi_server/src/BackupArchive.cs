using System.Formats.Tar;
using System.IO.Compression;

namespace CredVaultServer;

/// <summary>What one archive operation moved: the numbers a person is owed at the end of it.</summary>
public sealed record ArchiveSummary(int Files, int Directories, int Skipped, long Bytes)
{
    public static readonly ArchiveSummary Empty = new(0, 0, 0, 0);

    public ArchiveSummary Plus(ArchiveSummary other) => new(
        Files + other.Files,
        Directories + other.Directories,
        Skipped + other.Skipped,
        Bytes + other.Bytes);
}

/// <summary>
/// One directory tree in, one encrypted archive out, and back again.
/// </summary>
/// <remarks>
/// <para><b>tar, then gzip, then chunked AES-256-GCM</b> — see <see cref="BackupFormat"/> for why the
/// cipher is shaped that way. This type is the two ends of that pipe: what goes into an archive, and
/// what is allowed to come out of one.</para>
///
/// <para><b>Nothing is locked while an archive is built.</b> Every write in the store is atomic — a
/// rename — so a reader sees the old file or the new one, never half of one, which is the property the
/// shell backup already relies on against a live server. Taking the vault's locks would buy contention
/// and no correctness. What a live tree DOES produce is files that disappear between the walk and the
/// read, and those are counted as skipped rather than being allowed to abort a backup.</para>
///
/// <para><b>Extraction is the dangerous direction.</b> An archive is a list of names, and a name is a
/// path if you let it be one: <c>../../etc/cron.d/x</c>, an absolute path, a symlink pointing at
/// somewhere else followed by a file entry landing on it. Every entry is resolved and checked against
/// the destination before a single byte is written, and only files and directories are written at all.
/// The whole extraction goes into a staging directory that is renamed into place at the end, so a
/// failure on the last chunk leaves nothing behind that could be mistaken for a restore.</para>
/// </remarks>
public static class BackupArchive
{
    /// <summary>Seal <paramref name="sourceDir"/> into <paramref name="destination"/>.</summary>
    public static ArchiveSummary Create(
        string sourceDir, Stream destination, byte[] key, DateTimeOffset createdAt) =>
        Create(sourceDir, destination, key, createdAt, BackupFormat.DefaultChunkSize);

    internal static ArchiveSummary Create(
        string sourceDir, Stream destination, byte[] key, DateTimeOffset createdAt, int chunkSize) =>
        Seal(destination, key, createdAt, chunkSize, into => WriteEntries(sourceDir, into));

    /// <summary>Seal a tar stream that the caller composed. The one seam the tests need.</summary>
    internal static void SealTar(
        byte[] tarBytes, Stream destination, byte[] key, DateTimeOffset createdAt, int chunkSize) =>
        Seal(destination, key, createdAt, chunkSize, into =>
        {
            into.Write(tarBytes);
            return ArchiveSummary.Empty;
        });

    /// <summary>
    /// Open an archive into a directory that does not yet hold anything.
    /// </summary>
    /// <remarks>
    /// The extraction lands in a staging directory beside the destination and is renamed into place
    /// only once the last chunk has authenticated. A tag that fails on chunk 20, or a process killed
    /// half way, therefore leaves no half-tree that a later run would read as a restore — the one
    /// failure mode where "it looked like it worked" costs the most.
    /// </remarks>
    public static ArchiveSummary Extract(
        string archivePath, string destinationDir, byte[] key, Action<string>? onEntry = null)
    {
        var final = Path.GetFullPath(destinationDir);
        RefuseOccupiedDestination(final);
        var staging = final + ".partial-" + Guid.NewGuid().ToString("N")[..8];
        try
        {
            Directory.CreateDirectory(staging);
            var summary = ReadArchive(archivePath, staging, key, onEntry);
            Directory.Move(staging, final);
            return summary;
        }
        catch
        {
            Forget(staging);
            throw;
        }
    }

    /// <summary>Authenticate every chunk and every entry name, and write nothing at all.</summary>
    public static ArchiveSummary Verify(string archivePath, byte[] key) =>
        ReadArchive(archivePath, destination: null, key, onEntry: null);

    /// <summary>
    /// The two things that never go into an archive. One function, one place, tested directly.
    /// </summary>
    /// <remarks>
    /// <para>A <c>*.tmp</c> file is a write in flight: the store writes to one and renames, so a
    /// temporary caught mid-rename is a half-written record with no value to a restore.</para>
    /// <para><c>org/backup/</c> is an archive inside an archive — and, worse, the sealed backup key,
    /// which is the one secret that must never travel with the data it opens.</para>
    /// <para>"A measure applied at SOME of its sites" is this codebase's most repeated defect, and the
    /// sealed key is the file it would be worst for, so the decision is made here and nowhere else.</para>
    /// </remarks>
    public static bool Excluded(string relativePath)
    {
        var name = Normalised(relativePath);
        return IsTemporary(name) || IsBackupTree(name);
    }

    private static bool IsTemporary(string name) =>
        name.EndsWith(".tmp", StringComparison.OrdinalIgnoreCase)
        || name.Contains(".tmp/", StringComparison.OrdinalIgnoreCase);

    private static bool IsBackupTree(string name) =>
        name.Equals("org/backup", StringComparison.Ordinal)
        || name.StartsWith("org/backup/", StringComparison.Ordinal);

    private static string Normalised(string path) =>
        path.Replace('\\', '/').Trim('/');

    /// <summary>
    /// Separators normalised and a trailing slash dropped — and nothing else.
    /// </summary>
    /// <remarks>
    /// The LEADING slash stays exactly where it is. Trimming it is how <c>/etc/cron.d/evil</c> quietly
    /// becomes an ordinary relative path inside the destination and gets written instead of refused:
    /// the check below then sees nothing wrong, because the tidy-up already removed the thing that was
    /// wrong with it. A normalisation that runs before a safety check can only weaken it.
    /// </remarks>
    private static string EntryPath(string entryName) => entryName.Replace('\\', '/').TrimEnd('/');

    private static ArchiveSummary Seal(
        Stream destination,
        byte[] key,
        DateTimeOffset createdAt,
        int chunkSize,
        Func<Stream, ArchiveSummary> body)
    {
        var header = BackupHeader.NewFor(createdAt, chunkSize);
        var headerBytes = header.ToBytes();
        destination.Write(headerBytes);
        // Disposal order is the format: gzip flushes its trailer into the chunk writer, and only then
        // does the chunk writer emit the chunk marked last. Reversing these two produces an archive
        // that is truncated by construction.
        using var chunks = new ChunkWriteStream(destination, key, header, headerBytes);
        using var gzip = new GZipStream(chunks, CompressionLevel.Optimal, leaveOpen: true);
        return body(gzip);
    }

    private static ArchiveSummary WriteEntries(string sourceDir, Stream into)
    {
        using var tar = new TarWriter(into, TarEntryFormat.Pax, leaveOpen: true);
        var root = Path.GetFullPath(sourceDir);
        var summary = ArchiveSummary.Empty;
        foreach (var path in Walk(root))
        {
            summary = summary.Plus(Add(tar, root, path));
        }
        return summary;
    }

    /// <summary>Everything under the root, in a fixed order, minus what never travels.</summary>
    private static IEnumerable<string> Walk(string root) =>
        Directory.Exists(root)
            ? Directory.EnumerateFileSystemEntries(root, "*", SearchOption.AllDirectories)
                .Where(path => !Excluded(Path.GetRelativePath(root, path)))
                .Order(StringComparer.Ordinal)
            : [];

    private static ArchiveSummary Add(TarWriter tar, string root, string path)
    {
        try
        {
            return Directory.Exists(path) ? AddDirectory(tar, root, path) : AddFile(tar, root, path);
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            // The tree is live. A file renamed or deleted between the walk and the read is an ordinary
            // Tuesday on a running server, and aborting the backup over one is the wrong trade: the
            // count is reported so a run that skipped a lot is visible.
            return new ArchiveSummary(0, 0, 1, 0);
        }
    }

    private static ArchiveSummary AddDirectory(TarWriter tar, string root, string path)
    {
        tar.WriteEntry(new PaxTarEntry(TarEntryType.Directory, Normalised(Path.GetRelativePath(root, path)) + "/"));
        return new ArchiveSummary(0, 1, 0, 0);
    }

    private static ArchiveSummary AddFile(TarWriter tar, string root, string path)
    {
        // Delete-shared as well as read-shared: on Windows the server renaming over this file while it
        // is being read is exactly the case above, and an unshared handle turns it into a failure.
        using var stream = File.Open(
            path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
        tar.WriteEntry(new PaxTarEntry(TarEntryType.RegularFile, Normalised(Path.GetRelativePath(root, path)))
        {
            DataStream = stream,
        });
        return new ArchiveSummary(1, 0, 0, stream.Length);
    }

    private static ArchiveSummary ReadArchive(
        string archivePath, string? destination, byte[] key, Action<string>? onEntry)
    {
        using var input = File.OpenRead(archivePath);
        var (header, headerBytes) = BackupHeader.Read(input);
        using var chunks = new ChunkReadStream(input, key, header, headerBytes);
        using var gzip = new GZipStream(chunks, CompressionMode.Decompress);
        using var tar = new TarReader(gzip);
        var summary = ArchiveSummary.Empty;
        while (NextEntry(tar) is { } entry)
        {
            onEntry?.Invoke(entry.Name);
            summary = summary.Plus(Take(entry, destination));
        }
        return summary;
    }

    /// <summary>
    /// The next entry, or nothing — including for an archive that holds no entries at all.
    /// </summary>
    /// <remarks>
    /// <c>TarWriter</c> writes its end-of-archive marker only if it wrote an entry, so an archive of an
    /// empty tree is an empty tar stream and the reader meets the end of it where a header was due.
    /// That is not a truncation: everything in the file has already been authenticated chunk by chunk,
    /// the chunk marked last included, so a short tar can only be one the writer produced. An archive
    /// of nothing is a legitimate thing to have taken, and it reads back as nothing.
    /// </remarks>
    private static TarEntry? NextEntry(TarReader tar)
    {
        try
        {
            return tar.GetNextEntry();
        }
        catch (EndOfStreamException)
        {
            return null;
        }
    }

    private static ArchiveSummary Take(TarEntry entry, string? destination)
    {
        var target = TargetFor(entry.Name, destination);
        return entry.EntryType switch
        {
            TarEntryType.Directory => TakeDirectory(target),
            TarEntryType.RegularFile or TarEntryType.V7RegularFile => TakeFile(entry, target),
            _ => throw BackupArchiveException.UnsupportedEntry(entry.Name, entry.EntryType),
        };
    }

    private static ArchiveSummary TakeDirectory(string? target)
    {
        MakeDirectory(target);
        return new ArchiveSummary(0, 1, 0, 0);
    }

    private static void MakeDirectory(string? target)
    {
        if (target is not null)
        {
            Directory.CreateDirectory(target);
        }
    }

    private static ArchiveSummary TakeFile(TarEntry entry, string? target)
    {
        WriteFile(entry, target);
        return new ArchiveSummary(1, 0, 0, entry.Length);
    }

    private static void WriteFile(TarEntry entry, string? target)
    {
        if (target is null)
        {
            return;
        }
        Directory.CreateDirectory(Path.GetDirectoryName(target) ?? target);
        entry.ExtractToFile(target, overwrite: false);
    }

    /// <summary>
    /// Where this entry may land, or null when nothing is being written — and a refusal either way.
    /// </summary>
    /// <remarks>
    /// The name is checked even when there is no destination, so <see cref="Verify"/> answers the
    /// question a person actually asks it: "would restoring this be safe", not merely "does it decrypt".
    /// </remarks>
    private static string? TargetFor(string entryName, string? destination)
    {
        var name = EntryPath(entryName);
        RefuseUnsafeName(entryName, name);
        return destination is null ? null : Contained(destination, name, entryName);
    }

    private static void RefuseUnsafeName(string raw, string name)
    {
        if (name.Length == 0 || Escapes(name))
        {
            throw BackupArchiveException.UnsafeEntry(raw);
        }
    }

    /// <summary>Absolute, rooted, or climbing: three spellings of "not below the destination".</summary>
    private static bool Escapes(string name) =>
        name.StartsWith('/')
        || Path.IsPathRooted(name)
        || name.Split('/').Any(segment => segment is "..");

    /// <summary>The canonical check: resolved, then compared against the resolved destination.</summary>
    private static string Contained(string destination, string name, string raw)
    {
        var root = Path.GetFullPath(destination);
        var full = Path.GetFullPath(Path.Combine(root, name.Replace('/', Path.DirectorySeparatorChar)));
        if (!full.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.Ordinal))
        {
            throw BackupArchiveException.UnsafeEntry(raw);
        }
        return full;
    }

    private static void RefuseOccupiedDestination(string final)
    {
        if (!Directory.Exists(final))
        {
            return;
        }
        if (Directory.EnumerateFileSystemEntries(final).Any())
        {
            throw BackupArchiveException.DestinationExists(final);
        }
        // Empty and in the way: the staging directory is renamed onto this name, which needs it gone.
        Directory.Delete(final);
    }

    private static void Forget(string staging)
    {
        try
        {
            Directory.Delete(staging, recursive: true);
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            // The failure being handled is the one worth reporting; this one is swept up by the caller.
        }
    }
}
