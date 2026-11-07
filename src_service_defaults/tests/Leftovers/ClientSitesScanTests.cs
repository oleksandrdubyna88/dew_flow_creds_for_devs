using FluentAssertions;
using Xunit;

namespace CredsForDevs.Tests.Leftovers;

/// <summary>
/// The automated RED of the client, process and socket sites (E2.3.S3, S3.0): the copied guard's <c>raw-temp</c> reading over the four client test trees. A
/// temp-path API call, <c>Owned.TempRoot</c> outside the helper's folders and a <c>/tmp</c> or <c>/var/tmp</c> literal are findings, unless a marker on the line
/// (or the line above) carries them. The findings that remain are EXACTLY four lines that create nothing and stay for E2.5's guard: the product's default
/// socket path, a refused-path literal and a fixture string. A list of zero would be red until E2.5; a list that grows is a new site.
/// The scan reads a COPY of the trees in a scratch root, so the guard's own discovery (which keys on relative paths) runs unchanged and starts no script classifier.
/// </summary>
public sealed class ClientSitesScanTests : IDisposable
{
    private static readonly string[] Trees = ["src_cli/tests/", "src_mcp/tests/", "src_broker_client/tests/", "src_service_defaults/tests/"];

    /// <summary>Folders of the helper: the guard lets them name the temp root, and S3.0 leaves them out (S2 and E2.5 judge them).</summary>
    private static readonly string[] HelperFolders = ["src_service_defaults/tests/Support/Leftovers/", "src_service_defaults/tests/Leftovers/"];

    private const string SanctionedFile = "src_service_defaults/tests/Support/Leftovers/OwnedCreds.cs";

    /// <summary>The four lines that create nothing (string literals), left for E2.5's guard. Checked at HEAD of S3.</summary>
    private static readonly string[] Expected =
    [
        "src_broker_client/tests/CallerIdentityTests.cs:196",
        "src_cli/tests/AgentRelayTests.cs:33",
        "src_cli/tests/AgentRelayTests.cs:34",
        "src_cli/tests/AgentRelayTests.cs:278",
    ];

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

    private static string[] RawTempLines(string root)
    {
        var report = LeftoversGuard.Scan(root);
        report.FilesScanned.Should().BeGreaterThan(0, "premise: the scan read files (a scan of nothing passes for ever)");
        return [.. report.Findings.Where(f => f.Class == "raw-temp").Select(f => $"{f.File}:{f.Line}").Order(StringComparer.Ordinal)];
    }

    [Fact]
    public void TheFourClientTrees_HoldNoUnmarkedTempSiteButTheFourLinesThatCreateNothing()
    {
        var sources = TestSources().Where(relative => !HelperFolders.Any(folder => relative.StartsWith(folder, StringComparison.Ordinal))).ToList();
        sources.Count.Should().BeGreaterThan(50, "premise: the scan sees the trees (56 files when this was written)");

        RawTempLines(Scratch(sources)).Should().Equal(Expected,
            "every temp site is a helper call or carries a marker; the four literals that create nothing stay for E2.5's guard");
    }

    /// <summary>The callers pass the short <c>what</c>; the helper adds the owner, the repository token and the id, so a leading <c>creds-</c> reads as <c>creds-creds-</c>.</summary>
    [Fact]
    public void NoFolderIsAskedForUnderAnOldCredsName()
    {
        var sources = TestSources().ToList();
        sources.Count.Should().BeGreaterThan(50, "premise: the scan sees the trees");
        var old = new System.Text.RegularExpressions.Regex("""(?:TempDirectory|\.Dir)\(\s*"(?:creds|cred-vault)-""", System.Text.RegularExpressions.RegexOptions.CultureInvariant);

        sources.Where(relative => File.ReadAllLines(Path.Combine(RepositoryRoot.Path, relative)).Any(line => old.IsMatch(line)))
            .Should().BeEmpty("a folder is named for what it holds (`mcp-pump`), without the old `creds-` lead");
        old.IsMatch("""HostProcess.TempDirectory("creds-mcp-pump")""").Should().BeTrue("premise: the pattern reads the old spelling");
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
        RawTempLines(marked).Should().BeEmpty("premise: the one /tmp of the short socket root is carried by its marker");

        var bare = Scratch([SanctionedFile], relative =>
            string.Join('\n', File.ReadAllLines(Path.Combine(RepositoryRoot.Path, relative)).Where(line => !line.Contains("exempt: raw-temp", StringComparison.Ordinal))));
        RawTempLines(bare).Should().ContainSingle().Which.Should().StartWith(SanctionedFile + ":", "without its marker the same line is a raw-temp finding");
    }
}
