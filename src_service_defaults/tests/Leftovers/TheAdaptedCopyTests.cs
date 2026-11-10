using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using FluentAssertions;

namespace CredsForDevs.Tests.Leftovers;

/// <summary>
/// The diff check of the adapted copy (E2.3 S1, plan D1). The leftovers helper in <c>src_service_defaults/tests/Support/Leftovers</c> and
/// <c>src_service_defaults/tests/Leftovers</c> is a copy of <c>dew_flow_mcp</c>'s <c>tests/Mcp.Tests/Leftovers</c> at one commit, changed ONLY by the
/// exact replaces <c>template-manifest.json</c> lists. This check undoes those replaces on the file's raw bytes and compares the git blob SHA with the
/// manifest's. It needs no network and holds no copy of the template's bytes.
/// </summary>
/// <remarks>
/// <para>When it is red, the message names the file, the operation (or both SHAs) and the command that shows the template's blob. With
/// <c>CREDS_TEMPLATE_REPO</c> naming a local <c>dew_flow_mcp</c> checkout it also names the first line that differs (<c>git cat-file</c>, still no network).</para>
/// <para>Never edit a copied file to satisfy a creds-only check: this test would be red, and rightly. Change the manifest in the same commit, by reviewed operation.</para>
/// </remarks>
public sealed class TheAdaptedCopyTests
{
    /// <summary>Names a local checkout of the template repository, so a red check can name the first differing line.</summary>
    public const string TemplateRepoVariable = "CREDS_TEMPLATE_REPO";

    private const string TemplateCommit = "197cc76af7c3c1d28f50e57533fa99d34682466d";
    private const int TemplateEntries = 53;
    private const string HelperFolder = "src_service_defaults/tests/Support/Leftovers/";
    private const string TestsFolder = "src_service_defaults/tests/Leftovers/";

    private static readonly string[] CopiedUnder = [HelperFolder, TestsFolder];

    /// <summary>
    /// The creds-owned <c>.cs</c> files of the two folders - every other one must be a manifest target. A new file that is on neither list is red, so a copy
    /// cannot slip in unchecked. A path is relative to the repository root. A file that is named here before it exists is fine: the list is the decision.
    /// </summary>
    private static readonly string[] CredsOwn =
    [
        TestsFolder + "TheAdaptedCopyTests.cs",
        TestsFolder + "SocketRootSweepTests.cs",
        TestsFolder + "HostProcessAdapterTests.cs",
        TestsFolder + "WindowsHandoffTests.cs",
        TestsFolder + "ClientSitesScanTests.cs",
        TestsFolder + "LeftoversGuardCredsTests.cs",
        HelperFolder + "SweepRanTests.cs",
        HelperFolder + "OwnedCreds.cs",
        HelperFolder + "LeftoversSocketRootSweepFixture.cs",
    ];

    internal sealed record Operation(string Old, string New, int Count, string? Reason = null);

    internal sealed record Entry(string Upstream, string Target, string Blob, IReadOnlyList<Operation> Replace);

    private sealed record Manifest(string Repository, string Commit, IReadOnlyList<Entry> Entries);

    private static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true };

    private static string ManifestPath => Path.Combine(RepositoryRoot.Path, "src_service_defaults", "tests", "Support", "Leftovers", "template-manifest.json");

    private static Manifest ReadManifest() =>
        JsonSerializer.Deserialize<Manifest>(File.ReadAllText(ManifestPath), Json) ?? throw new InvalidDataException("template-manifest.json is empty");

    /// <summary>One row per manifest entry: the theory below names the file that is red.</summary>
    public static TheoryData<string> ManifestTargets()
    {
        var rows = new TheoryData<string>();
        foreach (var entry in ReadManifest().Entries)
        {
            rows.Add(entry.Target);
        }

        return rows;
    }

    [Fact]
    public void TheManifest_IsWellFormed()
    {
        var manifest = ReadManifest();

        manifest.Commit.Should().Be(TemplateCommit, "the copy is of one commit of the template");
        manifest.Entries.Should().HaveCount(TemplateEntries, "the template's 51 files, plus DirectoryLinks and RepositoryRoot (F4)");
        manifest.Entries.Select(e => e.Blob).Should().OnlyContain(b => IsLowerHex40(b), "a blob is a 40-digit lowercase hex git object id");
        manifest.Entries.Select(e => e.Target).Should().OnlyHaveUniqueItems("a target is copied once");
        manifest.Entries.Select(e => e.Target).Should().OnlyContain(t => CopiedUnder.Any(f => t.StartsWith(f, StringComparison.Ordinal)), "a copy lives in one of the two helper folders");
        manifest.Entries.Select(e => e.Upstream).Should().OnlyHaveUniqueItems("an upstream file is copied once");
        manifest.Entries.Select(e => e.Upstream).Should().OnlyContain(u => u.StartsWith("tests/Mcp.Tests/", StringComparison.Ordinal), "the template's helper lives under tests/Mcp.Tests/");
        manifest.Entries.Select(e => e.Upstream).Should().Contain(u => u.EndsWith("LeftoversRepositoryGuardTests.cs", StringComparison.Ordinal), "the repository guard test is E2.5's, copied by file");
        foreach (var operation in manifest.Entries.SelectMany(e => e.Replace))
        {
            operation.Old.Should().NotBeNullOrEmpty();
            operation.New.Should().NotBeNullOrEmpty();
            operation.New.Should().NotBe(operation.Old, "an operation that changes nothing is not an operation");
            operation.Count.Should().BeGreaterThanOrEqualTo(1);
        }
    }

    [Fact]
    public void EveryOperationBeyondTheNamespaceLine_HasAReason()
    {
        var withoutReason = ReadManifest().Entries
            .SelectMany(e => e.Replace.Select((operation, index) => (e.Target, Number: index + 1, operation)))
            .Where(x => !x.operation.Old.StartsWith("namespace ", StringComparison.Ordinal) && string.IsNullOrWhiteSpace(x.operation.Reason))
            .Select(x => $"{x.Target} operation {x.Number}")
            .ToList();

        withoutReason.Should().BeEmpty("a reviewer reads each operation's reason; only the namespace line needs none");
    }

    [Fact]
    public void TheManifest_NamesTheTwoLimitsOfTheCopy()
    {
        var about = JsonDocument.Parse(File.ReadAllText(ManifestPath)).RootElement.GetProperty("about").GetString();

        about.Should().Contain("F29").And.Contain("two creds test executables started at once", "the sweep of the template is not locked on Windows");
        about.Should().Contain("F31").And.Contain("BUILTIN\\Administrators", "what an elevated Windows run leaves waits for a person");
    }

    [Theory]
    [MemberData(nameof(ManifestTargets))]
    public async Task EveryCopiedFile_IsTheTemplateUnderTheListedReplacesOnly(string target)
    {
        var manifest = ReadManifest();
        var entry = manifest.Entries.Single(e => e.Target == target);

        var verdict = Verify(entry, File.ReadAllBytes(Path.Combine(RepositoryRoot.Path, target.Replace('/', Path.DirectorySeparatorChar))));

        if (verdict.Failure is { } failure)
        {
            Assert.Fail(failure + await WhereItDiffersAsync(entry, verdict.Reversed));
        }
    }

    [Fact]
    public void EveryLeftoversFile_IsInTheManifestOrIsCredsOwn()
    {
        var targets = ReadManifest().Entries.Select(e => e.Target).ToHashSet(StringComparer.Ordinal);
        var found = CopiedUnder
            .SelectMany(folder => Directory.EnumerateFiles(Path.Combine(RepositoryRoot.Path, folder.TrimEnd('/')), "*.cs", SearchOption.AllDirectories))
            .Select(path => Path.GetRelativePath(RepositoryRoot.Path, path).Replace('\\', '/'))
            .Where(path => !path.Split('/').Any(segment => segment is "bin" or "obj"))
            .ToList();

        found.Count.Should().BeGreaterThan(50, "the premise: the scan sees the folders (a scan that finds nothing passes for ever)");
        found.Should().Contain(targets, "every manifest target exists");
        found.Where(path => !targets.Contains(path) && !CredsOwn.Contains(path)).Should().BeEmpty(
            "a .cs file in the helper folders is a manifest entry or on CredsOwn, with its reason: a copy cannot slip in unchecked");
        CredsOwn.Should().NotIntersectWith(targets, "a file is either a copy or creds' own");
    }

    /// <summary>
    /// SonarCloud cannot be answered by editing a copied file (Q12), so the copies are excluded BY NAME: the manifest's targets are the source of the names, and a folder glob
    /// would hide creds' own files in the same two folders. The exclusion list is the four generic globs plus exactly the targets.
    /// </summary>
    [Fact]
    public void SonarExclusions_NameExactlyTheManifestTargets()
    {
        var workflow = File.ReadAllText(Path.Combine(RepositoryRoot.Path, ".github", "workflows", "sonarcloud.yml"));
        var match = Regex.Match(workflow, "/d:sonar\\.exclusions=\"([^\"]*)\"");
        match.Success.Should().BeTrue("sonarcloud.yml sets sonar.exclusions on the scanner's begin line");

        var excluded = match.Groups[1].Value.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
        var named = excluded.Where(e => !e.Contains('*', StringComparison.Ordinal)).ToList();
        var targets = ReadManifest().Entries.Select(e => e.Target).ToList();

        excluded.Should().Contain(["**/bin/**", "**/obj/**", "**/node_modules/**"], "the generic globs stay");
        named.Should().OnlyHaveUniqueItems();
        named.Should().BeEquivalentTo(targets, "the exclusion names exactly the copied files, by name and not by folder");
    }

    /// <summary>
    /// A manifest count BELOW the template's occurrences: the template has the old text twice, the manifest lists a count of one, and the copy replaced only one of them. Undoing the
    /// replace gives the template back byte for byte, so the blob matches - only applying the operations FORWARD again shows that one old text remains.
    /// </summary>
    [Fact]
    public void ACountBelowTheTemplatesOccurrences_IsRefused_WhereOneOldTextRemainsInTheCopy()
    {
        var template = Encoding.UTF8.GetBytes("aXbXc");
        var entry = new Entry("tests/Mcp.Tests/Fake.cs", HelperFolder + "Fake.cs", GitBlobSha(template), [new Operation("X", "Y", 1)]);

        var partial = Verify(entry, Encoding.UTF8.GetBytes("aYbXc"));
        var faithful = Verify(entry with { Replace = [new Operation("X", "Y", 2)] }, Encoding.UTF8.GetBytes("aYbYc"));

        partial.Failure.Should().NotBeNull("the copy kept one old text the manifest does not list").And.Contain("2 occurrence(s) of the old text").And.Contain("lists 1");
        faithful.Failure.Should().BeNull("a copy with the right count passes");
    }

    /// <summary>One changed byte of a copy is refused and the file is named: the check has teeth (S1.1; S1.3 does the same on a real file, by hand).</summary>
    [Fact]
    public void OneChangedByte_IsRefused_AndNamesTheFile()
    {
        var template = Encoding.UTF8.GetBytes("namespace Mcp.Tests.Leftovers;\nclass A { }\n");
        var entry = new Entry("tests/Mcp.Tests/Leftovers/A.cs", HelperFolder + "A.cs", GitBlobSha(template), [new Operation("namespace Mcp.Tests.Leftovers;", "namespace CredsForDevs.Tests.Leftovers;", 1)]);
        var exact = Encoding.UTF8.GetBytes("namespace CredsForDevs.Tests.Leftovers;\nclass A { }\n");
        var oneByte = Encoding.UTF8.GetBytes("namespace CredsForDevs.Tests.Leftovers;\nclass B { }\n");

        Verify(entry, exact).Failure.Should().BeNull("the premise: the exact copy passes");
        Verify(entry, oneByte).Failure.Should().NotBeNull().And.Contain(entry.Target).And.Contain("git blob");
    }

    /// <summary>The outcome of the check: a message when it failed, and the reversed bytes either way.</summary>
    internal sealed record Verdict(string? Failure, byte[] Reversed);

    /// <summary>Undoes the entry's operations in REVERSE order on the bytes, compares the git blob SHA, then applies them FORWARD again. Pure: the bytes in, the verdict out.</summary>
    internal static Verdict Verify(Entry entry, byte[] bytes)
    {
        var (current, undoFailure) = UndoOperations(entry, bytes);
        var failure = undoFailure ?? BlobFailure(entry, current);
        if (failure is not null)
        {
            return new Verdict(failure, current);
        }

        // The same operations FORWARD on the template's bytes must give exactly the committed file, each with its listed count of old text. Undoing alone cannot see a count
        // BELOW the template's: the copy that replaced one of two old texts reverses to the template, and only the forward count (two, not one) shows what stayed.
        var (forward, redoFailure) = RedoOperations(entry, current);

        return new Verdict(redoFailure ?? ByteFailure(entry, forward, bytes), current);
    }

    /// <summary>Each operation in REVERSE order: its new text must occur exactly as often as listed, and goes back to the old text. The failure names file, operation, counts and lines.</summary>
    private static (byte[] Bytes, string? Failure) UndoOperations(Entry entry, byte[] bytes)
    {
        var current = bytes;
        for (var index = entry.Replace.Count - 1; index >= 0; index--)
        {
            var operation = entry.Replace[index];
            var (found, lines) = Occurrences(current, Encoding.UTF8.GetBytes(operation.New));
            if (found != operation.Count)
            {
                return (current,
                    $"{entry.Target}: operation {index + 1} of {entry.Replace.Count} ('{Shown(operation.Old)}' -> '{Shown(operation.New)}') expected {operation.Count} occurrence(s) of the new text, found {found}"
                    + (lines.Count > 0 ? $" at line(s) {string.Join(", ", lines)}" : " (none)")
                    + ". The copy changed in a way the manifest does not list.");
            }

            current = Replace(current, Encoding.UTF8.GetBytes(operation.New), Encoding.UTF8.GetBytes(operation.Old));
        }

        return (current, null);
    }

    /// <summary>Each operation in order, on the reversed bytes: its OLD text must occur exactly as often as listed, and becomes the new text.</summary>
    private static (byte[] Bytes, string? Failure) RedoOperations(Entry entry, byte[] reversed)
    {
        var forward = reversed;
        for (var index = 0; index < entry.Replace.Count; index++)
        {
            var operation = entry.Replace[index];
            var oldBytes = Encoding.UTF8.GetBytes(operation.Old);
            var (found, lines) = Occurrences(forward, oldBytes);
            if (found != operation.Count)
            {
                return (forward,
                    $"{entry.Target}: operation {index + 1} of {entry.Replace.Count} ('{Shown(operation.Old)}' -> '{Shown(operation.New)}') applied to the template finds {found} occurrence(s) of the old text"
                    + (lines.Count > 0 ? $" at line(s) {string.Join(", ", lines)}" : string.Empty)
                    + $", but the manifest lists {operation.Count}: the copy keeps old text the manifest does not account for.");
            }

            forward = Replace(forward, oldBytes, Encoding.UTF8.GetBytes(operation.New));
        }

        return (forward, null);
    }

    private static string? BlobFailure(Entry entry, byte[] reversed) =>
        GitBlobSha(reversed) is var actual && actual != entry.Blob
            ? $"{entry.Target}: with the listed replaces undone, the git blob is {actual}; the manifest says {entry.Blob} (template file {entry.Upstream}). "
                + $"A byte of the copy differs from the template outside the listed replaces. Compare: git -C <dew_flow_mcp> show {entry.Blob} | diff - <(the reversed bytes). "
            : null;

    private static string? ByteFailure(Entry entry, byte[] forward, byte[] committed) =>
        forward.AsSpan().SequenceEqual(committed) ? null : $"{entry.Target}: the listed replaces applied to the template do not give this file byte for byte.";

    private static string Shown(string text) => text.Length <= 60 ? text : text[..57] + "...";

    private static bool IsLowerHex40(string text) => text.Length == 40 && text.All(c => c is (>= '0' and <= '9') or (>= 'a' and <= 'f'));

    /// <summary>The git object id of a file's content: <c>sha1("blob " + length + NUL + bytes)</c>. Not a security use of SHA-1; it is the name git gives the blob.</summary>
    internal static string GitBlobSha(byte[] bytes)
    {
        var header = Encoding.ASCII.GetBytes($"blob {bytes.Length}\0");
#pragma warning disable CA5350 // git names a blob by SHA-1; the manifest's golden value is that name, not a secret or a signature.
        return Convert.ToHexStringLower(SHA1.HashData([.. header, .. bytes]));
#pragma warning restore CA5350
    }

    private static (int Count, List<int> Lines) Occurrences(byte[] haystack, byte[] needle)
    {
        var lines = new List<int>();
        var from = 0;
        while (haystack.AsSpan(from).IndexOf(needle) is var offset and >= 0)
        {
            var at = from + offset;
            lines.Add(1 + haystack.AsSpan(0, at).Count((byte)'\n'));
            from = at + needle.Length;
        }

        return (lines.Count, lines);
    }

    private static byte[] Replace(byte[] haystack, byte[] oldBytes, byte[] newBytes)
    {
        var result = new List<byte>(haystack.Length);
        var from = 0;
        while (haystack.AsSpan(from).IndexOf(oldBytes) is var offset and >= 0)
        {
            result.AddRange(haystack.AsSpan(from, offset));
            result.AddRange(newBytes);
            from += offset + oldBytes.Length;
        }

        result.AddRange(haystack.AsSpan(from));
        return [.. result];
    }

    /// <summary>With a local template checkout named, the first line where the reversed bytes differ from the template's blob; otherwise nothing, and no upstream bytes are read.</summary>
    private static async Task<string> WhereItDiffersAsync(Entry entry, byte[] reversed)
    {
        if (Environment.GetEnvironmentVariable(TemplateRepoVariable) is not { Length: > 0 } repo)
        {
            return $"(Set {TemplateRepoVariable} to a local dew_flow_mcp checkout to name the first differing line.)";
        }

        var (exitCode, stdout, stderr) = await GitCatFileAsync(repo, entry.Blob);
        if (exitCode != 0)
        {
            return $"(git -C {repo} cat-file blob {entry.Blob} failed: {stderr.Trim()})";
        }

        var template = stdout.Split('\n');
        var mine = Encoding.UTF8.GetString(reversed).Split('\n');
        for (var line = 0; line < Math.Max(template.Length, mine.Length); line++)
        {
            var left = line < template.Length ? template[line] : "<end of file>";
            var right = line < mine.Length ? mine[line] : "<end of file>";
            if (left != right)
            {
                return $"First differing line {line + 1}: template '{Shown(left)}' vs copy (listed replaces undone) '{Shown(right)}'.";
            }
        }

        return "(Line by line the text is equal: the difference is a line ending or a trailing byte.)";
    }

    /// <summary>One <c>git cat-file blob</c> in a local checkout, bounded by thirty seconds, the tree killed if it does not end.</summary>
    private static async Task<(int ExitCode, string StdOut, string StdErr)> GitCatFileAsync(string repo, string blob)
    {
        var start = new ProcessStartInfo("git") { RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false };
        foreach (var argument in new[] { "-C", repo, "cat-file", "blob", blob })
        {
            start.ArgumentList.Add(argument);
        }

        using var process = Process.Start(start) ?? throw new InvalidOperationException("git did not start");
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(TestContext.Current.CancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(30));
        try
        {
            var stdout = process.StandardOutput.ReadToEndAsync(timeout.Token);
            var stderr = process.StandardError.ReadToEndAsync(timeout.Token);
            await process.WaitForExitAsync(timeout.Token);
            return (process.ExitCode, await stdout, await stderr);
        }
        catch (OperationCanceledException)
        {
            process.Kill(entireProcessTree: true);
            return (-1, string.Empty, "git cat-file did not end in thirty seconds");
        }
    }
}
