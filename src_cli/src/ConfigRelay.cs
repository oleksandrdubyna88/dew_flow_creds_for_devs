using System.ComponentModel;
using CredsBroker;

namespace CredsCli;

/// <summary>
/// What <see cref="ConfigRelay"/> touches outside itself — so every way it can end is a unit test.
/// </summary>
/// <param name="ResolveKey">Reads the key on THIS side (Linux stdin or <c>CREDSFORDEVS_KEY</c>).</param>
/// <param name="ProbeHelp">Runs the Windows binary's <c>--help</c> hermetically; null for a non-zero exit.</param>
/// <param name="Launch">Starts the Windows binary with these arguments and writes the text to its stdin.</param>
/// <param name="Note">One diagnostic line to stderr.</param>
internal sealed record ConfigRelaySeams(
    Func<ConfigKeySource, ConfigKey> ResolveKey,
    Func<Task<string?>> ProbeHelp,
    Func<IReadOnlyList<string>, string, int> Launch,
    Action<string> Note)
{
    /// <summary>The real seams: this process's stdin and environment, and the Windows <c>creds.exe</c>.</summary>
    internal static ConfigRelaySeams ForThisMachine(Action<string> note) =>
        new(
            source => ConfigKeyInput.Resolve(source, Environment.GetEnvironmentVariable, Console.OpenStandardInput),
            () => WslInterop.Creds.CaptureAsync(["--help"], ConfigRelay.ProbeTimeout),
            WslInterop.Creds.RelayWithInput,
            note);
}

/// <summary>
/// <c>creds config</c> inside WSL: the key crosses to the Windows <c>creds.exe</c> on STDIN.
/// </summary>
/// <remarks>
/// <para><b>Why it is not the general relay.</b> Every other verb is handed to Windows before its
/// arguments are read, with the arguments as they came. For this verb that would put the key into two
/// command lines — the Linux one, readable by every user of the distribution, and the Windows one. So
/// the Linux half parses, refuses the argument form itself, reads the key from its own stdin or
/// environment (an environment variable would not cross without <c>WSLENV</c>; stdin does), and starts
/// <c>creds.exe config -</c> with only stdin redirected. Its stdout and stderr stay inherited, so the
/// config document reaches the application byte for byte, exactly as <c>Relay</c> delivers it.</para>
/// <para><b>Why a probe, and why no fallback.</b> A Windows <c>creds.exe</c> older than this change reads
/// the key only from its arguments; handed <c>-</c> it would ask the window for a key called "-". It is
/// asked for its <c>--help</c> first, and without <see cref="CommandLine.ConfigStdinMarker"/> it is
/// refused with "update creds.exe". Falling back to the argument form would put the key back on the
/// Windows command line, which is the leak this exists to end. Same probe shape as <c>creds-mcp</c>'s
/// <c>CallerForwarding</c>, with the opposite answer to a stale binary — there the cost of degrading is
/// a vaguer consent label, here it would be the key.</para>
/// </remarks>
internal static class ConfigRelay
{
    /// <summary>
    /// The arguments the Windows half is started with — always these two, never a key.
    /// </summary>
    internal static readonly IReadOnlyList<string> WindowsArguments = ["config", "-"];

    /// <summary>
    /// Longer than <c>CallerForwarding</c>'s 3 s on purpose: there a slow probe degrades a label, here it
    /// refuses the read, so a cold interop start on a busy machine must not look like an old binary.
    /// </summary>
    internal static readonly TimeSpan ProbeTimeout = TimeSpan.FromSeconds(10);

    internal const string OutdatedWindowsBinary =
        "the Windows creds.exe does not say it reads a config key from stdin (its --help does not name "
            + CommandLine.ConfigStdinMarker + ", or it did not answer in time), and a key is never handed to it as an argument. "
            + "Update creds.exe — \"Install `creds` (terminal CLI)…\" in VS Code — and run this again.";

    internal static async Task<int> RunAsync(
        IReadOnlyList<string> args,
        BrokerContract contract,
        ConfigRelaySeams seams,
        TimeSpan probeTimeout)
    {
        if (CommandLine.Parse(args) is not Request.ReadConfig config)
        {
            // The only other thing `creds config …` parses to is the constant refusal.
            seams.Note(CommandLine.ConfigArgumentRefused);
            return contract.Exit("usage");
        }

        switch (seams.ResolveKey(config.Source))
        {
            case ConfigKey.Found found:
                return await CrossAsync(found.Value, contract, seams, probeTimeout).ConfigureAwait(false);

            case ConfigKey.Missing missing:
                seams.Note(missing.Message);
                return contract.Exit("usage");

            default:
                return contract.Exit("brokerFailure");
        }
    }

    /// <summary>Probe, then hand over the key on stdin — or refuse, and start nothing that would carry it.</summary>
    private static async Task<int> CrossAsync(string key, BrokerContract contract, ConfigRelaySeams seams, TimeSpan probeTimeout)
    {
        var probe = await ProbeAsync(seams.ProbeHelp, probeTimeout).ConfigureAwait(false);
        if (probe.CannotStart is { } why)
        {
            seams.Note(CannotStart(why));
            return contract.Exit("toolMissing");
        }

        if (probe.Help is null || !probe.Help.Contains(CommandLine.ConfigStdinMarker, StringComparison.Ordinal))
        {
            seams.Note(OutdatedWindowsBinary);
            return contract.Exit("toolMissing");
        }

        try
        {
            return seams.Launch(WindowsArguments, key + "\n");
        }
        catch (Exception e) when (e is Win32Exception or InvalidOperationException)
        {
            seams.Note(CannotStart(e.Message));
            return contract.Exit("toolMissing");
        }
    }

    /// <summary>The help text, or why the binary could not be started at all — two different sentences.</summary>
    private sealed record Probe(string? Help, string? CannotStart);

    private static async Task<Probe> ProbeAsync(Func<Task<string?>> probeHelp, TimeSpan timeout)
    {
        try
        {
            return new Probe(await probeHelp().WaitAsync(timeout).ConfigureAwait(false), null);
        }
        catch (Exception e) when (e is Win32Exception or InvalidOperationException)
        {
            // No such binary, or not startable: say THAT, not "too old" — the cure is different.
            return new Probe(null, e.Message);
        }
        catch (Exception e) when (e is TimeoutException or IOException or ObjectDisposedException or OperationCanceledException)
        {
            // A hang past the timeout or a broken pipe: unconfirmed, which refuses exactly like "old".
            return new Probe(null, null);
        }
    }

    /// <summary>
    /// The sentence the general relay has always used for a Windows binary it could not start. The reason
    /// is the launcher's own (a path and an OS error), never anything this process read from stdin.
    /// </summary>
    private static string CannotStart(string reason) =>
        $"this looks like WSL, but the Windows binary could not be started ({reason}). "
            + $"Put creds.exe on the PATH, or set {WslInterop.BinaryOverrideVariable} to its full path.";
}
