using System.Diagnostics;

using CredsBroker;
using CredsForDevs.ServiceDefaults;
using Serilog;

namespace CredsMcp;

/// <summary>
/// Inside WSL, hand the whole SESSION to the Windows binary and carry its stdio both ways.
/// </summary>
/// <remarks>
/// <para><b>Why this exists.</b> An MCP client — Claude Code most often — runs inside the
/// distribution and starts this binary as its own child. The broker it needs to reach listens on
/// the WINDOWS loopback, and <c>127.0.0.1</c> in WSL2 is the loopback of the virtual machine,
/// where nothing of ours listens. The announcement files are on Windows too. So an agent is told
/// "no CredsForDevs window answered" while the window is open on the same computer — correct, and
/// useless.</para>
/// <para><b>Why a pump rather than the CLI's re-execution.</b> <c>creds</c> crosses this bridge
/// with <see cref="WindowsBridge.Relay"/>: one short call, streams inherited, an exit code back.
/// MCP is not that. It is a long-lived JSON-RPC conversation in both directions over stdin and
/// stdout, so the Linux process cannot hand its console away and leave — it has to stay and carry
/// bytes. That is <see cref="WindowsBridge.StartPiped"/>, and it is the same shape
/// <c>AgentRelay</c> uses for the SSH agent, moved from one connection to one session.</para>
/// <para><b>What is deliberately NOT done here:</b> no attempt to find the Windows
/// <c>globalStorage</c> folder from Linux (its path depends on the VS Code edition, and
/// <c>/mnt/c/Users/…</c> is a guess that breaks on the first machine whose disk is not
/// <c>C:</c> — the Windows half already knows how to find it), and nothing new starts listening
/// anywhere. The broker stays exactly as loopback-only as it was.</para>
/// <para><b>It stops what it started (E3, defect B of PLAN_wsl_bridge_outlives_its_client.md).</b> Claude Code
/// ends an MCP server with SIGINT, and until 2026-10-10 this wrapper died by the signal's default disposition: its
/// <c>ProcessExit</c> hook — the only thing that stopped the Windows half — never ran, the <c>/init</c> interop proxy
/// stayed, and the Windows half sat in defect A for as long as the WSL session lived. Now the Windows child is held
/// by a <see cref="ChildLifetime"/>: a signal, or the parent's death, returns the pump at once, closes the child's
/// stdin, gives it the grace, and kills its tree — killing the proxy is what ends the Windows half (measured).</para>
/// </remarks>
internal static class WslPump
{
    /// <summary>Which side ended the conversation first.</summary>
    internal enum Ending
    {
        /// <summary>The client closed its stdin — the MCP stdio transport's own shutdown signal.</summary>
        ClientClosed,

        /// <summary>The Windows half closed its stdout — it left, or it was ended.</summary>
        WindowsHalfClosed,

        /// <summary>A signal or the parent's death ended the session while both sides were still open.</summary>
        Interrupted,
    }

    /// <summary>
    /// Big enough for any JSON-RPC message worth one read, small enough to stay a message pump.
    /// </summary>
    private const int BufferBytes = 64 * 1024;

    /// <summary>How long a Windows half that closed its stdout on its own is given to finish.</summary>
    private static readonly TimeSpan Grace = TimeSpan.FromSeconds(5);

    /// <summary>
    /// After the client hangs up, how long the child's stdout may stay open before the pump stops waiting for it:
    /// the Windows half's own end-of-stream drain and deadline (E2), after which it has either answered or hung.
    /// </summary>
    /// <remarks>
    /// The second half of defect B: the pump used to wait here without a bound, so an orderly hang-up against a
    /// Windows half stuck in defect A waited forever.
    /// </remarks>
    internal static readonly TimeSpan HangUpBound = LifetimeTimings.Default.Drain + LifetimeTimings.Default.Deadline;

    /// <summary>
    /// Run the Windows binary and be its stdio for as long as the client keeps us.
    /// </summary>
    /// <param name="args">
    /// What the Windows half is started with — <c>--caller &lt;record&gt;</c> when it knows the flag,
    /// nothing otherwise; decided by <see cref="CallerForwarding"/> before this is called.
    /// </param>
    /// <param name="lifetime">The signals, the parent watch and the one killer — owned by the caller, which also
    /// decides whether the parent is watched.</param>
    /// <param name="log">The wrapper's own log (<c>creds-mcp-wsl</c>): the child it started, which side
    /// ended, and the child's exit code. The Windows half writes its own file on its own side.</param>
    /// <remarks>
    /// The exit code is the child's, so a client that reads one learns what the half that did the
    /// work decided rather than what the pump felt about it — except after a signal, where it is 128 + n and
    /// the reason is the signal's.
    /// </remarks>
    internal static async Task<HostEnding> RunAsync(IReadOnlyList<string> args, ChildLifetime lifetime, ILogger log)
    {
        await using var fromClient = Console.OpenStandardInput();
        await using var toClient = Console.OpenStandardOutput();
        return await RunAsync(WslInterop.CredsMcp, args, fromClient, toClient, lifetime, log).ConfigureAwait(false);
    }

    /// <summary>
    /// The session over any two streams and any Windows half — what the in-process tests drive with a script
    /// standing in for <c>creds-mcp.exe</c>, no WSL needed.
    /// </summary>
    internal static async Task<HostEnding> RunAsync(
        WindowsBridge windowsHalf,
        IReadOnlyList<string> args,
        Stream fromClient,
        Stream toClient,
        ChildLifetime lifetime,
        ILogger log)
    {
        using var child = windowsHalf.StartPiped(args);
        // Neither half may outlive the other: an MCP client considers a server alive for exactly
        // as long as the process it started, so a Windows copy left behind would hold a window's
        // consent machinery open for a session nobody is in any more. Tracked, so a signal, the
        // parent's death and ProcessExit all stop it through the one killer.
        var tracked = lifetime.Track(child);
        log.Information("started the Windows half, pid {ChildPid}", child.Id);

        var ending = await PumpAsync(
            fromClient,
            child.StandardInput.BaseStream,
            child.StandardOutput.BaseStream,
            toClient,
            HangUpBound,
            log,
            lifetime.Shutdown).ConfigureAwait(false);

        await SettleAsync(tracked, ending, lifetime).ConfigureAwait(false);
        var code = ExitCodeOf(tracked, log);
        log.Information("the session ended: {Ending:l}; the Windows half exited with code {ChildExitCode}", ending.ToString(), code);
        return lifetime.EndingOr(new HostEnding(code, ReasonOf(ending)));
    }

    /// <summary>The exit code this process answers with when the Windows half could not be ended at all.</summary>
    internal const int ChildStillRunning = 1;

    /// <summary>
    /// The child's exit code — or, for a child the lifetime could not end (a refused kill), <see cref="ChildStillRunning"/>
    /// rather than the exception <c>Process.ExitCode</c> throws for a process that has not exited, which would end
    /// the pump without its exit line and read as a missing Windows binary.
    /// </summary>
    internal static int ExitCodeOf(IManagedChild tracked, ILogger log)
    {
        if (tracked.HasExited)
        {
            return tracked.ExitCode;
        }
        log.Warning("the Windows half (pid {ChildPid}) is still running; its exit code is unknown", tracked.Id);
        return ChildStillRunning;
    }

    /// <summary>The exit reason an ending is logged as — an interrupted session is the signal's or the parent's, which <see cref="ChildLifetime.EndingOr"/> supplies.</summary>
    internal static ExitReason ReasonOf(Ending ending) =>
        ending switch
        {
            Ending.ClientClosed => ExitReason.ClientClosed,
            Ending.WindowsHalfClosed => ExitReason.WindowsHalfClosed,
            _ => ExitReason.Signalled,
        };

    /// <summary>The pump as it was before E3: no shutdown token, the Windows half's bound after a hang-up, no log.</summary>
    internal static Task<Ending> PumpAsync(Stream fromClient, Stream toChild, Stream fromChild, Stream toClient) =>
        PumpAsync(fromClient, toChild, fromChild, toClient, HangUpBound, Serilog.Core.Logger.None, CancellationToken.None);

    /// <summary>
    /// Carry both directions until the conversation ends, and decide which ending it was.
    /// </summary>
    /// <remarks>
    /// <para>Three endings, and they are not symmetrical. <b>The client hangs up</b> — stdin reaches
    /// end-of-stream — and the child's stdin is closed so it learns the same thing; but the pump
    /// stays, because the child may still be answering, and dropping its last reply would turn an
    /// orderly shutdown into a truncated stream. It stays <paramref name="hangUpBound"/> at most: a child
    /// that has not closed its stdout by then is not answering. <b>The child goes</b> — its stdout closes —
    /// and there is nothing left to carry, so waiting for a client that may never close its end would
    /// hang a process whose job has finished. <b>The session is interrupted</b> — <paramref name="shutdown"/>
    /// fires — and the pump returns at once: nobody is left to read a reply.</para>
    /// <para>Its own method, taking four streams, so all three rules are a unit test rather than
    /// a claim: a real process on the other side of a kernel boundary is not something a
    /// test can assert about, which is what the integration script is for.</para>
    /// </remarks>
    internal static async Task<Ending> PumpAsync(
        Stream fromClient,
        Stream toChild,
        Stream fromChild,
        Stream toClient,
        TimeSpan hangUpBound,
        ILogger log,
        CancellationToken shutdown)
    {
        var upstream = CarryThenCloseAsync(fromClient, toChild);
        var downstream = CarryAsync(fromChild, toClient);
        var interrupted = InterruptedAsync(shutdown);

        var first = await Task.WhenAny(upstream, downstream, interrupted).ConfigureAwait(false);
        if (first == interrupted)
        {
            return Ending.Interrupted;
        }
        // The client's hang-up is the cause when a child answers and leaves in the same instant it reads the
        // end-of-stream we passed on — so a completed upstream names the ending even if the child's stdout closed a
        // scheduler tick earlier (the two raced on Linux; the exit code is the child's either way).
        if (upstream.IsCompleted)
        {
            return await LastWordsAsync(downstream, interrupted, hangUpBound, log).ConfigureAwait(false);
        }
        return Ending.WindowsHalfClosed;
    }

    /// <summary>
    /// The client hung up: wait for the child's stdout — its last reply — but not past <paramref name="bound"/>,
    /// and not past an interruption. Said in the log when it begins, so a wrapper seen waiting is a wrapper
    /// draining, not one that hangs (code round 1, finding 1).
    /// </summary>
    private static async Task<Ending> LastWordsAsync(Task downstream, Task interrupted, TimeSpan bound, ILogger log)
    {
        if (!downstream.IsCompleted)
        {
            log.Information("the client hung up; waiting up to {BoundSeconds} s for the Windows half's last reply", bound.TotalSeconds);
        }
        using var cut = new CancellationTokenSource();
        var window = Task.Delay(bound, cut.Token);
        var first = await Task.WhenAny(downstream, interrupted, window).ConfigureAwait(false);
        await cut.CancelAsync().ConfigureAwait(false);
        if (first == downstream)
        {
            // Observed, so a copy that failed is the caller's exception rather than a silent truncation.
            await downstream.ConfigureAwait(false);
        }
        return first == interrupted ? Ending.Interrupted : Ending.ClientClosed;
    }

    /// <summary>A task that completes when the token fires — never, for a token that cannot.</summary>
    private static Task InterruptedAsync(CancellationToken shutdown)
    {
        var fired = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        shutdown.Register(() => fired.TrySetResult());
        return fired.Task;
    }

    /// <summary>
    /// One direction, flushed after every message.
    /// </summary>
    /// <remarks>
    /// <para><b>The prediction that made this loop was measured and REFUTED, and the loop stays
    /// anyway.</b> It was written expecting <c>Process.StandardInput.BaseStream</c> — a
    /// <c>FileStream</c> asked for with a 4 KB buffer — to hold a 154-byte JSON-RPC request until
    /// something flushed it, leaving both halves waiting on each other. Probed against the real
    /// binary on .NET 10: the unflushed write arrived, and the reply came back. So that defect
    /// does not exist today.</para>
    /// <para>What is kept is the guarantee rather than the fix: this pump carries somebody else's
    /// protocol, and "a short write reaches the far end" is then a property of the runtime's
    /// buffering strategy, which is not part of any contract and has been rewritten before. One
    /// flush per message costs a syscall on a path that is already a process boundary, and it
    /// makes the property ours. <c>AgentRelay</c> uses a plain <c>CopyToAsync</c> for the SSH
    /// agent and is fine for the same measured reason — this is a deliberate difference, not a
    /// divergence somebody forgot about.</para>
    /// </remarks>
    private static async Task CarryAsync(Stream from, Stream to)
    {
        var buffer = new byte[BufferBytes];
        int read;
        while ((read = await from.ReadAsync(buffer).ConfigureAwait(false)) > 0)
        {
            await to.WriteAsync(buffer.AsMemory(0, read)).ConfigureAwait(false);
            await to.FlushAsync().ConfigureAwait(false);
        }
    }

    /// <summary>Carry one direction, then close the far end so it sees the same end-of-stream.</summary>
    private static async Task CarryThenCloseAsync(Stream from, Stream to)
    {
        try
        {
            await CarryAsync(from, to).ConfigureAwait(false);
        }
        finally
        {
            // In a `finally` because a client killed mid-message must still close the child's
            // stdin — otherwise the Windows half waits for a sentence nobody is going to finish.
            await CloseAsync(to).ConfigureAwait(false);
        }
    }

    private static async Task CloseAsync(Stream stream)
    {
        try
        {
            await stream.DisposeAsync().ConfigureAwait(false);
        }
        catch (IOException)
        {
            // The child closed it first, which is one of the two ordinary endings.
        }
    }

    /// <summary>
    /// Wait for the Windows half to end — or end it if it will not, through the lifetime's one killer.
    /// </summary>
    /// <remarks>
    /// <para>A child that closed its stdout on its own is already leaving and gets <see cref="Grace"/> to finish —
    /// bounded, because this process is the one an MCP client is waiting on, and a child that hangs after
    /// closing its stdout would otherwise keep a client believing its server is still shutting down, forever.</para>
    /// <para>A session the client ended by hanging up, or that its parent's death ended, gets the lifetime's shorter
    /// grace: its stdin is closed (again — a second close is harmless), and nobody is reading a reply any more.</para>
    /// <para><b>A signalled session gets no grace at all</b> (<see cref="GraceFor"/>): Claude Code 2.1.296 ends a
    /// server with SIGINT, SIGTERM 100 ms later and SIGKILL about half a second after that (measured through a
    /// shim, 2026-10-10 — research/RESULTS_wsl_bridge_orphans.md). A wrapper that waited a grace would be killed
    /// before it reached the kill, and a Windows half that ignores end-of-stream — a stale install still in defect
    /// A — would outlive the session exactly as before. So its stdin is closed and its tree stopped at once; the
    /// Windows half's own log then ends without an exit line, which is the truth of how it ended.</para>
    /// </remarks>
    private static Task SettleAsync(IManagedChild tracked, Ending ending, ChildLifetime lifetime) =>
        lifetime.StopAsync(tracked, GraceFor(ending, lifetime));

    /// <summary>
    /// How long the Windows half may take to leave on its own, by what ended the session — and none at all once a
    /// signal is recorded, whatever the pump's own ending was: a signal that lands a moment after the pump returned
    /// still means the client's kill is on its way (SonarCloud round, finding 0).
    /// </summary>
    internal static TimeSpan GraceFor(Ending ending, ChildLifetime lifetime)
    {
        if (lifetime.Signalled)
        {
            return TimeSpan.Zero;
        }
        return ending == Ending.WindowsHalfClosed ? Grace : lifetime.Grace;
    }
}
