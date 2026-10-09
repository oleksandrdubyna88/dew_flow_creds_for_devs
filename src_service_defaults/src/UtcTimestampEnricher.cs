using Serilog.Core;
using Serilog.Events;

namespace CredsForDevs.ServiceDefaults;

/// <summary>
/// Adds <c>UtcTimestamp</c>, because Serilog's own <c>{Timestamp}</c> is local.
/// </summary>
/// <remarks>
/// <para>Moved from the server's <c>Logging.cs</c> (2026-10-09), unchanged.
/// <c>LogEvent.Timestamp</c> is a <see cref="DateTimeOffset"/> taken with the machine's offset, so
/// <c>{Timestamp:HH:mm:ss}</c> renders local time — while the file this line goes into is named from
/// <c>DateTime.UtcNow</c>. One file carrying two timezones is not a cosmetic problem: the one moment
/// anybody opens it is while lining it up against another host's log, and the shared logging rule asks
/// for UTC in the folder, the file name and every line for exactly that reason.</para>
/// <para>It reads as a non-issue in the server's container, which happens to run UTC. It is not one on a
/// developer's machine, where both AOT binaries run.</para>
/// </remarks>
internal sealed class UtcTimestampEnricher : ILogEventEnricher
{
    public void Enrich(LogEvent logEvent, ILogEventPropertyFactory factory) =>
        logEvent.AddPropertyIfAbsent(
            factory.CreateProperty("UtcTimestamp", logEvent.Timestamp.UtcDateTime));
}
