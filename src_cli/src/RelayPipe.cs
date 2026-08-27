using System.IO.Pipes;
using System.Net.Sockets;

using CredsBroker;

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
/// </remarks>
internal static class RelayPipe
{
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
        var addresses = AgentAddresses(Endpoints.Read(Endpoints.DirectoryHere()));
        if (addresses.Count == 0)
        {
            Console.Error.WriteLine(
                "[creds-for-devs] no VS Code window is serving an SSH agent. Load a key into the "
                    + "agent from the SSH keys view, then try again.");
            return contract.Exit("brokerUnreachable");
        }

        foreach (var address in addresses)
        {
            var stream = await TryConnectAsync(address).ConfigureAwait(false);
            if (stream is not null)
            {
                await using (stream)
                {
                    await PumpAsync(stream).ConfigureAwait(false);
                }
                return 0;
            }
        }

        Console.Error.WriteLine(
            "[creds-for-devs] an SSH agent was announced but none answered — the window that "
                + "wrote it is gone, or its key was unloaded.");
        return contract.Exit("brokerUnreachable");
    }

    private static async Task<Stream?> TryConnectAsync(string address)
    {
        try
        {
            return PipeName(address) is { } name
                ? await ConnectPipeAsync(name).ConfigureAwait(false)
                : await ConnectUnixAsync(address).ConfigureAwait(false);
        }
        catch (Exception e) when (e is IOException or SocketException or TimeoutException
            or UnauthorizedAccessException or PlatformNotSupportedException)
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
    private static async Task PumpAsync(Stream agent)
    {
        await using var stdin = Console.OpenStandardInput();
        await using var stdout = Console.OpenStandardOutput();
        var toAgent = stdin.CopyToAsync(agent);
        var fromAgent = agent.CopyToAsync(stdout);
        await Task.WhenAny(toAgent, fromAgent).ConfigureAwait(false);
    }
}
