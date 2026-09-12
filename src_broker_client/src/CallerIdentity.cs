using System.Buffers.Text;
using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

namespace CredsBroker;

/// <summary>
/// Who is calling — the label a client sends the window, so the consent modal can say WHO is
/// asking instead of always saying "Claude Code".
/// </summary>
/// <remarks>
/// <para><b>It is a label, and it never reaches a decision.</b> Nothing on the window side keys a
/// switch, a route, a throttle or a grant on it; it is rendered into the modal and written to the
/// audit line, capped and stripped there regardless of what this side sends. That is what makes it
/// safe to compute from the environment of whatever process happens to be running this binary, and
/// why the cleaning done here is courtesy rather than a guard.</para>
/// <para>Shared by <c>creds-mcp</c> and <c>creds</c>, which is why it lives in this library. Shape
/// and ladder follow the sibling repository's <c>CallerIdentity.From</c> (ConnectOtherAIs); the two
/// share no code.</para>
/// </remarks>
public sealed record CallerRecord(
    [property: JsonPropertyName("agent")] string Agent,
    [property: JsonPropertyName("session")] string Session,
    [property: JsonPropertyName("sessionName")] string SessionName,
    [property: JsonPropertyName("cwd")] string Cwd)
{
    /// <summary>Nothing known — what the window renders as "An agent".</summary>
    public static CallerRecord Empty { get; } = new(string.Empty, string.Empty, string.Empty, string.Empty);

    /// <summary>Whether nothing at all was learnt. Not a wire field — the body carries the four named ones and no other.</summary>
    [JsonIgnore]
    public bool IsEmpty => Agent.Length == 0 && Session.Length == 0 && SessionName.Length == 0 && Cwd.Length == 0;

    /// <summary>
    /// The side that spoke to the client names the client — and only when nobody else has.
    /// </summary>
    /// <remarks>
    /// Under the WSL bridge the Linux half computes the session, its name and the folder and never
    /// instantiates the server, so it forwards an empty <see cref="Agent"/>; the Windows half is
    /// the process whose <c>ClientInfo</c> knows the client, and fills it. A forwarded label that is
    /// NOT empty is somebody's decision already and is kept.
    /// </remarks>
    public CallerRecord NamedBy(string? agent) =>
        Agent.Length > 0 ? this : this with { Agent = CallerIdentity.Clean(agent) };

    /// <summary>Every field through the one cleaner — what building and decoding both end with.</summary>
    internal CallerRecord Cleaned() =>
        new(CallerIdentity.Clean(Agent), CallerIdentity.Clean(Session), CallerIdentity.Clean(SessionName), CallerIdentity.Clean(Cwd));
}

/// <summary>
/// The two fields of <c>~/.claude/sessions/&lt;pid&gt;.json</c> this library reads — and nothing else.
/// </summary>
/// <remarks>
/// <para>A property this build does not know is dropped on the way in rather than refused, the
/// same rule <c>McpEntry</c> states: the registry is Claude Code's file, and it will grow.</para>
/// <para>Public only because the JSON source generator publishes a <c>JsonTypeInfo</c> property for
/// every type on the public <see cref="BrokerJsonContext"/>, and an internal type there is a
/// compile error (CS0053). Nothing outside this file constructs one.</para>
/// </remarks>
public sealed record SessionFile(
    [property: JsonPropertyName("name")] string? Name,
    [property: JsonPropertyName("cwd")] string? Cwd);

/// <summary>
/// Building the caller record from the environment, once at start-up.
/// </summary>
/// <remarks>
/// <para><b>Sources, in order.</b> The session id from the ladder below — first non-blank wins,
/// shortened to eight characters because a full uuid crowds the sentence. Then, only when there IS a
/// session, <c>CLAUDE_PID</c> names <c>~/.claude/sessions/&lt;pid&gt;.json</c>, whose <c>name</c> is
/// the session's name and whose <c>cwd</c> — reduced to its BASENAME, a full local path in a modal
/// being a leak the label must not carry — is the working folder; the process's own folder is the
/// fallback. Measured on 2026-09-12: Claude Code exports both variables to every child it spawns,
/// an MCP server on stdio included, and the registry holds the real folder of the session.</para>
/// <para><b>The session-file read is a bounded, failure-tolerant, single-file read</b>, and every
/// clause is a rule: only <c>&lt;pid&gt;.json</c>, with a digits-only pid, is ever opened — the
/// directory holds <c>.key</c> files beside the session files and is never enumerated; the size is
/// capped at 64 KB; any failure leaves the fields empty and throws nothing. A stale file is possible
/// (pids are recycled) and is accepted: a wrong session NAME is a wrong label, not a wrong
/// permission, and the id beside it comes from the live process.</para>
/// <para>Every source is injectable so every branch is a unit test with no filesystem.</para>
/// </remarks>
public static class CallerIdentity
{
    /// <summary>Where the session id comes from; first non-blank wins.</summary>
    /// <remarks>
    /// <c>CREDS_CALLER_SESSION</c> is first so a client with no id of its own can still be given one,
    /// exactly as the sibling repository's <c>COAI_CALLER_SESSION</c> is.
    /// </remarks>
    public static readonly IReadOnlyList<string> SessionLadder =
    [
        "CREDS_CALLER_SESSION",
        "CLAUDE_CODE_SESSION_ID",
        "CODEX_SESSION_ID",
        "GEMINI_CLI_SESSION_ID",
    ];

    /// <summary>Claude Code's own pid, which names its entry in the session registry.</summary>
    public const string PidVariable = "CLAUDE_PID";

    /// <summary>Per field — the same number the contract carries as <c>caller.maxFieldChars</c>.</summary>
    public const int MaxFieldChars = 80;

    /// <summary>The short form of a session id: the first eight characters, or the whole of a shorter one.</summary>
    public const int ShortSessionChars = 8;

    /// <summary>A registry entry is a few hundred bytes; anything past this is not one.</summary>
    public const int MaxSessionFileBytes = 64 * 1024;

    private const string Separator = "→";

    /// <summary>The record for this process, from its real environment, home folder and working folder.</summary>
    public static CallerRecord Current(string agent) =>
        Build(agent, Environment.GetEnvironmentVariable, ReadBounded, HomeDirectory(), CurrentDirectory());

    /// <summary>The record from injected sources — the shape every test drives.</summary>
    /// <param name="agent">The product label: <c>creds CLI</c>, or empty for the MCP server to fill from its client.</param>
    /// <param name="env">The environment, by variable name.</param>
    /// <param name="readFile">The whole text of a file, or <c>null</c> when it cannot be read.</param>
    /// <param name="home">The user's home folder.</param>
    /// <param name="processCwd">This process's working folder — the fallback for <see cref="CallerRecord.Cwd"/>.</param>
    public static CallerRecord Build(
        string agent,
        Func<string, string?> env,
        Func<string, string?> readFile,
        string home,
        string processCwd)
    {
        var session = Clean(SessionFrom(env));
        // No session, no session file: a session NAME without a session id would be a name for
        // nothing, and the plain CLI in a person's own terminal then costs no file read at all.
        var file = session.Length == 0 ? null : ReadSessionFile(env(PidVariable), home, readFile);
        var folder = Basename(file?.Cwd ?? string.Empty);
        return new CallerRecord(
            Clean(agent),
            CapRunes(session, ShortSessionChars),
            Clean(file?.Name),
            Clean(folder.Length > 0 ? folder : Basename(processCwd)));
    }

    /// <summary>The first rung of the ladder that is set and not blank, trimmed — or empty.</summary>
    public static string SessionFrom(Func<string, string?> env)
    {
        foreach (var name in SessionLadder)
        {
            if (env(name) is { } value && !string.IsNullOrWhiteSpace(value))
            {
                return value.Trim();
            }
        }

        return string.Empty;
    }

    /// <summary>
    /// The one path this library may open under the registry, or <c>null</c> for a pid it will not
    /// interpolate.
    /// </summary>
    /// <remarks>
    /// The pid comes from the environment, and a path segment built from environment data is
    /// exactly the shape that is repeatedly mis-sanitised: one to ten ASCII digits, or no read.
    /// </remarks>
    public static string? SessionFilePath(string? pid, string home) =>
        pid is { Length: >= 1 and <= 10 } && pid.All(char.IsAsciiDigit)
            ? Path.Combine(home, ".claude", "sessions", $"{pid}.json")
            : null;

    internal static SessionFile? ReadSessionFile(string? pid, string home, Func<string, string?> readFile)
    {
        var path = SessionFilePath(pid, home);
        if (path is null)
        {
            return null;
        }

        var content = readFile(path);
        if (content is null || content.Length > MaxSessionFileBytes)
        {
            return null;
        }

        try
        {
            return JsonSerializer.Deserialize(content, BrokerJsonContext.Default.SessionFile);
        }
        catch (JsonException)
        {
            return null; // malformed, or not an object: an empty label, never a crash at start-up
        }
    }

    /// <summary>The last segment of a path under EITHER separator, or empty.</summary>
    /// <remarks>
    /// Both separators, always: the Linux half of the WSL bridge reads a Linux registry entry, a
    /// Windows client's entry holds a Windows path, and the same binary must reduce both.
    /// <c>Path.GetFileName</c> knows only the host's separator.
    /// </remarks>
    public static string Basename(string path)
    {
        var trimmed = path.TrimEnd('/', '\\');
        var cut = trimmed.LastIndexOfAny(['/', '\\']);
        return cut < 0 ? trimmed : trimmed[(cut + 1)..];
    }

    /// <summary>
    /// One field: one line, no control or format characters, no audit separator, whitespace runs
    /// collapsed, trimmed, at most <see cref="MaxFieldChars"/> characters — counted by code point,
    /// so the cut never leaves half a surrogate pair.
    /// </summary>
    public static string Clean(string? value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return string.Empty;
        }

        var words = Spaced(value).Split(' ', StringSplitOptions.RemoveEmptyEntries);
        return CapRunes(string.Join(' ', words), MaxFieldChars);
    }

    private static string Spaced(string value) =>
        string.Concat(value.EnumerateRunes().Select(rune => IsSpaceLike(rune) ? " " : rune.ToString()));

    // Whitespace of every kind, controls (Cc — `\n`, `\r`, `\t`, a bell, an escape), formats (Cf — a
    // zero-width space, a direction override) and the audit line's field separator all become a
    // space, so `X\n\nAllow` reads `X Allow` rather than `XAllow`; the run then collapses.
    private static bool IsSpaceLike(Rune rune) =>
        Rune.IsWhiteSpace(rune)
        || Rune.IsControl(rune)
        || Rune.GetUnicodeCategory(rune) == UnicodeCategory.Format
        || rune.ToString() == Separator;

    private static string CapRunes(string text, int max)
    {
        var runes = text.EnumerateRunes().ToArray();
        return runes.Length <= max ? text : string.Concat(runes.Take(max).Select(rune => rune.ToString()));
    }

    /// <summary>The record as the body field the window reads — the contract's nested object.</summary>
    public static JsonObject ToJson(CallerRecord record) =>
        JsonSerializer.SerializeToNode(record, BrokerJsonContext.Default.CallerRecord)!.AsObject();

    /// <summary>
    /// The record as one command-line argument: base64url of its JSON.
    /// </summary>
    /// <remarks>
    /// It crosses a Windows command line from WSL, so: no quoting question, no encoding question,
    /// no character an argument parser can reinterpret, and no padding.
    /// </remarks>
    public static string Encode(CallerRecord record) =>
        Base64Url.EncodeToString(JsonSerializer.SerializeToUtf8Bytes(record, BrokerJsonContext.Default.CallerRecord));

    /// <summary>
    /// The argument back into a record — cleaned, because the other half of the bridge is a
    /// different binary — or <see cref="CallerRecord.Empty"/> for anything that is not one.
    /// </summary>
    public static CallerRecord Decode(string? encoded)
    {
        if (string.IsNullOrEmpty(encoded))
        {
            return CallerRecord.Empty;
        }

        try
        {
            var record = JsonSerializer.Deserialize(Base64Url.DecodeFromChars(encoded), BrokerJsonContext.Default.CallerRecord);
            return record?.Cleaned() ?? CallerRecord.Empty;
        }
        catch (Exception e) when (e is FormatException or JsonException)
        {
            return CallerRecord.Empty;
        }
    }

    /// <summary>The production reader: exists, small enough, readable — or nothing.</summary>
    private static string? ReadBounded(string path)
    {
        try
        {
            var info = new FileInfo(path);
            return info.Exists && info.Length <= MaxSessionFileBytes ? File.ReadAllText(path) : null;
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or ArgumentException or NotSupportedException)
        {
            return null;
        }
    }

    private static string HomeDirectory()
    {
        var profile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        return profile.Length > 0 ? profile : Environment.GetEnvironmentVariable("HOME") ?? string.Empty;
    }

    private static string CurrentDirectory()
    {
        try
        {
            return Directory.GetCurrentDirectory();
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            return string.Empty; // a deleted working folder is not a reason to fail to start
        }
    }
}
