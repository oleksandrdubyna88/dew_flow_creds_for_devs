using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;

using CredsBroker;
using CredsForDevs.ServiceDefaults;
using Serilog;

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
/// <para><b>It logs to a file</b> (since 2026-10-09, <c>creds-relay</c>): its start, every connection it
/// carried and how that connection ended, and why it stopped — the record that would have shown a relay
/// holding 27 children for 0 connections (PLAN_wsl_bridge_outlives_its_client.md §2.1 C). The console
/// half goes to stderr; stdout keeps the one <c>export SSH_AUTH_SOCK=</c> line it always carried.</para>
/// <para><b>It closes what it opened</b> (since 2026-10-10, E3 of the same plan, defect C). One Windows child per
/// connection, and each is stopped when its connection ends: stdin closed by name — <c>Process.Close</c> never
/// did that — a grace, then its tree. A termination signal (SIGINT, SIGTERM, the SIGHUP a killed <c>wsl.exe</c>
/// delivers, SIGQUIT) stops every child before the socket is removed, and the exit code is the shell's 128 + n.</para>
/// </remarks>
internal static class AgentRelay
{
    /// <summary>The log file prefix of a relay run.</summary>
    internal const string AppName = "creds-relay";

    /// <summary>This binary's version, for the start line.</summary>
    internal static string Version => typeof(AgentRelay).Assembly.GetName().Version?.ToString(3) ?? "0.0.0";

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
    /// How many BYTES a unix socket path may be: 103 on macOS, 107 elsewhere.
    /// </summary>
    /// <remarks>
    /// <para>The kernel's <c>sun_path</c>, and .NET enforces it in
    /// <see cref="UnixDomainSocketEndPoint"/>'s constructor with an
    /// <see cref="ArgumentOutOfRangeException"/> — which is neither a <c>SocketException</c> nor an
    /// <c>IOException</c>, so it escaped both of this file's guards and took the process with it.
    /// It is not a theoretical limit on macOS: the temporary directory alone is about fifty
    /// characters there, which is how the 1.7.0 release found it.</para>
    /// <para><b>Bytes, and one fewer than the exception says.</b> Both corrections came from review
    /// and both were then MEASURED against the runtime rather than argued about. The path is encoded
    /// as UTF-8 and a NUL is appended, so the exception's "must be between 1 and 108" describes the
    /// buffer and the largest pathname actually accepted is 107. And because it is the encoded form
    /// that is measured, a path of 107 CHARACTERS holding one two-byte character is 108 bytes and is
    /// refused — so counting characters would let exactly the paths a non-ASCII home directory
    /// produces through the guard and into the throw.</para>
    /// </remarks>
    internal static int MaxSocketPathBytes => OperatingSystem.IsMacOS() ? 103 : 107;

    /// <summary>Whether this path is longer than a domain socket may be on this platform.</summary>
    internal static bool TooLongForSocket(string path) =>
        Encoding.UTF8.GetByteCount(path) > MaxSocketPathBytes;

    /// <summary>
    /// What a person is told when the path cannot be a socket — a separate function so the SENTENCE
    /// is a test rather than a thing somebody reads once in a log.
    /// </summary>
    /// <remarks>
    /// It names four things, and each earns its place: the path, because it may have come from an
    /// environment variable the person has forgotten setting; its size and the limit, because "too
    /// long" without the numbers leaves them guessing how much to cut; and the variable to set,
    /// because otherwise the only remedy they can see is to move their home directory. In BYTES,
    /// because that is what is measured — and a person whose path is short but non-ASCII would
    /// otherwise read a number that looks like it fits.
    /// </remarks>
    internal static string TooLongMessage(string path) =>
        $"{path} is {Encoding.UTF8.GetByteCount(path)} bytes; a unix socket path "
            + $"may be at most {MaxSocketPathBytes} on this platform. Set {SocketOverrideVariable} "
            + "to something shorter.";

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
        catch (Exception e) when (e is SocketException or ArgumentException)
        {
            // ArgumentException as well, and it is the belt to the guard's braces. The guard above
            // exists to produce a SENTENCE; this exists so that being wrong about the exact limit by
            // one byte can never again escape a method whose whole contract is to answer true or
            // false. A path the endpoint refuses is a path nothing is serving.
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

        using var log = CredsLogging.Create(AppName);
        var run = HostRun.Start(log, "relay", Version);
        try
        {
            // The relay legitimately outlives whatever started it — a shell profile, the extension's wsl.exe —
            // so its parent is not watched. A killed wsl.exe delivers SIGHUP instead (measured, the RESULTS
            // record), which the lifetime handles like the other three.
            using var lifetime = ChildLifetime.Start(
                log,
                ParentWatch.Off("the relay outlives the shell or wsl.exe that started it, by design", log),
                ChildLifetime.DefaultGrace,
                run.ForcedExit(log));
            return run.End(await ListenAsync(SocketPathHere(), contract, WslInterop.Creds, lifetime, log).ConfigureAwait(false));
        }
        catch (Exception e)
        {
            run.Crash(e);
            throw;
        }
    }

    /// <summary>
    /// Refuse a path that cannot be ours, or serve it until stopped. Never on Windows (see RunAsync).
    /// </summary>
    /// <remarks>
    /// The path, the Windows half and the lifetime are parameters so the whole relay — bind, accept, carry, stop
    /// every child, remove the socket — runs in-process in a test against a script standing in for
    /// <c>creds.exe relay-pipe</c>, where the coverage tool can see it.
    /// </remarks>
    [System.Runtime.Versioning.UnsupportedOSPlatform("windows")]
    internal static async Task<HostEnding> ListenAsync(string path, BrokerContract contract, WindowsBridge windowsHalf, ChildLifetime lifetime, ILogger log)
    {
        var tooLong = await RefuseIfTooLongAsync(path, contract, log).ConfigureAwait(false);
        if (tooLong is { } refusal)
        {
            return new HostEnding(refusal, ExitReason.SocketPathTooLong);
        }

        var claimed = await ClaimAsync(path, contract, log).ConfigureAwait(false);
        if (claimed != 0)
        {
            return new HostEnding(claimed, ExitReason.Busy);
        }

        return await BindAndServeAsync(path, contract, windowsHalf, lifetime, log).ConfigureAwait(false);
    }

    [System.Runtime.Versioning.UnsupportedOSPlatform("windows")]
    private static async Task<HostEnding> BindAndServeAsync(string path, BrokerContract contract, WindowsBridge windowsHalf, ChildLifetime lifetime, ILogger log)
    {
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
        catch (Exception e) when (IsListenFailure(e))
        {
            log.Error(e, "could not listen on {Socket}", path);
            return new HostEnding(contract.Exit("brokerFailure"), ExitReason.ListenFailed);
        }

        AppDomain.CurrentDomain.ProcessExit += (_, _) => Remove(path);

        log.Information("relay listening on {Socket}", path);
        // On stdout so `eval "$(creds relay &)"` is not needed and a person can simply read it.
        Console.Out.WriteLine($"export SSH_AUTH_SOCK={path}");
        await AcceptLoopAsync(listener, windowsHalf, lifetime, log).ConfigureAwait(false);
        // Every child first, the socket after: the children are what a signal was sent to end (defect C's
        // 27 relay-pipe processes), and the file is reclaimed by the next relay either way.
        await lifetime.StopAllAsync().ConfigureAwait(false);
        Remove(path);
        return lifetime.EndingOr(new HostEnding(0, ExitReason.ListenerClosed));
    }

    /// <summary>What the bind or listen may refuse with — the endpoint's constructor refuses a VALUE.</summary>
    private static bool IsListenFailure(Exception e) =>
        e is SocketException or IOException or UnauthorizedAccessException or ArgumentException;

    /// <summary>
    /// The exit code when this path cannot be a socket at all, or null when it can.
    /// </summary>
    /// <remarks>
    /// <para>Its own function so the decision is a TEST rather than three lines inside a method
    /// that binds a socket and then serves it — nothing can run that in a unit test, which is how
    /// the refusal it replaces went out uncovered.</para>
    /// <para>Refused here rather than thrown at from inside the endpoint's constructor.
    /// <c>CREDS_RELAY_SOCKET</c> and <c>XDG_RUNTIME_DIR</c> are both somebody else's strings, and an
    /// unhandled <c>ArgumentOutOfRangeException</c> from a binary whose whole job is to print one
    /// line for <c>eval</c> is the least useful failure it could have.</para>
    /// </remarks>
    internal static Task<int?> RefuseIfTooLongAsync(string path, BrokerContract contract, ILogger log)
    {
        if (!TooLongForSocket(path))
        {
            return Task.FromResult<int?>(null);
        }
        log.Error("{Sentence}", TooLongMessage(path));
        return Task.FromResult<int?>(contract.Exit("usage"));
    }

    /// <summary>Take the path, or refuse it to whoever is already serving it.</summary>
    /// <remarks>
    /// The refusal is a Warning, and the logger's floor can never be raised past Information
    /// (<c>CredsLogging.FloorFrom</c>): this sentence is how the extension adopts a working relay
    /// (<c>socketFromBusyLine</c> in wslRelay.ts) instead of declaring it broken.
    /// </remarks>
    private static async Task<int> ClaimAsync(string path, BrokerContract contract, ILogger log)
    {
        if (await IsStaleAsync(path).ConfigureAwait(false))
        {
            Remove(path);
            log.Information("removed a stale socket at {Socket}", path);
            return 0;
        }
        if (!File.Exists(path))
        {
            return 0;
        }
        log.Warning(
            "{Socket} is already served by a live relay. Use that one, or set {Variable} to a different path.",
            path,
            SocketOverrideVariable);
        return contract.Exit("busy");
    }

    /// <summary>Accept until the lifetime's token fires — a signal; the relay's parent is not watched.</summary>
    private static async Task AcceptLoopAsync(Socket listener, WindowsBridge windowsHalf, ChildLifetime lifetime, ILogger log)
    {
        var connections = 0;
        var token = lifetime.Shutdown;
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
            // and every connection owns its own Windows child. Its child is nevertheless started and
            // tracked HERE, synchronously — the handler's first await is inside the carry, after
            // StartPiped and Track — so this loop cannot return to a signal with a child untracked.
            _ = ServeConnectionAsync(accepted, ++connections, windowsHalf, lifetime, log);
        }
    }

    /// <remarks>
    /// One Information line per connection, when it ends: which side ended it, how long it lasted,
    /// the child's pid — and whether that child was still running when the relay let go of it, which
    /// is defect C of PLAN_wsl_bridge_outlives_its_client.md observed rather than inferred (it reads
    /// <c>False</c> since E3: the child is stopped before the line is written).
    /// </remarks>
    private static async Task ServeConnectionAsync(Socket accepted, int number, WindowsBridge windowsHalf, ChildLifetime lifetime, ILogger log)
    {
        using var connection = accepted;
        await using var stream = new NetworkStream(connection, ownsSocket: false);
        var started = System.Diagnostics.Stopwatch.GetTimestamp();
        try
        {
            using var child = windowsHalf.StartPiped(["relay-pipe"]);
            var tracked = lifetime.Track(child);
            log.Information("connection {Connection} opened; relay-pipe pid {ChildPid}", number, child.Id);
            var ending = await CarryConnectionAsync(
                stream,
                child.StandardInput.BaseStream,
                child.StandardOutput.BaseStream,
                tracked,
                lifetime).ConfigureAwait(false);
            LogEnding(log, number, ending, System.Diagnostics.Stopwatch.GetElapsedTime(started), tracked);
        }
        catch (Exception e) when (IsServeFailure(e))
        {
            // One failed connection is ssh trying another authentication method next, not a reason
            // to take the relay down for every other terminal in this distribution.
            log.Warning(e, "connection {Connection} could not be served", number);
        }
    }

    private static void LogEnding(ILogger log, int number, ConnectionEnding ending, TimeSpan lasted, IManagedChild child)
    {
        foreach (var failure in ending.Failures)
        {
            log.Warning(failure, "connection {Connection}: a copy failed", number);
        }
        log.Information(
            "connection {Connection} ended ({Ending:l}) after {Seconds:0.000} s; relay-pipe pid {ChildPid}, still running: {ChildAlive}",
            number,
            Describe(ending.End),
            lasted.TotalSeconds,
            child.Id,
            !child.HasExited);
    }

    /// <summary>How one carried connection ended.</summary>
    internal enum ConnectionEnd
    {
        /// <summary>ssh closed its side of the socket first.</summary>
        SshClosed,

        /// <summary>The Windows half — <c>relay-pipe</c>, or the agent behind it — closed first.</summary>
        WindowsSideClosed,

        /// <summary>A copy FAILED rather than ended: a broken pipe, a reset.</summary>
        CopyFailed,

        /// <summary>A signal ended the relay while the connection was still open on both sides.</summary>
        Interrupted,
    }

    /// <summary>Which side ended a connection, and what failed if one did — never an orderly close for a fault.</summary>
    /// <param name="End">Who closed, or that a copy failed.</param>
    /// <param name="Failures">What the failed copy threw; empty for an orderly close.</param>
    internal sealed record ConnectionEnding(ConnectionEnd End, IReadOnlyList<Exception> Failures);

    /// <summary>
    /// Carry one connection both ways until either side ends it, then stop the child this connection started —
    /// defect C, fixed.
    /// </summary>
    /// <remarks>
    /// <para>Shaped like <c>WslPump.PumpAsync</c>: the streams and the child are parameters, so the stop order is a
    /// unit test over fakes. After the first direction ends: <b>dispose the child's stdin</b> — the end-of-stream
    /// <c>Process.Close</c> never sends, which is how a relay with no connections held 27 children — then the
    /// lifetime's stop (the grace, then the tree), then its stdout, so the pending copy ends instead of waiting
    /// on a pipe nobody will write to.</para>
    /// <para>A copy that FAILED is its own ending (plan round, finding 0): a broken pipe must not read as "ssh
    /// closed" in the one line somebody opens the log for.</para>
    /// </remarks>
    internal static async Task<ConnectionEnding> CarryConnectionAsync(Stream client, Stream toChild, Stream fromChild, IManagedChild child, ChildLifetime lifetime)
    {
        // The copies take the lifetime's token: a relay ended by a signal does not wait for ssh or the Windows side
        // to close a connection nobody will finish. The stop below runs whatever ended the copies.
        var toWindows = client.CopyToAsync(toChild, lifetime.Shutdown);
        var fromWindows = fromChild.CopyToAsync(client, lifetime.Shutdown);
        var first = await Task.WhenAny(toWindows, fromWindows).ConfigureAwait(false);

        await CloseAsync(toChild).ConfigureAwait(false);
        await lifetime.StopAsync(child).ConfigureAwait(false);
        await CloseAsync(fromChild).ConfigureAwait(false);
        // Not awaited: when the Windows side closed first, the other copy is still reading from ssh on a socket this
        // method does not own — waiting here would hold the connection open until ssh gave up. The caller closes the
        // socket, which ends that read, and its fault is observed here rather than left to nobody.
        _ = SettledAsync(toWindows, fromWindows);
        return EndingOf(first, toWindows);
    }

    /// <summary>The ending the first copy to finish stands for — a cancelled copy is the relay being ended.</summary>
    internal static ConnectionEnding EndingOf(Task first, Task toWindows) =>
        (first.IsCanceled, first.IsFaulted, first == toWindows) switch
        {
            (true, _, _) => new ConnectionEnding(ConnectionEnd.Interrupted, []),
            (_, true, _) => new ConnectionEnding(ConnectionEnd.CopyFailed, [.. first.Exception?.InnerExceptions ?? []]),
            (_, _, true) => new ConnectionEnding(ConnectionEnd.SshClosed, []),
            _ => new ConnectionEnding(ConnectionEnd.WindowsSideClosed, []),
        };

    private static async Task CloseAsync(Stream stream)
    {
        try
        {
            await stream.DisposeAsync().ConfigureAwait(false);
        }
        catch (IOException)
        {
            // The far end closed it first, which is one of the ordinary endings.
        }
    }

    /// <summary>Observe both copies and swallow what the closes made them throw — never a fault nobody sees.</summary>
    private static async Task SettledAsync(Task toWindows, Task fromWindows)
    {
        try
        {
            await Task.WhenAll(toWindows, fromWindows).ConfigureAwait(false);
        }
        catch (Exception e) when (IsServeFailure(e) || e is OperationCanceledException or NotSupportedException)
        {
            // The copy that was still pending ended on a stream somebody closed. Its sibling's fault, if it was the
            // one that ended the connection, is reported through the ending instead.
        }
    }

    /// <summary>What ends ONE connection without taking the relay down.</summary>
    private static bool IsServeFailure(Exception e) =>
        e is IOException or InvalidOperationException or System.ComponentModel.Win32Exception or ObjectDisposedException;

    /// <summary>The connection line's wording.</summary>
    private static string Describe(ConnectionEnd end) =>
        end switch
        {
            ConnectionEnd.SshClosed => "ssh closed",
            ConnectionEnd.WindowsSideClosed => "the Windows side closed",
            ConnectionEnd.Interrupted => "the relay was ended",
            _ => "a copy failed",
        };

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


