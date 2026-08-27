using System.Globalization;
using Serilog;
using Serilog.Core;
using Serilog.Events;

namespace CredVaultServer;

/// <summary>
/// The run's log on disk: a folder per day, a file per run — and, for a run that outlives the
/// day, a new file at UTC midnight.
///
/// <para><b>Ported from the family</b> (`dew_flow_mcp/src/ServiceDefaults/DailyRunFileSink.cs`).
/// "A file per run" and "this container never restarts" were two rules nobody had held against
/// each other: a file per run is right because the question asked of a log is almost always
/// "what did THAT run do" — but its mitigating rotation IS the restart, and a long-lived
/// deployment's premise is that there is none. One file growing for months is what the two rules
/// produced together. Segmenting at the day boundary keeps the run identifiable (same pid,
/// consecutive days) and bounds any single file to one day of traffic.</para>
///
/// <para>The boundary is the CLOCK, not twenty-four hours after startup: a run starting at 15:00
/// writes <c>…-15-00-00-1234.log</c> and its next segment is <c>…/00-00-00-1234.log</c> in
/// tomorrow's folder. The segment is named for the boundary, not for the first post-midnight
/// event, so a reader comparing consecutive files sees them meet rather than a gap.</para>
///
/// <para>The writing itself is Serilog's own file sink, one per segment — what this class owns is
/// <i>which file</i>.</para>
/// </summary>
public sealed class DailyRunFileSink : ILogEventSink, IDisposable
{
    private const string SegmentStart = "00-00-00";

    private readonly string _root;
    private readonly string _appName;
    private readonly string _template;
    private readonly object _gate = new();

    private DateOnly _day;
    private Logger _current;
    private volatile string _path;

    public DailyRunFileSink(string logRoot, string appName, string outputTemplate, DateTime startedUtc)
    {
        _root = logRoot;
        _appName = appName;
        _template = outputTemplate;

        _day = DateOnly.FromDateTime(startedUtc);
        _path = FilePath(logRoot, appName, _day, startedUtc.ToString("HH-mm-ss", CultureInfo.InvariantCulture));
        _current = Open(_path, outputTemplate);
    }

    /// <summary>The file being written right now; changes at every midnight the process lives
    /// through.</summary>
    public string CurrentPath => _path;

    public void Emit(LogEvent logEvent)
    {
        var utcDay = DateOnly.FromDateTime(logEvent.Timestamp.UtcDateTime);

        lock (_gate)
        {
            // FORWARD only: an event stamped earlier than the current segment — a clock
            // correction, or a queued event overtaken by the boundary — lands in the open file
            // rather than reopening yesterday's. A late line in the right run beats a lost file.
            if (utcDay > _day)
            {
                Roll(utcDay);
            }

            _current.Write(logEvent);
        }
    }

    public void Dispose()
    {
        lock (_gate)
        {
            _current.Dispose();
        }
    }

    private void Roll(DateOnly to)
    {
        _current.Dispose();
        _day = to;
        _path = FilePath(_root, _appName, to, SegmentStart);
        _current = Open(_path, _template);
    }

    private static string FilePath(string logRoot, string appName, DateOnly utcDay, string time)
    {
        var folder = Path.Combine(logRoot, utcDay.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture));
        Directory.CreateDirectory(folder);
        return Path.Combine(folder, $"{appName}-{time}-{Environment.ProcessId}.log");
    }

    /// <summary><c>MinimumLevel.Verbose</c> deliberately: everything arriving here already passed
    /// the outer logger's filter, and an inner Information default would silently discard the
    /// Debug lines somebody raised the level to see.</summary>
    private static Logger Open(string file, string template) =>
        new LoggerConfiguration()
            .MinimumLevel.Verbose()
            .WriteTo.File(
                file,
                outputTemplate: template,
                shared: false,
                flushToDiskInterval: TimeSpan.FromSeconds(2))
            .CreateLogger();
}
