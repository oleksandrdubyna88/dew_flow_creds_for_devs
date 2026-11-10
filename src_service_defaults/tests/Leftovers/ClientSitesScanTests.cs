using FluentAssertions;
using Xunit;

namespace CredsForDevs.Tests.Leftovers;

/// <summary>
/// The automated RED of the client, process, socket and server sites (E2.3.S3, S3.0; E2.3.S4, S4.0): the copied guard's <c>raw-temp</c> reading over the four client
/// test trees and the server's. A temp-path API call, <c>Owned.TempRoot</c> outside the helper's folders and a <c>/tmp</c> or <c>/var/tmp</c> literal are findings, unless a marker on the line
/// (or the line above) carries them. No unmarked temp site remains (E2.5.S2.3): the three lines that create nothing (the product's default socket path twice and a refused-path literal,
/// all in <c>AgentRelayTests</c>) carry a marker since S2.2, so the expected list is EMPTY and any finding is a new site. The server tests' backup sites (E2.3.S5) left the list when S5 moved them.
/// The scan reads a COPY of the trees in a scratch root, so the guard's own discovery (which keys on relative paths) runs unchanged and starts no script classifier.
/// </summary>
public sealed class ClientSitesScanTests : IDisposable
{
    private static readonly string[] Trees = ["src_cli/tests/", "src_mcp/tests/", "src_broker_client/tests/", "src_service_defaults/tests/", "src_minimalapi_server/tests/"];

    /// <summary>The helper's COPIED files (the manifest's targets) are left out: S3.0 judges creds' own code, and a copied file cannot be edited. Creds' own files in the same
    /// folders (<c>OwnedCreds.cs</c>, the fixtures, the tests) ARE scanned. The list is read from <c>template-manifest.json</c>, never retyped.</summary>
    private static readonly HashSet<string> Copied = ManifestTargets();

    private static HashSet<string> ManifestTargets()
    {
        var path = Path.Combine(RepositoryRoot.Path, "src_service_defaults", "tests", "Support", "Leftovers", "template-manifest.json");
        using var manifest = System.Text.Json.JsonDocument.Parse(File.ReadAllText(path));
        return [.. manifest.RootElement.GetProperty("entries").EnumerateArray().Select(entry => entry.GetProperty("target").GetString()!)];
    }

    private const string SanctionedFile = "src_service_defaults/tests/Support/Leftovers/OwnedCreds.cs";

    /// <summary>
    /// The lines that create nothing and are NOT carried by a marker: none (E2.5.S2.3). The three string literals of <c>AgentRelayTests</c> that were listed here (the product's default
    /// socket path twice, a refused-path literal) carry a marker now. The file and a fragment of the line is the key, never the number, so the list stays valid when a line moves; a finding
    /// that is on no list is shown as UNEXPECTED with its place and text. A follow-up that is not E2.5's: the template guard's raw-string reading (a <c>/tmp</c> inside a raw string that
    /// also holds a quote, <c>CallerIdentityTests.cs:196</c>, is not read, so it is not a finding).
    /// </summary>
    private static readonly (string File, string Fragment)[] Expected = [];

    private readonly OwnedScope _owned = DarwinLayout.FreshOwnedScope();

    public void Dispose() => _owned.Dispose();

    private static IEnumerable<string> TestSources() => Trees
        .SelectMany(tree => Directory.EnumerateFiles(Path.Combine(RepositoryRoot.Path, tree.TrimEnd('/')), "*.cs", SearchOption.AllDirectories))
        .Select(path => Path.GetRelativePath(RepositoryRoot.Path, path).Replace('\\', '/'))
        .Where(relative => !relative.Split('/').Any(segment => segment is "bin" or "obj"));

    private string Scratch(IEnumerable<string> relatives, Func<string, string>? text = null)
    {
        var root = _owned.Dir("sites-scan");
        foreach (var relative in relatives)
        {
            var target = Path.Combine(root, relative);
            Directory.CreateDirectory(Path.GetDirectoryName(target)!);
            File.WriteAllText(target, text is null ? File.ReadAllText(Path.Combine(RepositoryRoot.Path, relative)) : text(relative));
        }

        return root;
    }

    /// <summary>The raw-temp findings of a scan, each as <c>file:line</c> with the line's text.</summary>
    private static (string File, int Line, string Text)[] RawTempFindings(string root)
    {
        var report = LeftoversGuard.Scan(root);
        report.FilesScanned.Should().BeGreaterThan(0, "premise: the scan read files (a scan of nothing passes for ever)");
        return [.. report.Findings.Where(f => f.Class == "raw-temp").Select(f => (f.File, f.Line, File.ReadAllLines(Path.Combine(root, f.File))[f.Line - 1].Trim()))
            .OrderBy(f => f.File, StringComparer.Ordinal).ThenBy(f => f.Line)];
    }

    private static string[] RawTempLines(string root) => [.. RawTempFindings(root).Select(f => $"{f.File}:{f.Line}")];

    /// <summary>Each finding named by the expected entry it is (<c>file | fragment</c>), or marked UNEXPECTED with its place and text.</summary>
    private static string[] Named(IEnumerable<(string File, int Line, string Text)> findings) =>
        [.. findings.Select(f => Expected.Where(e => e.File == f.File && f.Text.Contains(e.Fragment, StringComparison.Ordinal)).Select(e => $"{e.File} | {e.Fragment}").FirstOrDefault()
            ?? $"UNEXPECTED {f.File}:{f.Line} {f.Text}").Order(StringComparer.Ordinal)];

    [Fact]
    public void TheTestTrees_HoldNoUnmarkedTempSite()
    {
        var sources = TestSources().Where(relative => !Copied.Contains(relative)).ToList();
        sources.Count.Should().BeGreaterThan(50, "premise: the scan sees the trees (about 125 files with the server's when this was written)");
        sources.Should().Contain(["src_service_defaults/tests/Support/Leftovers/OwnedCreds.cs", "src_service_defaults/tests/Leftovers/SocketRootSweepTests.cs"], "premise: creds' own files in the helper folders are scanned");
        sources.Should().Contain("src_minimalapi_server/tests/VaultServer.cs", "premise: the server's tests are in the scan (E2.3.S4)");
        sources.Should().NotContain(Copied, "premise: the copied files are not");

        Named(RawTempFindings(Scratch(sources))).Should().Equal(
            [.. Expected.Select(e => $"{e.File} | {e.Fragment}").Order(StringComparer.Ordinal)],
            "every temp site is a helper call or carries a marker: no unmarked temp site is left in the five test trees");
    }

    /// <summary>The callers pass the short <c>what</c>; the helper adds the owner, the repository token and the id, so a leading <c>creds-</c> reads as <c>creds-creds-</c>.</summary>
    [Fact]
    public void NoFolderIsAskedForUnderAnOldCredsName()
    {
        var sources = TestSources().ToList();
        sources.Count.Should().BeGreaterThan(50, "premise: the scan sees the trees");
        var old = new System.Text.RegularExpressions.Regex("""(?:TempDirectory|\.Dir|OwnedDir\.Create)\(\s*"(?:creds|cred-vault)-""", System.Text.RegularExpressions.RegexOptions.CultureInvariant);

        sources.Where(relative => File.ReadAllLines(Path.Combine(RepositoryRoot.Path, relative)).Any(line => old.IsMatch(line)))
            .Should().BeEmpty("a folder is named for what it holds (`mcp-pump`), without the old `creds-` lead");
        old.IsMatch("HostProcess.TempDirectory(\"creds" + "-mcp-pump\")").Should().BeTrue("premise: the pattern reads the old spelling");
        old.IsMatch("OwnedDir.Create(\"creds" + "-x\")").Should().BeTrue("premise: and the direct call of the helper");
    }

    [Fact]
    public void TheScan_HasTeeth_AFileWithATempCallOrAPathLiteralIsAFinding()
    {
        var planted = "src_cli/tests/Planted.cs";
        var root = Scratch([planted], _ => string.Join('\n', PlantedLines));

        RawTempLines(root).Should().Equal($"{planted}:2", $"{planted}:3", $"{planted}:4", $"{planted}:5");
    }

    /// <summary>The planted file: four temp sites. The markers keep THIS file clean under the guard's own reading; the scratch copy has none of them.</summary>
    private static readonly string[] PlantedLines =
    [
        "class Planted",
        // testsToDelete-exempt: raw-temp — a planted temp-path call: the scan must find it in the scratch copy
        "{ string A() => Path.Combine(Path.GetTempPath(), \"x\");",
        // testsToDelete-exempt: raw-temp — a planted path literal: the scan must find it in the scratch copy
        "  string B() => \"/var/tmp/y\";",
        "  string C() => Owned.TempRoot();",
        // testsToDelete-exempt: raw-temp — a planted subfolder call: the scan must find it in the scratch copy
        "  string D() => Directory.CreateTempSubdirectory(\"z\").FullName; }",
    ];

    [Fact]
    public void TheSanctionedLine_OfOwnedCreds_IsCarriedByItsMarkerAndIsAFindingWithoutIt()
    {
        var marked = Scratch([SanctionedFile]);
        RawTempLines(marked).Should().BeEmpty("premise: the one short-root literal is carried by its marker");

        var bare = Scratch([SanctionedFile], relative =>
            string.Join('\n', File.ReadAllLines(Path.Combine(RepositoryRoot.Path, relative)).Where(line => !line.Contains("exempt: raw-temp", StringComparison.Ordinal))));
        RawTempLines(bare).Should().ContainSingle().Which.Should().StartWith(SanctionedFile + ":", "without its marker the same line is a raw-temp finding");
    }
}
