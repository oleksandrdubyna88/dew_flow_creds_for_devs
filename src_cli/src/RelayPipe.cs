using System.IO.Pipes;
using System.Net.Sockets;

using CredsBroker;
using CredsForDevs.ServiceDefaults;
using Serilog;

namespace CredsCli;

/// <summary>
/// The Windows half of the WSL agent relay: connect to this window's SSH agent and pump bytes
/// between it and this process's own stdin/stdout.
/// </summary>
/// <remarks>
/// <para>Never run by a person. <see cref="AgentRelay"/> inside WSL starts one of these per
/// accepted connection, because a Windows named pipe is a kernel object the Linux side cannot
/// open, and the only thing that crosses the boundary reliably is a process's streams — measured
/// 2026-08-26: 64 KB of random bytes through WSL interop pipes came back with an identical
/// SHA-256.</para>
/// <para><b>The address is resolved here, on every connection, rather than once by the relay.</b>
/// The agent starts when the first key is loaded and stops when the last is unloaded, so a name
/// captured at relay startup would be wrong for most of a session — and on Windows a pipe name
/// whose server has gone is indistinguishable from one that never existed.</para>
/// <para>An announcement is a hint and never a promise: a window that crashed cannot delete its
/// own file. What decides is whether the connection opens, so the newest announcement that
/// answers wins and the rest are passed over in silence.</para>
/// <para><b>It logs to a file</b> (since 2026-10-09, <c>creds-relay-pipe</c>), sparse at Information: its
/// start, and its outcome — which side ended the connection, or why there was none. One file per run,
/// which is one per agent connection; the growth this costs is budgeted in §8 of
/// PLAN_wsl_bridge_outlives_its_client.md. stdout and stdin carry the agent protocol, so the console
/// half goes to stderr.</para>
/// </remarks>
internal static class RelayPipe
{
    /// <summary>The log file prefix of a relay-pipe run.</summary>
    internal const string AppName = "creds-relay-pipe";

    private const string PipePrefix = @"\\.\pipe\";

    /// <summary>The pipe name inside an address, or null when it is not a pipe address.</summary>
    internal static string? PipeName(string address) =>
        address.StartsWith(PipePrefix, StringComparison.Ordinal)
            ? address[PipePrefix.Length..]
            : null;

    /// <summary>Every announced agent address, newest window first.</summary>
    internal static IReadOnlyList<string> AgentAddresses(IReadOnlyList<Endpoint> endpoints)
    {
        var found = new List<string>();
        foreach (var endpoint in endpoints)
        {
            if (!string.IsNullOrWhiteSpace(endpoint.AgentSocket))
            {
                found.Add(endpoint.AgentSocket);
            }
        }
        return found;
    }

    internal static async Task<int> RunAsync(BrokerContract contract)
    {
        using var log = CredsLogging.Create(AppName);
        return await RunAsync(contract, Endpoints.DirectoryHere(), log).ConfigureAwait(false);
    }

    /// <summary>The run, with the announcement folder and the logger supplied — what the tests drive in-process.</summary>
    internal static async Task<int> RunAsync(BrokerContract contract, string? endpointDirectory, ILogger log)
    {
        var run = HostRun.Start(log, "relay-pipe", AgentRelay.Version);
        try
        {
            return run.End(await ConnectAndPumpAsync(contract, endpointDirectory, log).ConfigureAwait(false));
        }
        catch (Exception e)
        {
            run.Crash(e);
            throw;
        }
    }

    private static async Task<HostEnding> ConnectAndPumpAsync(BrokerContract contract, string? endpointDirectory, ILogger log)
    {
        var addresses = AgentAddresses(Endpoints.Read(endpointDirectory));
        if (addresses.Count == 0)
        {
            log.Warning(
                "no VS Code window is serving an SSH agent. Load a key into the agent from the SSH keys view, "
                    + "then try again.");
            return new HostEnding(contract.Exit("brokerUnreachable"), ExitReason.NoAgentAnnounced);
        }

        foreach (var address in addresses)
        {
            var stream = await TryConnectAsync(address).ConfigureAwait(false);
            if (stream is not null)
            {
                await using (stream)
                {
                    return new HostEnding(0, await PumpAsync(stream).ConfigureAwait(false));
                }
            }
        }

        log.Warning(
            "an SSH agent was announced but none answered — the window that wrote it is gone, or its key "
                + "was unloaded ({Candidates} announced).",
            addresses.Count);
        return new HostEnding(contract.Exit("brokerUnreachable"), ExitReason.NoAgentAnswered);
    }

    private static async Task<Stream?> TryConnectAsync(string address)
    {
        try
        {
            return PipeName(address) is { } name
                ? await ConnectPipeAsync(name).ConfigureAwait(false)
                : await ConnectUnixAsync(address).ConfigureAwait(false);
        }
        // ArgumentException among them: the address is ANNOUNCED by another process, and a unix
        // path longer than the platform's `sun_path` makes the endpoint's constructor refuse the
        // value rather than the connection — an ArgumentOutOfRangeException, which is none of the
        // others and would take the process down instead of meaning "could not connect". The same
        // escape crashed `creds relay` on macOS; found by the 1.7.0 release.
        catch (Exception e) when (e is IOException or SocketException or TimeoutException
            or UnauthorizedAccessException or PlatformNotSupportedException or ArgumentException)
        {
            return null;
        }
    }

    private static async Task<Stream> ConnectPipeAsync(string name)
    {
        var pipe = new NamedPipeClientStream(".", name, PipeDirection.InOut, PipeOptions.Asynchronous);
        // A short wait, not an indefinite one: a dead announcement must fail fast enough that the
        // next candidate is tried while ssh is still waiting for its agent.
        await pipe.ConnectAsync(2000).ConfigureAwait(false);
        return pipe;
    }

    private static async Task<Stream> ConnectUnixAsync(string path)
    {
        var socket = new Socket(AddressFamily.Unix, SocketType.Stream, ProtocolType.Unspecified);
        await socket.ConnectAsync(new UnixDomainSocketEndPoint(path)).ConfigureAwait(false);
        return new NetworkStream(socket, ownsSocket: true);
    }

    /// <summary>
    /// Copy both directions until either end closes.
    /// </summary>
    /// <remarks>
    /// <c>WhenAny</c>, not <c>WhenAll</c>: the agent closing its side must end this process even
    /// though stdin will never reach end-of-stream on its own, and a client that hangs up must not
    /// leave a copy waiting on a socket nobody will write to again.
    /// </remarks>
    private static async Task<ExitReason> PumpAsync(Stream agent)
    {
        await using var stdin = Console.OpenStandardInput();
        await using var stdout = Console.OpenStandardOutput();
        var toAgent = stdin.CopyToAsync(agent);
        var fromAgent = agent.CopyToAsync(stdout);
        var first = await Task.WhenAny(toAgent, fromAgent).ConfigureAwait(false);
        return EndingOf(first, toAgent);
    }

    /// <summary>Which ending the first copy to finish stands for — a FAILED copy is its own ending.</summary>
    internal static ExitReason EndingOf(Task first, Task toAgent) =>
        (first.IsFaulted, first == toAgent) switch
        {
            (true, _) => ExitReason.CopyFailed,
            (false, true) => ExitReason.RelayClosed,
            _ => ExitReason.AgentClosed,
        };
}
