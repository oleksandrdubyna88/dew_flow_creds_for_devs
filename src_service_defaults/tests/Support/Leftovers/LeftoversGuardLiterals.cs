using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace CredsForDevs.Tests.Leftovers;

/// <summary>A line of C# as the compiler reads its literals: <see cref="Text"/> is the line with every literal replaced by its DECODED content
/// in quotes and adjacent literals joined; <see cref="Literals"/> are those contents, one per joined literal.</summary>
internal sealed record FoldedLine(string Text, IReadOnlyList<string> Literals);

/// <summary>Reading the literals of one line of C# the way the compiler does, so a word cannot be hidden from the guard by how it is spelled:
/// an escape (<c>T</c>, <c>\x54</c>) is decoded; a verbatim, interpolated or character literal is read as what it holds; the operands of
/// <c>+</c> and of <c>string.Concat(…)</c> that are literals are joined, and so are interpolation holes that hold only a literal; and a regex
/// character class of one character (<c>[T]</c>) is the character. A SPELLING check, not a data-flow one: a name built from a variable, a
/// resource, a source generator or a char array is not seen. Every method is small on purpose (CA1502, at most 4).</summary>
internal static class GuardLiterals
{
    private const char Open = '\u0001', Close = '\u0002';
    private const int MinimumPiece = 5, TestsEnd = 5, DeleteStart = 7;

    private const string Quoted = @"""(?:[^""\\]|\\.)*""";
    private const string Hole = @"\{(?:[^{}""]|" + Quoted + @")*\}";

    /// <summary>A literal: verbatim-interpolated, verbatim, interpolated, regular, character — in that order, so <c>@"</c> and <c>$"</c> win over a bare quote.</summary>
    private static readonly Regex Literal = new(
        @"(?:\$@|@\$)""(?<vi>(?:[^""{]|""""|\{\{|" + Hole + @")*)"""
        + @"|@""(?<ve>(?:[^""]|"""")*)"""
        + @"|\$""(?<ip>(?:[^""\\{]|\\.|\{\{|" + Hole + @")*)"""
        + @"|""(?<re>(?:[^""\\]|\\.)*)"""
        + @"|'(?<ch>(?:[^'\\]|\\.)*)'", RegexOptions.CultureInvariant);

    private static readonly (string Group, Func<string, string> Decode)[] Kinds =
    [
        ("vi", body => Verbatim(Holes(body))),
        ("ve", Verbatim),
        ("ip", body => Unescape(Holes(body))),
        ("re", Unescape),
        ("ch", Unescape),
    ];

    private static readonly Regex LiteralHole = Rx(@"\{\s*""((?:[^""\\]|\\.)*)""\s*\}");
    private static readonly Regex Escape = Rx(@"\\(?:u(?<u>[0-9a-fA-F]{4})|U(?<U>[0-9a-fA-F]{8})|x(?<x>[0-9a-fA-F]{1,4})|(?<c>.))");
    private static readonly string[] HexEscapes = ["u", "U", "x"];
    private static readonly Regex SingleClass = Rx(@"\[([^\]\\^\-])\]");
    private static readonly Regex Plus = Rx(Close + @"\s*\+\s*" + Open);
    private static readonly Regex Comma = Rx(Close + @"\s*,\s*" + Open);
    private static readonly Regex Contents = Rx(Open + "([^" + Close + "]*)" + Close);

    private static readonly Dictionary<string, string> Simple = new(StringComparer.Ordinal)
    {
        ["n"] = "\n",
        ["r"] = "\r",
        ["t"] = "\t",
        ["0"] = "\0",
        ["a"] = "\a",
        ["b"] = "\b",
        ["f"] = "\f",
        ["v"] = "\v",
    };

    /// <summary>The pieces of the prefix word the guard refuses in a literal: every substring of at least five characters that is not
    /// wholly inside the first word or wholly inside the last — so <c>tests</c> and <c>delete</c> alone are words, and every piece that
    /// crosses the join (<c>testsTo</c>, <c>sToDel</c>, <c>oDelete</c>) is a half of the prefix.</summary>
    internal static Regex PrefixPieces { get; } = new(string.Join('|', Pieces(LeftoversGuard.Word)), RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    /// <summary>The line with its literals read as the compiler reads them.</summary>
    internal static FoldedLine Fold(string line)
    {
        var joined = Joined(Literal.Replace(line, m => $"{Open}{Decoded(m)}{Close}"));
        return new FoldedLine(joined.Replace(Open, '"').Replace(Close, '"'), [.. Contents.Matches(joined).Select(m => m.Groups[1].Value)]);
    }

    private static Regex Rx(string pattern) => new(pattern, RegexOptions.CultureInvariant);

    private static string Joined(string marked)
    {
        var plus = Plus.Replace(marked, "");
        return marked.Contains("Concat(", StringComparison.Ordinal) ? Comma.Replace(plus, "") : plus;
    }

    private static string Decoded(Match literal)
    {
        var (group, decode) = Kinds.First(k => literal.Groups[k.Group].Success);
        return SingleClass.Replace(decode(literal.Groups[group].Value), "$1");
    }

    private static string Verbatim(string body) => body.Replace("\"\"", "\"", StringComparison.Ordinal);

    private static string Holes(string body) => LiteralHole.Replace(body, "$1");

    private static string Unescape(string body) => Escape.Replace(body, Decode);

    private static string Decode(Match escape) =>
        HexEscapes.FirstOrDefault(g => escape.Groups[g].Success) is { } hex ? FromCode(escape.Groups[hex].Value) : Plain(escape.Groups["c"].Value);

    private static string FromCode(string hex)
    {
        var code = int.Parse(hex, NumberStyles.AllowHexSpecifier, CultureInfo.InvariantCulture);
        return Rune.IsValid(code) ? char.ConvertFromUtf32(code) : "�";
    }

    private static string Plain(string escaped) => Simple.GetValueOrDefault(escaped, escaped);

    private static IEnumerable<string> Pieces(string word) =>
        from length in Enumerable.Range(MinimumPiece, word.Length - MinimumPiece + 1)
        from at in Enumerable.Range(0, word.Length - length + 1)
        where at + length > TestsEnd && at < DeleteStart
        orderby length descending
        select word.Substring(at, length);
}
