using System.Diagnostics;

using CredsBroker;

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
/// </remarks>
internal static class WslPump
{
    /// <summary>
    /// Big enough for any JSON-RPC message worth one read, small enough to stay a message pump.
    /// </summary>
    private const int BufferBytes = 64 * 1024;

    /// <summary>How long the Windows half is given to finish after its stdout closes.</summary>
    private static readonly TimeSpan Grace = TimeSpan.FromSeconds(5);

    /// <summary>
    /// Run the Windows binary and be its stdio for as long as the client keeps us.
    /// </summary>
    /// <remarks>
    /// The exit code is the child's, so a client that reads one learns what the half that did the
    /// work decided rather than what the pump felt about it.
    /// </remarks>
    internal static async Task<int> RunAsync()
    {
        using var child = WslInterop.CredsMcp.StartPiped([]);
        // Neither half may outlive the other: an MCP client considers a server alive for exactly
        // as long as the process it started, so a Windows copy left behind would hold a window's
        // consent machinery open for a session nobody is in any more.
        AppDomain.CurrentDomain.ProcessExit += (_, _) => Stop(child);

        await using var fromClient = Console.OpenStandardInput();
        await using var toClient = Console.OpenStandardOutput();
        await PumpAsync(
            fromClient,
            child.StandardInput.BaseStream,
            child.StandardOutput.BaseStream,
            toClient).ConfigureAwait(false);

        return await SettleAsync(child).ConfigureAwait(false);
    }

    /// <summary>
    /// Carry both directions until the conversation ends, and decide which ending it was.
    /// </summary>
    /// <remarks>
    /// <para>Two endings, and they are not symmetrical. <b>The client hangs up</b> — stdin reaches
    /// end-of-stream — and the child's stdin is closed so it learns the same thing; but the pump
    /// stays, because the child may still be answering, and dropping its last reply would turn an
    /// orderly shutdown into a truncated stream. <b>The child goes</b> — its stdout closes — and
    /// there is nothing left to carry, so waiting for a client that may never close its end would
    /// hang a process whose job has finished.</para>
    /// <para>Its own method, taking four streams, so both of those rules are a unit test rather
    /// than a claim: a real process on the other side of a kernel boundary is not something a
    /// test can assert about, which is what the integration script is for.</para>
    /// </remarks>
    internal static async Task PumpAsync(Stream fromClient, Stream toChild, Stream fromChild, Stream toClient)
    {
        var upstream = CarryThenCloseAsync(fromClient, toChild);
        var downstream = CarryAsync(fromChild, toClient);

        var first = await Task.WhenAny(upstream, downstream).ConfigureAwait(false);
        if (first == upstream)
        {
            await downstream.ConfigureAwait(false);
        }
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
    /// Wait for the Windows half, and take its exit code — or end it if it will not end.
    /// </summary>
    /// <remarks>
    /// The grace is bounded because this process is the one an MCP client is waiting on. A child
    /// that has closed its stdout and then hangs would otherwise keep a client believing its
    /// server is still shutting down, forever.
    /// </remarks>
    private static async Task<int> SettleAsync(Process child)
    {
        try
        {
            using var grace = new CancellationTokenSource(Grace);
            await child.WaitForExitAsync(grace.Token).ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            Stop(child);
            child.WaitForExit();
        }
        return child.ExitCode;
    }

    /// <summary>End the Windows half, and say nothing when it has already ended on its own.</summary>
    private static void Stop(Process child)
    {
        try
        {
            if (!child.HasExited)
            {
                child.Kill(entireProcessTree: true);
            }
        }
        catch (Exception e) when (e is InvalidOperationException or NotSupportedException
            or System.ComponentModel.Win32Exception)
        {
            // Racing its own exit is the ordinary case, not a failure worth a line on stderr.
        }
    }
}
