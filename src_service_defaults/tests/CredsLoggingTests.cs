using System.Globalization;
using CredsForDevs.ServiceDefaults;
using FluentAssertions;
using Serilog.Events;

namespace CredsForDevs.ServiceDefaults.Tests;

/// <summary>
/// The factory the two AOT binaries log through: the path shape, UTC, the console stream, and the
/// environment that configures it (todo/PLAN_wsl_bridge_outlives_its_client.md, E1.S1).
/// </summary>
public sealed class CredsLoggingTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "creds-log-tests-" + Guid.NewGuid().ToString("N"));

    public void Dispose()
    {
        if (Directory.Exists(_root))
        {
            Directory.Delete(_root, recursive: true);
        }
    }

    private Func<string, string?> Env(params (string Name, string Value)[] extra)
    {
        var values = new Dictionary<string, string>(StringComparer.Ordinal) { [CredsLogging.DirectoryVariable] = _root };
        foreach (var (name, value) in extra)
        {
            values[name] = value;
        }
        return name => values.TryGetValue(name, out var value) ? value : null;
    }

    private static string Read(string path)
    {
        using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }

    [Fact]
    public void A_run_writes_one_file_named_for_its_UTC_start_and_its_pid()
    {
        var started = DateTime.UtcNow;
        var console = new StringWriter();

        using (var log = CredsLogging.Create("creds-test", consoleToStdErr: true, Env(), started, console))
        {
            log.Information("relay listening on {Socket}", "/run/x.sock");
        }

        var expected = Path.Combine(
            _root,
            started.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            $"creds-test-{started.ToString("HH-mm-ss", CultureInfo.InvariantCulture)}-{Environment.ProcessId}.log");
        File.Exists(expected).Should().BeTrue("the rule's shape is {root}/{yyyy-MM-dd}/{app}-{HH-mm-ss}-{pid}.log");
        var text = Read(expected);
        text.Should().Contain("relay listening on /run/x.sock", "the message is rendered literally, not quoted");
        text.Should().Contain("creds-test:", "a line nobody named a source for carries the app name");
        console.ToString().Should().Contain("relay listening on /run/x.sock", "the console gets the same line");
    }

    [Fact]
    public void Every_timestamp_in_the_file_is_UTC_whatever_offset_the_event_carries()
    {
        var started = DateTime.UtcNow;
        // The same instant, expressed five hours east. A local-time render would print hour+5.
        var at = new DateTimeOffset(started).ToOffset(TimeSpan.FromHours(5));

        using (var log = CredsLogging.Create("creds-utc", consoleToStdErr: true, Env(), started, new StringWriter()))
        {
            log.Write(new LogEvent(at, LogEventLevel.Information, null,
                new Serilog.Parsing.MessageTemplateParser().Parse("tick"), []));
        }

        var file = Directory.GetFiles(_root, "creds-utc-*.log", SearchOption.AllDirectories).Single();
        Read(file).Should().Contain($"[{started:yyyy-MM-dd HH:mm:ss.fff}Z", "the line's clock is the file name's clock");
    }

    [Fact]
    public void A_stdio_host_writes_its_console_lines_to_stderr()
    {
        CredsLogging.ConsoleFor(toStdErr: true).Should().BeSameAs(Console.Error);
        CredsLogging.ConsoleFor(toStdErr: false).Should().BeSameAs(Console.Out);
    }

    [Theory]
    [InlineData(null, LogEventLevel.Information)]
    [InlineData("", LogEventLevel.Information)]
    [InlineData("debug", LogEventLevel.Debug)]
    [InlineData("Verbose", LogEventLevel.Verbose)]
    [InlineData("warning", LogEventLevel.Information)]
    [InlineData("error", LogEventLevel.Information)]
    [InlineData("Fatal", LogEventLevel.Information)]
    [InlineData("loud", LogEventLevel.Information)]
    [InlineData("42", LogEventLevel.Information)]
    public void The_floor_is_lowered_freely_and_never_raised_above_information(string? value, LogEventLevel expected)
    {
        // Above Information would drop the start and exit lines — the reason this logging exists
        // (CodeRabbit on #201) — and above Warning the sentences the extension reads, the relay's
        // "already served" refusal among them. The variable adds detail; it never removes the story.
        CredsLogging.FloorFrom(value).Should().Be(expected);
    }

    [Theory]
    [InlineData(null, LogRetention.DefaultRetainDays)]
    [InlineData("0", 0)]
    [InlineData("7", 7)]
    [InlineData("-3", LogRetention.DefaultRetainDays)]
    [InlineData("a week", LogRetention.DefaultRetainDays)]
    public void Retention_is_a_whole_number_of_days_or_the_default(string? value, int expected)
    {
        CredsLogging.RetentionFrom(value).Should().Be(expected);
    }

    [Fact]
    public void A_floor_from_the_environment_reaches_the_file()
    {
        var started = DateTime.UtcNow;
        using (var log = CredsLogging.Create("creds-floor", true, Env((CredsLogging.LevelVariable, "debug")), started, new StringWriter()))
        {
            log.Verbose("chatter");
            log.Debug("worth reading");
        }

        var text = Read(Directory.GetFiles(_root, "creds-floor-*.log", SearchOption.AllDirectories).Single());
        text.Should().Contain("worth reading", "the positive control: the file holds what passes the floor");
        text.Should().NotContain("chatter");
    }

    [Fact]
    public void Expired_day_folders_are_pruned_at_startup_and_zero_disables_the_sweep()
    {
        var old = Path.Combine(_root, "2000-01-01");
        Directory.CreateDirectory(old);

        CredsLogging.Create("creds-keep", true, Env((CredsLogging.RetentionVariable, "0")), DateTime.UtcNow, new StringWriter()).Dispose();
        Directory.Exists(old).Should().BeTrue("0 disables the sweep");

        CredsLogging.Create("creds-prune", true, Env(), DateTime.UtcNow, new StringWriter()).Dispose();
        Directory.Exists(old).Should().BeFalse("the default window is fourteen days");
    }

    [Fact]
    public void A_log_directory_that_cannot_be_written_leaves_the_console_working()
    {
        Directory.CreateDirectory(_root);
        var aFile = Path.Combine(_root, "not-a-directory");
        File.WriteAllText(aFile, "x");
        var console = new StringWriter();

        using (var log = CredsLogging.Create("creds-blocked", true, name => name == CredsLogging.DirectoryVariable ? aFile : null, DateTime.UtcNow, console))
        {
            log.Warning("still heard");
        }

        console.ToString().Should().Contain("still heard", "losing the file is a degraded log, not an outage");
    }

    [Fact]
    public void The_rule_overrides_apply_and_a_host_override_of_the_same_source_wins()
    {
        var console = new StringWriter();
        var quiet = new LogSetup("a", string.Empty, DateTime.UtcNow, new LogLevels(LogEventLevel.Information), 14, console);
        var loud = quiet with
        {
            Levels = new LogLevels(LogEventLevel.Information) { Overrides = [new("Microsoft.AspNetCore", LogEventLevel.Information)] },
        };

        using (var log = CredsLogging.Build(quiet))
        {
            log.ForContext("SourceContext", "Microsoft.AspNetCore.Routing").Information("request chatter");
        }
        console.ToString().Should().NotContain("request chatter", "Microsoft.AspNetCore defaults to Warning");

        using (var log = CredsLogging.Build(loud))
        {
            log.ForContext("SourceContext", "Microsoft.AspNetCore.Routing").Information("request chatter");
        }
        console.ToString().Should().Contain("request chatter", "the host's own list comes after the defaults");
    }
}
