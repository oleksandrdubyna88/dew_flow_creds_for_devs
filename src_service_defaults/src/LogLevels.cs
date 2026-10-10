using Serilog.Events;

namespace CredsForDevs.ServiceDefaults;

/// <summary>
/// The minimum level and the per-source overrides, bound EXPLICITLY rather than through
/// <c>Serilog.Settings.Configuration</c>.
/// </summary>
/// <remarks>
/// <para>Moved from the server's <c>Logging.cs</c> (2026-10-09). That package discovers sinks by scanning
/// assemblies, which is reflection a Native AOT binary does not have — so the server read the same
/// <c>Serilog:MinimumLevel:*</c> keys by hand and dropped the scanning. The two AOT binaries now take
/// the same binding from their environment (<see cref="CredsLogging.LevelVariable"/>) instead of an
/// <c>appsettings.json</c> a single-file binary does not ship.</para>
/// <para>The rule's two overrides — <c>Microsoft.AspNetCore</c> and <c>System.Net.Http.HttpClient</c> at
/// Warning — are applied by <see cref="CredsLogging.Build"/> for every host before these, so a host's own
/// list can still lower or raise them: a later override of the same source wins.</para>
/// </remarks>
/// <param name="Default">The floor.</param>
public sealed record LogLevels(LogEventLevel Default)
{
    /// <summary>Per-source levels, applied in order after the rule's two defaults; none unless a host names some.</summary>
    public IReadOnlyList<KeyValuePair<string, LogEventLevel>> Overrides { get; init; } = [];

    /// <summary>A level name, any case, or <paramref name="fallback"/> when it is not one.</summary>
    public static LogEventLevel Parse(string? value, LogEventLevel fallback) =>
        Enum.TryParse<LogEventLevel>(value, ignoreCase: true, out var level) ? level : fallback;
}
