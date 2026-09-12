using System.Net.Sockets;
using System.Runtime.InteropServices;

using CredsBroker;

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
    /// <summary>
    /// Set the file-creation mask so the socket is owner-only the moment it EXISTS.
    /// </summary>
    /// <remarks>
    /// <para><b>Measured 2026-08-26, and it is why this exists.</b> A unix socket takes its mode
    /// from the umask at <c>bind</c>. With the ordinary 0022 the socket comes out
    /// <c>rwxr-xr-x</c> — world-connectable — and a <c>chmod</c> a line later leaves a window in
    /// which any process on the machine can connect. That window is enough to ask the agent for
    /// its identities, which raises no dialog by design.</para>
    /// <para>Setting the mask BEFORE the bind removes the window instead of shortening it, and it
    /// covers a path given through <c>CREDS_RELAY_SOCKET</c> too, where we do not control the
    /// directory. Process-global, which is safe here: this process binds one socket at startup
    /// and creates nothing else.</para>
    /// </remarks>
    // DllImport rather than LibraryImport: the source-generated form requires AllowUnsafeBlocks
    // for the whole project, which is a large guarantee to give up for one call into libc.
    [DllImport("libc", EntryPoint = "umask")]
    private static extern uint SetUmask(uint mask);

    /// <summary>Octal 077 — every group and other bit masked off. C# has no octal literal.</summary>
    private const uint OwnerOnlyMask = 0b000_111_111;

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

    /// <summary>
    /// How long a unix socket path may be: 104 characters on macOS, 108 elsewhere.
    /// </summary>
    /// <remarks>
    /// The kernel's <c>sun_path</c>, and .NET enforces it in <see cref="UnixDomainSocketEndPoint"/>'s
    /// constructor with an <see cref="ArgumentOutOfRangeException"/> — which is neither a
    /// <c>SocketException</c> nor an <c>IOException</c>, so it escaped both of this file's guards
    /// and took the process with it. It is not a theoretical limit on macOS: the temporary
    /// directory alone is about fifty characters there, which is how the 1.7.0 release found it.
    /// </remarks>
    internal static int MaxSocketPathLength => OperatingSystem.IsMacOS() ? 104 : 108;

    /// <summary>Whether this path is longer than a domain socket may be on this platform.</summary>
    internal static bool TooLongForSocket(string path) => path.Length > MaxSocketPathLength;

    /// <summary>
    /// What a person is told when the path cannot be a socket — a separate function so the SENTENCE
    /// is a test rather than a thing somebody reads once in a log.
    /// </summary>
    /// <remarks>
    /// It names four things, and each earns its place: the path, because it may have come from an
    /// environment variable the person has forgotten setting; its length and the limit, because
    /// "too long" without the numbers leaves them guessing how much to cut; and the variable to
    /// set, because otherwise the only remedy they can see is to move their home directory.
    /// </remarks>
    internal static string TooLongMessage(string path) =>
        $"[creds-for-devs] {path} is {path.Length} characters; a unix socket path may be at most "
            + $"{MaxSocketPathLength} on this platform. Set {SocketOverrideVariable} to something shorter.";

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
        // A path nothing could ever have bound is not a corpse to remove. This method's caller
        // DELETES what it is told about, so answering "stale" here would unlink an arbitrary file
        // for the crime of living somewhere with a long name.
        if (!File.Exists(path) || TooLongForSocket(path))
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
        // Refused here, with the number, rather than thrown at from inside the endpoint's
        // constructor. `CREDS_RELAY_SOCKET` and `XDG_RUNTIME_DIR` are both somebody else's strings,
        // and an unhandled ArgumentOutOfRangeException from a binary whose whole job is to print a
        // line for `eval` is the least useful failure it could have.
        if (TooLongForSocket(path))
        {
            Console.Error.WriteLine(TooLongMessage(path));
            return contract.Exit("usage");
        }

        var claimed = await ClaimAsync(path, contract).ConfigureAwait(false);
        if (claimed != 0)
        {
            return claimed;
        }

        // Owner-only from the instant the socket exists, not a line later. See SetUmask.
        SetUmask(OwnerOnlyMask);
        using var listener = new Socket(AddressFamily.Unix, SocketType.Stream, ProtocolType.Unspecified);
        try
        {
            listener.Bind(new UnixDomainSocketEndPoint(path));
            listener.Listen(16);
            // Belt and braces: the umask above already decided this, and a mode that disagreed
            // with it would mean the mask did not take.
            File.SetUnixFileMode(path, UnixFileMode.UserRead | UnixFileMode.UserWrite);
        }
        // ArgumentException as well as the three: the endpoint's constructor is the one call here
        // that refuses a VALUE rather than failing an operation, and its refusal was escaping into
        // an unhandled crash. The guard above catches the known case by name; this catches the next
        // one somebody finds, with the same sentence rather than a stack trace.
        catch (Exception e)
            when (e is SocketException or IOException or UnauthorizedAccessException or ArgumentException)
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
            using var child = WslInterop.Creds.StartPiped(["relay-pipe"]);
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
