namespace CredVaultServer;

/// <summary>
/// Refuse a data directory on a network filesystem (server-ops item 2, 2026-08-28).
///
/// <para><see cref="VaultStore"/>'s durability rests on <c>File.Move</c> being atomic — write the
/// new blob beside the old one, rename over it, and a crash at any instant leaves either the old
/// vault or the new, never half of one. SMB and older NFS do not promise that, and the failure is
/// the worst kind: nothing is wrong until the day two machines sync at once and a vault comes
/// back truncated. So the server refuses to start on a UNC path or a mount whose filesystem is
/// known to be remote, unless the operator says <c>Vault:AllowNetworkDataDir=true</c> and owns
/// the risk in writing.</para>
///
/// <para>Pure: the mount table comes in as text, so the decision is a unit test rather than a
/// machine with an NFS export on it.</para>
/// </summary>
public static class DataDirCheck
{
    /// <summary>Filesystem types that are remote, as <c>/proc/mounts</c> names them.</summary>
    public static readonly IReadOnlyList<string> NetworkFilesystems =
        ["nfs", "nfs4", "cifs", "smb3", "smbfs", "fuse.sshfs", "9p", "afs", "ceph", "glusterfs", "davfs", "fuse.rclone"];

    public const string OverrideKey = "Vault:AllowNetworkDataDir";

    /// <summary>A Windows UNC path (<c>\\server\share</c>) — remote by definition.</summary>
    public static bool IsUncPath(string path) =>
        path.StartsWith(@"\\", StringComparison.Ordinal) || path.StartsWith("//", StringComparison.Ordinal);

    /// <summary>
    /// The filesystem type of the mount that holds <paramref name="fullPath"/> — the longest mount
    /// point that is a prefix of it — when that type is a network one; <c>null</c> otherwise.
    /// </summary>
    public static string? NetworkMountOf(string fullPath, string mountsText)
    {
        var best = ("", "");
        foreach (var line in mountsText.Split('\n'))
        {
            var parts = line.Split(' ');
            if (parts.Length < 3)
            {
                continue;
            }

            var mountPoint = Unescape(parts[1]);
            if (Holds(mountPoint, fullPath) && mountPoint.Length > best.Item1.Length)
            {
                best = (mountPoint, parts[2]);
            }
        }

        return IsNetwork(best.Item2) ? best.Item2 : null;
    }

    /// <summary>
    /// The refusal for this data directory, or <c>null</c> when it may be used. The mount table is
    /// read through <paramref name="readMounts"/>, which answers <c>null</c> where there is none
    /// (Windows, macOS): there the only remote shape this can see is a UNC path.
    /// </summary>
    public static string? Judge(string dataDir, bool allowNetwork, Func<string?> readMounts)
    {
        if (allowNetwork)
        {
            return null;
        }

        if (IsUncPath(dataDir))
        {
            return Refusal(dataDir, "a UNC network path");
        }

        var mounts = readMounts();
        // A POSIX path is matched as written: GetFullPath on Windows would prefix a drive letter.
        var full = dataDir.StartsWith('/') ? dataDir : Path.GetFullPath(dataDir);
        var fstype = mounts is null ? null : NetworkMountOf(full, mounts);
        return fstype is null ? null : Refusal(dataDir, $"a {fstype} mount");
    }

    private static string Refusal(string dataDir, string what) =>
        $"DataDir '{dataDir}' is on {what}. The vault store relies on atomic rename, which network "
        + $"filesystems do not promise; use a local disk, or set {OverrideKey}=true to run anyway and own the risk.";

    private static bool IsNetwork(string fstype) =>
        NetworkFilesystems.Any(known => string.Equals(known, fstype, StringComparison.OrdinalIgnoreCase));

    private static bool Holds(string mountPoint, string fullPath)
    {
        if (mountPoint == "/")
        {
            return fullPath.StartsWith('/');
        }

        return fullPath == mountPoint || fullPath.StartsWith(mountPoint + "/", StringComparison.Ordinal);
    }

    /// <summary><c>/proc/mounts</c> writes a space in a mount point as <c>\040</c>.</summary>
    private static string Unescape(string mountPoint) =>
        mountPoint.Replace(@"\040", " ", StringComparison.Ordinal).Replace(@"\011", "\t", StringComparison.Ordinal);
}
