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
/// path if you let it be one: <c>../../etc/cron.d/x</c>, an absolute path, <c>notes.txt:hidden</c> on
/// Windows, a directory replaced by a symlink between the check and the write. Every entry is resolved
/// and checked against the destination before a single byte is written, only files and directories are
/// written at all, and the whole tree lands in a staging directory renamed into place at the end — so
/// a failure on the last chunk leaves nothing that could be mistaken for a restore.</para>
/// </remarks>
public static class BackupArchive
{
    /// <summary>Seal <paramref name="sourceDir"/> into <paramref name="destination"/>.</summary>
    public static ArchiveSummary Create(
        string sourceDir, Stream destination, byte[] key, DateTimeOffset createdAt,
        Action<string>? onEntry = null) =>
        Create(sourceDir, destination, key, createdAt, BackupFormat.DefaultChunkSize, onEntry);

    /// <summary>
    /// Seal a tree into a FILE, written under a temporary name and renamed once it is complete.
    /// </summary>
    /// <remarks>
    /// The rename is the same discipline the vault store uses for every write it makes: a reader — the
    /// next run's retention pass, an upload, a person — sees a whole archive or no archive, never a
    /// half-written one that would pass for a backup until the day it was needed.
    /// </remarks>
    public static ArchiveSummary CreateFile(
        string sourceDir, string archivePath, byte[] key, DateTimeOffset createdAt,
        Action<string>? onEntry = null)
    {
        var partial = archivePath + ".partial";
        var summary = SealToFile(sourceDir, partial, key, createdAt, onEntry);
        File.Move(partial, archivePath, overwrite: true);
        return summary;
    }

    internal static ArchiveSummary Create(
        string sourceDir, Stream destination, byte[] key, DateTimeOffset createdAt, int chunkSize,
        Action<string>? onEntry = null) =>
        Seal(destination, key, createdAt, chunkSize, into => WriteEntries(sourceDir, into, onEntry));

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
    /// <para>The extraction lands in a staging directory beside the destination and is renamed into
    /// place only once the last chunk has authenticated. A tag that fails on chunk 20, or a process
    /// killed half way, therefore leaves no half-tree that a later run would read as a restore — the
    /// one failure mode where "it looked like it worked" costs the most.</para>
    /// <para><b>The destination is checked twice and deleted only at the end.</b> Up front so that a
    /// restore into an occupied directory fails in a second rather than after ten minutes of
    /// decryption; again at commit time, because an empty directory the operator had prepared must not
    /// be removed by a restore that then fails on a mistyped key and leaves them worse off than they
    /// started.</para>
    /// </remarks>
    public static ArchiveSummary Extract(
        string archivePath, string destinationDir, byte[] key, Action<string>? onEntry = null)
    {
        var final = Path.TrimEndingDirectorySeparator(Path.GetFullPath(destinationDir));
        RefuseOccupiedDestination(final);
        var staging = final + ".partial-" + Guid.NewGuid().ToString("N")[..8];
        Directory.CreateDirectory(staging);
        var summary = Opened(archivePath, staging, key, onEntry);
        Commit(staging, final);
        return summary;
    }

    /// <summary>Authenticate every chunk and every entry name, and write nothing at all.</summary>
    public static ArchiveSummary Verify(string archivePath, byte[] key, Action<string>? onEntry = null) =>
        ReadArchive(archivePath, destination: null, key, onEntry);

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

    private static ArchiveSummary SealToFile(
        string sourceDir, string path, byte[] key, DateTimeOffset createdAt, Action<string>? onEntry)
    {
        using var output = File.Create(path);
        return Create(sourceDir, output, key, createdAt, onEntry);
    }

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

    private static ArchiveSummary WriteEntries(string sourceDir, Stream into, Action<string>? onEntry)
    {
        using var tar = new TarWriter(into, TarEntryFormat.Pax, leaveOpen: true);
        var root = Path.GetFullPath(sourceDir);
        var summary = ArchiveSummary.Empty;
        foreach (var path in Tree(root))
        {
            // Reported as it goes, the same way the read verbs report. Sealing a real server's data
            // directory takes minutes, and a terminal that has said nothing for four of them is
            // indistinguishable from a hung one — which was written about the read side and is just as
            // true here.
            onEntry?.Invoke(Normalised(Path.GetRelativePath(root, path)));
            summary = summary.Plus(Add(tar, root, path));
        }
        return summary;
    }

    private static IEnumerable<string> Tree(string root) =>
        Directory.Exists(root) ? Walk(root, root) : [];

    /// <summary>
    /// Everything under one directory and then everything under each of its own, lazily.
    /// </summary>
    /// <remarks>
    /// <para>Recursive rather than <c>SearchOption.AllDirectories</c> followed by a sort, for two
    /// reasons that both matter on a real server. That pair materialises every path in the tree before
    /// a single byte is written, which is a large allocation next to a format whose whole point is that
    /// it streams; and it WALKS the trees it is about to discard — <c>org/backup/</c>, which holds
    /// archives, is reliably the largest directory on the disk. Pruning an excluded directory here
    /// means never entering it.</para>
    /// <para>Sorted per directory, so an archive of the same tree is the same archive twice.</para>
    /// </remarks>
    private static IEnumerable<string> Walk(string root, string directory)
    {
        foreach (var entry in Sorted(directory))
        {
            if (Excluded(Path.GetRelativePath(root, entry)))
            {
                continue;
            }
            yield return entry;
            foreach (var nested in Descend(root, entry))
            {
                yield return nested;
            }
        }
    }

    private static IEnumerable<string> Descend(string root, string entry) =>
        Directory.Exists(entry) ? Walk(root, entry) : [];

    private static IEnumerable<string> Sorted(string directory)
    {
        try
        {
            return Directory.EnumerateFileSystemEntries(directory).Order(StringComparer.Ordinal).ToArray();
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            // A directory removed or locked while the walk is in it. The tree is live; see Add.
            return [];
        }
    }

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
        var length = stream.Length;
        tar.WriteEntry(new PaxTarEntry(TarEntryType.RegularFile, Normalised(Path.GetRelativePath(root, path)))
        {
            DataStream = stream,
        });
        return new ArchiveSummary(1, 0, 0, length);
    }

    private static ArchiveSummary Opened(
        string archivePath, string staging, byte[] key, Action<string>? onEntry)
    {
        try
        {
            return ReadArchive(archivePath, staging, key, onEntry);
        }
        catch (Exception failure)
        {
            throw Forget(staging, failure);
        }
    }

    /// <summary>
    /// Removes the staging tree, and never hides why the extraction failed.
    /// </summary>
    /// <remarks>
    /// A cleanup that cannot run is not a reason to lose the original failure — but it is not something
    /// to drop either: a partly extracted tree left beside the destination is bytes on a disk that
    /// nobody has been given a reason to look for. So the original failure is what propagates, and when
    /// the cleanup fails too, its message carries the original's along with the path that was stranded.
    /// </remarks>
    private static Exception Forget(string staging, Exception failure)
    {
        try
        {
            Directory.Delete(staging, recursive: true);
            return failure;
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            return BackupArchiveException.StrandedStaging(staging, failure);
        }
    }

    /// <summary>
    /// The rename into place, and the one failure that must not read as a lost restore.
    /// </summary>
    /// <remarks>
    /// <para><b>The move is TRIED before anything is removed.</b> An empty directory the operator had
    /// prepared — often a mount point — is in the way of the rename and has to go, but a destination on
    /// another filesystem makes the rename fail whatever is there, and removing their directory on the
    /// way to that failure would take something from them for nothing. So: try, and only if an empty
    /// directory is what stood in the way, remove it and try once more.</para>
    /// </remarks>
    private static void Commit(string staging, string final)
    {
        RefuseOccupiedDestination(final);
        try
        {
            Install(staging, final);
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            // Everything the install does is inside this: the rename, and the removal of an empty
            // directory standing in its way. A raw IOException escaping from the removal would be the
            // one failure that says nothing about where the restored tree is.
            throw BackupArchiveException.CouldNotInstall(staging, final, e);
        }
    }

    /// <summary>
    /// The rename <see cref="Commit"/> performs, and the only reason a directory is ever removed to
    /// make room for it.
    /// </summary>
    /// <remarks>
    /// <para><b>The FILESYSTEM decides whether to remove anything, never an exception.</b> An earlier
    /// version tried the rename first and removed the destination when it failed — and a rename that
    /// fails because the destination is on another filesystem is indistinguishable, at that point, from
    /// one that fails because an empty directory is in the way. It would have taken the operator's
    /// prepared directory and then failed anyway. So the question is asked directly: does the
    /// destination exist? <see cref="RefuseOccupiedDestination"/> has already established that if it
    /// does, it is empty.</para>
    /// <para><b>What is left, and named rather than implied.</b> A destination that exists, is empty,
    /// and is on another filesystem is still removed before a rename that then fails — the alternative
    /// would be moving the tree in entry by entry, which keeps their directory and gives up the
    /// all-or-nothing install that the staging design exists for. The message says the tree is complete
    /// at the staging path, so nothing is lost but the empty directory.</para>
    /// </remarks>
    private static void Install(string staging, string final)
    {
        if (Directory.Exists(final))
        {
            Directory.Delete(final);
        }
        Directory.Move(staging, final);
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
            TarEntryType.Directory => TakeDirectory(destination, target),
            TarEntryType.RegularFile or TarEntryType.V7RegularFile => TakeFile(entry, destination, target),
            _ => throw BackupArchiveException.UnsupportedEntry(entry.Name, entry.EntryType),
        };
    }

    private static ArchiveSummary TakeDirectory(string? root, string? target)
    {
        MakeDirectory(root, target);
        return new ArchiveSummary(0, 1, 0, 0);
    }

    private static void MakeDirectory(string? root, string? target)
    {
        if (root is null || target is null)
        {
            return;
        }
        Directory.CreateDirectory(target);
        RefuseLinkedComponents(root, target);
    }

    private static ArchiveSummary TakeFile(TarEntry entry, string? root, string? target)
    {
        WriteFile(entry, root, target);
        return new ArchiveSummary(1, 0, 0, entry.Length);
    }

    private static void WriteFile(TarEntry entry, string? root, string? target)
    {
        if (root is null || target is null)
        {
            return;
        }
        Directory.CreateDirectory(Path.GetDirectoryName(target) ?? target);
        RefuseLinkedComponents(root, target);
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

    private static bool Escapes(string name) => Climbs(name) || NamesAWindowsStream(name);

    /// <summary>Absolute, rooted, or climbing: three spellings of "not below the destination".</summary>
    private static bool Climbs(string name) =>
        name.StartsWith('/')
        || Path.IsPathRooted(name)
        || name.Split('/').Any(segment => segment is "..");

    /// <summary>
    /// On Windows a colon in a name is not part of the name.
    /// </summary>
    /// <remarks>
    /// <c>notes.txt:hidden</c> addresses an alternate data STREAM of <c>notes.txt</c>, and <c>c:x</c> a
    /// path relative to a drive's current directory. Neither is a file below the destination, and both
    /// survive a containment check written in terms of directories. Refused on Windows only, because on
    /// Linux a colon is an ordinary character in a filename and an archive taken there has to restore
    /// there.
    /// </remarks>
    private static bool NamesAWindowsStream(string name) =>
        OperatingSystem.IsWindows() && name.Contains(':');

    /// <summary>The canonical check: resolved, then compared against the resolved destination.</summary>
    private static string Contained(string destination, string name, string raw)
    {
        var root = Path.TrimEndingDirectorySeparator(Path.GetFullPath(destination));
        var full = Path.GetFullPath(Path.Combine(root, name.Replace('/', Path.DirectorySeparatorChar)));
        if (Outside(root, full))
        {
            throw BackupArchiveException.UnsafeEntry(raw);
        }
        return full;
    }

    /// <summary>
    /// Asked as a RELATIVE path rather than as a string prefix.
    /// </summary>
    /// <remarks>
    /// <c>full.StartsWith(root + separator)</c> is the usual spelling and it is wrong at the edges: a
    /// destination that is a filesystem root gives <c>"//"</c> or <c>"C:\\"</c> and then refuses every
    /// entry in a perfectly good archive. Asking for the relative path answers the actual question —
    /// "is this below that" — for every destination, including a root and including another drive,
    /// which comes back rooted and is refused.
    /// </remarks>
    internal static bool Outside(string root, string full)
    {
        var relative = Path.GetRelativePath(root, full);
        return Path.IsPathRooted(relative)
            || relative == "."
            || relative.Split(Path.DirectorySeparatorChar, '/').Any(segment => segment is "..");
    }

    /// <summary>
    /// No directory on the way to this file may be a link.
    /// </summary>
    /// <remarks>
    /// <para>The containment check is lexical, and the staging tree is a real directory on a real
    /// filesystem: between the check and the write, another local process can replace a directory we
    /// just created with a symlink, and the entry then lands wherever it points. .NET exposes no
    /// open-without-following, so this is the strongest check available here — every component below
    /// the root is resolved and refused if it is a link.</para>
    /// <para>It closes the ordinary case and narrows the race rather than eliminating it, which is why
    /// a restore belongs in a directory nobody else can write to. Said plainly rather than implied,
    /// because a defence described as complete is one nobody checks again.</para>
    /// </remarks>
    private static void RefuseLinkedComponents(string root, string target)
    {
        for (var dir = Path.GetDirectoryName(target);
             dir is not null && dir.Length > root.Length;
             dir = Path.GetDirectoryName(dir))
        {
            RefuseLink(dir);
        }
    }

    private static void RefuseLink(string path)
    {
        if (new DirectoryInfo(path).LinkTarget is not null)
        {
            throw BackupArchiveException.LinkedComponent(path);
        }
    }

    private static void RefuseOccupiedDestination(string final)
    {
        if (Directory.Exists(final) && Directory.EnumerateFileSystemEntries(final).Any())
        {
            throw BackupArchiveException.DestinationExists(final);
        }
    }

}
