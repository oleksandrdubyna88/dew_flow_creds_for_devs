using System.Globalization;

namespace CredVaultServer;

/// <summary>
/// One question to the event log. Every filter is optional and they are ANDed; <see cref="RestrictToSelf"/>
/// is the caller's SCOPE, applied before any filter by the same predicate, so a caller's own filters can
/// only narrow what they may see and never widen it — a member asking for <c>person=somebody-else</c> gets
/// the rows that name both of them, not an error and not a leak.
/// </summary>
/// <param name="Kind">Exact, or a group prefix when it ends in <c>.</c> — <c>share.</c> is every share kind.</param>
/// <param name="Since">Inclusive, unix milliseconds, UTC — the only clock the log has.</param>
/// <param name="Until">Inclusive, unix milliseconds.</param>
/// <param name="Text">A case-insensitive substring over every metadata field a row carries.</param>
/// <param name="Cursor">Where the previous page stopped; the next page carries on from the line below it.</param>
/// <param name="Limit">Rows per page, after filtering. The endpoint clamps it to <see cref="MaxLimit"/>.</param>
/// <param name="RestrictToSelf">The caller's email when they may see only rows that name them; null for an admin.</param>
public sealed record OrgEventQuery(
    string? Actor = null,
    string? Subject = null,
    string? Person = null,
    string? Project = null,
    string? Kind = null,
    long? Since = null,
    long? Until = null,
    string? Text = null,
    OrgEventCursor? Cursor = null,
    int Limit = OrgEventQuery.DefaultLimit,
    string? RestrictToSelf = null)
{
    public const int DefaultLimit = 100;

    /// <summary>
    /// The most rows one page carries. A page is materialised before it is written — 500 rows at
    /// ~400 bytes is 200 KB, bounded by this number — which is why the response can be one DTO
    /// rather than a hand-streamed envelope.
    /// </summary>
    public const int MaxLimit = 500;

    /// <summary>
    /// The longest a text filter may be. A substring search costs the filter's length on every field
    /// of every row scanned, and the scan budget bounds the rows, so the filter has to bound itself.
    /// </summary>
    public const int MaxFilterLength = 256;
}

/// <summary>
/// Where a page stopped: the UTC day file and the index of the last physical line the walk consumed.
///
/// <para>A physical line index, counting blank and torn lines too, and that is what makes it stable:
/// the writer only ever APPENDS — a torn tail is left in place and the next row starts on a fresh line
/// (<see cref="OrgEventLog"/>) — so no line below a handed-out index ever moves, and a page taken while
/// the log is being written neither repeats a row nor skips one. A cursor naming a day with no file
/// resumes at the next older day, because gone is gone; one past a file's end resumes at the file's
/// last line, because a file only ever grows.</para>
/// </summary>
public readonly record struct OrgEventCursor(DateOnly Day, int LineIndex)
{
    private const string DayFormat = "yyyy-MM-dd";

    public static bool TryParse(string? text, out OrgEventCursor cursor)
    {
        cursor = default;
        if (text is null || text.Length < DayFormat.Length + 2 || text[DayFormat.Length] != ':')
        {
            return false;
        }
        if (!TryParseDay(text.AsSpan(0, DayFormat.Length), out var day)
            || !int.TryParse(text.AsSpan(DayFormat.Length + 1), NumberStyles.None, CultureInfo.InvariantCulture, out var index))
        {
            return false;
        }
        cursor = new OrgEventCursor(day, index);
        return true;
    }

    /// <summary>The day a unix-millisecond instant falls on in UTC — the day its row's file is named for.</summary>
    public static DateOnly UtcDayOf(long unixMilliseconds) =>
        DateOnly.FromDateTime(DateTimeOffset.FromUnixTimeMilliseconds(unixMilliseconds).UtcDateTime);

    /// <summary>The day of an instant, in UTC whatever offset the value carries.</summary>
    public static DateOnly UtcDayOf(DateTimeOffset at) => DateOnly.FromDateTime(at.UtcDateTime);

    public static string FormatDay(DateOnly day) => day.ToString(DayFormat, CultureInfo.InvariantCulture);

    public static bool TryParseDay(ReadOnlySpan<char> text, out DateOnly day) =>
        DateOnly.TryParseExact(text, DayFormat, CultureInfo.InvariantCulture, DateTimeStyles.None, out day);

    public override string ToString() => $"{FormatDay(Day)}:{LineIndex.ToString(CultureInfo.InvariantCulture)}";
}

/// <summary>
/// What a query answered: the rows, newest first; where to continue, or null when the walk reached
/// the oldest row in range; and how many lines it could not parse on the way — for the tests, never
/// for the wire.
/// </summary>
public sealed record OrgEventPage(IReadOnlyList<OrgEventDto> Items, OrgEventCursor? Next, int Skipped);

/// <summary>
/// The wire shape of <c>GET /api/org/events</c>. No <c>total</c>, deliberately: an exact count is a
/// second full scan with the same filter, which is what the server already refused to pay when the
/// inbox was made to stream. <c>nextCursor</c> is null when there is nothing older to ask for.
/// </summary>
public sealed record OrgEventsPageDto(IReadOnlyList<OrgEventDto> Items, string? NextCursor);

/// <summary>
/// The per-row predicate, pure: scope first, then every filter. One function rather than a chain of
/// LINQ at the call site, so the scope cannot be applied after a filter that widened the set.
/// </summary>
public static class OrgEventFilter
{
    public static bool Matches(OrgEventDto row, OrgEventQuery query) =>
        Involves(row, query.RestrictToSelf)
        && Names(row.Actor, query.Actor)
        && Names(row.Subject, query.Subject)
        && Involves(row, query.Person)
        && Names(row.Project, query.Project)
        && KindMatches(row.Kind, query.Kind)
        && InRange(row.At, query.Since, query.Until)
        && Mentions(row, query.Text);

    private static bool Involves(OrgEventDto row, string? person) =>
        person is null || Same(row.Actor, person) || Same(row.Subject, person);

    private static bool Names(string? value, string? wanted) => wanted is null || Same(value, wanted);

    // Emails on this server are lowercased before they reach a row, but a filter typed by a person is
    // not; ordinal-ignore-case reads both the same way, and a project id is hex either way.
    private static bool Same(string? value, string wanted) =>
        value is not null && string.Equals(value, wanted, StringComparison.OrdinalIgnoreCase);

    private static bool KindMatches(string kind, string? wanted) =>
        wanted is null
        || (wanted.EndsWith('.')
            ? kind.StartsWith(wanted, StringComparison.Ordinal)
            : string.Equals(kind, wanted, StringComparison.Ordinal));

    private static bool InRange(long at, long? since, long? until) =>
        (since is null || at >= since) && (until is null || at <= until);

    private static bool Mentions(OrgEventDto row, string? text) =>
        text is null || Fields(row).Any(field => field is not null && field.Contains(text, StringComparison.OrdinalIgnoreCase));

    /// <summary>Every field a row carries — metadata all of it, by the umbrella's invariant.</summary>
    private static IEnumerable<string?> Fields(OrgEventDto row) =>
        [row.Kind, row.Actor, row.Subject, row.Project, row.ShareId, row.EntityName, row.EntityKind, row.Outcome, row.Detail];
}
