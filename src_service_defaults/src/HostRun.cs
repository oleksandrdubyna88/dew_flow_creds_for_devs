using System.Diagnostics;
using Serilog;

namespace CredsForDevs.ServiceDefaults;

/// <summary>How a host run ended: the exit code it returns and the reason, in words, it logs.</summary>
/// <param name="Code">The process exit code — unchanged by logging; the contract's codes stay the contract's.</param>
/// <param name="Reason">A short camelCase word for the log line — <c>clientClosed</c>, <c>busy</c>… — never a
/// new contract exit name (todo/PLAN_wsl_bridge_outlives_its_client.md §5.2.4).</param>
public sealed record HostEnding(int Code, string Reason);

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
    public int End(HostEnding ending)
    {
        _log.Information(
            "exited: code {ExitCode}, reason {Reason}, after {UptimeSeconds:0.000} s",
            ending.Code, ending.Reason, Stopwatch.GetElapsedTime(_startedAt).TotalSeconds);
        return ending.Code;
    }

    /// <summary>Log an end nobody planned: the exception first, as the doctrine asks, then the uptime.</summary>
    public void Crash(Exception exception) =>
        _log.Fatal(
            exception,
            "exited: reason crashed, after {UptimeSeconds:0.000} s",
            Stopwatch.GetElapsedTime(_startedAt).TotalSeconds);
}
