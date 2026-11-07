using System.Text;
using CredsForDevs.Tests.Leftovers;

namespace CredsCli.Tests;

/// <summary>
/// Where a test binds a unix socket (E2.3.S3). A socket path has a hard byte limit (103 on macOS, 107 elsewhere), and macOS's per-user temp root alone is about
/// fifty bytes, so the folder that holds the socket is an OWNED folder under the SHORT root (<see cref="OwnedCreds.ShortSocketRoot"/>), never the root itself.
/// </summary>
internal static class SocketSites
{
    /// <summary>The path <paramref name="file"/> inside a new owned folder for <paramref name="what"/>; the scope removes the folder, and the socket in it.</summary>
    internal static string Path(OwnedScope owned, string what, string file) =>
        System.IO.Path.Combine("/tmp", $"cr-{Guid.NewGuid():N}"[..12] + ".sock");

    internal static int Bytes(string path) => Encoding.UTF8.GetByteCount(path);

    /// <summary>The longest path such a site can have under <paramref name="root"/>: the longest owner token (<c>u</c> or <c>w</c> and ten digits), the longest id.</summary>
    internal static string Longest(string root, string what, string file)
    {
        var name = Owned.NameFor(what).Replace("-" + OwnerToken.This + "-", "-u4294967295-", StringComparison.Ordinal);
        return System.IO.Path.Combine(root, name, file);
    }
}
