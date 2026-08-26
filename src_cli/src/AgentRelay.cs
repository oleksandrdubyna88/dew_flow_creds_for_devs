using System.Net.Sockets;

namespace CredsCli;

/// <summary>
/// The WSL half of the agent relay: a unix socket inside the distribution that carries the SSH
/// agent protocol to the agent running in the VS Code window on Windows.
/// </summary>
/// <remarks>
/// <para><b>Why a relay and not the trick the rest of this CLI uses.</b> Every other verb is one
/// short exchange whose arguments are names, so <see cref="WslInterop"/> re-executes the Windows
/// binary and relays its streams. <c>ssh</c> does not call us — it opens <c>$SSH_AUTH_SOCK</c> and
/// speaks a binary protocol over a connection it holds open. A socket cannot be re-executed. So
/// the same trick moves down one level: one Windows child per accepted connection.</para>
/// <para><b>Measured before it was built (2026-08-26).</b> A throwaway relay of this exact shape
/// was driven by the real OpenSSH tools against the real agent: <c>ssh-add -l</c> inside WSL
/// listed the key, and <c>ssh-keygen -Y sign</c> produced a signature <c>-Y verify</c> accepted —
/// which is the mechanism <c>git commit -S</c> uses. The private key never existed inside WSL.
/// The one thing that failed was a relay started from a transient shell, which died with it:
/// lifecycle, not plumbing, is the work here.</para>
/// <para><b>This widens the reach of the agent, and that is said out loud.</b> A named pipe is
/// reachable by one Windows user; a unix socket is reachable by every process in the distribution
/// running as that user. The mitigation is not the socket's mode — it is that every signature
/// still raises the consent dialog on Windows, so the worst a process in WSL can do is ask,
/// visibly. The relay is opt-in and never starts itself.</para>
/// </remarks>
internal static class AgentRelay
{
    /// <summary>Overrides the socket path, for a second window or an unusual layout.</summary>
    internal const string SocketOverrideVariable = "CREDS_RELAY_SOCKET";

    /// <summary>Anything that is not plainly a file name is dropped from the user component.</summary>
    internal static string SafeUser(string user)
    {
        var kept = new string([.. user.Where(c => char.IsAsciiLetterOrDigit(c) || c == '_' || c == '-')]);
        return kept.Length == 0 ? "user" : kept;
    }

    /// <summary>
    /// Where the socket lives.
    /// </summary>
    /// <remarks>
    /// <c>XDG_RUNTIME_DIR</c> when the distribution provides one — it is per-user, already mode
    /// 0700, and cleaned up on logout. Otherwise <c>/tmp</c> with the user in the name, so two
    /// accounts on one machine cannot collide on a path.
    /// </remarks>
    internal static string DefaultSocketPath(string? runtimeDir, string user) =>
        string.IsNullOrWhiteSpace(runtimeDir)
            ? $"/tmp/creds-agent-{SafeUser(user)}.sock"
            : Path.Combine(runtimeDir, "creds-agent.sock");

    internal static string SocketPathHere() =>
        Environment.GetEnvironmentVariable(SocketOverrideVariable) is { Length: > 0 } custom
            ? custom
            : DefaultSocketPath(
                Environment.GetEnvironmentVariable("XDG_RUNTIME_DIR"),
                Environment.UserName);

    /// <summary>
    /// Whether a socket file at this path is a corpse we may remove.
    /// </summary>
    /// <remarks>
    /// The only honest test is to dial it. A relay that unlinked any file it found would evict a
    /// working relay in another terminal; one that refused any file it found would need a manual
    /// cleanup after every crash, which is the common case rather than the rare one.
    /// </remarks>
    internal static async Task<bool> IsStaleAsync(string path)
    {
        if (!File.Exists(path))
        {
            return false;
        }
        try
        {
            using var probe = new Socket(AddressFamily.Unix, SocketType.Stream, ProtocolType.Unspecified);
            await probe.ConnectAsync(new UnixDomainSocketEndPoint(path)).ConfigureAwait(false);
            return false;
        }
        catch (SocketException)
        {
            return true;
        }
    }

    internal static async Task<int> RunAsync(BrokerContract contract)
    {
        // Not portability box-ticking: on Windows the agent is already reachable, so a person
        // who typed this has misunderstood what it is for. Saying so beats failing at a unix
        // socket that cannot exist there.
        if (OperatingSystem.IsWindows())
        {
            Console.Error.WriteLine(
                "[creds-for-devs] `creds relay` runs INSIDE WSL, where ssh cannot reach the "
                    + "agent's named pipe. On Windows the agent is already reachable.");
            return contract.Exit("usage");
        }

        var path = SocketPathHere();
        var claimed = await ClaimAsync(path, contract).ConfigureAwait(false);
        if (claimed != 0)
        {
            return claimed;
        }

        using var listener = new Socket(AddressFamily.Unix, SocketType.Stream, ProtocolType.Unspecified);
        try
        {
            listener.Bind(new UnixDomainSocketEndPoint(path));
            listener.Listen(16);
            File.SetUnixFileMode(path, UnixFileMode.UserRead | UnixFileMode.UserWrite);
        }
        catch (Exception e) when (e is SocketException or IOException or UnauthorizedAccessException)
        {
            Console.Error.WriteLine($"[creds-for-devs] could not listen on {path}: {e.Message}");
            return contract.Exit("brokerFailure");
        }

        using var stopping = new CancellationTokenSource();
        Console.CancelKeyPress += (_, e) =>
        {
            e.Cancel = true;
            stopping.Cancel();
        };
        AppDomain.CurrentDomain.ProcessExit += (_, _) => Remove(path);

        Console.Error.WriteLine($"[creds-for-devs] relay listening on {path}");
        // On stdout so `eval "$(creds relay &)"` is not needed and a person can simply read it.
        Console.Out.WriteLine($"export SSH_AUTH_SOCK={path}");
        await AcceptLoopAsync(listener, stopping.Token).ConfigureAwait(false);
        Remove(path);
        return 0;
    }

    /// <summary>Take the path, or refuse it to whoever is already serving it.</summary>
    private static async Task<int> ClaimAsync(string path, BrokerContract contract)
    {
        if (await IsStaleAsync(path).ConfigureAwait(false))
        {
            Remove(path);
            return 0;
        }
        if (!File.Exists(path))
        {
            return 0;
        }
        Console.Error.WriteLine(
            $"[creds-for-devs] {path} is already served by a live relay. Use that one, or set "
                + $"{SocketOverrideVariable} to a different path.");
        return contract.Exit("busy");
    }

    private static async Task AcceptLoopAsync(Socket listener, CancellationToken token)
    {
        while (!token.IsCancellationRequested)
        {
            Socket accepted;
            try
            {
                accepted = await listener.AcceptAsync(token).ConfigureAwait(false);
            }
            catch (Exception e) when (e is OperationCanceledException or SocketException or ObjectDisposedException)
            {
                return;
            }
            // Deliberately not awaited: one slow signature must not hold up the next connection,
            // and every connection owns its own Windows child.
            _ = ServeAsync(accepted);
        }
    }

    private static async Task ServeAsync(Socket accepted)
    {
        using var connection = accepted;
        await using var stream = new NetworkStream(connection, ownsSocket: false);
        try
        {
            using var child = WslInterop.StartPiped(["relay-pipe"]);
            var toWindows = stream.CopyToAsync(child.StandardInput.BaseStream);
            var fromWindows = child.StandardOutput.BaseStream.CopyToAsync(stream);
            await Task.WhenAny(toWindows, fromWindows).ConfigureAwait(false);
        }
        catch (Exception e) when (e is IOException or InvalidOperationException
            or System.ComponentModel.Win32Exception or ObjectDisposedException)
        {
            // One failed connection is ssh trying another authentication method next, not a reason
            // to take the relay down for every other terminal in this distribution.
            Console.Error.WriteLine($"[creds-for-devs] a connection could not be served: {e.Message}");
        }
    }

    private static void Remove(string path)
    {
        try
        {
            File.Delete(path);
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            // Nothing useful to do while exiting; a stale file is reclaimed by the next relay.
        }
    }
}
