namespace CredsForDevs.ServiceDefaults;

/// <summary>
/// Why a serving run ended — the whole vocabulary of the exit line, in one place a reader of the logs can
/// look it up.
/// </summary>
/// <remarks>
/// <para>Typed rather than a free string (code round, finding 1: no primitive obsession) — a reason is a
/// closed set the hosts choose from, never something composed. It is written to the log as its camelCase
/// word (<see cref="HostRun.Word"/>) and is NEVER a new contract exit name: the exit CODE stays the
/// contract's (todo/PLAN_wsl_bridge_outlives_its_client.md §5.2.4). Later epics add their own endings —
/// a handled signal, a parent gone, a shutdown deadline — here.</para>
/// </remarks>
public enum ExitReason
{
    /// <summary>The client closed stdin, the MCP stdio transport's own shutdown signal.</summary>
    ClientClosed,

    /// <summary>The client's stream failed mid-conversation.</summary>
    ClientDisconnected,

    /// <summary>Inside WSL, the Windows half could not be started.</summary>
    WindowsHalfMissing,

    /// <summary>The Windows half closed its stdout first.</summary>
    WindowsHalfClosed,

    /// <summary>The relay's socket path cannot be a unix socket on this platform.</summary>
    SocketPathTooLong,

    /// <summary>Another live relay already serves the socket.</summary>
    Busy,

    /// <summary>The relay could not bind or listen.</summary>
    ListenFailed,

    /// <summary>Ctrl-C (the console's cancel key) stopped the relay.</summary>
    Interrupted,

    /// <summary>The relay's accept loop ended on its own.</summary>
    ListenerClosed,

    /// <summary>relay-pipe found no window announcing an SSH agent.</summary>
    NoAgentAnnounced,

    /// <summary>relay-pipe found announcements, and none answered.</summary>
    NoAgentAnswered,

    /// <summary>relay-pipe's stdin (the relay's side) ended first.</summary>
    RelayClosed,

    /// <summary>The SSH agent closed its side first.</summary>
    AgentClosed,
}

/// <summary>How a host run ended: the exit code it returns and the reason it logs.</summary>
/// <param name="Code">The process exit code — unchanged by logging; the contract's codes stay the contract's.</param>
/// <param name="Reason">Why, from the closed vocabulary.</param>
public sealed record HostEnding(int Code, ExitReason Reason);
