using System.Diagnostics;
using FluentAssertions;
using Xunit;

namespace CredsForDevs.Tests.Leftovers;

/// <summary>The guard of rule §7 over this repository's tests, scripts and CI (S4 scenarios 3-6). THIS FILE IS SCANNED LIKE ANY OTHER:
/// the violations it carries as fixture strings are spelled in pieces (<see cref="Fx"/>, and the prefix word is the variable
/// <c>P</c>), so the guard reads none of them as the word, and a test pins that the exclusion list stays empty. Every
/// tree is written at run time into a private <see cref="OwnedDir"/>; the scripts in it are judged by the SHIPPED classifier
/// through the real mount, so each expected count is what the mount's own scan prints for the same text.</summary>
public sealed class LeftoversGuardTests : IDisposable
{
    private static readonly string P = "testsTo" + "Delete";
    private static readonly string Lower = P.ToLowerInvariant();
    private static readonly string Marker = P + "-exempt:";

    private readonly OwnedScope _owned = new();

    public void Dispose() => _owned.Dispose();

    // ---- 3: break-it per class ----------------------------------------------------------------------------------------

    public static TheoryData<string, string, string, string> BreakIt()
    {
        var d = new TheoryData<string, string, string, string>();
        void Add(string id, string file, string text, string expected) => d.Add(Fx(id), file, Fx(text), expected);

        // raw-temp
        Add("cs create-temp-subdirectory", "tests/X/A.cs", "var d = Directory.Create§TempSubdirectory(\"x\");", "raw-temp");
        Add("cs get-temp-path without a call", "tests/X/A.cs", "var f = Path.GetTemp§Path;", "raw-temp");
        Add("cs get-temp-path2", "tests/X/A.cs", "var f = Path.GetTemp§Path2();", "raw-temp");
        Add("cs get-temp-file-name", "tests/X/A.cs", "var f = Path.GetTemp§FileName();", "raw-temp");
        Add("cs env TMPDIR", "tests/X/A.cs", "var t = Environment.GetEnvironmentVariable(\"TMPDIR\");", "raw-temp");
        Add("cs env TEMP", "tests/X/A.cs", "var t = Environment.GetEnvironmentVariable( \"TEMP\" );", "raw-temp");
        Add("cs RUNNER_TEMP is not one", "tests/X/A.cs", "var t = Environment.GetEnvironmentVariable(\"RUNNER_TEMP\");", "");
        Add("sh mktemp", "a.sh", "d=$(mktemp -d)", "raw-temp");
        Add("workflow mktemp", ".github/workflows/w.yml", "      - run: d=$(mktemp -d)", "raw-temp");
        Add("ps1 $env:TEMP", "b.ps1", "$d = $env:TEMP", "raw-temp");
        Add("ps1 New-TemporaryFile", "b.ps1", "$f = New-TemporaryFile", "raw-temp");
        Add("mjs mkd§tempSync", ".github/scripts/a.mjs", "const d = fs.mkd§tempSync(path.join(base, 'x-'));", "raw-temp");
        Add("mjs tmpdir", ".github/scripts/a.mjs", "const d = os.tmp§dir();", "raw-temp");
        Add("mjs process.env.§TMPDIR", ".github/scripts/a.mjs", "const d = process.env.§TMPDIR;", "raw-temp");
        Add("py mkd§temp", "c.py", "d = tempfile.mkd§temp()", "raw-temp");
        Add("py temp_dir", "c.py", "d = temp§_dir()", "raw-temp");
        Add("sh mktemp is not a cs word", "tests/X/A.cs", "var s = \"mktemp\";", "");

        // raw-worktree
        Add("cs work§tree add", "tests/X/A.cs", "Run(\"git\", \"work§tree\", \"add\", dir);", "raw-worktree");
        Add("sh git work§tree add", "a.sh", "git work§tree add x", "raw-worktree");

        // docker-run and docker-name
        Add("docker r§un without --rm", ".github/workflows/w.yml", "      - run: docker r§un -d img", "docker-run");
        Add("docker r§un --rm owner-form name", ".github/workflows/w.yml", $"      - run: docker r§un --rm --na§me {P}-u1000-mcp-x-abc123 img", "");
        Add("docker r§un --rm unowned name", ".github/workflows/w.yml", "      - run: docker r§un --rm --na§me cache img", "docker-name");
        Add("docker r§un --rm legacy name", ".github/workflows/w.yml", $"      - run: docker r§un --rm --na§me {P}-mcp-x-abc123 img", "docker-name,legacy-name");
        Add("docker name is a whole expansion", "a.sh", "docker r§un --rm --na§me \"${name}\" img", "");
        Add("docker name is a command substitution", "a.sh", "docker r§un --rm --na§me \"$(mk name)\" img", "");
        Add("docker name default that is not an owner form", "a.sh", "docker r§un --rm --na§me \"${NAME:-cache}\" img", "docker-name");
        Add("docker volume cre§ate", "a.sh", "docker volume cre§ate cache", "docker-name");
        Add("docker network cre§ate with an option", "a.sh", "docker network cre§ate --driver bridge cache", "docker-name");
        Add("docker volume cre§ate owner form", "a.sh", $"docker volume cre§ate {P}-u1000-mcp-v-abc123", "");
        Add("cs WithName", "tests/X/A.cs", "var b = new Builder().With§Name(\"pg\");", "docker-name");
        Add("cs WithName owner form", "tests/X/A.cs", $"var b = new Builder().With§Name(\"{P}-u1000-mcp-pg-abc123\");", "");
        Add("docker comp§ose -p", "a.sh", "docker comp§ose -p cache up", "docker-name");
        Add("docker comp§ose --project-name", "a.sh", "docker comp§ose --project-name=cache up", "docker-name");
        Add("COMPOSE_PROJECT§_NAME", ".github/workflows/w.yml", "        COMPOSE_PROJECT§_NAME: cache", "docker-name");
        Add("docker bu§ild -t", "a.sh", "docker bu§ild -t cache .", "docker-name");

        // shared-store, ryuk-off
        Add("TRUN§CATE TABLE", ".github/workflows/w.yml", "      - run: psql -c \"TRUN§CATE TABLE users\"", "shared-store");
        Add("DR§OP DATABASE", "a.sh", "psql -c 'DR§OP DATABASE shop'", "shared-store");
        Add("DR§OP TABLE of an owner-form name", "a.sh", $"psql -c 'DR§OP TABLE {P}-u1000-mcp-t-abc123'", "");
        Add("FLUSH§ALL", "a.sh", "redis-cli FLUSH§ALL", "shared-store");
        Add("deleteMany all", ".github/scripts/a.mjs", "await coll.delete§Many({});", "shared-store");
        Add("the prose word truncated", "tests/X/A.cs", "var s = \"the output was truncated\";", "");
        Add("a commented truncate", "tests/X/A.cs", "// TRUN§CATE TABLE users", "");
        Add("ryuk off", ".github/workflows/w.yml", "        TESTCONTAINERS_RYUK_DISABLED: \"true\"", "ryuk-off");
        Add("ryuk on", ".github/workflows/w.yml", "        TESTCONTAINERS_RYUK_DISABLED: \"false\"", "");

        // exemptions
        Add("exempt raw-temp", "tests/X/A.cs", $"// {Marker} raw-temp — the one place a test learns the temp root\nvar t = Path.GetTemp§Path();", "");
        Add("exempt raw-temp on the same line", "tests/X/A.cs", $"var t = Path.GetTemp§Path(); // {Marker} raw-temp — the one place a test learns the temp root", "");
        Add("exempt raw-temp in a block comment", "tests/X/A.cs", $"/* {Marker} raw-temp — the one place a test learns the temp root */\nvar t = Path.GetTemp§Path();", "");
        Add("exempt two lines above does not reach", "tests/X/A.cs", $"// {Marker} raw-temp — the one place a test learns the temp root\n\nvar t = Path.GetTemp§Path();", "raw-temp");
        Add("exempt for another class does not reach", "tests/X/A.cs", $"// {Marker} raw-worktree — the one place a test learns the temp root\nvar t = Path.GetTemp§Path();", "raw-temp");
        Add("exempt with a placeholder reason", "tests/X/A.cs", $"// {Marker} raw-temp — needed\nvar t = Path.GetTemp§Path();", "exemption,raw-temp");
        Add("exempt with a todo reason", "tests/X/A.cs", $"// {Marker} raw-temp — todo fix this later on\nvar t = Path.GetTemp§Path();", "exemption,raw-temp");
        Add("exempt with two words", "tests/X/A.cs", $"// {Marker} raw-temp — only twowords\nvar t = Path.GetTemp§Path();", "exemption,raw-temp");
        Add("exempt with an unknown class", "tests/X/A.cs", $"// {Marker} nonsense — a perfectly fine reason here\nvar t = Path.GetTemp§Path();", "exemption,raw-temp");
        Add("exempt with no class", "tests/X/A.cs", $"// {Marker}\nvar t = Path.GetTemp§Path();", "exemption,raw-temp");
        Add("exempt shared-store with a lock", "a.sh", $"-- {Marker} shared-store — pg:5432 users; reuse intentional; lock: pg_advisory_lock(42)\npsql -c 'TRUN§CATE TABLE users'", "");
        Add("exempt shared-store without a lock", "a.sh", $"-- {Marker} shared-store — pg:5432 users; reuse intentional\npsql -c 'TRUN§CATE TABLE users'", "exemption,shared-store");
        Add("ryuk-off under another class's exemption", ".github/workflows/w.yml", $"        # {Marker} shared-store — pg:5432 users; reuse intentional; lock: pg_advisory_lock(42)\n        TESTCONTAINERS_RYUK_DISABLED: \"true\"", "ryuk-off");
        Add("ryuk-off under its own exemption", ".github/workflows/w.yml", $"        # {Marker} ryuk-off — the reaper is slow on this runner\n        TESTCONTAINERS_RYUK_DISABLED: \"true\"", "exemption,ryuk-off");

        // comments
        Add("a commented-out raw-temp", "tests/X/A.cs", "// Directory.Create§TempSubdirectory(\"x\")", "");
        Add("a doc-commented raw-temp", "tests/X/A.cs", "/// Directory.Create§TempSubdirectory(\"x\")", "");
        Add("a shell comment", "a.sh", "# mktemp -d", "");
        Add("a block comment on one line", "tests/X/A.cs", "/* Path.GetTemp§Path() */", "");
        Add("a block comment over three lines", "tests/X/A.cs", "/*\n Path.GetTemp§Path()\n*/", "");
        Add("code after a block comment closes", "tests/X/A.cs", "/* x */ var t = Path.GetTemp§Path();", "raw-temp");
        Add("a slash-star inside a string opens nothing", "tests/X/A.cs", "var glob = \"src/**/*.cs\"; var t = Path.GetTemp§Path();", "raw-temp");
        Add("a slash-star inside a verbatim string opens nothing", "tests/X/A.cs", "var s = @\"a \"\"/*\"\" b\"; var t = Path.GetTemp§Path();", "raw-temp");
        Add("a slash-star inside a char literal pair opens nothing", "tests/X/A.cs", "var c = '/'; var d = '*'; var t = Path.GetTemp§Path();", "raw-temp");
        Add("a quote char literal opens no string", "tests/X/A.cs", "var q = '\"'; /* x */ var t = Path.GetTemp§Path();", "raw-temp");
        Add("a slash-star inside a line comment opens nothing", "tests/X/A.cs", "// see /* here\nvar t = Path.GetTemp§Path();", "raw-temp");
        Add("a block comment in mjs", ".github/scripts/a.mjs", "/* os.tmp§dir() */", "");
        Add("a template string holding a slash-star in mjs", ".github/scripts/a.mjs", "const g = `src/**/*.cs`; const d = os.tmp§dir();", "raw-temp");

        // legacy-name, owner-blind in .cs (decision 3)
        Add("legacy literal", "tests/X/A.cs", $"var n = \"{P}-mcp-x-abc123\";", "legacy-name,owner-blind");
        Add("legacy literal exempted", "tests/X/A.cs", $"// {Marker} legacy-name — a fixture of the form before the owner\nvar n = \"{P}-mcp-x-abc123\";", "owner-blind");
        Add("a prefix built from the token", "tests/X/A.cs", $"var n = $\"{P}-{{RepoToken}}-\";", "legacy-name,owner-blind");
        Add("the exempt marker word", "tests/X/A.cs", $"var n = \"{P}-exempt:\";", "");
        Add("a quarantine sibling name", "tests/X/A.cs", $"var n = \".x.{Lower}-quarantine-1-ab\";", "");
        Add("the owner environment variable", "tests/X/A.cs", "var n = \"TESTSTODELETE_OWNER\";", "");
        Add("a bare prefix with a dash", "tests/X/A.cs", $"var n = \"{P}-\";", "owner-blind");
        Add("a bare lower-case prefix with an underscore", "tests/X/A.cs", $"var n = \"{Lower}_\";", "owner-blind");
        Add("an owner-form literal", "tests/X/A.cs", $"var n = \"{P}-u1000-\";", "");
        Add("an owner-form literal of the windows form", "tests/X/A.cs", $"var n = \"{P}-w4294967295-\";", "");
        Add("a bare prefix concatenated", "tests/X/A.cs", $"var n = \"{P}-\" + x;", "owner-blind");
        Add("a constant carrying the prefix", "tests/X/A.cs", $"private const string P = \"{P}-\";", "owner-blind");
        Add("the bare prefix in the helper file", "src_service_defaults/tests/Support/Leftovers/Owned.cs", $"public const string Prefix = \"{P}-\";", "");
        Add("the bare prefix in src", "src/Y/Y.cs", $"var n = \"{P}-\";", "owner-blind");
        Add("the bare prefix, no exemption of any kind", "tests/X/A.cs", $"// {Marker} owner-blind — any reason at all here\nvar n = \"{P}-\";", "exemption,owner-blind");
        Add("a reference to Owned.Prefix outside the helper", "tests/X/A.cs", "var p = Owned.Prefix + what;", "owner-blind");
        Add("a reference to Owned.Prefix in the helper's folder", "src_service_defaults/tests/Support/Leftovers/X.cs", "var p = Owned.Prefix + what;", "");
        Add("a reference to Owned.LegacyPattern in src", "src/Y/Y.cs", "var m = Owned.LegacyPattern.IsMatch(n);", "owner-blind");
        Add("a commented reference to Owned.Prefix", "tests/X/A.cs", "// var p = Owned.Prefix + what;", "");
        Add("a reference to Owned.NameBase is how a test builds a name", "tests/X/A.cs", "var p = Owned.NameBase + what;", "");
        Add("src is read for the literal classes only", "src/Y/Y.cs", "var d = Directory.Create§TempSubdirectory(\"x\");", "");

        // owner-blind in .cs: the word itself, whatever follows it (a glob, a class, a pattern, a bare word)
        Add("a directory listing by the bare word and a star", "tests/X/A.cs", $"foreach (var d in Directory.GetDirectories(Owned.TempRoot(), \"{P}*\")) Directory.Delete(d, true);", "owner-blind,raw-temp");
        Add("a pattern over the bare word with a question mark", "tests/X/A.cs", $"var hits = Directory.GetDirectories(root, \"{P}?\");", "owner-blind");
        Add("a regex over the word and a class separator", "tests/X/A.cs", $"var r = new Regex(\"^{Lower}[-_]mcp[-_]\");", "owner-blind");
        Add("the word and its separator in two literals", "tests/X/A.cs", $"var n = \"{P}\" + \"-\";", "owner-blind");
        Add("the word interpolated and a separator after it", "tests/X/A.cs", "var n = $\"{\"" + P + "\"}-\";", "owner-blind");
        Add("the bare word alone", "tests/X/A.cs", $"var n = \"{P}\";", "owner-blind");
        Add("the bare word in a verbatim string", "tests/X/A.cs", $"var n = @\"{Lower}*\";", "owner-blind");
        Add("an owner-form glob", "tests/X/A.cs", $"var hits = Directory.GetDirectories(root, \"{P}-u1000-*\");", "");
        Add("an owner-form regex", "tests/X/A.cs", $"var r = new Regex(\"^{Lower}[-_]u1000[-_]\");", "");
        Add("the owner environment variable in a call", "tests/X/A.cs", "var v = Environment.GetEnvironmentVariable(\"TESTSTODELETE_RUN\");", "");
        Add("a lower-case environment name is not the variable", "tests/X/A.cs", $"var v = \"{Lower}_run\";", "legacy-name,owner-blind");
        Add("the bare word in a script is the classifier's, not the C# rule's", "a.sh", $"echo {P}", "");

        // the guard reads a literal the way the compiler does: a word cannot be hidden by how it is spelled
        var head = P[..7];
        var tail = P[7..];
        Add("the word split over a plus", "tests/X/A.cs", $"var n = \"{head}\" + \"{tail}-\";", "owner-blind");
        Add("the word split over string.Concat", "tests/X/A.cs", $"var n = string.Concat(\"{head}\", \"{tail}-*\");", "owner-blind");
        Add("the word split over interpolation holes", "tests/X/A.cs", "var n = $\"{\"" + head + "\"}{\"" + tail + "-\"}\";", "owner-blind");
        Add("the word with a unicode escape in it", "tests/X/A.cs", $"var n = \"tests\\u0054o{tail}-*\";", "owner-blind");
        Add("the word with a hex escape in it", "tests/X/A.cs", $"var n = \"tests\\x54o{tail}-\";", "owner-blind");
        Add("the word with a character literal between its halves", "tests/X/A.cs", $"var n = \"tests\" + 'T' + \"o{tail}-\";", "owner-blind");
        Add("the word with a one-character regex class", "tests/X/A.cs", $"var r = @\"^tests[T]o{tail}-\";", "owner-blind");
        Add("the word split over a plus, an owner after it", "tests/X/A.cs", $"var n = \"{head}\" + \"{tail}-u1000-\";", "");
        Add("a half of the word on its own", "tests/X/A.cs", $"var half = \"{head}\"; var rest = \"{tail}-\";", "owner-blind");
        Add("a middle piece of the word in capitals", "tests/X/A.cs", $"var piece = \"{P[3..10].ToUpperInvariant()}\";", "owner-blind");
        Add("a half of the word in src", "src/Y/Y.cs", $"var half = \"{head}\";", "owner-blind");
        Add("the two plain words of the prefix are words", "tests/X/A.cs", "var a = \"tests\"; var b = \"Delete\"; var c = \"tests/Mcp.Tests/A.cs\";", "");
        Add("the word split over a plus in the helper file", "src_service_defaults/tests/Support/Leftovers/Owned.cs", $"var n = \"{head}\" + \"{tail}-\";", "");
        Add("the word split over a plus in the guard's fixture file", "src_service_defaults/tests/Leftovers/LeftoversGuardTests.cs", $"var n = \"{head}\" + \"{tail}-\";", "");
        Add("the word split over a plus in a third file of the folder", "src_service_defaults/tests/Support/Leftovers/LeftoversSweep.cs", $"var n = \"{head}\" + \"{tail}-\";", "owner-blind");
        Add("a path under the raw temp root", "tests/X/A.cs", "Directory.CreateDirectory(Path.Combine(\"/tmp\", \"x\"));", "raw-temp");
        Add("a path under the other raw temp root", "tests/X/A.cs", "var d = \"/var/tmp/x\";", "raw-temp");
        Add("the raw temp root in two literals", "tests/X/A.cs", "var d = \"/t\" + \"mp\";", "raw-temp");
        Add("the temp variable named in two literals", "tests/X/A.cs", "var t = Environment.GetEnvironmentVariable(\"TM\" + \"P\");", "raw-temp");
        Add("the temp variable named with an escape", "tests/X/A.cs", "var t = Environment.GetEnvironmentVariable(\"TMP\\u0044IR\");", "raw-temp");
        Add("a file called tmpfile is not the temp root", "tests/X/A.cs", "var d = \"/tmpfile\"; var e = \"my/tmp-file\";", "");
        Add("a commented temp root", "tests/X/A.cs", "// var d = \"/tmp\";", "");
        Add("an escape that is no character does not break the scan", "tests/X/A.cs", "var s = \"\\uD800 \\U00110000 \\q\" + 'x' + \"unterminated;", "");
        Add("the raw temp root in src is read for the literal classes only", "src/Y/Y.cs", "var d = \"/tmp\";", "");

        // Owned.TempRoot() is the temp root: outside the helper's folder it is a raw-temp finding like any other spelling of it
        Add("a folder made under Owned.TempRoot outside the helper", "tests/X/A.cs", "Directory.CreateDirectory(Path.Combine(Owned.TempRoot(), \"x\"));", "raw-temp");
        Add("Owned.TempRoot in src", "src/Y/Y.cs", "var root = Owned.TempRoot();", "raw-temp");
        Add("Owned.TempRoot in the helper's folder", "src_service_defaults/tests/Support/Leftovers/X.cs", "var root = Owned.TempRoot();", "");
        Add("a read-only use of Owned.TempRoot, exempted with a reason", "tests/X/A.cs", $"// {Marker} raw-temp — a read-only use, nothing is made there\nvar root = Owned.TempRoot();", "");
        Add("a commented Owned.TempRoot", "tests/X/A.cs", "// var root = Owned.TempRoot();", "");

        // scripts, judged by the shipped classifier through node
        Add("sh rm -rf glob", "a.sh", $"rm -rf \"$TMPDIR\"/{P}-*", "owner-blind");
        Add("sh find -name class", "a.sh", $"find /tmp -name '{Lower}[-_]*' -delete", "owner-blind");
        Add("sh a bare u glob", "a.sh", $"rm -rf /tmp/{P}-u*", "legacy-name,owner-blind");
        Add("sh a quoted owner reads as broad: the quote is not an owner start (the plan expected 0)", "a.sh", $"rm -rf /tmp/{P}-\"$OWNER\"-*", "owner-blind");
        Add("sh a bare variable owner", "a.sh", $"rm -rf /tmp/{P}-$OWNER-*", "");
        Add("sh a braced owner", "a.sh", $"rm -rf /tmp/{P}-${{OWNER}}-*", "");
        Add("sh a literal first segment that no owner can start with", "a.sh", $"rm -rf /tmp/{P}-conventions-*", "legacy-name");
        Add("sh a variable held on another line", "a.sh", $"P='{P}-'\necho x\nrm -rf \"$P\"*", "owner-blind");
        Add("mjs a const held on another line and removed", ".github/scripts/a.mjs", $"const P = \"{P}-\";\nfor (const n of names) fs.rmSync(P + n);", "owner-blind");
        Add("mjs a glob built by concatenation is a documented limit of the shipped tracer", ".github/scripts/a.mjs", $"const P = \"{P}-\";\nconst hits = glob(P + \"*\");", "");
        Add("ps1 a variable held on another line", "b.ps1", $"$P = \"{P}-\"\nRemove-Item \"$P*\"", "owner-blind");
        Add("py a variable held on another line and removed", "c.py", $"P = \"{P}-\"\nfor n in names: shutil.rmtree(P + n)", "owner-blind");
        Add("py a glob built by concatenation is a documented limit of the shipped tracer", "c.py", $"P = \"{P}-\"\nglob.glob(P + \"*\")", "");
        Add("workflow run block", ".github/workflows/w.yml", $"      - run: rm -rf /tmp/{P}-*", "owner-blind");
        Add("a name, not a pattern", "a.sh", $"echo \"{P}-u1000-mcp-x-abc123\"", "");
        Add("a script comment is not read", "a.sh", $"# rm -rf /tmp/{P}-*", "");

        return d;
    }

    [Theory]
    [MemberData(nameof(BreakIt))]
    public void Each_class_is_found_where_it_is_written_and_nowhere_else(string id, string file, string text, string expected)
    {
        var root = Tree((file, text));

        var report = LeftoversGuard.Scan(root, RepositoryRoot.Path);

        report.FilesScanned.Should().Be(1, id);
        Classes(report).Should().Be(expected, $"{id}: {Show(report)}");
    }

    [Fact]
    public void A_finding_names_the_file_the_line_and_the_class()
    {
        var root = Tree(("tests/X/A.cs", "var a = 1;\nvar b = 2;\nvar t = Path.GetTemp§Path();\n"));

        var finding = LeftoversGuard.Scan(root, RepositoryRoot.Path).Findings.Should().ContainSingle().Subject;

        finding.File.Should().Be("tests/X/A.cs");
        finding.Line.Should().Be(3);
        finding.Class.Should().Be("raw-temp");
        finding.Text.Should().Contain(Fx("GetTemp§Path"));
    }

    [Fact]
    public void Code_after_a_block_comment_that_closes_on_its_line_is_found_at_that_line()
    {
        var root = Tree(("tests/X/A.cs", "/*\n x\n*/ var t = Path.GetTemp§Path();\n"));

        LeftoversGuard.Scan(root, RepositoryRoot.Path).Findings.Should().ContainSingle().Which.Line.Should().Be(3);
    }

    [Fact]
    public void A_script_finding_is_reported_at_the_use_not_at_the_assignment()
    {
        var root = Tree(("a.sh", $"P='{P}-'\necho x\nrm -rf \"$P\"*\n"));

        LeftoversGuard.Scan(root, RepositoryRoot.Path).Findings.Should().ContainSingle().Which.Line.Should().Be(3);
    }

    [Fact]
    public void A_line_that_breaks_a_class_twice_is_one_finding_of_that_class()
    {
        var root = Tree(("tests/X/A.cs", "var a = Path.GetTemp§Path() + Path.GetTemp§FileName();"));

        LeftoversGuard.Scan(root, RepositoryRoot.Path).Findings.Should().ContainSingle().Which.Class.Should().Be("raw-temp");
    }

    [Fact]
    public void A_file_under_a_build_output_is_not_scanned_and_the_folders_that_are_not_ours_are_never_entered()
    {
        var violation = "var t = Path.GetTemp§Path();";
        var root = Tree(
            ("tests/X/A.cs", "var ok = 1;"),
            ("tests/X/bin/Debug/B.cs", violation),
            ("tests/X/obj/C.cs", violation),
            ("http/node_modules/pkg/index.mjs", "const d = os.tmp§dir();"),
            (".git/hooks/x.sh", "d=$(mktemp -d)"),
            (".agents/conventions/tools/x.sh", "d=$(mktemp -d)"),
            (".http-artifacts/x.sh", "d=$(mktemp -d)"),
            ("logs/x.sh", "d=$(mktemp -d)"));

        var report = LeftoversGuard.Scan(root, RepositoryRoot.Path);

        report.FilesScanned.Should().Be(1);
        report.Findings.Should().BeEmpty();
    }

    [Fact]
    public void Discovery_reads_the_tests_the_source_the_workflows_and_every_script()
    {
        var root = Tree(
            ("tests/X/A.cs", "var a = 1;"),
            ("src/Y/B.cs", "var b = 1;"),
            (".github/workflows/w.yml", "name: w"),
            (".github/workflows/v.yaml", "name: v"),
            (".github/scripts/s.mjs", "const a = 1;"),
            ("http/h.mjs", "const a = 1;"),
            ("tools/t.sh", "echo t"),
            ("tools/u.ps1", "Write-Host u"),
            ("tools/v.py", "print('v')"),
            ("docs/not-scanned.cs", "var t = Path.GetTemp§Path();"),
            ("README.md", "d=$(mktemp -d)"));

        var report = LeftoversGuard.Scan(root, RepositoryRoot.Path);

        report.FilesScanned.Should().Be(9);
        report.Findings.Should().BeEmpty();
    }

    [Fact]
    public void The_guard_over_itself_reports_nothing_because_it_spells_its_detector_words_in_pieces()
    {
        var path = "src_service_defaults/tests/Support/Leftovers/LeftoversGuard.cs";
        var root = Verbatim(path);

        var report = LeftoversGuard.Scan(root, RepositoryRoot.Path);

        report.FilesScanned.Should().Be(1);
        report.Findings.Should().BeEmpty(Show(report));
    }

    [Fact]
    public void Without_node_the_script_half_is_a_finding_never_a_silence()
    {
        var root = Tree(("a.sh", "echo hello"));
        var missing = "no-such-node-" + Guid.NewGuid().ToString("N");

        var report = LeftoversGuard.Scan(root, RepositoryRoot.Path, missing);

        var finding = report.Findings.Should().ContainSingle().Subject;
        finding.Class.Should().Be("owner-blind");
        finding.Text.Should().Contain(missing).And.Contain("shipped classifier");
    }

    [Fact]
    public void Without_the_mounted_classifier_the_script_half_is_a_finding_naming_the_cause()
    {
        var root = Tree(("a.sh", "echo hello"));
        var bare = _owned.Dir("bare-mount");

        var report = LeftoversGuard.Scan(root, bare);

        report.Findings.Should().ContainSingle().Which.Class.Should().Be("owner-blind");
        report.Findings[0].Text.Should().Contain("shipped classifier");
    }

    [Fact]
    public void A_tree_with_no_script_never_starts_node()
    {
        var root = Tree(("tests/X/A.cs", "var a = 1;"));

        var report = LeftoversGuard.Scan(root, mountRoot: null, node: "no-such-node-" + Guid.NewGuid().ToString("N"));

        report.Findings.Should().BeEmpty();
    }

    [Fact]
    public void A_path_with_quotes_and_shell_syntax_is_an_argument_never_code()
    {
        // The mount's folder and the script's own name carry a quote, a backtick, a substitution, a semicolon and a space: handed to
        // node as program text they would run `touch`; handed as arguments they are only names.
        var weird = "m'q`$(touch pwned);" + (OperatingSystem.IsWindows() ? "" : "\"x\ny");
        var mount = Path.Combine(_owned.Dir("weird-mount"), weird);
        var lib = Path.Combine(mount, ".agents", "conventions", "tools", "lib");
        Directory.CreateDirectory(lib);
        foreach (var file in Directory.GetFiles(Path.Combine(RepositoryRoot.Path, ".agents", "conventions", "tools", "lib"), "*.mjs")) File.Copy(file, Path.Combine(lib, Path.GetFileName(file)));
        var root = Tree(("tools/" + weird + ".sh", $"rm -rf /tmp/{P}-*"));

        var report = LeftoversGuard.Scan(root, mount);

        var finding = report.Findings.Should().ContainSingle().Subject;
        finding.Class.Should().Be("owner-blind");
        finding.Text.Should().Contain("with no owner segment after it", "the classifier ran and judged the line");
        File.Exists(Path.Combine(Directory.GetCurrentDirectory(), "pwned")).Should().BeFalse();
        Directory.GetFiles(root, "pwned", SearchOption.AllDirectories).Should().BeEmpty();
    }

    // ---- 4: a scan of nothing is red -----------------------------------------------------------------------------------

    [Fact]
    public void A_scan_of_nothing_says_so_instead_of_reporting_clean()
    {
        var empty = _owned.Dir("empty-tree");
        var missing = Path.Combine(_owned.Dir("parent"), "does-not-exist");

        var nothing = LeftoversGuard.Scan(empty, RepositoryRoot.Path);
        var absent = LeftoversGuard.Scan(missing, RepositoryRoot.Path);

        nothing.FilesScanned.Should().Be(0);
        nothing.Findings.Should().BeEmpty();
        absent.FilesScanned.Should().Be(0);
        absent.Findings.Should().BeEmpty();
        nothing.Describe(empty).Should().Contain("scanned nothing under " + empty).And.Contain("discovery broke; the repository is not clean");
    }

    // ---- 5: the token is registered and is ours ------------------------------------------------------------------------

    private const string Heading = "## Tokens\n\n";
    private const string Header = "| token | family | repository |\n|---|---|---|\n";

    private static string Rule(string rows, string header = Header) => "# rule\n\n" + Heading + header + rows + "\n\n## Next\n";

    private const string McpRow = "| `mcp` | dew_flow | the MCP server |";

    [Fact]
    public void The_real_token_is_a_row_of_the_mounted_rule_and_is_declared_once_in_the_token_file()
    {
        LeftoversGuard.RegisteredTokenFindings(RepositoryRoot.Path, OwnedToken.RepoToken, OwnedToken.RepoRow).Should().BeEmpty();
        LeftoversGuard.ConstantFindings(RepositoryRoot.Path, OwnedToken.RepoToken).Should().BeEmpty();
    }

    [Theory]
    [InlineData("nosuchtoken")]
    [InlineData("Mcp")]
    [InlineData("x")]
    [InlineData("u1000")]
    [InlineData("w1")]
    public void A_token_that_is_not_registered_or_not_of_the_shape_is_one_finding(string token)
    {
        LeftoversGuard.TokenFindings(Rule(McpRow), token, "the MCP server", DetailName).Should().ContainSingle().Which.Class.Should().Be("token");
    }

    [Fact]
    public void The_registered_token_of_this_repository_is_clean()
    {
        LeftoversGuard.TokenFindings(Rule(McpRow), "mcp", "the MCP server", DetailName).Should().BeEmpty();
        LeftoversGuard.TokenFindings(Rule(McpRow), "mcp", "THE MCP SERVER ", DetailName).Should().BeEmpty("the identity is trimmed and case-insensitive");
    }

    [Fact]
    public void A_rule_without_a_tokens_table_registers_nothing()
    {
        LeftoversGuard.TokenFindings("# rule\n\nno table here\n", "mcp", "the MCP server", DetailName).Should().ContainSingle();
        LeftoversGuard.TokenFindings(Rule(McpRow, "| token | family |\n|---|---|\n"), "mcp", "the MCP server", DetailName).Should().ContainSingle();
        LeftoversGuard.TokenFindings("## Tokens\n\nprose only\n", "mcp", "the MCP server", DetailName).Should().ContainSingle();
    }

    [Fact]
    public void A_token_listed_twice_is_one_finding()
    {
        LeftoversGuard.TokenFindings(Rule(McpRow + "\n" + McpRow), "mcp", "the MCP server", DetailName).Should().ContainSingle().Which.Text.Should().Contain("listed twice");
    }

    [Fact]
    public void A_token_that_appears_only_in_the_repository_column_is_not_registered()
    {
        var rule = Rule("| `other` | dew_flow | the mcp thing |");

        LeftoversGuard.TokenFindings(rule, "mcp", "the MCP server", DetailName).Should().ContainSingle();
    }

    [Fact]
    public void A_token_that_belongs_to_another_repository_is_one_finding_naming_both()
    {
        var rule = Rule("| `mcp` | dew_flow | the embedding sidecar |");

        var finding = LeftoversGuard.TokenFindings(rule, "mcp", "the MCP server", DetailName).Should().ContainSingle().Subject;

        finding.Text.Should().Contain("the embedding sidecar").And.Contain("the MCP server");
    }

    [Fact]
    public void An_empty_identity_fails_closed()
    {
        LeftoversGuard.TokenFindings(Rule(McpRow), "mcp", "", DetailName).Should().ContainSingle();
        LeftoversGuard.TokenFindings(Rule(McpRow), "mcp", "   ", DetailName).Should().ContainSingle();
    }

    [Fact]
    public void A_missing_rule_file_is_a_finding_because_an_uninitialised_submodule_registers_nothing()
    {
        var root = _owned.Dir("no-mount");

        var found = LeftoversGuard.RegisteredTokenFindings(root, "mcp", "the MCP server");

        found.Should().ContainSingle().Which.Text.Should().Contain("git submodule update --init");
    }

    private const string DetailName = "common/test-leftovers-detail.md";
    private const string CoreName = "common/test-leftovers.md";

    /// <summary>A synthetic repository whose mount holds the given rule files (name → text).</summary>
    private string MountWith(string what, params (string Name, string Text)[] files)
    {
        var root = _owned.Dir(what);
        foreach (var (name, text) in files)
        {
            var full = Path.Combine(root, ".agents", "conventions", name);
            Directory.CreateDirectory(Path.GetDirectoryName(full)!);
            File.WriteAllText(full, text);
        }

        return root;
    }

    [Fact]
    public void A_split_mount_reads_the_table_from_the_detail_and_the_messages_name_the_detail()
    {
        var root = MountWith("split-mount", (CoreName, "# core\n\nno table\n"), (DetailName, Rule(McpRow)));

        LeftoversGuard.RegisteredTokenFindings(root, "mcp", "the MCP server").Should().BeEmpty();
        var found = LeftoversGuard.RegisteredTokenFindings(root, "mcp", "the embedding sidecar").Should().ContainSingle().Subject;
        found.File.Should().Be(DetailName);
        found.Text.Should().Contain(DetailName).And.NotContain(CoreName);
    }

    [Fact]
    public void A_mount_from_before_the_split_reads_the_table_from_the_core_and_the_messages_name_the_core()
    {
        var root = MountWith("presplit-mount", (CoreName, Rule(McpRow)));

        LeftoversGuard.RegisteredTokenFindings(root, "mcp", "the MCP server").Should().BeEmpty();
        var found = LeftoversGuard.RegisteredTokenFindings(root, "mcp", "the embedding sidecar").Should().ContainSingle().Subject;
        found.File.Should().Be(CoreName);
        found.Text.Should().Contain(CoreName).And.NotContain("detail");
    }

    [Fact]
    public void A_detail_without_a_table_does_not_hide_the_table_of_the_core()
    {
        var root = MountWith("detail-no-table", (DetailName, "# detail\n\nno table\n"), (CoreName, Rule(McpRow)));

        LeftoversGuard.RegisteredTokenFindings(root, "mcp", "the MCP server").Should().BeEmpty();
        LeftoversGuard.RegisteredTokenFindings(root, "mcp", "the embedding sidecar").Should().ContainSingle().Which.File.Should().Be(CoreName);
    }

    [Fact]
    public void The_detail_wins_when_both_files_have_a_table()
    {
        var root = MountWith("both-tables", (CoreName, Rule("| `mcp` | dew_flow | the core row |")), (DetailName, Rule(McpRow)));

        LeftoversGuard.RegisteredTokenFindings(root, "mcp", "the MCP server").Should().BeEmpty();
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void A_mount_with_no_table_in_either_file_is_one_finding_naming_both_files(bool filesExist)
    {
        var root = filesExist
            ? MountWith("neither-table", (CoreName, "# core\n"), (DetailName, "# detail\n"))
            : _owned.Dir("neither-file");

        var found = LeftoversGuard.RegisteredTokenFindings(root, "mcp", "the MCP server");

        found.Should().ContainSingle().Which.Text.Should().Contain(DetailName).And.Contain(CoreName);
    }

    // The shared selector (`resolveRule` of the mounted tools/leftovers-check.mjs) picks by EXISTENCE, the detail first; the guard picks by
    // CONTENT. They agree on every mount but one: the detail PRESENT WITHOUT a `## Tokens` section and the core WITH one — the shared tool
    // names the detail, the guard names the core (the file that holds the table). That case is asserted as a difference, on purpose.
    // A mount with no rule file at all makes the shared tool fall back to the files beside the tool — outside the fixture ("outside").
    [Theory]
    [InlineData("split", DetailName, DetailName)]
    [InlineData("presplit", CoreName, CoreName)]
    [InlineData("both", DetailName, DetailName)]
    [InlineData("detail-without-table", DetailName, CoreName)]
    [InlineData("neither", DetailName, "finding")]
    [InlineData("no-files", "outside", "finding")]
    public void The_guards_choice_is_the_mounted_selectors_except_where_the_guard_reads_by_content(string kind, string shared, string guard)
    {
        var root = kind switch
        {
            "split" => MountWith("c-split", (CoreName, "# core\n"), (DetailName, Rule(McpRow))),
            "presplit" => MountWith("c-presplit", (CoreName, Rule(McpRow))),
            "both" => MountWith("c-both", (CoreName, Rule(McpRow)), (DetailName, Rule(McpRow))),
            "detail-without-table" => MountWith("c-dnt", (DetailName, "# detail\n"), (CoreName, Rule(McpRow))),
            "neither" => MountWith("c-neither", (CoreName, "# core\n"), (DetailName, "# detail\n")),
            _ => _owned.Dir("c-nofiles"),
        };
        var mount = Path.Combine(root, ".agents", "conventions");

        var picked = MountedSelectorPick(mount);
        var found = LeftoversGuard.RegisteredTokenFindings(root, "mcp", "nobody").Should().ContainSingle().Subject;
        var chosen = found.Text.Contains("neither", StringComparison.Ordinal) ? "finding" : found.File;

        picked.Should().Be(shared, "the mounted resolveRule's answer for this mount");
        chosen.Should().Be(guard);
        if (kind == "detail-without-table") chosen.Should().NotBe(picked, "this is the one deliberate difference: by content, not by existence");
        else if (guard != "finding") chosen.Should().Be(picked);
    }

    /// <summary>The mounted <c>resolveRule(mount)</c> through <c>node</c>: the module URL and the mount travel in <c>process.argv</c>, never in the
    /// program text. Returns the rule name under the mount, or "outside" when it fell back to the files beside the tool. node missing, a
    /// non-zero exit: the test FAILS with the reason.</summary>
    private static string MountedSelectorPick(string mount)
    {
        const string program = """
            const [module, repo] = process.argv.slice(1);
            const { resolveRule } = await import(module);
            console.log(resolveRule(repo) ?? "");
            """;
        var module = new Uri(Path.GetFullPath(Path.Combine(RepositoryRoot.Path, ".agents/conventions/tools/leftovers-check.mjs"))).AbsoluteUri;
        var start = new ProcessStartInfo("node") { RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false, CreateNoWindow = true };
        foreach (var argument in new[] { "--input-type=module", "-e", program, "--", module, mount }) start.ArgumentList.Add(argument);
        using var process = Process.Start(start) ?? throw new InvalidOperationException("node did not start");
        var output = process.StandardOutput.ReadToEndAsync();
        var errors = process.StandardError.ReadToEndAsync();
        process.WaitForExit(TimeSpan.FromMinutes(2)).Should().BeTrue("node must answer in two minutes");
        process.WaitForExit();
        process.ExitCode.Should().Be(0, "node said: " + errors.GetAwaiter().GetResult());
        var picked = output.GetAwaiter().GetResult().Trim().Replace('\\', '/');
        var prefix = mount.Replace('\\', '/').TrimEnd('/') + "/";
        return picked.StartsWith(prefix, StringComparison.Ordinal) ? picked[prefix.Length..] : "outside";
    }

    [Theory]
    [InlineData(DetailName)]
    [InlineData(CoreName)]
    public void An_unreadable_candidate_is_one_finding_naming_the_file_and_the_error_never_an_exception(string unreadable)
    {
        if (OperatingSystem.IsWindows())
        {
            Assert.Skip("chmod 000 is POSIX only");
            return;
        }

        if (Native.GetUid() == 0) Assert.Skip("root reads a file with mode 000");
        var other = unreadable == DetailName ? CoreName : DetailName;
        var root = MountWith("unreadable", (unreadable, Rule(McpRow)), (other, "# no table\n"));
        var file = Path.Combine(root, ".agents", "conventions", unreadable);
        File.SetUnixFileMode(file, UnixFileMode.None);
        try
        {
            var found = LeftoversGuard.RegisteredTokenFindings(root, "mcp", "the MCP server");

            found.Should().ContainSingle().Which.Text.Should().Contain(unreadable).And.Contain("UnauthorizedAccessException");
        }
        finally
        {
            File.SetUnixFileMode(file, UnixFileMode.UserRead | UnixFileMode.UserWrite);
        }
    }

    private const string TokenFile = "src_service_defaults/tests/Support/Leftovers/OwnedToken.cs";

    [Fact]
    public void The_token_constant_is_written_once_in_the_token_file_with_the_registered_value()
    {
        var one = Tree((TokenFile, "public const string Repo§Token = \"mcp\";"));
        var twice = Tree((TokenFile, "public const string Repo§Token = \"mcp\";"), ("tests/Other.cs", "const string Repo§Token = \"mcp\";"));
        var elsewhere = Tree(("src/Other.cs", "const string Repo§Token = \"mcp\";"));
        var other = Tree((TokenFile, "public const string Repo§Token = \"mcpx\";"));
        var commented = Tree((TokenFile, "public const string Repo§Token = \"mcp\";"), ("tests/Other.cs", "// const string Repo§Token = \"mcp\";"));
        var script = Tree((TokenFile, "public const string Repo§Token = \"mcp\";"), ("a.sh", "Repo§Token='mcp'"));

        var none = Tree(("tests/X/A.cs", "var a = 1;"));

        LeftoversGuard.ConstantFindings(one, "mcp").Should().BeEmpty();
        LeftoversGuard.ConstantFindings(none, "mcp").Should().ContainSingle().Which.Text.Should().Contain("exactly once");
        LeftoversGuard.ConstantFindings(twice, "mcp").Should().ContainSingle().Which.Class.Should().Be("token");
        LeftoversGuard.ConstantFindings(elsewhere, "mcp").Should().NotBeEmpty("not declared in the token file");
        LeftoversGuard.ConstantFindings(other, "mcp").Should().ContainSingle().Which.Text.Should().Contain("mcpx");
        LeftoversGuard.ConstantFindings(commented, "mcp").Should().BeEmpty("a comment declares nothing");
        LeftoversGuard.ConstantFindings(script, "mcp").Should().ContainSingle("a script's second declaration counts too");
    }

    // ---- 6: the exclusion list -----------------------------------------------------------------------------------------

    [Fact]
    public void The_files_that_may_spell_the_word_in_pieces_are_these_four_and_all_of_them_exist()
    {
        const string helper = "src_service_defaults/tests/Support/Leftovers/";
        const string tests = "src_service_defaults/tests/Leftovers/";

        LeftoversGuard.FoldingAllowances.Should().Equal(helper + "Owned.cs", helper + "LeftoversGuard.cs", tests + "LeftoversGuardTests.cs", tests + "LeftoversGuardScriptsTests.cs");
        LeftoversGuard.FoldingAllowances.Should().OnlyContain(file => File.Exists(Path.Combine(RepositoryRoot.Path, file)));
    }

    [Fact]
    public void No_file_is_excluded_and_the_guards_own_tests_are_scanned_clean()
    {
        LeftoversGuard.ExcludedFiles.Should().BeEmpty();
        var path = "src_service_defaults/tests/Leftovers/LeftoversGuardTests.cs";
        var root = Verbatim(path);

        var report = LeftoversGuard.Scan(root, RepositoryRoot.Path);

        report.FilesScanned.Should().Be(1, "the file is read like any other");
        report.Findings.Should().BeEmpty(Show(report));
    }

    // ---- helpers -------------------------------------------------------------------------------------------------------

    /// <summary>A tree of the given files, each text through <see cref="Fx"/>.</summary>
    private string Tree(params (string Path, string Text)[] files) => Written(files.Select(f => (f.Path, Fx(f.Text))));

    /// <summary>A tree of the given files exactly as they are: a real file of this repository, scanned as it stands.</summary>
    private string Verbatim(string relative) => Written([(relative, File.ReadAllText(Path.Combine(RepositoryRoot.Path, relative)))]);

    private string Written(IEnumerable<(string Path, string Text)> files)
    {
        var root = _owned.Dir("guard-tree");
        foreach (var (relative, text) in files)
        {
            var full = Path.Combine(root, relative);
            Directory.CreateDirectory(Path.GetDirectoryName(full)!);
            File.WriteAllText(full, text);
        }

        return root;
    }

    /// <summary>The fixtures hold the very words the guard detects, and the guard scans this file: each such word is written with a
    /// section sign inside it (<c>Path.GetTemp§Path</c>), which the guard cannot read as the word, and the sign is dropped before the
    /// text is written into a tree or compared. The prefix word is a variable (<c>P</c>) for the same reason.</summary>
    private static string Fx(string text) => text.Replace("§", "", StringComparison.Ordinal);

    private static string Classes(GuardReport report) => string.Join(",", report.Findings.Select(f => f.Class).Order(StringComparer.Ordinal));

    private static string Show(GuardReport report) => string.Join("; ", report.Findings.Select(f => $"{f.File}:{f.Line} — {f.Class} — {f.Text}"));
}
