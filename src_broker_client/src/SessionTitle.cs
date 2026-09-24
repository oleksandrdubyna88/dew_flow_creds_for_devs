using System.Text.Json;

namespace CredsBroker;

/// <summary>The last bytes of a transcript, and whether they are all of it.</summary>
/// <remarks>
/// <see cref="IsWholeFile"/> decides whether the first line may be trusted: a read that began past
/// offset 0 almost always began inside a line, and that fragment is dropped rather than parsed.
/// </remarks>
public sealed record TranscriptTail(byte[] Bytes, bool IsWholeFile);

/// <summary>
/// The two file reads the title needs — injected, so every branch of <see cref="SessionTitle"/> is a
/// unit test and only the production reads touch a disk.
/// </summary>
/// <param name="ReadTail">The last <c>N</c> bytes of a file, or <c>null</c> when it cannot be read.</param>
/// <param name="ReadSmall">The whole text of a file of at most <c>N</c> bytes, or <c>null</c>.</param>
public sealed record TranscriptSources(
    Func<string, int, TranscriptTail?> ReadTail,
    Func<string, int, string?> ReadSmall)
{
    /// <summary>The real filesystem, through the bounded readers below.</summary>
    public static TranscriptSources Files { get; } = new(SessionTitle.ReadTailOf, SessionTitle.ReadSmallFile);
}

/// <summary>
/// The text on a Claude Code tab — the session's title — read from the tail of its transcript.
/// </summary>
/// <remarks>
/// <para><b>Where the tab's text comes from</b> (read in <c>anthropic.claude-code</c> 2.1.281, 2026-09-24):
/// the session's summary, found by reading the last 64 KB of
/// <c>~/.claude/projects/&lt;folder&gt;/&lt;sessionId&gt;.jsonl</c> in this order — the last
/// <c>customTitle</c> line, then <c>&lt;sessionId&gt;/custom-title.json</c>, then the last
/// <c>aiTitle</c> line. The extension goes further down its own ladder (the last prompt, the first
/// prompt, a summary): those are the TEXT OF THE CONVERSATION, and this reader never goes there.
/// A session whose title would come only from them has no title here.</para>
/// <para><b>Nothing of the conversation survives the read.</b> The tail is a byte buffer that goes
/// out of scope when <see cref="Read"/> returns. A line is looked at only when it STARTS with a
/// title record's own prefix; only such a line is parsed, its ROOT <c>type</c> is checked again, and
/// one string is taken from it. Every other line is never decoded to text. Conversation text is a
/// JSON string inside a user or assistant record, so its quotes are escaped and it cannot begin a
/// physical line with the unescaped prefix.</para>
/// <para><b>Every failure is an empty title</b> — a missing file, a malformed line, a folder name this
/// code cannot compute. The title is a label; a call never fails for want of one.</para>
/// </remarks>
public static class SessionTitle
{
    /// <summary>The tab's own window, and twice the measured distance of the last title line (33 KB over 150 sessions).</summary>
    public const int MaxTailBytes = 64 * 1024;

    /// <summary><c>{"customTitle":"…"}</c> — 34 bytes measured; anything past this is not one.</summary>
    public const int MaxTitleFileBytes = 1024;

    /// <summary>Past this, Claude Code appends a hash to the folder name that this code cannot reproduce.</summary>
    public const int MaxProjectFolderChars = 200;

    /// <summary>A session id is a uuid; this is generous and still a single, safe path segment.</summary>
    public const int MaxSessionIdChars = 64;

    private const string TitleFileName = "custom-title.json";

    /// <summary>
    /// The title of the session, or empty: the last custom title in the tail, else
    /// <c>custom-title.json</c>, else the last AI title in the tail.
    /// </summary>
    /// <param name="home">The user's home folder — must be rooted.</param>
    /// <param name="cwd">The folder the session started in, as its registry entry records it.</param>
    /// <param name="sessionId">The full session id.</param>
    /// <param name="sources">The two reads.</param>
    public static string Read(string home, string cwd, string sessionId, TranscriptSources sources)
    {
        var transcript = TranscriptPath(home, cwd, sessionId);
        if (transcript is null)
        {
            return string.Empty;
        }

        var (custom, ai) = sources.ReadTail(transcript, MaxTailBytes) is { } tail
            ? FromTail(tail.Bytes, tail.IsWholeFile)
            : (string.Empty, string.Empty);
        // The title file is the SECOND rung, so it is opened only when the first gave nothing — per
        // call, a missing file would otherwise cost an open and a thrown exception for nothing.
        var chosen = custom.Length > 0 ? custom : NonBlankOr(CustomFromFile(ReadTitleFile(home, cwd, sessionId, sources)), ai);
        return CallerIdentity.Clean(chosen);
    }

    /// <summary>The transcript's path, or <c>null</c> when any part of it cannot be trusted or computed.</summary>
    public static string? TranscriptPath(string home, string cwd, string sessionId) =>
        ProjectDirectory(home, cwd, sessionId) is { } folder ? Path.Combine(folder, $"{sessionId}.jsonl") : null;

    /// <summary>The <c>custom-title.json</c> beside the transcript, or <c>null</c>.</summary>
    public static string? TitleFilePath(string home, string cwd, string sessionId) =>
        ProjectDirectory(home, cwd, sessionId) is { } folder ? Path.Combine(folder, sessionId, TitleFileName) : null;

    /// <summary>
    /// Claude Code's folder name for a working folder: every character outside <c>[a-zA-Z0-9]</c>
    /// becomes <c>-</c> — per UTF-16 unit, as the JavaScript that names it counts — or <c>null</c>
    /// when the result is longer than <see cref="MaxProjectFolderChars"/> or there is no folder.
    /// </summary>
    public static string? ProjectFolder(string? cwd)
    {
        if (string.IsNullOrEmpty(cwd) || cwd.Length > MaxProjectFolderChars)
        {
            return null;
        }

        return string.Create(cwd.Length, cwd, static (span, source) =>
        {
            for (var i = 0; i < source.Length; i++)
            {
                span[i] = char.IsAsciiLetterOrDigit(source[i]) ? source[i] : '-';
            }
        });
    }

    /// <summary>One to <see cref="MaxSessionIdChars"/> of <c>[A-Za-z0-9-]</c> — a path segment that cannot escape its folder.</summary>
    public static bool IsSessionId(string? value) =>
        value is { Length: >= 1 and <= MaxSessionIdChars } && value.All(c => char.IsAsciiLetterOrDigit(c) || c == '-');

    /// <summary>
    /// The last non-blank custom title and the last non-blank AI title in a tail. Custom outranks AI
    /// whatever their order; among several of one kind the LAST wins, as on the tab.
    /// </summary>
    /// <param name="tail">The bytes read.</param>
    /// <param name="isWholeFile">Whether the read began at offset 0; if not, the first line is a fragment and is dropped.</param>
    public static (string Custom, string Ai) FromTail(ReadOnlySpan<byte> tail, bool isWholeFile)
    {
        var rest = isWholeFile ? tail : AfterFirstLine(tail);
        var custom = string.Empty;
        var ai = string.Empty;
        while (!rest.IsEmpty)
        {
            var end = rest.IndexOf((byte)'\n');
            var line = end < 0 ? rest : rest[..end];
            rest = end < 0 ? [] : rest[(end + 1)..];
            (custom, ai) = Keep(line, custom, ai);
        }

        return (custom, ai);
    }

    /// <summary>The <c>customTitle</c> of a <c>custom-title.json</c>, or empty for anything else.</summary>
    public static string CustomFromFile(string? json)
    {
        if (string.IsNullOrEmpty(json))
        {
            return string.Empty;
        }

        try
        {
            using var document = JsonDocument.Parse(json);
            return StringProperty(document.RootElement, "customTitle");
        }
        catch (JsonException)
        {
            return string.Empty;
        }
    }

    private static string? ProjectDirectory(string home, string cwd, string sessionId) =>
        Path.IsPathRooted(home) && IsSessionId(sessionId) && ProjectFolder(cwd) is { } project
            ? Path.Combine(home, ".claude", "projects", project)
            : null;

    private static string? ReadTitleFile(string home, string cwd, string sessionId, TranscriptSources sources) =>
        TitleFilePath(home, cwd, sessionId) is { } path ? sources.ReadSmall(path, MaxTitleFileBytes) : null;

    private static ReadOnlySpan<byte> AfterFirstLine(ReadOnlySpan<byte> tail)
    {
        var cut = tail.IndexOf((byte)'\n');
        return cut < 0 ? [] : tail[(cut + 1)..];
    }

    // A line counts only if it starts with a title record's own prefix — so a line of the
    // conversation is never decoded or parsed at all — and a blank title never displaces a real one.
    private static (string Custom, string Ai) Keep(ReadOnlySpan<byte> line, string custom, string ai)
    {
        if (line.StartsWith("{\"type\":\"custom-title\""u8))
        {
            return (NonBlankOr(TitleOf(line, "custom-title", "customTitle"), custom), ai);
        }

        return line.StartsWith("{\"type\":\"ai-title\""u8)
            ? (custom, NonBlankOr(TitleOf(line, "ai-title", "aiTitle"), ai))
            : (custom, ai);
    }

    private static string NonBlankOr(string candidate, string current) =>
        string.IsNullOrWhiteSpace(candidate) ? current : candidate;

    private static string TitleOf(ReadOnlySpan<byte> line, string type, string property)
    {
        try
        {
            using var document = JsonDocument.Parse(line.ToArray());
            var root = document.RootElement;
            return StringProperty(root, "type") == type ? StringProperty(root, property) : string.Empty;
        }
        catch (JsonException)
        {
            return string.Empty; // a torn or malformed line is no title, never a failed call
        }
    }

    private static string StringProperty(JsonElement element, string name) =>
        element.ValueKind == JsonValueKind.Object
        && element.TryGetProperty(name, out var value)
        && value.ValueKind == JsonValueKind.String
            ? value.GetString() ?? string.Empty
            : string.Empty;

    /// <summary>
    /// The production tail read: <c>Seek</c> to <c>max(0, length − max)</c> and read AT MOST
    /// <paramref name="max"/> bytes — a bound on the read itself, so a transcript that grows between
    /// taking its length and reading it cannot enlarge what is read. A 100 MB file costs 64 KB.
    /// </summary>
    internal static TranscriptTail? ReadTailOf(string path, int max)
    {
        try
        {
            using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
            var start = Math.Max(0, stream.Length - max);
            stream.Seek(start, SeekOrigin.Begin);
            var buffer = new byte[max];
            var read = stream.ReadAtLeast(buffer, max, throwOnEndOfStream: false);
            return new TranscriptTail(buffer[..read], start == 0);
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or ArgumentException or NotSupportedException)
        {
            return null;
        }
    }

    /// <summary>A whole small file, or <c>null</c> when it is missing, unreadable or larger than <paramref name="max"/> bytes.</summary>
    internal static string? ReadSmallFile(string path, int max)
    {
        try
        {
            using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
            var buffer = new byte[max + 1];
            var read = stream.ReadAtLeast(buffer, max + 1, throwOnEndOfStream: false);
            return read > max ? null : System.Text.Encoding.UTF8.GetString(buffer, 0, read);
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or ArgumentException or NotSupportedException)
        {
            return null;
        }
    }
}
