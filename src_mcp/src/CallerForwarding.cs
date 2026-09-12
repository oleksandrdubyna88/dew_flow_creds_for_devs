using CredsBroker;

namespace CredsMcp;

/// <summary>
/// Handing the caller record across the WSL bridge — as an argument, and only to a Windows half
/// that knows what to do with one.
/// </summary>
/// <remarks>
/// <para><b>Why an argument.</b> Environment variables do not cross from WSL into a Windows child
/// unless named in <c>WSLENV</c> — measured by this repository on 2026-08-26 and written down in
/// <c>wslRelay.ts</c> and the CLI's README. The record therefore travels as
/// <c>--caller &lt;base64url json&gt;</c>: no quoting question, no encoding question, no character
/// a Windows argument parser can reinterpret.</para>
/// <para><b>Why a probe.</b> An <i>old</i> <c>creds-mcp.exe</c> handed an argument it does not know
/// answers a usage error and exits before the handshake — the bridge would be dead, not degraded,
/// and the person would see their MCP server fail to start. The halves ship from one tag, but this
/// is a run-time launch of whatever is actually on disk. So the Linux half asks the binary for its
/// <c>--help</c> once per session and passes the flag only when the text names it: one extra
/// process launch per SESSION (AOT start-up is single-digit milliseconds), never per call, and the
/// degradation when the Windows half is old is "An agent" in the modal rather than a dead server.
/// The same precedent the installer uses for a stale release (<c>knowsTheBridge</c>).</para>
/// <para><b>The probe cannot break the server.</b> Every failure — a missing binary, a launch error, a
/// non-zero exit, help text without the flag, a hang past the timeout — is read as "unsupported",
/// and the Windows half is started WITHOUT the flag. It can delay the server by at most the timeout,
/// once, and can never stop it starting. Its stdio is redirected into private buffers by
/// <c>WindowsBridge.CaptureAsync</c>, because the relay's OWN stdio is the live JSON-RPC channel.</para>
/// </remarks>
internal static class CallerForwarding
{
    /// <summary>The argument, and the word the probe looks for in the help text.</summary>
    internal const string Flag = "--caller";

    /// <summary>Two orders of magnitude above the measured AOT start-up; a hang past it is abandoned.</summary>
    internal static readonly TimeSpan ProbeTimeout = TimeSpan.FromSeconds(3);

    /// <summary>
    /// The argument list the Windows half is started with: <c>--caller &lt;record&gt;</c> when the probe
    /// says it knows the flag, nothing otherwise — and nothing, without probing, when there is nothing
    /// to forward.
    /// </summary>
    /// <param name="caller">What the Linux half learnt from its environment.</param>
    /// <param name="probeHelp">Runs the Windows binary's <c>--help</c> hermetically and answers its stdout, or <c>null</c>.</param>
    /// <param name="timeout">How long the probe may take before it is abandoned.</param>
    /// <param name="warn">Where to say that the Windows half is too old to be told who is asking.</param>
    internal static async Task<IReadOnlyList<string>> ArgumentsForAsync(
        CallerRecord caller,
        Func<Task<string?>> probeHelp,
        TimeSpan timeout,
        Action<string> warn)
    {
        if (caller.IsEmpty)
        {
            return [];
        }

        var help = await ProbeAsync(probeHelp, timeout).ConfigureAwait(false);
        if (help is not null && help.Contains(Flag, StringComparison.Ordinal))
        {
            return [Flag, CallerIdentity.Encode(caller)];
        }

        warn(
            $"the Windows creds-mcp.exe predates {Flag}, so the consent modal will say \"An agent\" rather than "
                + "who is asking — reinstall it with \"CredsForDevs: Install the MCP Server…\" to fix that.");
        return [];
    }

    private static async Task<string?> ProbeAsync(Func<Task<string?>> probeHelp, TimeSpan timeout)
    {
        try
        {
            return await probeHelp().WaitAsync(timeout).ConfigureAwait(false);
        }
        catch (Exception)
        {
            // Deliberately every exception, and the one place in this binary that catches so
            // broadly: a launch failure, a timeout, a disposed stream and anything not yet imagined
            // all mean the same thing here — "unsupported" — and none of them may stop the server
            // from starting. The relay itself reports a binary that cannot be started, in its own
            // words, when IT tries.
            return null;
        }
    }
}
