using System.Diagnostics;

namespace CredsCli;

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
internal static class WslInterop
{
    /// <summary>Set by WSL itself in every distribution's environment.</summary>
    private const string DistroVariable = "WSL_DISTRO_NAME";

    /// <summary>An explicit override, for a layout where the binary is not on the interop PATH.</summary>
    internal const string BinaryOverrideVariable = "CREDS_WINDOWS_BINARY";

    /// <summary>Set by us before re-executing, so the Windows side can never bounce back.</summary>
    internal const string RelayedVariable = "CREDS_RELAYED_FROM_WSL";

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
    internal static bool ShouldRelay(bool isWindows, string? distro, string? procVersion, bool alreadyRelayed)
    {
        if (isWindows || alreadyRelayed)
        {
            return false;
        }

        return !string.IsNullOrWhiteSpace(distro)
            || (procVersion?.Contains("microsoft", StringComparison.OrdinalIgnoreCase) ?? false);
    }

    /// <summary>Read the two signals from this machine.</summary>
    internal static bool ShouldRelayHere() =>
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

    /// <summary>The Windows binary to run: the override when set, otherwise found on the PATH.</summary>
    internal static string WindowsBinary() =>
        Environment.GetEnvironmentVariable(BinaryOverrideVariable) is { Length: > 0 } custom
            ? custom
            : "creds.exe";

    /// <summary>
    /// Run the Windows binary with these arguments and return its exit code.
    /// </summary>
    /// <remarks>
    /// Streams are inherited rather than captured, so stdout stays a stream: a long
    /// <c>creds ssh … -- tail -f</c> prints as it goes instead of arriving at the end, and the
    /// caller's own redirection and piping keep working. Capturing would also have to re-encode
    /// output, which is how a bridge quietly corrupts binary stdout.
    /// </remarks>
    internal static int Relay(IReadOnlyList<string> args)
    {
        var start = new ProcessStartInfo(WindowsBinary()) { UseShellExecute = false };
        foreach (var arg in args)
        {
            start.ArgumentList.Add(arg);
        }
        start.Environment[RelayedVariable] = "1";

        using var child = Process.Start(start)
            ?? throw new InvalidOperationException($"could not start {WindowsBinary()}");
        child.WaitForExit();
        return child.ExitCode;
    }
}
