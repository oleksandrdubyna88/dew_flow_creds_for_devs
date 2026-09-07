using FluentAssertions;
using Microsoft.Extensions.Logging;

namespace CredVaultServer.Tests;

/// <summary>
/// The event log's reader: what a query answers, in what order, and what it does with a file the
/// writer left torn. The writer's own guarantees are <see cref="OrgEventLogTests"/>; these are the
/// ones only a reader can make.
/// </summary>
public sealed class OrgEventLogQueryTests : IDisposable
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static readonly DateTimeOffset Noon = new(2026, 3, 1, 12, 0, 0, TimeSpan.Zero);

    private const string Admin = "admin@example.com";

    private const string Anna = "anna@example.com";

    private const string Boris = "boris@example.com";

    private readonly string _dir =
        Path.Combine(Path.GetTempPath(), "cred-vault-tests", Guid.NewGuid().ToString("N"));

    private readonly CapturingLogger<OrgEventLog> _log = new();
    private DateTimeOffset _now = Noon;

    public OrgEventLogQueryTests() => Directory.CreateDirectory(_dir);

    public void Dispose()
    {
        try
        {
            Directory.Delete(_dir, recursive: true);
        }
        catch (IOException)
        {
            // A handle not yet released; the temp sweeper gets it.
        }
    }

    private OrgEventLog NewLog() => new(_dir, _log, () => _now);

    private OrgEventDto Row(
        string kind = OrgEventKinds.MemberRoleChanged,
        string actor = Admin,
        string? subject = Anna,
        string? project = null,
        string? detail = null) => new(
        At: _now.ToUnixTimeMilliseconds(),
        Kind: kind,
        Actor: actor,
        Subject: subject,
        Project: project,
        ShareId: null,
        EntityName: null,
        EntityKind: null,
        Outcome: null,
        Detail: detail);

    private async Task<OrgEventLog> WithRowsAsync(params OrgEventDto[] rows)
    {
        var log = NewLog();
        foreach (var row in rows)
        {
            (await log.AppendAsync(row, Ct)).Should().BeTrue();
        }
        return log;
    }

    private static Task<OrgEventPage> PageAsync(OrgEventLog log, OrgEventQuery query) => log.QueryAsync(query, Ct);

    [Fact]
    public async Task RowsComeBackNewestFirst()
    {
        var log = await WithRowsAsync(Row(detail: "first"), Row(detail: "second"), Row(detail: "third"));

        var page = await PageAsync(log, new OrgEventQuery());

        page.Items.Select(r => r.Detail).Should().Equal("third", "second", "first");
        page.Next.Should().BeNull("the walk reached the oldest row");
        page.Skipped.Should().Be(0);
    }

    [Fact]
    public async Task AnEmptyLogAnswersAnEmptyPageRatherThanFailing()
    {
        var page = await PageAsync(NewLog(), new OrgEventQuery());

        page.Items.Should().BeEmpty();
        page.Next.Should().BeNull();
    }

    [Fact]
    public async Task EachFilterNarrowsOnItsOwn()
    {
        var log = await WithRowsAsync(
            Row(actor: Admin, subject: Anna, detail: "role"),
            Row(kind: OrgEventKinds.ProjectAssigned, actor: Admin, subject: Boris, project: "a1", detail: "Atlas"),
            Row(kind: OrgEventKinds.SettingsChanged, actor: Boris, subject: null, detail: "offlineLeaseHours 24 -> 0"));

        (await PageAsync(log, new OrgEventQuery(Actor: Boris))).Items.Should().ContainSingle()
            .Which.Kind.Should().Be(OrgEventKinds.SettingsChanged);
        (await PageAsync(log, new OrgEventQuery(Subject: Anna))).Items.Should().ContainSingle()
            .Which.Detail.Should().Be("role");
        (await PageAsync(log, new OrgEventQuery(Project: "a1"))).Items.Should().ContainSingle()
            .Which.Subject.Should().Be(Boris);
        (await PageAsync(log, new OrgEventQuery(Person: Boris))).Items.Should().HaveCount(2, "actor OR subject");
        (await PageAsync(log, new OrgEventQuery(Text: "ATLAS"))).Items.Should().ContainSingle("the text filter ignores case");
    }

    [Fact]
    public async Task TwoFiltersAreAndedNeverOred()
    {
        var log = await WithRowsAsync(
            Row(actor: Admin, subject: Anna, detail: "wanted"),
            Row(actor: Boris, subject: Anna, detail: "wrong actor"),
            Row(actor: Admin, subject: Boris, detail: "wrong subject"));

        var page = await PageAsync(log, new OrgEventQuery(Actor: Admin, Subject: Anna));

        page.Items.Should().ContainSingle().Which.Detail.Should().Be("wanted");
    }

    [Fact]
    public async Task AKindIsExactAndATrailingDotIsTheGroup()
    {
        var log = await WithRowsAsync(
            Row(kind: OrgEventKinds.ProjectCreated, subject: null, project: "a1"),
            Row(kind: OrgEventKinds.ProjectAssigned, subject: Anna, project: "a1"),
            Row(kind: OrgEventKinds.MemberBlocked, subject: Anna));

        (await PageAsync(log, new OrgEventQuery(Kind: OrgEventKinds.ProjectCreated))).Items.Should().ContainSingle();
        (await PageAsync(log, new OrgEventQuery(Kind: "project."))).Items.Should().HaveCount(2);
        (await PageAsync(log, new OrgEventQuery(Kind: "project"))).Items.Should().BeEmpty("without the dot it is an exact kind, and no row has that one");
    }

    [Fact]
    public async Task AKindThisBuildDoesNotKnowIsStillAnswered()
    {
        // A row written by a NEWER server. Dropping it would hide from an admin exactly the history
        // they are looking at the log to find.
        var log = await WithRowsAsync(Row(kind: "backup.run", subject: null));

        (await PageAsync(log, new OrgEventQuery())).Items.Should().ContainSingle()
            .Which.Kind.Should().Be("backup.run");
    }

    [Fact]
    public async Task SinceAndUntilSelectAcrossDayFiles()
    {
        var log = NewLog();
        var first = _now;
        await log.AppendAsync(Row(detail: "day one"), Ct);
        _now = _now.AddDays(1);
        await log.AppendAsync(Row(detail: "day two"), Ct);
        _now = _now.AddDays(1);
        await log.AppendAsync(Row(detail: "day three"), Ct);

        var middle = await PageAsync(log, new OrgEventQuery(
            Since: first.AddDays(1).ToUnixTimeMilliseconds(),
            Until: first.AddDays(1).ToUnixTimeMilliseconds()));

        middle.Items.Should().ContainSingle().Which.Detail.Should().Be("day two");
        (await PageAsync(log, new OrgEventQuery(Since: first.AddDays(1).ToUnixTimeMilliseconds())))
            .Items.Select(r => r.Detail).Should().Equal("day three", "day two");
    }

    [Fact]
    public async Task DayFilesComeBackNewestFirstWhateverOrderTheyWereWritten()
    {
        // The reader sorts the day files by name rather than trusting the file system's enumeration
        // order, which is an OS-level accident. Written out of order to make the difference visible.
        var log = NewLog();
        _now = Noon.AddDays(2);
        await log.AppendAsync(Row(detail: "third"), Ct);
        _now = Noon;
        await log.AppendAsync(Row(detail: "first"), Ct);
        _now = Noon.AddDays(1);
        await log.AppendAsync(Row(detail: "second"), Ct);

        var page = await PageAsync(log, new OrgEventQuery());

        page.Items.Select(r => r.Detail).Should().Equal("third", "second", "first");
    }

    [Fact]
    public async Task APageStopsAtTheLimitAndTheCursorContinuesToTheEnd()
    {
        var log = await WithRowsAsync(
            Row(detail: "1"), Row(detail: "2"), Row(detail: "3"), Row(detail: "4"), Row(detail: "5"));

        var first = await PageAsync(log, new OrgEventQuery(Limit: 2));
        first.Items.Select(r => r.Detail).Should().Equal("5", "4");
        first.Next.Should().NotBeNull();

        var second = await PageAsync(log, new OrgEventQuery(Limit: 2, Cursor: first.Next));
        second.Items.Select(r => r.Detail).Should().Equal("3", "2");

        var third = await PageAsync(log, new OrgEventQuery(Limit: 2, Cursor: second.Next));
        third.Items.Select(r => r.Detail).Should().Equal("1");
        third.Next.Should().BeNull("the walk reached the oldest row");
    }

    [Fact]
    public async Task APageThatFillsOnTheOldestRowEndsWithNoCursorRatherThanOneMoreRoundTrip()
    {
        var log = await WithRowsAsync(Row(detail: "1"), Row(detail: "2"));

        var page = await PageAsync(log, new OrgEventQuery(Limit: 2));

        page.Items.Select(r => r.Detail).Should().Equal("2", "1");
        page.Next.Should().BeNull("the walk consumed line 0 of the oldest file, so it knows there is nothing older");
    }

    [Fact]
    public async Task AnAppendBetweenTwoPagesNeitherRepeatsARowNorSkipsOne()
    {
        // The property the cursor exists for. A physical line index is stable because the writer only
        // ever appends: rows added after a page was taken are NEWER than everything on it, and the
        // next page walks older.
        var log = await WithRowsAsync(Row(detail: "1"), Row(detail: "2"), Row(detail: "3"), Row(detail: "4"));

        var first = await PageAsync(log, new OrgEventQuery(Limit: 2));
        await log.AppendAsync(Row(detail: "5"), Ct);
        var second = await PageAsync(log, new OrgEventQuery(Limit: 2, Cursor: first.Next));

        first.Items.Select(r => r.Detail).Should().Equal("4", "3");
        // The page below the cursor is untouched by the append: neither "5" nor a repeat of "3".
        second.Items.Select(r => r.Detail).Should().Equal("2", "1");
        second.Next.Should().BeNull();
    }

    [Fact]
    public async Task ATornFinalLineIsSkippedCountedAndLoggedOncePerFile()
    {
        var log = await WithRowsAsync(Row(detail: "whole"));
        await File.AppendAllTextAsync(log.PathForDay(Noon), "{\"at\":1,\"kind\":\"member.role_ch", Ct);

        var page = await PageAsync(log, new OrgEventQuery());

        page.Items.Should().ContainSingle().Which.Detail.Should().Be("whole", "a torn line must not end a query");
        page.Skipped.Should().Be(1);
        await PageAsync(log, new OrgEventQuery());
        _log.Entries.Where(e => e.Level == LogLevel.Warning).Should()
            .ContainSingle("said once per file, however many queries read it")
            .Which.Message.Should().Contain(log.PathForDay(Noon));
    }

    [Fact]
    public async Task ABlankLineIsSkippedWithoutBeingCountedAsDamage()
    {
        var log = await WithRowsAsync(Row(detail: "whole"));
        await File.AppendAllTextAsync(log.PathForDay(Noon), "\n\n", Ct);

        var page = await PageAsync(log, new OrgEventQuery());

        page.Items.Should().ContainSingle();
        page.Skipped.Should().Be(0, "a blank line is not a torn row");
    }

    [Fact]
    public async Task JsonThatIsNotARowIsSkippedRatherThanAnsweredAsAnEmptyOne()
    {
        var log = await WithRowsAsync(Row(detail: "whole"));
        await File.AppendAllTextAsync(log.PathForDay(Noon), "{\"hello\":\"world\"}\n", Ct);

        var page = await PageAsync(log, new OrgEventQuery());

        page.Items.Should().ContainSingle().Which.Detail.Should().Be("whole");
        page.Skipped.Should().Be(1, "a deserializer runs no initializer, so this parses into a row with no kind and no actor");
    }

    [Fact]
    public async Task RestrictToSelfHidesEveryRowThatDoesNotNameTheCaller()
    {
        var log = await WithRowsAsync(
            Row(actor: Admin, subject: Anna, detail: "about anna"),
            Row(actor: Admin, subject: Boris, detail: "about boris"),
            Row(actor: Anna, subject: null, detail: "by anna"));

        var page = await PageAsync(log, new OrgEventQuery(RestrictToSelf: Anna));

        page.Items.Select(r => r.Detail).Should().Equal("by anna", "about anna");
    }

    [Fact]
    public async Task AScopedCallerAskingAboutSomebodyElseNarrowsRatherThanWidens()
    {
        // The test that matters: a member passing person=<colleague> gets the rows naming BOTH of
        // them — a subset of their own — not an error and not somebody else's history.
        var log = await WithRowsAsync(
            Row(actor: Boris, subject: Anna, detail: "both"),
            Row(actor: Admin, subject: Boris, detail: "boris alone"));

        var page = await PageAsync(log, new OrgEventQuery(Person: Boris, RestrictToSelf: Anna));

        page.Items.Should().ContainSingle().Which.Detail.Should().Be("both");
    }

    [Fact]
    public async Task AnEmailFilterIgnoresCaseTheWayAPersonTypesIt()
    {
        var log = await WithRowsAsync(Row(actor: Admin, subject: Anna));

        (await PageAsync(log, new OrgEventQuery(Actor: "ADMIN@Example.com"))).Items.Should().ContainSingle();
    }

    [Fact]
    public async Task ACursorWhoseDayHasNoFileResumesAtTheNextOlderDay()
    {
        // Nothing here deletes a day file, but an operator's hand can. Gone is gone: the walk carries
        // on with what is there rather than failing on a cursor that was valid when it was handed out.
        var log = NewLog();
        await log.AppendAsync(Row(detail: "old"), Ct);

        var page = await PageAsync(log, new OrgEventQuery(
            Cursor: new OrgEventCursor(DateOnly.FromDateTime(Noon.AddDays(5).UtcDateTime), 3)));

        page.Items.Should().ContainSingle().Which.Detail.Should().Be("old");
    }

    [Fact]
    public async Task ACursorPastAFilesEndResumesAtItsLastLine()
    {
        var log = await WithRowsAsync(Row(detail: "1"), Row(detail: "2"));

        var page = await PageAsync(log, new OrgEventQuery(
            Cursor: new OrgEventCursor(DateOnly.FromDateTime(Noon.UtcDateTime), 99)));

        page.Items.Select(r => r.Detail).Should().Equal("2", "1");
    }

    [Fact]
    public async Task AFileThisProcessCannotOpenIsReportedRatherThanSilentlyOmitted()
    {
        // Half a history answered as if it were the whole one is the one failure an audit log must
        // not have. The endpoint turns this into a 503.
        var log = await WithRowsAsync(Row(detail: "hidden"));
        var path = log.PathForDay(Noon);
        // Two operating systems refuse a READ in two different ways, and neither is the way they
        // refuse a DELETE — which is what the first version of this test asked for, and why it
        // passed on Windows and not on Linux: stripping a directory's write bit stops an unlink and
        // lets every read through. Windows refuses an open while another handle holds the file
        // exclusively; Unix refuses one when the file itself has no read bit (as a non-root user,
        // which is what CI is).
        using var held = Unreadable(path);

        var act = async () => await PageAsync(log, new OrgEventQuery());

        (await act.Should().ThrowAsync<OrgEventLogUnreadableException>()).Which.FilePath.Should().Be(path);
    }

    /// <summary>Make one file impossible to OPEN, and put it back on dispose.</summary>
    private static IDisposable Unreadable(string path) =>
        OperatingSystem.IsWindows()
            ? new FileStream(path, FileMode.Open, FileAccess.ReadWrite, FileShare.None)
            : new ReadableAgain(path);

    private sealed class ReadableAgain : IDisposable
    {
        private readonly string _path;

        public ReadableAgain(string path)
        {
            _path = path;
            Chmod(path, UnixFileMode.None);
        }

        public void Dispose() => Chmod(_path, UnixFileMode.UserRead | UnixFileMode.UserWrite);

        /// <summary>Guarded rather than suppressed: the analyzer is right that this is Unix-only.</summary>
        private static void Chmod(string path, UnixFileMode mode)
        {
            if (!OperatingSystem.IsWindows())
            {
                File.SetUnixFileMode(path, mode);
            }
        }
    }

    [Fact]
    public void TheCursorRoundTripsAndRefusesWhatThisServerDidNotHandOut()
    {
        var cursor = new OrgEventCursor(new DateOnly(2026, 3, 1), 42);

        cursor.ToString().Should().Be("2026-03-01:42");
        OrgEventCursor.TryParse(cursor.ToString(), out var parsed).Should().BeTrue();
        parsed.Should().Be(cursor);

        // The path-shaped ones are the security case: a day is parsed into a DateOnly and a file name is
        // BUILT from it, so nothing a caller sends is ever a path component — but the grammar is what
        // makes that true, and a grammar with no test for it is a grammar somebody widens.
        foreach (var bad in new[]
                 {
                     "", "2026-03-01", "2026-03-01:", "2026-3-1:4", "not-a-day:1", "2026-03-01:-1", "2026-03-01:x",
                     "../secrets:0", @"..\secrets:0", "2026-03-01:0/../x", "/etc/passwd:0", "2026-03-01:+1",
                 })
        {
            OrgEventCursor.TryParse(bad, out _).Should().BeFalse("'{0}' is not a cursor", bad);
        }
    }

    [Fact]
    public void ADayIsTheUtcDayWhateverOffsetTheInstantCarries()
    {
        // 01:00 at UTC+2 is the previous day in UTC, and the file is named for the UTC one. A reader
        // that derived the day in local time would drop a whole file at every boundary.
        var oneAmInBerlin = new DateTimeOffset(2026, 3, 2, 1, 0, 0, TimeSpan.FromHours(2));

        OrgEventCursor.UtcDayOf(oneAmInBerlin).Should().Be(new DateOnly(2026, 3, 1));
        OrgEventCursor.UtcDayOf(oneAmInBerlin.ToUnixTimeMilliseconds()).Should().Be(new DateOnly(2026, 3, 1));
    }

    [Fact]
    public async Task APageCarriesOnIntoTheOlderDayFileAndTheCursorSaysWhereItStopped()
    {
        // A cursor names the day AND the line it stopped on, whichever file that was, so a page that
        // spans midnight resumes in the right file rather than clamping an index into the wrong one.
        var log = NewLog();
        await log.AppendAsync(Row(detail: "old 1"), Ct);
        await log.AppendAsync(Row(detail: "old 2"), Ct);
        _now = Noon.AddDays(1);
        await log.AppendAsync(Row(detail: "new 1"), Ct);
        await log.AppendAsync(Row(detail: "new 2"), Ct);

        var first = await PageAsync(log, new OrgEventQuery(Limit: 3));
        first.Items.Select(r => r.Detail).Should().Equal("new 2", "new 1", "old 2");
        first.Next!.Value.Day.Should().Be(DateOnly.FromDateTime(Noon.UtcDateTime), "it stopped in the OLDER file");

        var second = await PageAsync(log, new OrgEventQuery(Limit: 3, Cursor: first.Next));

        second.Items.Select(r => r.Detail).Should().Equal("old 1");
        second.Next.Should().BeNull();
    }

    [Fact]
    public async Task AQueryStopsAtItsDayFileBudgetToo()
    {
        // The line budget is not this budget. A deployment with two rows a day never reaches it, and
        // spends its cost OPENING files instead — a decade of them on one request, without this.
        var log = NewLog();
        for (var day = 0; day <= OrgEventLog.MaxDayFilesPerQuery; day++)
        {
            _now = Noon.AddDays(-day);
            await log.AppendAsync(Row(detail: $"day {day}"), Ct);
        }

        var page = await PageAsync(log, new OrgEventQuery(Text: "nothing matches this"));

        page.Items.Should().BeEmpty();
        page.Next.Should().NotBeNull("there are older files this query did not open");
        var next = await PageAsync(log, new OrgEventQuery(Text: "day 400", Cursor: page.Next));
        next.Items.Should().ContainSingle("the next page carries on where the budget stopped it");
    }

    [Fact]
    public async Task AQueryStopsAtItsScanBudgetAndHandsBackACursorRatherThanReadingTheWholeHistory()
    {
        // A substring filter with no date range would otherwise read every day the server has ever
        // written, on one request. The page comes back short with a cursor: "nothing yet, keep going".
        var log = await WithRowsAsync(Row(detail: "the oldest row"));
        // Written straight to the file rather than through the appender: the budget is about how many
        // LINES a query reads, and 20,000 locked appends would buy the same file for minutes of runtime.
        await File.AppendAllLinesAsync(
            log.PathForDay(Noon),
            Enumerable.Range(0, OrgEventLog.MaxLinesScannedPerQuery + 10)
                .Select(i => System.Text.Json.JsonSerializer.Serialize(
                    Row(detail: $"row {i}"), AppJsonContext.Default.OrgEventDto)),
            Ct);

        var page = await PageAsync(log, new OrgEventQuery(Text: "nothing matches this"));

        page.Items.Should().BeEmpty();
        page.Next.Should().NotBeNull("an empty page WITH a cursor means keep going; only a null cursor is the end");

        // And the window the budget truncated is not a file the walk has finished with: the next page
        // reads the lines below it, in the SAME file, and finds the row that was under them.
        var next = await PageAsync(log, new OrgEventQuery(Text: "the oldest row", Cursor: page.Next));
        next.Items.Should().ContainSingle().Which.Detail.Should().Be("the oldest row");
    }

    [Fact]
    public async Task AQueryHoldsOnlyWhatItsBudgetAllOWS_neverTheWholeDayFile()
    {
        // The property the window exists for. A day is projected at ~120 rows and reading a whole one
        // would cost nothing — but projected is not bounded, and a burst turns "read the file into a
        // list of strings" into an allocation nobody chose. What is asserted is the observable half:
        // a file far larger than the budget answers a page rather than failing, and the cursor it
        // hands out is inside that file rather than past it.
        var log = await WithRowsAsync(Row(detail: "the oldest row"));
        await File.AppendAllLinesAsync(
            log.PathForDay(Noon),
            Enumerable.Range(0, OrgEventLog.MaxLinesScannedPerQuery + 500)
                .Select(i => System.Text.Json.JsonSerializer.Serialize(
                    Row(detail: $"row {i}"), AppJsonContext.Default.OrgEventDto)),
            Ct);

        var page = await PageAsync(log, new OrgEventQuery(Limit: 2));

        page.Items.Should().HaveCount(2, "the newest two rows of a very large day");
        page.Next.Should().NotBeNull();
        page.Next!.Value.Day.Should().Be(DateOnly.FromDateTime(Noon.UtcDateTime));
        page.Next!.Value.LineIndex.Should().BeGreaterThan(
            OrgEventLog.MaxLinesScannedPerQuery,
            "the walk started at the END of the file, not at the start of the window");
    }
}
