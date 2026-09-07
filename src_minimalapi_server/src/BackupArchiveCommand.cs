namespace CredVaultServer;

/// <summary>Where a command's two kinds of output go. Console in production, a buffer in a test.</summary>
internal readonly record struct CommandOutput(TextWriter Out, TextWriter Error);

/// <summary>
/// <c>--decrypt-archive</c> and <c>--verify-archive</c>: opening a backup with the server binary itself.
/// </summary>
/// <remarks>
/// <para>A subcommand rather than a second tool, intercepted before any host is built, exactly as
/// <c>--healthcheck</c> is. The moment anybody needs this is the moment a server is gone, and "find
/// the other program we wrote for this" is not a step that survives that moment. The image and the key
/// are the whole recovery kit.</para>
///
/// <para><b>Console output, not logging.</b> The logging rule bans <c>Console.WriteLine</c> for
/// anything that is a log — a line with no level, no timestamp and no source. This is not logging: it
/// is a command-line program answering the person who typed it, and the entry names it prints as it
/// goes are both the progress report and the record of what came out of the archive. There is no
/// percentage on purpose, because an archive does not store its uncompressed size and any percentage
/// would be a number this code invented.</para>
/// </remarks>
public static class BackupArchiveCommand
{
    public const string DecryptVerb = "--decrypt-archive";

    public const string VerifyVerb = "--verify-archive";

    /// <summary>
    /// Taking an archive from the command line.
    /// </summary>
    /// <remarks>
    /// The scheduled run and the endpoint belong to story 3; this verb exists because a format is not
    /// worth much if the only thing that can produce one does not exist yet. It is what the scenario
    /// harness drives to make a real archive with the real binary, and what a restore rehearsal needs
    /// on a machine that has an image and nothing else.
    /// </remarks>
    public const string CreateVerb = "--create-archive";

    /// <summary>44 characters of base64, plus room for an editor's newline and stray whitespace.</summary>
    private const int MaxKeyFileBytes = 256;

    /// <summary>Whether these arguments are for this command at all.</summary>
    public static bool Handles(string[] args) =>
        args is [DecryptVerb, ..] or [VerifyVerb, ..] or [CreateVerb, ..];

    /// <summary>0 done, 1 refused with a reason, 2 the arguments were not a command.</summary>
    public static int Run(string[] args) => Run(args, new CommandOutput(Console.Out, Console.Error));

    internal static int Run(string[] args, CommandOutput say)
    {
        try
        {
            return Dispatch(args, say);
        }
        catch (Exception e) when (e is BackupArchiveException or IOException or UnauthorizedAccessException)
        {
            say.Error.WriteLine(e.Message);
            return 1;
        }
    }

    private static int Dispatch(string[] args, CommandOutput say) => args switch
    {
        [DecryptVerb, var archive, var output, var keyFile] => Decrypt(archive, output, keyFile, say),
        [VerifyVerb, var archive, var keyFile] => Verify(archive, keyFile, say),
        [CreateVerb, var source, var archive, var keyFile] => CreateOne(source, archive, keyFile, say),
        _ => Usage(say),
    };

    private static int Decrypt(string archivePath, string outputDir, string keyFilePath, CommandOutput say)
    {
        var key = KeyFrom(keyFilePath);
        RefuseMissing(archivePath, "archive");
        // The first line goes out BEFORE the work, and then one per entry. An archive of a real server
        // takes minutes, and a terminal that has said nothing for four of them is indistinguishable
        // from a hung one. There is no percentage: the archive does not record its uncompressed size,
        // and a number this code invented would be worse than none.
        say.Out.WriteLine($"Opening {archivePath} into {outputDir}...");
        var summary = BackupArchive.Extract(archivePath, outputDir, key, say.Out.WriteLine);
        say.Out.WriteLine(
            $"Restored {summary.Files} file(s) and {summary.Directories} director(ies), {summary.Bytes} "
            + $"bytes, into {outputDir}.");
        return 0;
    }

    private static int Verify(string archivePath, string keyFilePath, CommandOutput say)
    {
        var key = KeyFrom(keyFilePath);
        RefuseMissing(archivePath, "archive");
        say.Out.WriteLine($"Verifying {archivePath}...");
        var summary = BackupArchive.Verify(archivePath, key, say.Out.WriteLine);
        say.Out.WriteLine(
            $"The archive is intact: every chunk authenticated, {summary.Files} file(s) and "
            + $"{summary.Directories} director(ies) inside, {summary.Bytes} bytes. Nothing was written.");
        return 0;
    }

    private static int CreateOne(string sourceDir, string archivePath, string keyFilePath, CommandOutput say)
    {
        var key = KeyFrom(keyFilePath);
        RefuseMissingDirectory(sourceDir);
        say.Out.WriteLine($"Sealing {sourceDir} into {archivePath}...");
        var summary = BackupArchive.CreateFile(sourceDir, archivePath, key, DateTimeOffset.UtcNow);
        say.Out.WriteLine(
            $"Sealed {summary.Files} file(s) and {summary.Directories} director(ies), {summary.Bytes} "
            + $"bytes, into {archivePath}. {summary.Skipped} entr(ies) vanished while it was read.");
        return 0;
    }

    /// <summary>Base64 of exactly 32 bytes, and a sentence naming the contract when it is not.</summary>
    private static byte[] KeyFrom(string path)
    {
        RefuseMissing(path, "key file");
        RefuseHugeKeyFile(path);
        var key = Key32.Decode(File.ReadAllText(path));
        return key.Length == Key32.Bytes ? key : throw BackupArchiveException.BadKeyFile(path);
    }

    /// <summary>
    /// A key file has a known size, so it is checked before it is read rather than after.
    /// </summary>
    /// <remarks>
    /// Base64 of 32 bytes is 44 characters; the allowance is for whatever line ending an editor added.
    /// Pointed at a gigabyte log by a mistyped path, the unbounded read would allocate the whole thing
    /// inside a recovery container before deciding it was not a key.
    /// </remarks>
    private static void RefuseHugeKeyFile(string path)
    {
        var length = new FileInfo(path).Length;
        if (length > MaxKeyFileBytes)
        {
            throw BackupArchiveException.KeyFileTooLarge(path, length);
        }
    }

    private static void RefuseMissingDirectory(string path)
    {
        if (!Directory.Exists(path))
        {
            throw BackupArchiveException.Missing("source directory", path);
        }
    }

    private static void RefuseMissing(string path, string what)
    {
        if (!File.Exists(path))
        {
            throw BackupArchiveException.Missing(what, path);
        }
    }

    private static int Usage(CommandOutput say)
    {
        say.Error.WriteLine("Usage:");
        say.Error.WriteLine($"  CredVaultServer {DecryptVerb} <archive> <output-directory> <key-file>");
        say.Error.WriteLine($"  CredVaultServer {VerifyVerb} <archive> <key-file>");
        say.Error.WriteLine($"  CredVaultServer {CreateVerb} <source-directory> <archive> <key-file>");
        say.Error.WriteLine(
            "The key file holds base64 of exactly 32 bytes and nothing else; surrounding whitespace is "
            + "ignored. The output directory must be absent or empty.");
        return 2;
    }
}
