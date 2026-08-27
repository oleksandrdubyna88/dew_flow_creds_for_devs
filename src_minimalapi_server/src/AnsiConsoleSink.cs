using Serilog.Core;
using Serilog.Events;
using Serilog.Formatting.Display;

namespace CredVaultServer;

/// <summary>
/// Writes coloured log lines to stdout with ANSI escapes, unconditionally.
///
/// <para><b>Ported from the family</b> (`dew_flow_mcp/src/ServiceDefaults/AnsiConsoleSink.cs`) per
/// the shared logging rule, which keeps the code per-repo by deliberate trade. This closes the
/// deviation `Logging.cs` used to record: the plain console sink was chosen because "docker
/// compose logs colours by stream" — which colours the stderr/stdout SPLIT, not the lines, and a
/// grey wall at level Warning looks exactly like a grey wall at level Error.</para>
///
/// <para><b>Why not Serilog's own console theme.</b> The documented knob does not work: measured
/// on Serilog.Sinks.Console 6.1.1, <c>theme: AnsiConsoleTheme.Code</c> with
/// <c>applyThemeToRedirectedOutput: true</c> wrote <b>zero</b> escape bytes to a redirected
/// stdout, as did <c>Sixteen</c> and an <c>ExpressionTemplate</c> theme — while a control writing
/// one escape by hand in the same process produced four. A container's captured stdout is a
/// redirected stream by definition. The measurement lives in the rule; the test beside this file
/// repeats its shape, control included.</para>
///
/// <para>The colours are deliberately few: the level is the only thing coloured strongly, because
/// a line where everything is coloured is a line where nothing stands out. One write per event,
/// and the line is built before the lock is taken — the lock guards a single <c>Write</c> of a
/// finished string, not a rendering pipeline.</para>
/// </summary>
/// <param name="formatProvider">Culture for message rendering; null is invariant-enough here.</param>
/// <param name="output">Where lines go. Null — the default — resolves <see cref="Console.Out"/> at
/// each event; a writer supplied here is used as given, which is what makes the sink testable
/// without touching process-global state.</param>
public sealed class AnsiConsoleSink(IFormatProvider? formatProvider = null, TextWriter? output = null)
    : ILogEventSink
{
    private const string Reset = "\x1b[0m";
    private const string Dim = "\x1b[38;5;245m";
    private const string Context = "\x1b[38;5;110m";

    private readonly object _gate = new();

    /// <summary>
    /// Renders the message through Serilog's own formatter with <c>:lj</c> — never
    /// <c>RenderMessage()</c>, which quotes every string property so a connection error reads
    /// <c>database '"vault"'</c>.
    /// </summary>
    private readonly MessageTemplateTextFormatter _message = new("{Message:lj}", formatProvider);

    public void Emit(LogEvent logEvent)
    {
        var line = Render(logEvent);
        var writer = output ?? Console.Out;
        lock (_gate)
        {
            writer.Write(line);
            writer.Flush();
        }
    }

    /// <summary>The finished line, escapes and newline included.</summary>
    private string Render(LogEvent logEvent)
    {
        var source = logEvent.Properties.TryGetValue("SourceContext", out var context)
            ? Shorten(context.ToString().Trim('"'))
            : "";

        var line = new StringWriter();
        line.Write($"{Dim}[{logEvent.Timestamp.UtcDateTime:HH:mm:ss}Z{Reset} {LevelToken(logEvent.Level)}{Dim}]{Reset} ");
        if (source.Length > 0)
        {
            line.Write($"{Context}{source}{Reset}{Dim}:{Reset} ");
        }

        _message.Format(logEvent, line);
        line.Write(Environment.NewLine);
        if (logEvent.Exception is not null)
        {
            line.Write($"{LevelColour(LogEventLevel.Error)}{logEvent.Exception}{Reset}{Environment.NewLine}");
        }

        return line.ToString();
    }

    private static string LevelToken(LogEventLevel level) =>
        $"{LevelColour(level)}{Abbreviate(level)}{Reset}";

    private static string LevelColour(LogEventLevel level) => level switch
    {
        LogEventLevel.Verbose => "\x1b[38;5;240m",
        LogEventLevel.Debug => "\x1b[38;5;244m",
        LogEventLevel.Information => "\x1b[38;5;42m",
        LogEventLevel.Warning => "\x1b[38;5;214m",
        LogEventLevel.Error => "\x1b[38;5;203m",
        _ => "\x1b[1;38;5;199m",
    };

    private static string Abbreviate(LogEventLevel level) => level switch
    {
        LogEventLevel.Verbose => "VRB",
        LogEventLevel.Debug => "DBG",
        LogEventLevel.Information => "INF",
        LogEventLevel.Warning => "WRN",
        LogEventLevel.Error => "ERR",
        _ => "FTL",
    };

    /// <summary>The last two segments of a namespace-qualified type — the part that identifies
    /// the writer is at the end.</summary>
    private static string Shorten(string sourceContext)
    {
        var parts = sourceContext.Split('.');
        return parts.Length <= 2 ? sourceContext : string.Join('.', parts[^2..]);
    }
}
