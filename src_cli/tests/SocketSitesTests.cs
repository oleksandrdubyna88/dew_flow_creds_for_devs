using CredsCli;
using CredsForDevs.Tests.Leftovers;
using FluentAssertions;

namespace CredsCli.Tests;

/// <summary>
/// The four socket sites of the client tests (E2.3.S3, S3.2): the folder that holds a socket is OWNED (claimed, prefixed, under the short root), and the path
/// fits a socket on Linux AND on macOS, computed for macOS's real roots too, in UTF-8 bytes - what the kernel counts.
/// </summary>
public sealed class SocketSitesTests : IDisposable
{
    /// <summary>The sites: the folder's <c>what</c> and the socket's file name, as the four tests spell them.</summary>
    public static TheoryData<string, string> Sites() => new() { { "sock", "cr.sock" }, { "corpse", "c.sock" } };

    /// <summary>macOS's per-user temp root as the OS gives it (<c>$TMPDIR</c>): measured on the macOS runners at 49 to 50 bytes.</summary>
    private const string MacTempRoot = "/var/folders/zz/zyxvpxvq6csfxvn_n0000000000000/T";

    private readonly OwnedScope _owned = DarwinLayout.FreshOwnedScope();

    public void Dispose() => _owned.Dispose();

    [Theory]
    [MemberData(nameof(Sites))]
    public void A_socket_site_binds_inside_an_owned_folder_under_the_short_root_and_the_path_fits(string what, string file)
    {
        var path = SocketSites.Path(_owned, what, file);

        var folder = System.IO.Path.GetDirectoryName(path)!;
        Directory.Exists(folder).Should().BeTrue("premise: the folder exists before anything binds");
        System.IO.Path.GetFileName(path).Should().Be(file);
        Owned.Pattern().IsMatch(System.IO.Path.GetFileName(folder)).Should().BeTrue("the socket's parent is an owned folder, not the short root itself");
        File.Exists(folder + ".owner").Should().BeTrue("its claim is beside it, claimed first");
        OwnedCreds.Canonical(System.IO.Path.GetDirectoryName(folder)!).Should().Be(OwnedCreds.Canonical(OwnedCreds.ShortSocketRoot));
        SocketSites.Bytes(path).Should().BeLessThanOrEqualTo(AgentRelay.MaxSocketPathBytes, "UTF-8 bytes, on this platform");
    }

    [Theory]
    [MemberData(nameof(Sites))]
    public void The_short_root_leaves_a_wide_margin_on_both_platforms_where_macOS_temp_root_leaves_almost_none(string what, string file)
    {
        const int macOs = 103, linux = 107;
        // /tmp on Linux and macOS; /private/tmp is what macOS's /tmp is a link to (a path may be given either way).
        foreach (var root in new[] { "/tmp", "/private/tmp" })
        {
            SocketSites.Bytes(SocketSites.Longest(root, what, file)).Should().BeLessThanOrEqualTo(macOs - 35, $"{root} holds the longest {what} socket with 35 bytes to spare on macOS ({linux} on Linux)");
        }

        SocketSites.Bytes(SocketSites.Longest(MacTempRoot, what, file)).Should().BeGreaterThan(macOs - 10, "premise: under macOS's own temp root the same path has under ten bytes to spare, which is why the short root exists");
    }
}
