using CredsForDevs.ServiceDefaults;
using Serilog;
using Serilog.Events;

namespace CredVaultServer;

/// <summary>
/// The server's entry point into the repository's one logging configuration, per
/// <c>.claude/rules/shared/common/logging-serilog.md</c>: the console, and a file on disk with a NEW FILE
/// PER RUN under a folder named for the UTC day.
///
/// <para>
/// A file per run rather than a rolling file per day is the part people get wrong by reaching for a
/// rolling sink: rolling by day appends every run into one file, and the question actually being asked
/// is almost always "what did <em>that</em> run do". The timestamp is taken once at startup and the
/// process id disambiguates two hosts started in the same second.
/// </para>
///
/// <para>
/// <b>Since 2026-10-09 the sinks, the retention sweep, the enrichers and the level binding live in
/// <c>src_service_defaults</c></b> (<see cref="CredsLogging"/>), moved there unchanged so the two Native
/// AOT binaries write the same files the same way (<c>todo/PLAN_wsl_bridge_outlives_its_client.md</c>
/// §5.1). What stays here is exactly the server's CONTRACT — the <c>appsettings.json</c> keys this file
/// reads, which <c>ConfigKeys</c> lists and the backup archive carries — so the contract did not move
/// and did not change.
/// </para>
/// </summary>
public static class CredVaultLogging
{
    /// <summary>
    /// Configures Serilog and installs it as the host's logger. Call it as the first statement after
    /// creating the builder — a host that crashes while wiring itself up is precisely when the log
    /// matters, and a logger configured after <c>Build()</c> has nothing to say about it.
    /// </summary>
    public static void AddCredVaultLogging(this IHostApplicationBuilder builder, string appName)
    {
        // Empty is the appsettings default and means "unset" — `??` alone would take it and put the
        // log root at the process working directory.
        var configured = builder.Configuration["Logging:Directory"];
        var logRoot = string.IsNullOrWhiteSpace(configured)
            ? Path.Combine(AppContext.BaseDirectory, "logs")
            : configured;

        Log.Logger = CredsLogging.Build(new LogSetup(
            appName,
            logRoot,
            DateTime.UtcNow,
            // Levels come from configuration, never from call sites: changing verbosity is a config
            // edit and a restart, not an edited binary. The same `Serilog:MinimumLevel:*` keys, read
            // explicitly (see LogLevels for why not Serilog.Settings.Configuration).
            new LogLevels(LogLevels.Parse(builder.Configuration["Serilog:MinimumLevel:Default"], LogEventLevel.Information))
            {
                Overrides = ConfiguredOverrides(builder.Configuration),
            },
            builder.Configuration.GetValue("Logging:RetentionDays", LogRetention.DefaultRetainDays)));
        builder.Logging.ClearProviders();
        builder.Logging.AddSerilog(Log.Logger, dispose: true);
    }

    /// <summary>
    /// The server's own override first, then whatever the configuration names — a later override of the
    /// same source wins, so the configuration can still change it.
    /// </summary>
    private static IReadOnlyList<KeyValuePair<string, LogEventLevel>> ConfiguredOverrides(IConfiguration configuration) =>
    [
        // This service issues no cookies and no antiforgery tokens, so the key-ring warnings it emits on
        // every start are three lines of noise per run.
        new("Microsoft.AspNetCore.DataProtection", LogEventLevel.Error),
        .. configuration.GetSection("Serilog:MinimumLevel:Override").GetChildren()
            .Where(over => over.Value is { Length: > 0 })
            .Select(over => new KeyValuePair<string, LogEventLevel>(
                over.Key, LogLevels.Parse(over.Value, LogEventLevel.Information))),
    ];
}
