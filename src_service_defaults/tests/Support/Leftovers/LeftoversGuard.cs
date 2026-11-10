using System.Text;
using System.Text.RegularExpressions;

namespace CredsForDevs.Tests.Leftovers;

/// <summary>One thing the guard refuses: the repository-relative path (forward slashes), the 1-based line, the class of rule §7
/// (<c>raw-temp</c> … <c>ryuk-off</c>, plus <c>exemption</c> and <c>token</c>, which are about the guard's own grammar) and the
/// text that was matched.</summary>
public sealed record Finding(string File, int Line, string Class, string Text)
{
    public override string ToString() => $"{File}:{Line} — {Class} — {Text}";
}

/// <summary>What a scan read and what it found. <see cref="FilesScanned"/> of zero is a broken discovery, never a clean
/// repository.</summary>
public sealed record GuardReport(int FilesScanned, IReadOnlyList<Finding> Findings)
{
    /// <summary>The failure message: every finding as <c>file:line — class — text</c>, or the one sentence for a scan of nothing.</summary>
    public string Describe(string root) => FilesScanned == 0
        ? $"scanned nothing under {root} — discovery broke; the repository is not clean"
        : string.Join(Environment.NewLine, Findings.Select(f => f.ToString()));
}

/// <summary>The structural guard of <c>common/test-leftovers.md</c> §7 over this repository's tests, source, scripts and CI: red on
/// every class below outside the helper, and red when it scanned nothing. A port of the SHAPE of the conventions' Node guard
/// (<c>tools/leftovers-check.mjs</c>) to this repository's languages — with differences it states rather than hides:
/// <list type="bullet">
/// <item><c>owner-blind</c> in C# is a rule about the WORD (owner decision 3): the bare prefix word in any spelling — a literal, a glob,
/// a character class, a regex, a bare word, a separator in another literal — outside <c>Owned.cs</c> is a finding unless an owner
/// segment follows it, and any reference to <c>Owned.Prefix</c> or <c>Owned.LegacyPattern</c> outside this folder is one, so a
/// constant cannot carry the prefix to a sweep. <c>Owned.TempRoot</c> outside this folder is a <c>raw-temp</c> finding. In scripts and
/// workflows the class is judged by the SHIPPED classifier (<c>tools/lib/sweeper-scan.mjs</c> of the mounted conventions) started
/// through <c>node</c> — not a port, so the guard and the machine scan can never disagree about a line.</item>
/// <item>the container carve-out of rule §5 is NOT recognised: this repository starts no container, and a container command without
/// the remove flag is a finding; a container that needs the carve-out re-opens this guard.</item>
/// <item>the docker classes read one line at a time; a command continued with a backslash is judged line by line.</item>
/// </list>
/// Every detector word below is spelled in two pieces, and the guard scans ITS OWN files clean (its tests included): a test pins it. The
/// work is split by what is read — <see cref="GuardFiles"/>, <see cref="GuardText"/>, <see cref="GuardDocker"/>, <see cref="GuardExemptions"/>,
/// <see cref="GuardScripts"/>, <see cref="GuardTokens"/> — and every method is of cyclomatic complexity 4 at most (CA1502 fails the build).</summary>
public static class LeftoversGuard
{
    /// <summary>The files the scan never reads: none. The guard's own tests spell their fixtures in pieces, as every other file does, and
    /// the guard scans them clean. A test pins that the list stays empty.</summary>
    public static IReadOnlyList<string> ExcludedFiles { get; } = [];

    /// <summary>The workflows whose docker classes (<c>docker-run</c>, <c>docker-name</c>) this guard does not read: exactly one entry, pinned by a test. The
    /// container carve-out of rule §5 (a smoke container started without the remove flag, then removed by one always-run remover) is read by the SHIPPED Node
    /// guard, which is green on the file; this copy does not know the carve-out and would call both smoke starts a finding. Every other class still reads the
    /// file, and the same text under another workflow name keeps both docker findings.</summary>
    internal static IReadOnlyList<string> DockerJudgedByNodeGuard { get; } = [".github/workflows/docker.yml"];

    private const string HelperFile = "src_service_defaults/tests/Support/Leftovers/Owned.cs";
    private static readonly string[] HelperFolders = ["src_service_defaults/tests/Support/Leftovers/", "src_service_defaults/tests/Leftovers/"];

    // The detector words, each in two pieces: the guard is scanned like any other file, and the machine scan reads it too.
    internal const string Word = "teststo" + "delete";

    /// <summary>The same word as a person writes it, for the exemption marker: <c>testsToDelete</c>.</summary>
    internal const string CamelWord = "testsTo" + "Delete";

    /// <summary>The files that may spell the word in pieces, so the folded reading (<see cref="GuardLiterals"/>: joined literals, decoded
    /// escapes, single-character classes, pieces of the word) is not applied to them: the helper that owns the prefix, the guard that
    /// holds the detector words, and the two files that build the guard's break-it fixtures out of the word. Pinned by a test; a fifth
    /// file is a decision, not a convenience. Everything else names the word through <c>Owned</c> (a constant) or not at all.</summary>
    internal static IReadOnlyList<string> FoldingAllowances { get; } =
    [
        HelperFile,
        "src_service_defaults/tests/Support/Leftovers/LeftoversGuard.cs",
        "src_service_defaults/tests/Leftovers/LeftoversGuardTests.cs",
        "src_service_defaults/tests/Leftovers/LeftoversGuardScriptsTests.cs",
    ];

    private static Regex Rx(string pattern, RegexOptions options = RegexOptions.None) => new(pattern, options | RegexOptions.CultureInvariant);

    // ---- raw-temp, raw-worktree, ryuk-off, shared-store -------------------------------------------------------------------

    private static readonly Regex[] RawTemp =
    [
        Rx("Create" + "TempSubdirectory"),
        Rx("GetTemp" + "Path2?"),
        Rx("GetTemp" + "FileName"),
        Rx("GetEnvironment" + @"Variable\(\s*""(?:TEMP|TMP|TMPDIR)"""),
        Rx(@"\bmkd" + @"temp(?:Sync)?\s*\("),
        Rx(@"\btmp" + @"dir\s*\("),
        Rx(@"process\.env\." + "(?:TEMP|TMP|TMPDIR)" + @"\b"),
        Rx(@"\btemp" + @"_dir\s*\("),
    ];

    private static readonly Regex[] RawTempShell = [Rx(@"\bmk" + @"temp\b")];

    private static readonly Regex[] RawTempPowerShell = [Rx("New-Temporary" + @"File|\$env:TE?MP\b")];

    /// <summary>The extra raw-temp spellings of a language, by extension.</summary>
    private static readonly (string[] Extensions, Regex[] Patterns)[] RawTempByExtension = [([".sh", ".yml", ".yaml"], RawTempShell), ([".ps1"], RawTempPowerShell)];

    private static readonly Regex[] RawWorktree = [Rx(@"[""']work" + @"tree[""']\s*,\s*[""']add[""']"), Rx(@"\bwork" + @"tree\s+add\b")];

    private static readonly Regex RyukOff = Rx("TESTCONTAINERS_RYUK_" + @"DISABLED\s*[:=]\s*[""']?true", RegexOptions.IgnoreCase);

    private static readonly (Regex Pattern, bool Named)[] SharedStore =
    [
        (Rx(@"\bDR" + @"OP\s+(?:DATABASE|SCHEMA|TABLE)\s+(?:IF\s+EXISTS\s+)?([""'`]?[\w.$-]*)"), true),
        (Rx(@"\bTRUN" + @"CATE\s+(?:TABLE\s+)?([""'`]?[\w.$-]*)"), true),
        (Rx(@"\bFLUSH" + @"(?:ALL|DB)\b"), false),
        (Rx("delete" + @"Many\(\s*\{\s*\}\s*\)"), false),
    ];

    private static readonly Regex ContainerStart = Rx(@"\bdocker\s+r" + @"un\b");
    private static readonly Regex HasRm = Rx(@"(?<![-\w])--rm\b");

    /// <summary>The OWNER form of a leftover name, one of the three spellings then an owner segment (rule §1, case-insensitive).</summary>
    internal static readonly Regex OwnerForm = Rx("^" + Word + @"[-_][uw][0-9]{1,10}[-_]", RegexOptions.IgnoreCase);

    // ---- legacy-name, owner-blind ------------------------------------------------------------------------------------------

    private static readonly Regex PrefixWord = Rx(Word + "[-_]", RegexOptions.IgnoreCase);

    /// <summary>The word itself, whatever follows it: a glob, a character class, a pattern, a bare word, a separator in another literal.</summary>
    private static readonly Regex WordAnywhere = Rx(Word, RegexOptions.IgnoreCase);

    /// <summary>What may follow the word in C# without being a sweep: an owner segment between separators (a regex may write one as
    /// <c>[-_]</c>), the exempt marker word, the quarantine sibling's word.</summary>
    private static readonly Regex AllowedAfterWord = Rx(@"^(?:[-_]|\[-_\])(?:[uw][0-9]{1,10}(?:[-_]|\[-_\])|(?:exempt|quarantine)(?![a-z0-9]))", RegexOptions.IgnoreCase);

    /// <summary>The owner environment variables (<c>TESTSTODELETE_RUN</c>): the word in upper case, an underscore, upper-case letters.</summary>
    private static readonly Regex EnvironmentUse = Rx("^" + Word.ToUpperInvariant() + "_[A-Z]+(?![A-Za-z0-9])");

    private static readonly Regex SecondSegment = Rx("^[a-z0-9]+", RegexOptions.IgnoreCase);
    private static readonly Regex OwnerGrammar = Rx(@"^[uw][0-9]{1,10}\z", RegexOptions.IgnoreCase);
    private static readonly Regex EnvironmentName = Rx("^" + Word.ToUpperInvariant() + @"_[A-Z]+\z");
    private static readonly Regex BuiltFromToken = Rx(Word + @"[-_](?:\{\s*RepoToken\b|\$\{?\s*(?:REPO_TOKEN|RepoToken|repoToken)\b)", RegexOptions.IgnoreCase);
    private static readonly Regex HelperReference = Rx(@"\bOwned\.(?:Prefix|LegacyPattern)\b");

    /// <summary>The helper's one door to the temp root: outside the helper's folder a path made under it is a temp path no <c>OwnedDir</c> claimed.</summary>
    private static readonly Regex TempRootReference = Rx(@"\bOwned\.TempRoot\b");

    /// <summary>A literal that names the raw temp root outright: <c>/tmp</c> or <c>/var/tmp</c> as a path, however the path is then built.</summary>
    private static readonly Regex TempFolderLiteral = Rx(@"(?<![\w.-])/(?:var/)?tmp(?![\w-])");

    /// <summary>Scan <paramref name="repoRoot"/>: <see cref="GuardReport"/> with the number of files read and every finding. Pure
    /// apart from reading files and, when the tree holds a script or a workflow, starting <paramref name="node"/> ONCE to run the
    /// mounted conventions' classifier (read from <paramref name="mountRoot"/>, default the scanned root). A root that does not
    /// exist scans nothing; it does not throw.</summary>
    public static GuardReport Scan(string repoRoot, string? mountRoot = null, string node = "node")
    {
        var findings = new List<Finding>();
        List<ScriptFile> scripts = [];
        var scanned = 0;
        foreach (var source in GuardFiles.Discover(repoRoot))
        {
            ScanFile(source, findings, scripts);
            scanned++;
        }

        findings.AddRange(ClassifiedScripts(scripts, mountRoot ?? repoRoot, node));
        return new GuardReport(scanned, [.. findings.OrderBy(f => f.File, StringComparer.Ordinal).ThenBy(f => f.Line).ThenBy(f => f.Class, StringComparer.Ordinal)]);
    }

    /// <summary>One file read, scanned and let go: its text is not kept past this call. Only a script or a workflow keeps anything —
    /// its lines, split once, for the classifier's line numbers — so the memory of a scan is the scripts' lines, not the whole tree's text.</summary>
    private static void ScanFile(SourceFile source, List<Finding> findings, List<ScriptFile> scripts)
    {
        var text = File.ReadAllText(source.Absolute, Encoding.UTF8);
        findings.AddRange(ScanText(source, text));
        if (source.IsJudgedByClassifier) scripts.Add(new ScriptFile(source, GuardText.SplitLines(text)));
    }

    /// <summary>The shipped classifier over the scripts and workflows of the scan (started once, only when there are any).</summary>
    private static List<Finding> ClassifiedScripts(List<ScriptFile> scripts, string mountRoot, string node) =>
        scripts.Count == 0 ? [] : GuardScripts.Classify(scripts, mountRoot, node);

    /// <summary>The token checks (class <c>token</c>): see <see cref="GuardTokens"/>.</summary>
    /// <param name="rule">the name of the rule file <paramref name="ruleText"/> was read from — every message names it.</param>
    public static IReadOnlyList<Finding> TokenFindings(string ruleText, string token, string identity, string rule) => GuardTokens.TokenFindings(ruleText, token, identity, rule);

    public static IReadOnlyList<Finding> RegisteredTokenFindings(string repoRoot, string token, string identity) => GuardTokens.RegisteredTokenFindings(repoRoot, token, identity);

    public static IReadOnlyList<Finding> ConstantFindings(string repoRoot, string token) => GuardTokens.ConstantFindings(repoRoot, token);

    // ---- one file ----------------------------------------------------------------------------------------------------------

    private static List<Finding> ScanText(SourceFile source, string text)
    {
        var original = GuardText.SplitLines(text);
        var matched = GuardText.SplitLines(source.HasBlockComments ? GuardText.StripBlockComments(text, csharp: source.Extension == ".cs") : text);
        var exemptions = GuardExemptions.Read(source.Relative, original, out var found);
        found.AddRange(matched.SelectMany((line, i) => LineFindings(source, line, i + 1, exemptions)));
        return found;
    }

    /// <summary>One finding per class that hits the line, unless the class is exempt there (<c>ryuk-off</c> never is).</summary>
    private static IEnumerable<Finding> LineFindings(SourceFile source, string line, int number, Dictionary<string, HashSet<int>> exemptions) =>
        GuardText.IsComment(line)
            ? []
            : LineHits(source, line).GroupBy(h => h.Class).Where(g => g.Key == "ryuk-off" || !GuardExemptions.IsExempt(exemptions, g.Key, number))
                .Select(g => new Finding(source.Relative, number, g.Key, string.Join(", ", g.Select(h => $"`{h.Text}`").Distinct())));

    private static IEnumerable<(string Class, string Text)> LineHits(SourceFile source, string line) =>
        HitsOutsideSource(source, line).Concat(Tag("legacy-name", LegacyNameHits(line))).Concat(HitsOfCSharp(source, line)).Concat(HitsOfFoldedLiterals(source, line));

    private static IEnumerable<(string Class, string Text)> Tag(string cls, IEnumerable<string> texts) => texts.Select(text => (cls, text));

    /// <summary>The classes that apply to tests, scripts and workflows but not to the code under test.</summary>
    private static IEnumerable<(string Class, string Text)> HitsOutsideSource(SourceFile source, string line) =>
        source.Kind == SourceKind.Source
            ? []
            : Tag("raw-temp", RawTempHits(source.Extension, line))
                .Concat(Tag("raw-worktree", Matches(RawWorktree, line).Take(1)))
                .Concat(DockerHits(source, line))
                .Concat(Tag("shared-store", SharedStoreHits(line)))
                .Concat(Tag("ryuk-off", RyukOff.IsMatch(line) ? ["the reaper is switched off"] : []));

    /// <summary>The two docker classes of a line, none for a workflow of <see cref="DockerJudgedByNodeGuard"/>.</summary>
    private static IEnumerable<(string Class, string Text)> DockerHits(SourceFile source, string line) =>
        DockerJudgedByNodeGuard.Contains(source.Relative)
            ? []
            : Tag("docker-run", ContainerWithoutRemoveFlag(line)).Concat(Tag("docker-name", GuardDocker.NameHits(line)));

    /// <summary>The classes that only the C# files carry: the bare prefix and the temp root.</summary>
    private static IEnumerable<(string Class, string Text)> HitsOfCSharp(SourceFile source, string line) =>
        source.Kind is SourceKind.Tests or SourceKind.Source
            ? Tag("owner-blind", OwnerBlindHits(source, line)).Concat(Tag("raw-temp", TempRootHits(source, line)))
            : [];

    /// <summary>The same two classes over the line READ AS THE COMPILER READS IT (<see cref="GuardLiterals"/>): a word or a temp root that is
    /// spelled with an escape, in pieces joined by <c>+</c> or <c>string.Concat</c>, in a one-character class, or only as a piece of the
    /// prefix word. Never for the files of <see cref="FoldingAllowances"/>.</summary>
    private static IEnumerable<(string Class, string Text)> HitsOfFoldedLiterals(SourceFile source, string line) =>
        IsFolded(source, line) ? FoldedHits(source, GuardLiterals.Fold(line)) : [];

    private static bool IsFolded(SourceFile source, string line) =>
        source.Extension == ".cs" && source.Kind is SourceKind.Tests or SourceKind.Source && !FoldingAllowances.Contains(source.Relative) && line.AsSpan().IndexOfAny('"', '\'') >= 0;

    private static IEnumerable<(string Class, string Text)> FoldedHits(SourceFile source, FoldedLine folded) =>
        Tag("owner-blind", BareWordHits(folded.Text).Concat(PieceHits(folded))).Concat(Tag("raw-temp", source.Kind == SourceKind.Tests ? FoldedTempHits(folded) : []));

    /// <summary>A literal that holds a piece of the prefix word and not the whole word (a literal with the whole word is judged by what follows it).</summary>
    private static IEnumerable<string> PieceHits(FoldedLine folded) =>
        folded.Literals.Where(literal => !WordAnywhere.IsMatch(literal)).Select(literal => GuardLiterals.PrefixPieces.Match(literal)).Where(m => m.Success)
            .Select(m => $"{m.Value} (a piece of the prefix word)");

    private static IEnumerable<string> FoldedTempHits(FoldedLine folded) =>
        Matches(RawTemp, folded.Text).Concat(folded.Literals.Select(literal => TempFolderLiteral.Match(literal)).Where(m => m.Success).Select(m => $"\"{m.Value}\""));

    private static IEnumerable<string> RawTempHits(string extension, string line) =>
        Matches(RawTemp, line).Concat(RawTempByExtension.Where(r => r.Extensions.Contains(extension)).SelectMany(r => Matches(r.Patterns, line)));

    private static IEnumerable<string> ContainerWithoutRemoveFlag(string line) =>
        ContainerStart.IsMatch(line) && !HasRm.IsMatch(line) ? ["a container started without the remove flag"] : [];

    private static IEnumerable<string> Matches(IEnumerable<Regex> patterns, string line) =>
        patterns.Select(p => p.Match(line)).Where(m => m.Success).Select(m => m.Value.Trim());

    // ---- shared-store ----------------------------------------------------------------------------------------------------------

    /// <summary>The first shared-store pattern that hits the line (one hit per line, as the shipped guard counts); a named drop or
    /// truncate of an owner-form name is not one.</summary>
    private static IEnumerable<string> SharedStoreHits(string line) =>
        SharedStore.Select(s => (s.Named, Match: s.Pattern.Match(line))).Where(s => IsStoreHit(s.Match, s.Named)).Select(s => s.Match.Value.Trim()).Take(1);

    private static bool IsStoreHit(Match match, bool named) =>
        match.Success && !(named && OwnerForm.IsMatch(match.Groups[1].Value.TrimStart('"', '\'', '`')));

    // ---- legacy-name, owner-blind ------------------------------------------------------------------------------------------------

    /// <summary>Each literal of the prefix with its separator whose second segment is something other than an owner, an exempt marker
    /// word, the quarantine sibling's word or an environment name — and a prefix built from the repository token.</summary>
    private static IEnumerable<string> LegacyNameHits(string line) =>
        PrefixWord.Matches(line).Select(m => LegacyName(line, m)).OfType<string>()
            .Concat(BuiltFromToken.IsMatch(line) ? new[] { "a prefix built from the repository token" } : []);

    private static string? LegacyName(string line, Match prefix)
    {
        var second = SecondSegment.Match(line[(prefix.Index + prefix.Length)..]);
        return !second.Success || IsNotAName(prefix, second) || OwnerGrammar.IsMatch(second.Value) ? null : prefix.Value + second.Value;
    }

    /// <summary>Decision 3, in C#: the word itself, in every <c>.cs</c> file but the helper's own, unless an owner segment follows it
    /// (or it is the exempt marker word, the quarantine sibling's word or an environment variable) — a literal, a glob, a character
    /// class, a pattern, a bare word or a separator in another literal all read as a sweep by the bare prefix. And a reference to
    /// <c>Owned.Prefix</c> or <c>Owned.LegacyPattern</c> outside the helper's folder.</summary>
    private static IEnumerable<string> OwnerBlindHits(SourceFile source, string line) =>
        (source.Relative == HelperFile ? [] : BareWordHits(line)).Concat(InHelperFolder(source) ? [] : References(HelperReference, line));

    private static IEnumerable<string> TempRootHits(SourceFile source, string line) =>
        InHelperFolder(source) ? [] : References(TempRootReference, line).Select(reference => reference + " outside the helper's folder");

    private static IEnumerable<string> References(Regex reference, string line) => reference.Match(line) is { Success: true } hit ? [hit.Value] : [];

    private static bool InHelperFolder(SourceFile source) => HelperFolders.Any(folder => source.Relative.StartsWith(folder, StringComparison.Ordinal));

    private static IEnumerable<string> BareWordHits(string line) => WordAnywhere.Matches(line).Select(m => BareWord(line, m)).OfType<string>();

    private static string? BareWord(string line, Match word)
    {
        var rest = line[(word.Index + word.Length)..];
        return AllowedAfterWord.IsMatch(rest) || EnvironmentUse.IsMatch(line[word.Index..]) ? null : word.Value + rest[..Math.Min(rest.Length, 3)].TrimEnd('"', '\\');
    }

    /// <summary>The second segments that are not names: the exempt marker word, the quarantine sibling (<c>.&lt;name&gt;.&lt;prefix&gt;-quarantine-…</c>) and an
    /// environment variable (upper case, underscore).</summary>
    private static bool IsNotAName(Match prefix, Match second) =>
        second.Value.Equals("exempt", StringComparison.OrdinalIgnoreCase)
        || second.Value.Equals("quarantine", StringComparison.OrdinalIgnoreCase)
        || EnvironmentName.IsMatch(prefix.Value + second.Value);
}
