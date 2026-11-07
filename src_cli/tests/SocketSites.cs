using System.Text;
using CredsForDevs.ServiceDefaults.Tests.Support;
using CredsForDevs.Tests.Leftovers;

namespace CredsCli.Tests;

/// <summary>
/// Where a test binds a unix socket (E2.3.S3). A socket path has a hard byte limit (103 on macOS, 107 elsewhere), and macOS's per-user temp root alone is about
/// fifty bytes, so the folder that holds the socket is an OWNED folder under the SHORT root (<see cref="OwnedCreds.ShortSocketRoot"/>), never the root itself.
/// </summary>
internal static class SocketSites
{
    /// <summary>A site: the folder's <c>what</c> and the socket's file name.</summary>
    internal static readonly (string What, string File) Relay = ("sock", "cr.sock");

    /// <summary>The corpse site: a stale socket file, never bound.</summary>
    internal static readonly (string What, string File) Corpse = ("corpse", "c.sock");

    /// <summary>The path of <paramref name="site"/>'s file inside a new owned folder under the short root; the scope removes the folder, and the socket in it. For a site that
    /// binds in this process; a site whose socket a CHILD uses calls <see cref="Folder"/>.</summary>
    internal static string Path(OwnedScope owned, (string What, string File) site) =>
        System.IO.Path.Combine(owned.Dir(site.What, OwnedCreds.ShortSocketRoot), site.File);

    /// <summary>The folder of <paramref name="site"/> as a <see cref="HostProcess"/> folder under the short root: a child started with the socket path in its arguments or
    /// environment is TIED to it, so the class's <c>HostProcess.Remove</c> keeps it while that child (or a process of its group) lives.</summary>
    internal static string Folder((string What, string File) site) => HostProcess.TempDirectory(site.What, parent: OwnedCreds.ShortSocketRoot);

    internal static int Bytes(string path) => Encoding.UTF8.GetByteCount(path);

    /// <summary>The longest path such a site can have under <paramref name="root"/>: the longest owner token (<c>u</c> or <c>w</c> and ten digits), the longest id.</summary>
    internal static string Longest(string root, string what, string file)
    {
        var name = Owned.NameFor(what).Replace("-" + OwnerToken.This + "-", "-u4294967295-", StringComparison.Ordinal);
        return System.IO.Path.Combine(root, name, file);
    }
}
