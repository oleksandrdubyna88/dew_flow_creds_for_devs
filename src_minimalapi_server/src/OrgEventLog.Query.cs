using System.Collections.Concurrent;
using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace CredVaultServer;

/// <summary>
/// A day file the reader could not open for a reason other than its absence — a permission, a lock
/// held by something that is not this server. Its own type so the endpoint can answer <c>503</c> for
/// exactly this and let anything else surface as the fault it is; a query that silently omitted a
/// day of history would be worse than one that refused.
/// </summary>
public sealed class OrgEventLogUnreadableException(string filePath, Exception inner)
    : IOException($"event log {filePath} could not be read", inner)
{
    public string FilePath { get; } = filePath;
}

/// <summary>
/// The reader half of the log: a filtered, cursor-paginated walk over the day files, newest first.
///
/// <para><b>Day files are sorted by name, descending</b> — <c>yyyy-MM-dd</c> sorts as a date — never by
/// the order the file system enumerates them, which is an OS-level accident. <c>since</c> and
/// <c>until</c> skip whole files by the UTC day they name before a line is read; inside a file every
/// row's own instant is still compared, because a day file holds a whole day.</para>
///
/// <para><b>A file is read whole and walked in reverse.</b> A day is ~50 KB, so the read IS the
/// snapshot: rows appended after it are not in the buffer and cannot be reordered inside it, and a
/// partial line caught mid-write sits at the buffer's end where the torn-line rule already skips it.
/// The file is opened with <see cref="FileShare.ReadWrite"/>, as the writer's own probe is, so a reader
/// never refuses a writer and is never refused by one — <c>File.ReadAllLines</c> would be, for the
/// microseconds a writer holds the file.</para>
///
/// <para><b>A line that will not parse is skipped and counted</b>, and the log says so once per file at
/// Warning — a process killed mid-append leaves exactly one — because a torn final line must not end a
/// query. The once-per-file memory is bounded by the number of files that ever carried a torn line,
/// which is the number of crashes mid-append, not the number of days.</para>
///
/// <para><b>Newest first means the order rows were APPENDED</b> — the file's own order, newest file
/// first — not a sort on <c>at</c>. The two agree to the microsecond, because the day file is chosen
/// from the same clock that stamps the row; where a page would show them disagreeing is a row whose
/// caller stamped it either side of a midnight the appender crossed, and re-sorting by <c>at</c>
/// across files would cost a merge of every file in range and a cursor that could no longer be a
/// position. What the log records is the sequence of what happened, and that is what it answers.</para>
///
/// <para><b>Every query has two budgets</b>, <see cref="MaxLinesScannedPerQuery"/> and
/// <see cref="MaxDayFilesPerQuery"/>. A substring filter with no date range would otherwise read the
/// whole history — 18 MB a year, kept forever — on one request, and the request limiter bounds how
/// often a caller asks, not how much one ask costs. The second budget is not the first in disguise: a
/// deployment with two rows a day spends its cost in OPENING files, not in reading lines, and a
/// line budget alone would let one request open a decade of them. Past either budget the page ends
/// with a cursor where it stopped, so a client simply asks again; an empty page with a cursor means
/// "nothing yet, keep going", and only a null cursor means the end.</para>
///
/// <para>A file that vanishes between the listing and the open is skipped as gone — an operator's
/// hand, since nothing here ever deletes one. Any other failure to open a file is
/// <see cref="OrgEventLogUnreadableException"/>, which the endpoint turns into a <c>503</c>.</para>
/// </summary>
public sealed partial class OrgEventLog
{
    /// <summary>Lines one query may read — about 8 MB, a few months of a busy company — before it hands back what it has.</summary>
    public const int MaxLinesScannedPerQuery = 20_000;

    /// <summary>
    /// Day files one query may OPEN. Over a year of days, and the budget a sparse deployment actually
    /// spends: two rows a day never reaches the line budget, so without this one request would open
    /// every file the server has ever written.
    /// </summary>
    public const int MaxDayFilesPerQuery = 400;

    private readonly ConcurrentDictionary<string, byte> _unparseableLogged = new();

    /// <summary>
    /// One page, newest first. Never answers rows outside <see cref="OrgEventQuery.RestrictToSelf"/>.
    /// </summary>
    public async Task<OrgEventPage> QueryAsync(OrgEventQuery query, CancellationToken ct)
    {
        var page = new PageBuilder(query);
        var files = DayFilesNewestFirst(query);
        for (var f = 0; f < files.Count; f++)
        {
            ct.ThrowIfCancellationRequested();
            var (day, path) = files[f];
            var window = await ReadWindowAsync(path, CursorIndexIn(query.Cursor, day), page.LinesLeftInBudget, ct);
            if (window is not { } opened)
            {
                continue;
            }
            var stop = page.Walk(day, opened, isOldestFile: f == files.Count - 1);
            LogUnparseable(path, page.TakeUnparseableInFile());
            if (stop is { } stopped)
            {
                return page.Ended(stopped.Next);
            }
            if (f + 1 < files.Count && f + 1 >= MaxDayFilesPerQuery)
            {
                // Line 0 of the last file opened: the next page's walk starts BELOW it, which is the
                // first line of the next older file — exactly where this one stopped.
                return page.Ended(new OrgEventCursor(day, 0));
            }
        }
        return page.Ended(null);
    }

    /// <summary>
    /// The day files a query may need, newest first: at or before the cursor's day and the <c>until</c>
    /// day, at or after the <c>since</c> day. Names that are not a day — <c>.append.lock</c>, anything an
    /// operator dropped in — are not files of the log.
    /// </summary>
    private IReadOnlyList<(DateOnly Day, string Path)> DayFilesNewestFirst(OrgEventQuery query)
    {
        var newest = Newest(query);
        var oldest = query.Since is { } since ? OrgEventCursor.UtcDayOf(since) : (DateOnly?)null;
        try
        {
            return
            [
                .. Directory.EnumerateFiles(_dir, "*.ndjson")
                    .Select(path => (Day: DayOf(path), Path: path))
                    .Where(file => file.Day is { } day && (newest is null || day <= newest) && (oldest is null || day >= oldest))
                    .Select(file => (file.Day!.Value, file.Path))
                    .OrderByDescending(file => file.Item1)
                    // One more than the budget, so the walk can still tell "there are older files" from
                    // "that was the last one" without materialising a decade of paths to answer it.
                    .Take(MaxDayFilesPerQuery + 1),
            ];
        }
        catch (DirectoryNotFoundException)
        {
            // No log yet — a personal deployment, or a corporate one before its first row. The absence
            // is the one case here that is NOT a fault, and it answers an empty page.
            return [];
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            // A directory that EXISTS and cannot be listed is a fault, not an empty log. Directory.Exists
            // answers false for both, which is why it is no longer asked: answering "no history" for a
            // permission fault is the silent omission this reader refuses everywhere else.
            throw new OrgEventLogUnreadableException(_dir, e);
        }
    }

    private static DateOnly? Newest(OrgEventQuery query)
    {
        DateOnly? newest = query.Until is { } until ? OrgEventCursor.UtcDayOf(until) : null;
        if (query.Cursor is { } cursor && (newest is null || cursor.Day < newest))
        {
            newest = cursor.Day;
        }
        return newest;
    }

    private static DateOnly? DayOf(string path) =>
        OrgEventCursor.TryParseDay(Path.GetFileNameWithoutExtension(path), out var day) ? day : null;

    /// <summary>
    /// The line this file's window ENDS at, exclusive — the walk starts below it — or <c>null</c> when
    /// the cursor names another day and the window ends at the file's last line. A cursor past the end,
    /// a file truncated by hand, simply reads to the end.
    /// </summary>
    private static int? CursorIndexIn(OrgEventCursor? cursor, DateOnly day) =>
        cursor is { } c && c.Day == day ? c.LineIndex : null;

    /// <summary>
    /// The lines of one day file a walk may still afford, and the absolute index of the first of them.
    /// <see cref="Truncated"/> says the window starts above line 0 because the budget ran out — an
    /// exhausted window is not an exhausted file.
    /// </summary>
    private readonly record struct DayWindow(IReadOnlyList<string> Lines, int StartIndex, bool Truncated);

    /// <summary>
    /// Read the window ending at <paramref name="upTo"/> (exclusive; <c>null</c> reads to the end of the
    /// file), keeping at most <paramref name="maxLines"/> of it. <c>null</c> when the file is gone.
    ///
    /// <para><b>Bounded by construction.</b> A day file is projected at ~120 rows and reading a whole one
    /// would cost nothing — but projected is not bounded, and a burst, a loop or simply a larger company
    /// turns "read the file into a list of strings" into an allocation the CALLER never chose. Lines
    /// above the cursor are not read at all, lines below the window are dropped as they are read, and
    /// what is held is what the query has left of its line budget. So a query costs the budget rather
    /// than the file.</para>
    /// </summary>
    private static async Task<DayWindow?> ReadWindowAsync(string path, int? upTo, int maxLines, CancellationToken ct)
    {
        try
        {
            await using var stream = new FileStream(
                path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete, bufferSize: 4096, useAsync: true);
            using var reader = new StreamReader(stream);
            var kept = new Queue<string>(Math.Min(maxLines, 1024));
            var dropped = 0;
            var index = 0;
            while ((upTo is null || index < upTo) && await reader.ReadLineAsync(ct) is { } line)
            {
                kept.Enqueue(line);
                if (kept.Count > maxLines)
                {
                    kept.Dequeue();
                    dropped++;
                }
                index++;
            }
            return new DayWindow([.. kept], dropped, dropped > 0);
        }
        catch (Exception e) when (e is FileNotFoundException or DirectoryNotFoundException)
        {
            return null;
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            throw new OrgEventLogUnreadableException(path, e);
        }
    }

    private void LogUnparseable(string path, int count)
    {
        if (count == 0 || !_unparseableLogged.TryAdd(path, 0))
        {
            return;
        }
        log.LogWarning(
            "event log {Path}: {Count} line(s) could not be parsed and were skipped — a process killed mid-append leaves one; said once per file",
            path,
            count);
    }

    /// <summary>A row, or null for a line that is not one — torn, or JSON that is not a row.</summary>
    private static OrgEventDto? Parse(string line)
    {
        try
        {
            var row = JsonSerializer.Deserialize(line, AppJsonContext.Default.OrgEventDto);
            // The deserializer runs no initializer: a line that is JSON but not a row leaves the
            // required fields null however the type reads.
            return row is { Kind: not null, Actor: not null } ? row : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    /// <summary>
    /// The page under construction: the rows taken so far, the lines scanned against the budget, the
    /// lines that would not parse. One walk per file, newest line first.
    /// </summary>
    private sealed class PageBuilder(OrgEventQuery query)
    {
        private readonly List<OrgEventDto> _items = [];
        private int _scanned;
        private int _skipped;
        private int _skippedInFile;

        /// <summary>What the query has left of its line budget — at least one, so every walk advances.</summary>
        public int LinesLeftInBudget => Math.Max(1, MaxLinesScannedPerQuery - _scanned);

        /// <summary>
        /// Walk one file's window from its newest line down to its oldest. Answers a stop — the cursor
        /// to hand out, being the last line consumed, so the next page resumes on the line below it —
        /// when the page filled or the budget ran out, and null when the file was exhausted and the walk
        /// moves to an older one.
        ///
        /// <para>A page that fills on line 0 of the OLDEST file stops with NO cursor: the walk knows it
        /// has nothing older to offer, and handing one out would cost a client a round trip to be told
        /// so. Knowing it in any other case would cost a scan past the page on every request, which is
        /// the second scan this reader refuses to pay for a <c>total</c>.</para>
        ///
        /// <para>A window the budget TRUNCATED is not an exhausted file: the walk stops at the window's
        /// own start, so the next page picks up the lines this one could not afford to read.</para>
        /// </summary>
        public WalkStop? Walk(DateOnly day, DayWindow window, bool isOldestFile)
        {
            var lines = window.Lines;
            for (var i = lines.Count - 1; i >= 0; i--)
            {
                var absolute = window.StartIndex + i;
                if (_scanned >= MaxLinesScannedPerQuery)
                {
                    // This line is not consumed; the line above it was. Resuming at it is what the
                    // cursor's "below the last consumed line" rule gives.
                    return new WalkStop(new OrgEventCursor(day, absolute + 1));
                }
                _scanned++;
                if (Take(lines[i]) && _items.Count >= query.Limit)
                {
                    return new WalkStop(isOldestFile && absolute == 0 ? null : new OrgEventCursor(day, absolute));
                }
            }
            return window.Truncated ? new WalkStop(new OrgEventCursor(day, window.StartIndex)) : null;
        }

        /// <summary>True when the line was a row the page took.</summary>
        private bool Take(string line)
        {
            if (string.IsNullOrWhiteSpace(line))
            {
                return false;
            }
            var row = Parse(line);
            if (row is null)
            {
                _skipped++;
                _skippedInFile++;
                return false;
            }
            if (!OrgEventFilter.Matches(row, query))
            {
                return false;
            }
            _items.Add(row);
            return true;
        }

        public int TakeUnparseableInFile()
        {
            var count = _skippedInFile;
            _skippedInFile = 0;
            return count;
        }

        public OrgEventPage Ended(OrgEventCursor? next) => new(_items, next, _skipped);
    }

    /// <summary>Why a walk stopped inside a file, and where to carry on — <c>null</c> when there is nowhere older.</summary>
    private readonly record struct WalkStop(OrgEventCursor? Next);
}
