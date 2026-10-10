using System.Globalization;
using Serilog;
using Serilog.Core;
using Serilog.Events;

namespace CredsForDevs.ServiceDefaults;

/// <summary>What one host's logger is built from.</summary>
/// <param name="AppName">Enriched onto every line, and the file-name prefix.</param>
/// <param name="Root">The <c>logs/</c> root; empty means "console only", said once on stderr.</param>
/// <param name="StartedUtc">The run's start — the file name is taken from it, ONCE.</param>
/// <param name="Levels">The floor and the per-source overrides.</param>
/// <param name="RetainDays">Day folders older than this are pruned at startup; 0 disables the sweep.</param>
/// <param name="Console">Where the coloured lines go; null resolves <see cref="System.Console.Out"/> per event.</param>
/// <param name="Source">The <c>SourceContext</c> a line carries when its writer named none; empty for none.</param>
public sealed record LogSetup(
    string AppName,
    string Root,
    DateTime StartedUtc,
    LogLevels Levels,
    int RetainDays,
    TextWriter? Console = null,
    string Source = "");

/// <summary>
/// The one place logging is configured in this repository, per
/// <c>.claude/rules/shared/common/logging-serilog.md</c>: the console in colour, and a file on disk with a
/// NEW FILE PER RUN under a folder named for the UTC day — <c>{root}/{yyyy-MM-dd}/{app}-{HH-mm-ss}-{pid}.log</c>.
/// </summary>
/// <remarks>
/// <para><b>Two entry points over one core.</b> The server keeps <c>AddCredVaultLogging</c>, which reads its
/// <c>appsettings.json</c> contract and calls <see cref="Build"/>. The two Native AOT binaries have no
/// generic host to extend, so they take the factory <see cref="Create(string, bool)"/> — the deviation from
/// the rule's C# shape that coai records in <c>CoaiLogging</c>, made here for the same reason: the CONTRACT
/// (two sinks, the path shape, UTC, stderr for stdio, levels from configuration) is what is shared.</para>
/// <para><b>Levels from the environment for the AOT binaries</b> — <see cref="LevelVariable"/>,
/// <see cref="DirectoryVariable"/>, <see cref="RetentionVariable"/>. A single-file binary ships no
/// <c>appsettings.json</c>; the rule's point is "a config edit and a restart, never an edited call site",
/// and an environment variable in an MCP client's server block is exactly that.</para>
/// <para>Moved together with the sinks out of the server (2026-10-09,
/// <c>todo/PLAN_wsl_bridge_outlives_its_client.md</c> §5.1) — moved, not rewritten: the templates, the
/// enrichers, the overrides and the unwritable-directory fallback are the server's, unchanged.</para>
/// </remarks>
public static class CredsLogging
{
    /// <summary>The floor for an AOT binary: verbose, debug or information (the default, and the ceiling).</summary>
    public const string LevelVariable = "CREDS_LOG_LEVEL";

    /// <summary>Overrides the platform's log root (see <see cref="LogRoot"/>).</summary>
    public const string DirectoryVariable = "CREDS_LOG_DIR";

    /// <summary>Days of day-folders kept; 0 disables the sweep. Default <see cref="LogRetention.DefaultRetainDays"/>.</summary>
    public const string RetentionVariable = "CREDS_LOG_RETENTION_DAYS";

    private const string FileTemplate =
        "[{UtcTimestamp:yyyy-MM-dd HH:mm:ss.fff}Z {Level:u3}] {SourceContext}: {Message:lj} {Properties:j}{NewLine}{Exception}";

    /// <summary>
    /// A logger for an AOT host, configured from its environment. Dispose it last: that flushes the file.
    /// </summary>
    /// <param name="appName">The file-name prefix and the default source — <c>creds-mcp</c>, <c>creds-relay</c>…</param>
    /// <param name="consoleToStdErr">Every host here passes true: stdout carries JSON-RPC, the SSH agent
    /// protocol, or the <c>export SSH_AUTH_SOCK=</c> line, and one log line there corrupts it.</param>
    public static Logger Create(string appName, bool consoleToStdErr = true) =>
        Create(appName, consoleToStdErr, Environment.GetEnvironmentVariable, DateTime.UtcNow, console: null);

    /// <summary>The same, with every input supplied — what the tests drive.</summary>
    internal static Logger Create(
        string appName,
        bool consoleToStdErr,
        Func<string, string?> env,
        DateTime startedUtc,
        TextWriter? console) =>
        Build(new LogSetup(
            appName,
            LogRoot.For(
                LogRoot.Here(),
                env,
                Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData)),
            startedUtc,
            new LogLevels(FloorFrom(env(LevelVariable))),
            RetentionFrom(env(RetentionVariable)),
            console ?? ConsoleFor(consoleToStdErr),
            Source: appName));

    /// <summary>The stream a host's console sink writes to.</summary>
    internal static TextWriter ConsoleFor(bool toStdErr) => toStdErr ? Console.Error : Console.Out;

    /// <summary>
    /// The floor an AOT binary runs at: lowered freely, never raised above Information.
    /// </summary>
    /// <remarks>
    /// <para>The variable adds detail; it never removes the story. Two readers depend on that. The start and
    /// exit lines (<see cref="HostRun"/>) are Information, and they are the reason this logging exists — a
    /// floor of Warning would leave a file that cannot say why its process lived or ended (CodeRabbit on
    /// #201). And the sentences a person or the extension READS are Warning or above — the relay's "already
    /// served" refusal is how the extension adopts a working relay (cadence consultation, epics 1–3).</para>
    /// <para>An unknown value is the default, never an error: logging must not stop a start.</para>
    /// </remarks>
    internal static LogEventLevel FloorFrom(string? value) =>
        LogLevels.Parse(value, LogEventLevel.Information) switch
        {
            var level when !Enum.IsDefined(level) => LogEventLevel.Information,
            > LogEventLevel.Information => LogEventLevel.Information,
            var level => level,
        };

    /// <summary>A non-negative whole number of days, or the default.</summary>
    internal static int RetentionFrom(string? value) =>
        int.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out var days)
            ? days
            : LogRetention.DefaultRetainDays;

    /// <summary>
    /// The core both entry points share: prune, then a coloured console, then the file — or the console
    /// alone, said once, when the directory cannot be written.
    /// </summary>
    public static Logger Build(LogSetup setup)
    {
        if (setup.Root.Length > 0)
        {
            LogRetention.PruneAtStartup(setup.Root, DateOnly.FromDateTime(setup.StartedUtc), setup.RetainDays);
        }

        var configuration = new LoggerConfiguration()
            .MinimumLevel.Is(setup.Levels.Default)
            .MinimumLevel.Override("Microsoft.AspNetCore", LogEventLevel.Warning)
            .MinimumLevel.Override("System.Net.Http.HttpClient", LogEventLevel.Warning);
        foreach (var (source, level) in setup.Levels.Overrides)
        {
            configuration.MinimumLevel.Override(source, level);
        }

        configuration
            .Enrich.FromLogContext()
            .Enrich.With(new UtcTimestampEnricher())
            .Enrich.WithProperty("Application", setup.AppName)
            .Enrich.WithProperty("ProcessId", Environment.ProcessId)
            .WriteTo.Sink(new AnsiConsoleSink(output: setup.Console));
        if (setup.Source.Length > 0)
        {
            // AddPropertyIfAbsent underneath: a writer that names its own source still wins.
            configuration.Enrich.WithProperty("SourceContext", setup.Source);
        }

        return WithFile(configuration, setup).CreateLogger();
    }

    /// <summary>
    /// A host with no writable log directory must still start and still serve. Losing the file is a
    /// degraded log, not an outage — so this failure is reported on stderr and swallowed, which is the one
    /// place swallowing is correct.
    /// </summary>
    private static LoggerConfiguration WithFile(LoggerConfiguration configuration, LogSetup setup)
    {
        try
        {
            return setup.Root.Length == 0
                ? Unwritable(configuration, setup, "no log directory could be determined")
                : configuration.WriteTo.Sink(new DailyRunFileSink(setup.Root, setup.AppName, FileTemplate, setup.StartedUtc));
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or ArgumentException or NotSupportedException)
        {
            return Unwritable(configuration, setup, ex.Message);
        }
    }

    private static LoggerConfiguration Unwritable(LoggerConfiguration configuration, LogSetup setup, string why)
    {
        Console.Error.WriteLine(
            $"[{setup.AppName}] log directory '{setup.Root}' is not writable ({why}); "
            + "continuing with console logging only.");
        return configuration;
    }
}
