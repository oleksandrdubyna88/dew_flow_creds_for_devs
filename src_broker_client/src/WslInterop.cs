using System.Diagnostics;

namespace CredsBroker;

/// <summary>
/// Inside WSL, hand the whole call to the Windows binary and relay its streams back.
/// </summary>
/// <remarks>
/// <para><b>Why this rather than networking.</b> The broker listens on the Windows loopback. From
/// WSL2, <c>127.0.0.1</c> is the loopback of the virtual machine, where nothing of ours listens.
/// The ecosystem's usual answer is <c>npiperelay.exe</c> plus <c>socat</c>; the owner's decision
/// to build the CLI for Windows <i>and</i> Linux makes a better one available, because then both
/// halves of the bridge are ours: the Linux binary re-executes the Windows one through WSL
/// interop, which is enabled by default.</para>
/// <para>What that buys, and it is the whole argument: no mirrored networking, no firewall rule,
/// no third-party utilities to install and keep compatible, and — the part that matters for a
/// credential broker — <b>nothing starts listening anywhere new</b>. The broker stays exactly as
/// loopback-only as it was.</para>
/// <para>It works because the arguments are verbs, tokens and aliases: names, never paths. A tool
/// that took file paths would need WSL↔Windows path translation, which is where this kind of
/// bridge usually goes wrong.</para>
/// <para>The cost is one extra process launch per call. For an AOT binary that is single-digit
/// milliseconds, which is why the CLI is AOT.</para>
/// </remarks>
public static class WslInterop
{
    /// <summary>Set by WSL itself in every distribution's environment.</summary>
    private const string DistroVariable = "WSL_DISTRO_NAME";

    /// <summary>
    /// An explicit override, for a layout where the binary is not on the interop PATH.
    /// </summary>
    /// <remarks>
    /// Named for <c>creds</c> alone because it names <c>creds</c> alone: a second binary crossing
    /// this bridge gets its own variable rather than sharing this one, so pointing one of them at
    /// a custom path cannot silently redirect the other.
    /// </remarks>
    public const string BinaryOverrideVariable = "CREDS_WINDOWS_BINARY";

    /// <summary>The CLI's side of the bridge — the original, and still the only caller here.</summary>
    public static WindowsBridge Creds { get; } = new("creds.exe", BinaryOverrideVariable);

    /// <summary>Set by us before re-executing, so the Windows side can never bounce back.</summary>
    public const string RelayedVariable = "CREDS_RELAYED_FROM_WSL";

    /// <summary>
    /// Whether this process should hand the call to the Windows binary.
    /// </summary>
    /// <param name="isWindows">Whether we are already the Windows binary.</param>
    /// <param name="distro">The value of <c>WSL_DISTRO_NAME</c>, if set.</param>
    /// <param name="procVersion">The contents of <c>/proc/version</c>, if readable.</param>
    /// <param name="alreadyRelayed">Whether we were started BY a relay.</param>
    /// <remarks>
    /// Two independent signals because neither is reliable alone: <c>WSL_DISTRO_NAME</c> is
    /// absent in some service and container contexts inside WSL, and <c>/proc/version</c> is
    /// unreadable in a few sandboxes. The relay guard is not belt-and-braces — without it a
    /// misconfiguration where the Windows binary is itself a Linux one would fork forever.
    /// </remarks>
    public static bool ShouldRelay(bool isWindows, string? distro, string? procVersion, bool alreadyRelayed)
    {
        if (isWindows || alreadyRelayed)
        {
            return false;
        }

        return !string.IsNullOrWhiteSpace(distro)
            || (procVersion?.Contains("microsoft", StringComparison.OrdinalIgnoreCase) ?? false);
    }

    /// <summary>Read the two signals from this machine.</summary>
    public static bool ShouldRelayHere() =>
        ShouldRelay(
            OperatingSystem.IsWindows(),
            Environment.GetEnvironmentVariable(DistroVariable),
            ReadProcVersion(),
            Environment.GetEnvironmentVariable(RelayedVariable) is not null);

    private static string? ReadProcVersion()
    {
        try
        {
            return File.Exists("/proc/version") ? File.ReadAllText("/proc/version") : null;
        }
        catch (IOException)
        {
            return null;
        }
        catch (UnauthorizedAccessException)
        {
            return null;
        }
    }

}

/// <summary>
/// One binary's crossing of the WSL bridge: which Windows executable, and how to override it.
/// </summary>
/// <remarks>
/// <para>Detection is a property of the machine and stays static above; launching is a property
/// of the BINARY, and there are two of them now — <c>creds</c> and <c>creds-mcp</c>. That is the
/// whole reason this is an instance: a single static <c>WindowsBinary()</c> returning
/// <c>"creds.exe"</c> would have quietly relayed the MCP server's stdio to the CLI, which would
/// have answered a JSON-RPC handshake with a usage error and left the client waiting.</para>
/// <para>Each binary carries its own override variable for the same reason: pointing one at a
/// custom path must not redirect the other.</para>
/// </remarks>
public sealed record WindowsBridge(string DefaultBinary, string OverrideVariable)
{
    /// <summary>The Windows binary to run: the override when set, otherwise found on the PATH.</summary>
    public string WindowsBinary() =>
        Environment.GetEnvironmentVariable(OverrideVariable) is { Length: > 0 } custom
            ? custom
            : DefaultBinary;

    /// <summary>The launch both forms share: the binary, the arguments, and the loop guard.</summary>
    private ProcessStartInfo StartInfo(IReadOnlyList<string> args)
    {
        var start = new ProcessStartInfo(WindowsBinary()) { UseShellExecute = false };
        foreach (var arg in args)
        {
            start.ArgumentList.Add(arg);
        }
        start.Environment[WslInterop.RelayedVariable] = "1";
        return start;
    }

    /// <summary>
    /// Run the Windows binary with these arguments and return its exit code.
    /// </summary>
    /// <remarks>
    /// Streams are inherited rather than captured, so stdout stays a stream: a long
    /// <c>creds ssh … -- tail -f</c> prints as it goes instead of arriving at the end, and the
    /// caller's own redirection and piping keep working. Capturing would also have to re-encode
    /// output, which is how a bridge quietly corrupts binary stdout.
    /// </remarks>
    public int Relay(IReadOnlyList<string> args)
    {
        using var child = Process.Start(StartInfo(args))
            ?? throw new InvalidOperationException($"could not start {WindowsBinary()}");
        child.WaitForExit();
        return child.ExitCode;
    }

    /// <summary>
    /// The same launch, but with stdin and stdout as pipes the caller owns.
    /// </summary>
    /// <remarks>
    /// <para>For a caller that is not relaying a call but carrying a held connection: it must
    /// write into the child and read back from it rather than let the child inherit this
    /// process's console. stderr is left inherited on purpose, so a diagnostic from the Windows
    /// side reaches the terminal instead of being swallowed by a pump.</para>
    /// <para>Binary integrity across this boundary was measured rather than assumed (2026-08-26):
    /// 64 KB of random bytes through WSL interop pipes came back with an identical SHA-256.</para>
    /// </remarks>
    public Process StartPiped(IReadOnlyList<string> args)
    {
        var start = StartInfo(args);
        start.RedirectStandardInput = true;
        start.RedirectStandardOutput = true;
        return Process.Start(start)
            ?? throw new InvalidOperationException($"could not start {WindowsBinary()}");
    }
}
