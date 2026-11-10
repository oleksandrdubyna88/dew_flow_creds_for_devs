using System.Text;
using System.Text.RegularExpressions;

namespace CredsForDevs.Tests.Leftovers;

/// <summary>The guard's <c>token</c> class (rule §1, §2): this repository's token must be a row of the rule's <c>## Tokens</c> table
/// (read from the rule file that holds it, found by content — see <see cref="RegisteredTokenFindings"/>; the row's <c>repository</c> column naming THIS repository), of the token grammar and not of the owner grammar, and the
/// <c>RepoToken</c> constant must be written once, in the token file.</summary>
internal static class GuardTokens
{
    internal const string TokenFile = "src_service_defaults/tests/Support/Leftovers/OwnedToken.cs";
    /// <summary>The rule file that holds the <c>## Tokens</c> table since the split of 2026-11-01 (release 105d53c).</summary>
    internal const string DetailRule = "common/test-leftovers-detail.md";

    /// <summary>The rule core; it holds the table on a mount from before the split.</summary>
    internal const string CoreRule = "common/test-leftovers.md";

    private static readonly string[] ExpectedHeader = ["token", "family", "repository"];
    private static readonly string[] ConstantExtensions = [".cs", ".mjs", ".js", ".cjs", ".sh", ".ps1", ".py"];

    private static readonly Regex TokenShape = Rx(@"^[a-z0-9]{2,12}\z");
    private static readonly Regex OwnerGrammar = Rx(@"^[uw][0-9]{1,10}\z", RegexOptions.IgnoreCase);
    private static readonly Regex TokenConstant = Rx(@"\bRepoToken\b\s*(?::\s*\w+\s*)?=\s*[""']([^""'\n]*)[""']");
    private static readonly Regex TokensHeading = Rx(@"^##\s+Tokens\s*\z");
    private static readonly Regex AnyHeading = Rx(@"^#{1,2}\s");
    private static readonly Regex TableLine = Rx(@"^\s*\|");
    private static readonly Regex TableSeparator = Rx(@"^\s*\|?[\s:|-]+\|[\s:|-]*\z");

    private sealed record Problem(int Line, string Text);

    private sealed record TokenRow(string Token, string Repository, int Line);

    private sealed record TokenTable(int Heading, string[]? Header, List<TokenRow> Rows);

    private sealed record Declaration(string File, int Line, string Value);

    private static Regex Rx(string pattern, RegexOptions options = RegexOptions.None) => new(pattern, options | RegexOptions.CultureInvariant);

    /// <summary>Findings (class <c>token</c>) when <paramref name="token"/> is not a row of the rule's <c>## Tokens</c> table, is of the
    /// owner grammar, or is another repository's row — <paramref name="identity"/> is the <c>repository</c> column of ITS row. Fails
    /// closed: a rule with no table registers nothing, and an empty identity proves nothing.</summary>
    internal static IReadOnlyList<Finding> TokenFindings(string ruleText, string token, string identity, string rule) =>
        (ShapeProblem(token, rule) ?? TableProblem(ParseTokenTable(ruleText), token, identity, rule)) is { } problem ? At(problem, rule) : [];

    private static List<Finding> At(Problem problem, string rule) => [new Finding(rule, Math.Max(problem.Line, 1), "token", problem.Text)];

    private static Problem? ShapeProblem(string token, string rule)
    {
        if (!TokenShape.IsMatch(token)) return new Problem(1, $"the token `{token}` is not [a-z0-9]{{2,12}} ({rule})");
        return OwnerGrammar.IsMatch(token) ? new Problem(1, $"the token `{token}` matches the owner grammar of {rule} §1 — no repository may be named like an owner") : null;
    }

    private static Problem? TableProblem(TokenTable table, string token, string identity, string rule) =>
        HeadingProblem(table, token, rule) ?? RowProblem(table, token, identity, rule);

    private static Problem? HeadingProblem(TokenTable table, string token, string rule) =>
        table.Heading == 0 ? new Problem(1, $"{rule} has no `## Tokens` section — the token `{token}` is not registered")
        : table.Header is null ? new Problem(table.Heading, $"{rule} has no table under `## Tokens` — the token `{token}` is not registered")
        : IsExpectedHeader(table.Header) ? null
        : new Problem(table.Heading, $"the `## Tokens` table of {rule} is not `| token | family | repository |` — the token `{token}` is not registered");

    private static bool IsExpectedHeader(string[] header) =>
        header.Length == ExpectedHeader.Length && ExpectedHeader.Select((name, i) => header[i].Equals(name, StringComparison.OrdinalIgnoreCase)).All(ok => ok);

    private static Problem? RowProblem(TokenTable table, string token, string identity, string rule)
    {
        var rows = table.Rows.Where(r => r.Token == token).ToList();
        if (rows.Count == 0) return new Problem(table.Heading, $"the token `{token}` is not a row of the `## Tokens` table of {rule}");
        return rows.Count > 1 ? new Problem(rows[1].Line, $"the token `{token}` is listed twice in {rule}") : IdentityProblem(rows[0], token, identity, rule);
    }

    private static Problem? IdentityProblem(TokenRow row, string token, string identity, string rule)
    {
        if (identity.Trim().Length == 0)
        {
            return new Problem(row.Line, $"this repository's identity is unknown, so the token `{token}` cannot be proven to belong to it — OwnedToken.RepoRow must be exactly the repository column of the row of `{token}` ({row.Repository})");
        }

        return row.Repository.Trim().Equals(identity.Trim(), StringComparison.OrdinalIgnoreCase)
            ? null
            : new Problem(row.Line, $"the token `{token}` belongs to `{row.Repository}` in {rule}, not to this repository (`{identity}`)");
    }

    private sealed record Candidate(string Name, string? Text, string? Error);

    private sealed record Resolution(Candidate? Chosen, Finding? Failure);

    /// <summary><see cref="TokenFindings"/> over the rule file of the mount that holds the table, found by content (the reference is
    /// <c>resolveRule</c> of the mounted <c>tools/leftovers-check.mjs</c>, which picks by existence; the two differ only where the detail
    /// exists without a table): <c>common/test-leftovers-detail.md</c> when it exists AND has a <c>## Tokens</c> section, else
    /// <c>common/test-leftovers.md</c> when it has one (a mount from before the split). Fails closed with ONE finding when neither has
    /// it — <see cref="DetailRule"/> is the canonical anchor of that finding (the file the table belongs in); the message names both files —
    /// and with ONE finding naming the file and the error when a candidate cannot be read (never an exception). Candidates are read in
    /// order and the first that holds the table ends the search, so a core that is not read cannot fail the guard. Every message names the
    /// file actually read.</summary>
    internal static IReadOnlyList<Finding> RegisteredTokenFindings(string repoRoot, string token, string identity)
    {
        var mount = Path.Combine(repoRoot, ".agents", "conventions");
        var resolved = Resolve(mount, token, [DetailRule, CoreRule]);
        return resolved.Failure is { } failure ? [failure] : TokenFindings(resolved.Chosen!.Text!, token, identity, resolved.Chosen.Name);
    }

    private static Resolution Resolve(string mount, string token, string[] names) =>
        names.Length == 0 ? new Resolution(null, NeitherFinding(mount, token)) : Step(mount, token, names, Read(mount, names[0]));

    private static Resolution Step(string mount, string token, string[] names, Candidate candidate) =>
        candidate.Error is not null ? new Resolution(null, new Finding(candidate.Name, 1, "token", $"{candidate.Name} under {mount} could not be read ({candidate.Error}) — the token `{token}` is not registered"))
        : candidate.Text is not null && GuardText.SplitLines(candidate.Text).Any(l => TokensHeading.IsMatch(l)) ? new Resolution(candidate, null)
        : Resolve(mount, token, names[1..]);

    /// <summary>The text of the rule file <paramref name="name"/> of the mount; null text when the file does not exist; an error text when it cannot be read.</summary>
    private static Candidate Read(string mount, string name)
    {
        var file = Path.Combine(mount, name);
        try
        {
            return new Candidate(name, File.Exists(file) ? File.ReadAllText(file) : null, null);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            return new Candidate(name, null, $"{ex.GetType().Name}: {ex.Message}");
        }
    }

    private static Finding NeitherFinding(string mount, string token) =>
        new(DetailRule, 1, "token", $"neither {DetailRule} (the canonical home of the table, so this finding is anchored on it) nor {CoreRule} under {mount} has a `## Tokens` section — the token `{token}` is not registered; an uninitialised submodule registers nothing, run `git submodule update --init .agents/conventions`");

    /// <summary>The ONE constant (rule §2): over every <c>.cs</c>, <c>.mjs</c>, <c>.js</c>, <c>.cjs</c>, <c>.sh</c>, <c>.ps1</c> and
    /// <c>.py</c> file of the tree (the folders the scan never enters excepted), a non-comment line that declares <c>RepoToken</c> must
    /// occur exactly once — in the token file — and carry <paramref name="token"/>.</summary>
    internal static IReadOnlyList<Finding> ConstantFindings(string repoRoot, string token)
    {
        if (!Directory.Exists(repoRoot)) return [new Finding(TokenFile, 1, "token", $"{repoRoot} does not exist — the token file cannot be read")];
        var declarations = GuardFiles.Walk(repoRoot).Order(StringComparer.Ordinal).Select(path => (Path: path, Relative: GuardFiles.RelativeTo(repoRoot, path)))
            .Where(file => IsScannable(file.Path, file.Relative)).SelectMany(file => DeclarationsIn(file.Path, file.Relative)).ToList();
        var found = declarations.SelectMany(d => ConstantProblems(d, token)).ToList();
        var declared = declarations.Count(d => d.File == TokenFile);
        if (declared != 1) found.Add(new Finding(TokenFile, 1, "token", $"{TokenFile} must declare RepoToken exactly once; it declares it {declared} time(s)"));
        return found;
    }

    private static bool IsScannable(string path, string relative) =>
        ConstantExtensions.Contains(Path.GetExtension(path).ToLowerInvariant()) && !LeftoversGuard.ExcludedFiles.Contains(relative);

    /// <summary>Every declaration of <c>RepoToken</c> on a non-comment line of the file.</summary>
    private static IEnumerable<Declaration> DeclarationsIn(string path, string relative) =>
        GuardText.SplitLines(File.ReadAllText(path, Encoding.UTF8)).Select((line, index) => (Line: line, Number: index + 1)).Where(l => !GuardText.IsComment(l.Line))
            .SelectMany(l => TokenConstant.Matches(l.Line).Select(m => new Declaration(relative, l.Number, m.Groups[1].Value)));

    private static IEnumerable<Finding> ConstantProblems(Declaration d, string token) =>
        (d.File == TokenFile ? [] : new[] { new Finding(d.File, d.Line, "token", $"RepoToken is declared here, outside {TokenFile} — the token is written once (rule §2)") })
            .Concat(d.Value == token ? [] : new[] { new Finding(d.File, d.Line, "token", $"RepoToken is `{d.Value}`, not the registered `{token}`") });

    private static TokenTable ParseTokenTable(string ruleText)
    {
        var lines = GuardText.SplitLines(ruleText);
        var start = Array.FindIndex(lines, l => TokensHeading.IsMatch(l));
        if (start < 0) return new TokenTable(0, null, []);
        var section = SectionAfter(lines, start);
        var headerAt = HeaderIndex(section);
        return new TokenTable(start + 1, headerAt < 0 ? null : Cells(section[headerAt]), headerAt < 0 ? [] : Rows(section, headerAt, start));
    }

    /// <summary>The lines after the heading at <paramref name="start"/>, up to the next heading of level 1 or 2.</summary>
    private static string[] SectionAfter(string[] lines, int start)
    {
        var end = Array.FindIndex(lines, start + 1, l => AnyHeading.IsMatch(l));
        return lines[(start + 1)..(end < 0 ? lines.Length : end)];
    }

    /// <summary>The first line that is a table row followed by a separator row with a dash; -1 when there is none.</summary>
    private static int HeaderIndex(string[] section) =>
        Enumerable.Range(0, Math.Max(section.Length - 1, 0)).FirstOrDefault(i => IsHeaderAt(section, i), -1);

    private static bool IsHeaderAt(string[] section, int i) =>
        TableLine.IsMatch(section[i]) && TableSeparator.IsMatch(section[i + 1]) && section[i + 1].Contains('-');

    private static List<TokenRow> Rows(string[] section, int headerAt, int start) =>
        [.. section.Skip(headerAt + 2).TakeWhile(l => TableLine.IsMatch(l)).Select((row, k) => ToRow(row, start + headerAt + k + 4))];

    private static TokenRow ToRow(string row, int line)
    {
        var cells = Cells(row);
        return new TokenRow(Cell(cells, 0).Replace("`", ""), Cell(cells, 2), line);
    }

    private static string Cell(string[] cells, int index) => index < cells.Length ? cells[index] : "";

    private static string[] Cells(string row)
    {
        var trimmed = row.Trim();
        if (trimmed.StartsWith('|')) trimmed = trimmed[1..];
        if (trimmed.EndsWith('|')) trimmed = trimmed[..^1];
        return [.. trimmed.Split('|').Select(c => c.Trim())];
    }
}
