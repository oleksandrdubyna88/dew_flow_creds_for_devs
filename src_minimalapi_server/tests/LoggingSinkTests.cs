using System.Globalization;
using Serilog.Events;
using Serilog.Parsing;

namespace CredVaultServer.Tests;

/// <summary>
/// The ported logging sinks (todo/PLAN_tails.md T8 → research/PLAN_logging_convention.md).
///
/// <para>The escape-count test repeats the family rule's own measurement shape, control
/// included: the rule exists because Serilog's console theme wrote ZERO escapes to a redirected
/// stream while a by-hand control wrote four — so a test that only counted the sink's escapes
/// could pass against a pipeline that strips them. The control is what makes the number mean
/// something.</para>
/// </summary>
public class LoggingSinkTests
{
    private static LogEvent Event(DateTimeOffset at, LogEventLevel level, string message) =>
        new(
            at,
            level,
            exception: null,
            new MessageTemplateParser().Parse(message),
            []);

    // ---------------------------------------------------------------- AnsiConsoleSink

    [Fact]
    public void ColouredSink_WritesEscapes_OnARedirectedWriter()
    {
        // The control first: this writer preserves escapes, or the sink's count proves nothing.
        var control = new StringWriter();
        control.Write("\x1b[38;5;42mINF\x1b[0m");
        Assert.Equal(2, Count(control.ToString(), '\x1b'));

        var output = new StringWriter();
        var sink = new AnsiConsoleSink(CultureInfo.InvariantCulture, output);
        sink.Emit(Event(DateTimeOffset.UtcNow, LogEventLevel.Information, "vault opened"));

        var line = output.ToString();
        Assert.True(
            Count(line, '\x1b') >= 4,
            $"expected at least 4 escape bytes on a redirected writer, got {Count(line, '\x1b')} in: {line}");
        Assert.Contains("vault opened", line, StringComparison.Ordinal);
        Assert.Contains("INF", line, StringComparison.Ordinal);
    }

    [Fact]
    public void ColouredSink_DistinguishesLevels_ByColour()
    {
        var output = new StringWriter();
        var sink = new AnsiConsoleSink(CultureInfo.InvariantCulture, output);
        sink.Emit(Event(DateTimeOffset.UtcNow, LogEventLevel.Warning, "w"));
        sink.Emit(Event(DateTimeOffset.UtcNow, LogEventLevel.Error, "e"));

        var text = output.ToString();
        // The level token is the strongly coloured element; two levels, two colours.
        Assert.Contains("\x1b[38;5;214mWRN", text, StringComparison.Ordinal);
        Assert.Contains("\x1b[38;5;203mERR", text, StringComparison.Ordinal);
    }

    private static int Count(string text, char c) => text.Count(x => x == c);

    // ---------------------------------------------------------------- DailyRunFileSink

    [Fact]
    public void RunFile_SegmentsAtUtcMidnight_SamePidNextDayFolder()
    {
        var root = Path.Combine(Path.GetTempPath(), "creds-logsink-" + Guid.NewGuid().ToString("N"));
        try
        {
            var started = new DateTime(2026, 08, 27, 23, 59, 58, DateTimeKind.Utc);
            using var sink = new DailyRunFileSink(root, "cred-vault-server", "{Message:lj}{NewLine}", started);

            var firstPath = sink.CurrentPath;
            sink.Emit(Event(new DateTimeOffset(started), LogEventLevel.Information, "before midnight"));

            // The clock crosses the boundary: the next event lands in tomorrow's folder as a
            // 00-00-00 segment with the SAME pid — the run stays identifiable.
            var after = new DateTime(2026, 08, 28, 00, 00, 02, DateTimeKind.Utc);
            sink.Emit(Event(new DateTimeOffset(after), LogEventLevel.Information, "after midnight"));
            var secondPath = sink.CurrentPath;

            Assert.Contains(Path.Combine("2026-08-27"), firstPath, StringComparison.Ordinal);
            Assert.Contains("23-59-58", firstPath, StringComparison.Ordinal);
            Assert.Contains(Path.Combine("2026-08-28"), secondPath, StringComparison.Ordinal);
            Assert.Contains($"00-00-00-{Environment.ProcessId}.log", secondPath, StringComparison.Ordinal);
        }
        finally
        {
            if (Directory.Exists(root))
            {
                Directory.Delete(root, recursive: true);
            }
        }
    }

    [Fact]
    public void RunFile_NeverRollsBackward_OnAClockCorrection()
    {
        var root = Path.Combine(Path.GetTempPath(), "creds-logsink-" + Guid.NewGuid().ToString("N"));
        try
        {
            var started = new DateTime(2026, 08, 28, 00, 00, 05, DateTimeKind.Utc);
            using var sink = new DailyRunFileSink(root, "app", "{Message:lj}{NewLine}", started);
            var path = sink.CurrentPath;

            // An event stamped YESTERDAY (queued line, clock correction) stays in the open file.
            var yesterday = new DateTime(2026, 08, 27, 23, 59, 59, DateTimeKind.Utc);
            sink.Emit(Event(new DateTimeOffset(yesterday), LogEventLevel.Information, "late line"));

            Assert.Equal(path, sink.CurrentPath);
        }
        finally
        {
            if (Directory.Exists(root))
            {
                Directory.Delete(root, recursive: true);
            }
        }
    }

    // ---------------------------------------------------------------- LogRetention

    [Fact]
    public void Retention_DeletesOnlyExpiredDayFolders_AndNeverToday()
    {
        var today = new DateOnly(2026, 08, 27);
        var folders = new[]
        {
            "2026-08-27",       // today — kept
            "2026-08-14",       // 13 days — kept at 14
            "2026-08-13",       // exactly 14 days — kept (cutoff is strictly older)
            "2026-08-12",       // 15 days — pruned
            "2026-07-01",       // long gone — pruned
            "not-a-date",       // not ours — left alone
        };

        var pruned = LogRetention.FoldersToPrune(folders, today, retainDays: 14);

        Assert.Equal(["2026-08-12", "2026-07-01"], pruned);
    }

    [Fact]
    public void Retention_ZeroDisablesTheSweep()
    {
        Assert.Empty(LogRetention.FoldersToPrune(["2000-01-01"], new DateOnly(2026, 08, 27), 0));
    }

    [Fact]
    public void Retention_PruneOnDisk_RemovesTheFolder_AndSurvivesAMissingRoot()
    {
        var root = Path.Combine(Path.GetTempPath(), "creds-retention-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(Path.Combine(root, "2026-01-01"));
        Directory.CreateDirectory(Path.Combine(root, "2026-08-27"));
        File.WriteAllText(Path.Combine(root, "2026-01-01", "app-10-00-00-1.log"), "old");

        LogRetention.PruneAtStartup(root, new DateOnly(2026, 08, 27), 14);

        Assert.False(Directory.Exists(Path.Combine(root, "2026-01-01")), "the expired day survived");
        Assert.True(Directory.Exists(Path.Combine(root, "2026-08-27")), "today was deleted");
        Directory.Delete(root, recursive: true);

        // A missing root is a no-op, not an exception — retention must never stop a start.
        LogRetention.PruneAtStartup(Path.Combine(root, "missing"), new DateOnly(2026, 08, 27), 14);
    }
}
