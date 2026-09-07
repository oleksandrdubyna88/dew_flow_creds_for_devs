using System.Formats.Tar;

namespace CredVaultServer;

/// <summary>
/// Every refusal the archive format makes, each one a sentence a person can act on.
/// </summary>
/// <remarks>
/// <para>A backup nobody can open is the failure this whole feature exists to prevent, and the second
/// worst outcome after that is an operator who cannot tell WHICH failure they have. "This file is
/// corrupt" sends someone looking for a better copy; "this build is older than the archive" sends them
/// to fetch a newer build, and the archive they were about to throw away is fine. So every message here
/// names the thing that went wrong and, where there is one, the move that fixes it.</para>
/// </remarks>
public sealed class BackupArchiveException : Exception
{
    public BackupArchiveException(string message)
        : base(message)
    {
    }

    public BackupArchiveException(string message, Exception inner)
        : base(message, inner)
    {
    }

    public static BackupArchiveException NotAnArchive(string why) =>
        new($"This file is not a CredVault backup archive: {why}.");

    public static BackupArchiveException WrongVersion(ushort found) =>
        new($"This archive is version {found}; this build of CredVaultServer reads version "
            + $"{BackupFormat.Version}. The archive is fine and this reader is the older half — open it "
            + "with a build from the release that wrote it.");

    public static BackupArchiveException BadChunkSize(int chunkSize) =>
        new($"This archive declares a chunk size of {chunkSize} bytes. A chunk is a power of two "
            + $"between {BackupFormat.MinChunkSize} and {BackupFormat.MaxChunkSize} bytes, so nothing "
            + "has been read and no buffer has been allocated for it.");

    public static BackupArchiveException BadChunkLength(uint counter, int length, int chunkSize) =>
        new($"Chunk {counter} declares {length} bytes where this archive's chunks are at most "
            + $"{chunkSize}. Nothing has been allocated for it.");

    public static BackupArchiveException BadKey(int length) =>
        new($"A backup key is {Key32.Bytes} bytes; this one is {length}.");

    public static BackupArchiveException BadKeyFile(string path) =>
        new($"The key file '{path}' holds neither of the two forms a backup key comes in: "
            + $"{BackupKey.Form.Prefix}-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-CCCC as a person writes it "
            + $"down, or base64 of exactly {Key32.Bytes} bytes as a script or a secret manager holds "
            + "it. Surrounding whitespace is ignored; nothing else in the file is. A key that is nearly "
            + "right is refused rather than truncated into one that opens nothing.");

    /// <summary>
    /// A file that IS a printable key and is wrong — which is a different sentence from "not a key".
    /// </summary>
    /// <remarks>
    /// The checksum exists so that a mis-typed character is caught here, with a message that sends
    /// somebody back to the paper. Collapsing this into the generic refusal would waste it: an operator
    /// told "that is not a key" about something that plainly looks like one goes looking for a
    /// different file instead of a different character.
    /// </remarks>
    public static BackupArchiveException BadPrintableKeyFile(string path, PrintableKeyError error) =>
        new($"The key file '{path}' will not do. {BackupKey.Explain(error)}");

    public static BackupArchiveException Missing(string what, string path) =>
        new($"The {what} '{path}' does not exist.");

    public static BackupArchiveException Truncated(uint counter) =>
        new($"This archive is truncated: it ends inside chunk {counter}, before any chunk marked as the "
            + "last one. What is here is authentic as far as it goes — the rest of the file did not "
            + "arrive. Fetch it again rather than trusting a partial restore.");

    public static BackupArchiveException WrongKey() =>
        new("The first chunk will not decrypt. Either this is the wrong key for this archive, or the "
            + "archive's header has been altered — both fail here, and neither can be told apart from "
            + "the outside.");

    public static BackupArchiveException Tampered(uint counter) =>
        new($"Chunk {counter} failed authentication: the archive has been altered or corrupted at that "
            + "chunk. Everything before it was authentic, which is what makes the position meaningful.");

    public static BackupArchiveException TrailingData() =>
        new("This archive has bytes after the chunk marked as its last. Nothing was extracted: an "
            + "archive with something appended to it is not one this reader will guess about.");

    public static BackupArchiveException TooManyChunks() =>
        new($"This archive would need more than {uint.MaxValue} chunks, which the nonce counter cannot "
            + "number without repeating. Nothing has been written past that point.");

    public static BackupArchiveException UnsafeEntry(string name) =>
        new($"Refusing to extract '{name}': it resolves outside the output directory. An archive entry "
            + "may name a path below the destination and nothing else.");

    public static BackupArchiveException UnsupportedEntry(string name, TarEntryType type) =>
        new($"Refusing to extract '{name}': it is a {type}, and only files and directories are "
            + "restored. Links and device nodes are not written, because following one is how an "
            + "extraction lands somewhere nobody asked for.");

    public static BackupArchiveException LinkedComponent(string path) =>
        new($"Refusing to extract through '{path}': it is a link, not a directory this restore made. "
            + "Something else is writing into the output directory while the restore runs, and an entry "
            + "written through a link lands wherever the link points. Restore into a directory nobody "
            + "else can write to.");

    public static BackupArchiveException StrandedStaging(string staging, Exception failure) =>
        new($"{failure.Message} The partly extracted tree at '{staging}' could not be removed either, "
            + "so it is still on disk — delete it before trying again.", failure);

    public static BackupArchiveException CouldNotInstall(string staging, string final, Exception failure) =>
        new($"The archive was opened in full and every chunk authenticated, but the result could not be "
            + $"moved into '{final}': {failure.Message} Nothing was lost — the restored tree is complete "
            + $"at '{staging}', and moving it yourself finishes the job.", failure);

    public static BackupArchiveException KeyFileTooLarge(string path, long length) =>
        new($"The key file '{path}' is {length} bytes. A backup key is base64 of {Key32.Bytes} bytes, so "
            + "this is some other file and none of it has been read.");

    public static BackupArchiveException DestinationExists(string path) =>
        new($"The output directory '{path}' already holds something. A restore writes into an empty or "
            + "absent directory, so that what comes out of the archive is all that is there.");
}
