using FluentAssertions;
using Xunit;

namespace CredsForDevs.Tests.Leftovers;

/// <summary>
/// The copied guard's reading of THIS repository's file kinds (E2.5.S1): creds' own plants, in a scratch tree, each asserted as the exact list of
/// <c>file:line:class</c>. Creds-owned, never a copy: the template's <c>LeftoversGuardTests</c> reads the template's tree.
/// <para>THIS FILE IS SCANNED BY THE GUARD LIKE ANY OTHER <c>.cs</c> OF THE TESTS (F2), with the folded reading on, and it is not one of
/// <see cref="LeftoversGuard.FoldingAllowances"/>. So no literal here holds the prefix word, a piece of it or the exempt marker (they are built from
/// <see cref="LeftoversGuard.CamelWord"/> and <see cref="LeftoversGuard.Word"/>); every plant line that the guard reads as a temp site carries a marker
/// above it; and every docker plant is split with <c>+</c> inside its docker words. The last case scans this very text.</para>
/// </summary>
public sealed class LeftoversGuardCredsTests : IDisposable
{
    /// <summary>The prefix word as a person writes it, built (never a literal) so the guard reads none of this file's lines as the word.</summary>
    private static readonly string P = LeftoversGuard.CamelWord;

    private static readonly string Marker = P + "-exempt:";

    private const string ThisFile = "src_service_defaults/tests/Leftovers/LeftoversGuardCredsTests.cs";

    // The plants. Every line the guard reads as a temp site has its marker above it; the marker keeps THIS file clean, the scratch copy has none of them.
    // testsToDelete-exempt: raw-temp — a planted temp-path call: the scan must find it in the scratch copy
    private const string TempCallJs = "const d = fs.mkdtempSync(path.join(os.tmpdir(), 'x'));";

    // testsToDelete-exempt: raw-temp — a planted temp-path call: the scan must find it in the scratch copy
    private const string TempCallCs = "var d = Path.GetTempPath();";

    private const string ComposeProjectFlag = "pose -p ";

    private readonly OwnedScope _owned = new();

    public void Dispose() => _owned.Dispose();

    // ---- raw-temp: the file kinds of this tree --------------------------------------------------------------------------------

    [Fact]
    public void A_temp_call_in_a_harness_script_of_the_extension_is_one_raw_temp_finding()
    {
        var report = Scan(("src_vs_code/scripts/x.cjs", TempCallJs));

        Found(report).Should().Equal("src_vs_code/scripts/x.cjs:1:raw-temp");
    }

    [Fact]
    public void A_temp_call_in_a_test_helper_that_is_not_a_test_of_the_extension_is_one_raw_temp_finding()
    {
        var report = Scan(("src_vs_code/src/test/xWorld.ts", TempCallJs));

        report.FilesScanned.Should().Be(1, "a .ts helper under src/test/ is read as a script");
        Found(report).Should().Equal("src_vs_code/src/test/xWorld.ts:1:raw-temp");
    }

    [Fact]
    public void A_test_file_of_the_extension_is_not_discovered_because_it_is_the_Node_guards()
    {
        var report = Scan(("src_vs_code/src/test/x.test.ts", TempCallJs));

        report.FilesScanned.Should().Be(0, "the shipped Node guard reads *.test.ts; reading it here too would count every finding twice");
        report.Findings.Should().BeEmpty();
    }

    [Fact]
    public void A_temp_call_in_a_test_of_a_client_project_is_one_raw_temp_finding()
    {
        var report = Scan(("src_cli/tests/X.cs", TempCallCs));

        Found(report).Should().Equal("src_cli/tests/X.cs:1:raw-temp");
    }

    // ---- owner-blind: the folded reading of a .cs ----------------------------------------------------------------------------

    [Fact]
    public void A_prefix_word_split_in_two_joined_literals_in_a_test_of_a_client_project_is_one_owner_blind_finding()
    {
        var report = Scan(("src_cli/tests/Y.cs", SplitPrefix()));

        Found(report).Should().Equal("src_cli/tests/Y.cs:1:owner-blind");
        report.Findings.Single().Text.Should().Contain(P[..7], "the finding names what the folded reading joined");
    }

    [Fact]
    public void A_reference_to_the_helpers_prefix_constant_outside_the_helper_in_another_project_is_one_owner_blind_finding()
    {
        var report = Scan(("src_mcp/tests/X.cs", "var p = Owned.Prefix;"));

        Found(report).Should().Equal("src_mcp/tests/X.cs:1:owner-blind");
    }

    // ---- the docker classes ----------------------------------------------------------------------------------------------------

    [Fact]
    public void A_compose_project_that_is_not_an_owner_form_name_is_one_docker_name_finding()
    {
        Found(Scan(("deploy/acme-test/run.sh", Compose("cred-vault-acme-test up -d")))).Should().Equal("deploy/acme-test/run.sh:1:docker-name");
    }

    [Fact]
    public void A_compose_project_from_a_variable_or_in_the_owner_form_is_no_finding()
    {
        Found(Scan(("deploy/acme-test/run.sh", Compose("\"$PROJECT\" up -d")))).Should().BeEmpty("a variable is read by the shipped scan as a name some other line decides");
        Found(Scan(("deploy/acme-test/run.sh", Compose(LeftoversGuard.Word + "-u1001-creds-acme-abcd1234 up -d")))).Should().BeEmpty("a literal owner-form project");
    }

    [Fact]
    public void The_real_docker_workflow_is_judged_by_the_Node_guard_so_this_one_reads_no_docker_class_in_it()
    {
        var report = Scan((".github/workflows/docker.yml", RealDockerWorkflow()));

        report.FilesScanned.Should().Be(1);
        report.Findings.Should().BeEmpty("the carve-out of rule §5 is read by the shipped Node guard, which is green on the file; the copy does not know the carve-out");
    }

    [Fact]
    public void The_exclusion_of_the_docker_classes_is_one_pinned_workflow_that_exists_and_no_file_is_excluded()
    {
        LeftoversGuard.DockerJudgedByNodeGuard.Should().Equal(".github/workflows/docker.yml");
        LeftoversGuard.DockerJudgedByNodeGuard.Should().OnlyContain(file => File.Exists(Path.Combine(RepositoryRoot.Path, file.Replace('/', Path.DirectorySeparatorChar))));
        LeftoversGuard.ExcludedFiles.Should().BeEmpty("the docker exclusion hides two classes of one file; no file is skipped whole");
    }

    [Fact]
    public void The_same_text_under_another_workflow_name_keeps_both_docker_run_findings()
    {
        var report = Scan((".github/workflows/other.yml", RealDockerWorkflow()));

        report.Findings.Select(f => f.Class).Should().Equal("docker-run", "docker-run");
        report.Findings.Select(f => f.File).Distinct().Should().ContainSingle().Which.Should().Be(".github/workflows/other.yml", "the exclusion is by name, one pinned entry");
    }

    // ---- a valid marker silences a class; the finding comes back without it -----------------------------------------------------

    [Theory]
    [InlineData("src_vs_code/scripts/x.cjs", "//", "js")]
    [InlineData("src_vs_code/src/test/xWorld.ts", "//", "js")]
    [InlineData("src_cli/tests/X.cs", "//", "cs")]
    public void A_valid_marker_above_a_temp_site_silences_it_and_the_bare_line_is_a_finding(string path, string comment, string kind)
    {
        var line = kind == "cs" ? TempCallCs : TempCallJs;

        Found(Scan((path, line))).Should().Equal(path + ":1:raw-temp");
        Found(Scan((path, comment + " " + Marker + " raw-temp — a planted site, silenced in the scratch tree\n" + line))).Should().BeEmpty();
    }

    [Fact]
    public void A_valid_marker_above_a_docker_name_silences_it()
    {
        var path = "deploy/acme-test/run.sh";
        var bare = Compose("cred-vault-acme-test up -d");

        Found(Scan((path, bare))).Should().Equal(path + ":1:docker-name");
        Found(Scan((path, "# " + Marker + " docker-name — a planted project, silenced in the scratch tree\n" + bare))).Should().BeEmpty();
    }

    [Fact]
    public void A_marker_never_silences_owner_blind()
    {
        var report = Scan(("src_cli/tests/Y.cs", "// " + Marker + " owner-blind — a planted word, not exemptible at all\n" + SplitPrefix()));

        Found(report).Should().Contain("src_cli/tests/Y.cs:1:exemption").And.Contain("src_cli/tests/Y.cs:2:owner-blind");
    }

    // ---- the wrapper's folding allowance has no effect at the pin (S1.5, F10) -------------------------------------------------------

    [Fact]
    public void The_wrappers_allowance_changes_no_answer_at_the_pin_because_the_copy_folds_only_cs()
    {
        LeftoversGuard.FoldingAllowances.Should().Contain("src_vs_code/scripts/lib/leftovers.cjs", "the wrapper is the fifth file that may spell the word in pieces (D7)");

        var plant = SplitPrefix();
        var wrapper = Found(Scan(("src_vs_code/scripts/lib/leftovers.cjs", plant)));
        var other = Found(Scan(("src_vs_code/scripts/lib/other.cjs", plant)));

        wrapper.Should().BeEmpty("the copy folds .cs only, so a .cjs is not folded at the pin");
        other.Should().Equal(wrapper, "the allowance has no effect today; a template that folds JavaScript makes this case red and the allowance's effect visible");
    }

    // ---- this file is scanned clean --------------------------------------------------------------------------------------------

    [Fact]
    public void This_file_scans_clean_at_its_own_relative_path()
    {
        var report = Scan((ThisFile, File.ReadAllText(Path.Combine(RepositoryRoot.Path, ThisFile.Replace('/', Path.DirectorySeparatorChar)))));

        report.FilesScanned.Should().Be(1, "the file is read like any other .cs of the tests");
        report.Findings.Should().BeEmpty(string.Join("; ", report.Findings.Select(f => f.ToString())));
    }

    // ---- helpers -------------------------------------------------------------------------------------------------------------------

    /// <summary>The prefix word split in two joined literals, as a .cs or a .cjs would spell it - built, never written.</summary>
    private static string SplitPrefix() => "var p = \"" + P[..7] + "\" + \"" + P[7..] + "-agent-x\";";

    /// <summary>A compose command, split inside its docker words so this file's own docker classes read none of it.</summary>
    private static string Compose(string rest) => "docker com" + ComposeProjectFlag + rest;

    private static string RealDockerWorkflow() => File.ReadAllText(Path.Combine(RepositoryRoot.Path, ".github", "workflows", "docker.yml"));

    private static string[] Found(GuardReport report) => [.. report.Findings.Select(f => $"{f.File}:{f.Line}:{f.Class}")];

    /// <summary>The guard over a scratch tree of the given files, the shipped classifier read from the real mount.</summary>
    private GuardReport Scan(params (string Path, string Text)[] files)
    {
        var root = _owned.Dir("creds-guard-tree");
        foreach (var (relative, text) in files)
        {
            var full = Path.Combine(root, relative.Replace('/', Path.DirectorySeparatorChar));
            Directory.CreateDirectory(Path.GetDirectoryName(full)!);
            File.WriteAllText(full, text);
        }

        return LeftoversGuard.Scan(root, RepositoryRoot.Path);
    }
}
