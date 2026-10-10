using System.Diagnostics;
using Serilog;

namespace CredsForDevs.ServiceDefaults;

/// <summary>
/// The two lines every serving host writes: why it started and why it ended.
/// </summary>
/// <remarks>
/// <para>The point of the whole logging epic (§2.4 of the plan above): on 2026-10-09 neither the reason a
/// process stayed alive nor the reason it exited could be read afterwards, and an investigation had to
/// rebuild both from <c>/proc</c> and a shim. A file with a start line and no exit line is itself the
/// diagnosis — the process was killed hard, or it is still running.</para>
/// <para><b>What these lines never carry</b> (§5.1): argument values, environment values, the caller
/// record, protocol bodies, tool data, tokens. The mode is a word the host chose, the version is the
/// assembly's, and the reason is a word from the host's own code.</para>
/// </remarks>
public sealed class HostRun
{
    private readonly ILogger _log;
    private readonly long _startedAt;
    private int _ended;

    private HostRun(ILogger log)
    {
        _log = log;
        _startedAt = Stopwatch.GetTimestamp();
    }

    /// <summary>Log the start: mode, version, pid and parent pid.</summary>
    /// <param name="log">The host's logger.</param>
    /// <param name="mode">What this run is for — <c>serve</c>, <c>wsl-pump</c>, <c>relay</c>…</param>
    /// <param name="version">The binary's version, from the same source it reports elsewhere.</param>
    public static HostRun Start(ILogger log, string mode, string version)
    {
        log.Information(
            "started: {Mode}, version {Version}, pid {Pid}, parent {ParentPid}",
            mode, version, Environment.ProcessId, ParentProcess.Id());
        return new HostRun(log);
    }

    /// <summary>Log the end — code, reason, uptime — and hand the code back for <c>Main</c> to return.</summary>
    /// <remarks>
    /// Once per run: a shutdown deadline and a normal return can reach this in the same instant, and a file with
    /// two exit lines would say the run ended twice. The first caller's line stands; every caller still gets its
    /// own code back.
    /// </remarks>
    public int End(HostEnding ending)
    {
        if (Interlocked.Exchange(ref _ended, 1) == 0)
        {
            _log.Information(
                "exited: code {ExitCode}, reason {Reason}, after {UptimeSeconds:0.000} s",
                ending.Code, Word(ending.Reason), Stopwatch.GetElapsedTime(_startedAt).TotalSeconds);
        }
        return ending.Code;
    }

    /// <summary>The reason as the log writes it: <c>clientClosed</c>, <c>noAgentAnnounced</c>.</summary>
    public static string Word(ExitReason reason)
    {
        var name = reason.ToString();
        return string.Concat(char.ToLowerInvariant(name[0]).ToString(), name[1..]);
    }

    /// <summary>Log an end nobody planned: the exception first, as the doctrine asks, then the uptime.</summary>
    public void Crash(Exception exception) =>
        _log.Fatal(
            exception,
            "exited: reason crashed, after {UptimeSeconds:0.000} s",
            Stopwatch.GetElapsedTime(_startedAt).TotalSeconds);
}
