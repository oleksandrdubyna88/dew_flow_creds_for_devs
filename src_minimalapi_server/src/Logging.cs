using Serilog;
using Serilog.Core;
using Serilog.Events;

namespace CredVaultServer;

/// <summary>
/// The one place logging is configured, per
/// <c>.claude/rules/shared/common/logging-serilog.md</c>: the console, and a file on disk
/// with a NEW FILE PER RUN under a folder named for the UTC day.
///
/// <para>
/// A file per run rather than a rolling file per day is the part people get wrong by
/// reaching for a rolling sink: rolling by day appends every run into one file, and the
/// question actually being asked is almost always "what did <em>that</em> run do". The
/// timestamp is taken once at startup and the process id disambiguates two hosts started
/// in the same second.
/// </para>
///
/// <para>
/// Everything is UTC — the folder, the file name, and the timestamp on every line — so
/// that correlating this service's log with anything else never turns into timezone
/// arithmetic during an incident.
/// </para>
///
/// <para>
/// The family's <c>AnsiConsoleSink</c> and <c>DailyRunFileSink</c> are ported here
/// (2026-08-27, closing the deviation this note used to record): the console is coloured
/// through hand-written escapes because Serilog's own themes emit nothing once stdout is
/// redirected — and a container's captured stdout is redirected by definition; the file
/// segments at UTC midnight so a run that never restarts cannot grow one file for months;
/// and <see cref="LogRetention"/> is the named owner of <c>logs/</c>, sweeping day folders
/// older than 14 days at startup — the same number the extension's `diagnosticLog.ts`
/// chose, because one product should give one answer.
/// </para>
/// </summary>
public static class CredVaultLogging
{
    private const string ConsoleTemplate =
        "[{UtcTimestamp:HH:mm:ss}Z {Level:u3}] {SourceContext}: {Message:lj}{NewLine}{Exception}";

    private const string FileTemplate =
        "[{UtcTimestamp:yyyy-MM-dd HH:mm:ss.fff}Z {Level:u3}] {SourceContext}: {Message:lj} {Properties:j}{NewLine}{Exception}";

    /// <summary>
    /// Configures Serilog and installs it as the host's logger. Call it as the first
    /// statement after creating the builder — a host that crashes while wiring itself up
    /// is precisely when the log matters, and a logger configured after
    /// <c>Build()</c> has nothing to say about it.
    /// </summary>
    private static LogEventLevel ParseLevel(string? value, LogEventLevel fallback) =>
        Enum.TryParse<LogEventLevel>(value, ignoreCase: true, out var level) ? level : fallback;

    private static LoggerConfiguration Apply(
        this LoggerConfiguration configuration,
        Func<LoggerConfiguration, LoggerConfiguration> configure) => configure(configuration);

    /// <summary>
    /// Adds <c>UtcTimestamp</c>, because Serilog's own <c>{Timestamp}</c> is local.
    ///
    /// <para>
    /// <c>LogEvent.Timestamp</c> is a <see cref="DateTimeOffset"/> taken with the machine's
    /// offset, so <c>{Timestamp:HH:mm:ss}</c> renders local time — while the file this
    /// line goes into is named from <c>DateTime.UtcNow</c>. One file carrying two
    /// timezones is not a cosmetic problem: the one moment anybody opens it is while
    /// lining it up against another host's log, and the shared logging rule asks for UTC
    /// in the folder, the file name and every line for exactly that reason.
    /// </para>
    ///
    /// <para>
    /// It reads as a non-issue here because the container happens to run UTC. The rule
    /// exists so it does not depend on happening to.
    /// </para>
    /// </summary>
    private sealed class UtcTimestampEnricher : ILogEventEnricher
    {
        public void Enrich(LogEvent logEvent, ILogEventPropertyFactory factory) =>
            logEvent.AddPropertyIfAbsent(
                factory.CreateProperty("UtcTimestamp", logEvent.Timestamp.UtcDateTime));
    }

    public static void AddCredVaultLogging(this IHostApplicationBuilder builder, string appName)
    {
        var startedUtc = DateTime.UtcNow;
        // Empty is the appsettings default and means "unset" — `??` alone would take it
        // and put the log root at the process working directory.
        var configured = builder.Configuration["Logging:Directory"];
        var logRoot = string.IsNullOrWhiteSpace(configured)
            ? Path.Combine(AppContext.BaseDirectory, "logs")
            : configured;
        LogRetention.PruneAtStartup(
            logRoot,
            DateOnly.FromDateTime(startedUtc),
            builder.Configuration.GetValue("Logging:RetentionDays", LogRetention.DefaultRetainDays));

        var configuration = new LoggerConfiguration()
            // Levels come from configuration, never from call sites: changing verbosity is
            // a config edit and a restart, not an edited binary. Read EXPLICITLY rather
            // than via Serilog.Settings.Configuration — that package discovers sinks by
            // scanning assemblies, which is reflection a Native AOT binary does not have.
            // This keeps the same `Serilog:MinimumLevel:*` keys and drops the scanning.
            .MinimumLevel.Is(ParseLevel(
                builder.Configuration["Serilog:MinimumLevel:Default"], LogEventLevel.Information))
            .MinimumLevel.Override("Microsoft.AspNetCore", LogEventLevel.Warning)
            .MinimumLevel.Override("System.Net.Http.HttpClient", LogEventLevel.Warning)
            // This service issues no cookies and no antiforgery tokens, so the key-ring
            // warnings it emits on every start are three lines of noise per run.
            .MinimumLevel.Override("Microsoft.AspNetCore.DataProtection", LogEventLevel.Error)
            .Apply(c =>
            {
                foreach (var over in builder.Configuration
                             .GetSection("Serilog:MinimumLevel:Override").GetChildren())
                {
                    if (over.Value is { Length: > 0 })
                    {
                        c.MinimumLevel.Override(over.Key, ParseLevel(over.Value, LogEventLevel.Information));
                    }
                }
                return c;
            })
            .Enrich.FromLogContext()
            .Enrich.With(new UtcTimestampEnricher())
            .Enrich.WithProperty("Application", appName)
            .Enrich.WithProperty("ProcessId", Environment.ProcessId)
            .WriteTo.Sink(new AnsiConsoleSink());

        // A container with no writable log mount must still start and still serve. Losing
        // the file sink is a degraded log, not an outage — so this failure is reported on
        // the console and swallowed, which is the one place swallowing is correct.
        try
        {
            configuration = configuration.WriteTo.Sink(
                new DailyRunFileSink(logRoot, appName, FileTemplate, startedUtc));
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            Console.Error.WriteLine(
                $"[{appName}] log directory '{logRoot}' is not writable ({ex.Message}); "
                + "continuing with console logging only.");
        }

        Log.Logger = configuration.CreateLogger();
        builder.Logging.ClearProviders();
        builder.Logging.AddSerilog(Log.Logger, dispose: true);
    }
}
