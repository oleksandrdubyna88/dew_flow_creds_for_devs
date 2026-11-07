using System.Text;

namespace CredsForDevs.Tests.Leftovers;

/// <summary>Reading a source file as text for the guard: its lines, its comments, its literals. A comment is blanked (its line ends
/// kept, so no line number moves) before a detector looks at a line, and the walk that finds a comment respects string literals — a
/// slash-star inside one opens nothing. Every method is small on purpose (cyclomatic complexity of at most 4, measured by CA1502).</summary>
internal static class GuardText
{
    internal static string[] SplitLines(string text) => [.. text.Split('\n').Select(l => l.EndsWith('\r') ? l[..^1] : l)];

    internal static bool IsComment(string line)
    {
        var trimmed = line.TrimStart();
        return trimmed.StartsWith("//", StringComparison.Ordinal) || trimmed.StartsWith('#');
    }

    internal static string FirstLine(string text) => text.Split('\n', 2)[0].TrimEnd('\r');

    /// <summary>Each character inside a <c>/* … */</c> comment becomes a space and every line end is kept, so line numbers do not
    /// move. The walk respects string literals — a <c>/*</c> inside one opens nothing — and line comments.</summary>
    internal static string StripBlockComments(string text, bool csharp)
    {
        var sb = new StringBuilder(text.Length);
        var i = 0;
        while (i < text.Length) i = Take(text, i, csharp, sb);
        return sb.ToString();
    }

    /// <summary>Appends the segment that starts at <paramref name="i"/> — a line comment, a block comment (blanked), a literal, or one
    /// character — and returns the index just past it.</summary>
    private static int Take(string text, int i, bool csharp, StringBuilder sb)
    {
        var end = SegmentEnd(text, i, csharp);
        if (At(text, i, "/*")) sb.Append(Blanked(text[i..end]));
        else sb.Append(text, i, end - i);
        return end;
    }

    private static int SegmentEnd(string text, int i, bool csharp)
    {
        if (At(text, i, "//")) return LineEnd(text, i);
        if (At(text, i, "/*")) return BlockEnd(text, i);
        return OpensLiteral(text[i], csharp) ? EndOfLiteral(text, i, csharp) : i + 1;
    }

    private static bool At(string text, int index, string value) => string.CompareOrdinal(text, index, value, 0, value.Length) == 0;

    private static bool OpensLiteral(char c, bool csharp) => c is '"' or '\'' || (!csharp && c == '`');

    private static int LineEnd(string text, int i)
    {
        var end = text.IndexOf('\n', i);
        return end < 0 ? text.Length : end;
    }

    private static int BlockEnd(string text, int i)
    {
        var close = text.IndexOf("*/", i + 2, StringComparison.Ordinal);
        return close < 0 ? text.Length : close + 2;
    }

    private static string Blanked(string comment) => new([.. comment.Select(c => c is '\n' or '\r' ? c : ' ')]);

    /// <summary>The index just past the literal that starts at <paramref name="start"/>: a C# verbatim string (a doubled quote is a
    /// quote), a raw string, a regular string or char literal, or a JavaScript string or template.</summary>
    internal static int EndOfLiteral(string text, int start, bool csharp) =>
        (IsCSharpString(text, start, csharp) ? CSharpStringEnd(text, start) : null) ?? QuotedEnd(text, start, IsTemplate(text, start, csharp));

    private static bool IsCSharpString(string text, int start, bool csharp) => csharp && text[start] == '"';

    /// <summary>A JavaScript template literal: it may span lines.</summary>
    private static bool IsTemplate(string text, int start, bool csharp) => !csharp && text[start] == '`';

    /// <summary>The end of a verbatim, raw or empty C# string; null for a regular one (the caller reads it up to its closing quote).</summary>
    private static int? CSharpStringEnd(string text, int start)
    {
        if (IsVerbatim(text, start)) return VerbatimEnd(text, start);
        var run = QuoteRun(text, start);
        return run >= 3 ? RawEnd(text, start, run) : run == 2 ? start + 2 : null; // two quotes: the empty string
    }

    /// <summary>A quote right after <c>@</c> (<c>@"</c>, <c>$@"</c>) or after <c>@$</c>.</summary>
    private static bool IsVerbatim(string text, int quote) => PrecededBy(text, quote, "@") || PrecededBy(text, quote, "@$");

    private static bool PrecededBy(string text, int index, string value) =>
        index >= value.Length && string.CompareOrdinal(text, index - value.Length, value, 0, value.Length) == 0;

    private static int VerbatimEnd(string text, int start)
    {
        var from = start + 1;
        while (true)
        {
            var quote = text.IndexOf('"', from);
            if (quote < 0) return text.Length;
            if (!Doubled(text, quote)) return quote + 1;
            from = quote + 2;
        }
    }

    private static bool Doubled(string text, int quote) => quote + 1 < text.Length && text[quote + 1] == '"';

    private static int QuoteRun(string text, int start)
    {
        var run = 0;
        while (start + run < text.Length && text[start + run] == '"') run++;
        return run;
    }

    private static int RawEnd(string text, int start, int run)
    {
        var close = text.IndexOf(new string('"', run), start + run, StringComparison.Ordinal);
        return close < 0 ? text.Length : close + run;
    }

    /// <summary>A regular literal: up to its closing quote, past a backslash and the character it escapes; a line ends it unless it is a
    /// template.</summary>
    private static int QuotedEnd(string text, int start, bool multiline)
    {
        for (var i = start + 1; i < text.Length; i += text[i] == '\\' ? 2 : 1)
        {
            if (LiteralEndAt(text, i, text[start], multiline) is { } end) return end;
        }

        return text.Length;
    }

    private static int? LiteralEndAt(string text, int i, char quote, bool multiline)
    {
        if (text[i] == quote) return i + 1;
        return text[i] == '\n' && !multiline ? i : null;
    }
}
