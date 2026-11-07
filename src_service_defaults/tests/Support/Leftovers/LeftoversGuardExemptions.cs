using System.Text.RegularExpressions;

namespace CredsForDevs.Tests.Leftovers;

/// <summary>The exemption marker of rule §7: a comment <c>&lt;prefix&gt;-exempt: &lt;class&gt; — &lt;reason&gt;</c> on the line of a finding or the line
/// above it. A marker is itself judged: the class must be one that accepts an exemption, the reason must be a reason, and a
/// <c>shared-store</c> marker must name its lock. A marker that exempts nothing is a finding of class <c>exemption</c>.</summary>
internal static class GuardExemptions
{
    /// <summary>The classes a marker may exempt. <c>ryuk-off</c> and <c>owner-blind</c> accept none.</summary>
    internal static readonly string[] Exemptible = ["raw-temp", "raw-worktree", "docker-run", "docker-name", "legacy-name", "shared-store"];

    private const string MarkerWord = LeftoversGuard.CamelWord + "-exempt:";

    private static readonly Dictionary<string, string> Refused = new(StringComparer.Ordinal)
    {
        [""] = "an exemption names no class",
        ["ryuk-off"] = "`ryuk-off` accepts no exemption",
        ["owner-blind"] = "`owner-blind` accepts no exemption of any kind",
    };

    private static readonly Regex Marker = Rx(@"(?://|#|--|/\*|\*|<!--)\s*" + Regex.Escape(MarkerWord) + "(.*)$");
    private static readonly Regex MarkerBody = Rx(@"^\s*([^\s—]*)\s*(?:—\s*(.*?))?\s*(?:\*/|-->)?\s*\z");
    private static readonly Regex Placeholder = Rx(@"^(?:see above|see below|needed|required|necessary|obvious|todo|tbd|n/?a|because|why|reason|it is needed)\b", RegexOptions.IgnoreCase);

    private static Regex Rx(string pattern, RegexOptions options = RegexOptions.None) => new(pattern, options | RegexOptions.CultureInvariant);

    /// <summary>The lines each class is exempt on, and a finding for every marker that exempts nothing.</summary>
    internal static Dictionary<string, HashSet<int>> Read(string file, string[] lines, out List<Finding> findings)
    {
        var valid = Exemptible.ToDictionary(c => c, _ => new HashSet<int>(), StringComparer.Ordinal);
        var markers = lines.Select((line, i) => (Marker: Marker.Match(line), Number: i + 1)).Where(m => m.Marker.Success)
            .Select(m => (m.Number, Verdict: Judge(m.Marker.Groups[1].Value))).ToList();
        foreach (var (number, verdict) in markers.Where(m => m.Verdict.Class is not null)) valid[verdict.Class!].Add(number);
        findings = [.. markers.Where(m => m.Verdict.Class is null).Select(m => new Finding(file, m.Number, "exemption", m.Verdict.Problem))];
        return valid;
    }

    /// <summary>Is <paramref name="cls"/> exempt on <paramref name="line"/> — a marker on the line or the one above?</summary>
    internal static bool IsExempt(Dictionary<string, HashSet<int>> exemptions, string cls, int line) =>
        exemptions.TryGetValue(cls, out var lines) && (lines.Contains(line) || lines.Contains(line - 1));

    /// <summary>The class a marker exempts, or why it exempts nothing.</summary>
    private static (string? Class, string Problem) Judge(string rest)
    {
        var parsed = MarkerBody.Match(rest);
        var cls = parsed.Groups[1].Value;
        var problem = ClassProblem(cls) ?? ReasonProblem(cls, parsed.Groups[2].Value);
        return problem is null ? (cls, "") : (null, problem);
    }

    private static string? ClassProblem(string cls) =>
        Refused.TryGetValue(cls, out var refusal) ? refusal : Exemptible.Contains(cls) ? null : $"an exemption names an unknown class `{cls}`";

    private static string? ReasonProblem(string cls, string reason)
    {
        if (!IsReason(reason)) return $"the exemption of `{cls}` carries no reason (ten characters, three words, not a placeholder)";
        return cls == "shared-store" && !reason.Contains("lock:", StringComparison.Ordinal) ? "the exemption of `shared-store` must name its lock (`lock: …`)" : null;
    }

    private static bool IsReason(string reason) =>
        reason.Length >= 10 && reason.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries).Length >= 3 && !Placeholder.IsMatch(reason);
}
