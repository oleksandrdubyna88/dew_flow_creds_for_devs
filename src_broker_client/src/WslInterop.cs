using System.Collections.Concurrent;
using System.Diagnostics;
using System.Text;

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

    /// <summary>
    /// The MCP server's own override, deliberately not shared with the CLI's.
    /// </summary>
    /// <remarks>
    /// The reason is the one written above <see cref="BinaryOverrideVariable"/> and it is not
    /// hypothetical: a person who points <c>creds</c> at a build in a custom folder would
    /// otherwise send their MCP client's stdio to the same place, and a CLI answering a JSON-RPC
    /// handshake says nothing at all — the client simply waits.
    /// </remarks>
    public const string McpBinaryOverrideVariable = "CREDS_MCP_WINDOWS_BINARY";

    /// <summary>The CLI's side of the bridge — the original, and still the only caller here.</summary>
    public static WindowsBridge Creds { get; } = new("creds.exe", BinaryOverrideVariable);

    /// <summary>The MCP server's side of the bridge: a different binary, a different variable.</summary>
    public static WindowsBridge CredsMcp { get; } = new("creds-mcp.exe", McpBinaryOverrideVariable);

    /// <summary>Set by us before re-executing, so the Windows side can never bounce back.</summary>
    public const string RelayedVariable = "CREDS_RELAYED_FROM_WSL";

    /// <summary>
    /// The one variable WSL reads to decide which of a Linux process's variables a Windows child it starts may see.
    /// </summary>
    /// <remarks>
    /// Environment variables do NOT cross WSL interop on their own — measured 2026-08-26, including from
    /// <c>ProcessStartInfo.Environment</c> — so until 2026-10-10 <see cref="RelayedVariable"/> never reached the
    /// Windows half at all: the loop guard held only because <c>isWindows</c> short-circuits there, and E2's "the
    /// parent watch is off for the Windows half of the bridge" was a line in a document the real bridge did not
    /// honour (the Windows half watched the session-long <c>wsl.exe</c>; seen in E3's end-to-end log). Naming the
    /// variable here, APPENDED to whatever the person's own <c>WSLENV</c> already lists, is what makes it cross.
    /// </remarks>
    public const string WslEnvVariable = "WSLENV";

    /// <summary>
    /// The <c>WSLENV</c> a Windows child is started with: the person's list without any entry of their own for
    /// <see cref="RelayedVariable"/>, plus the bare name once — an entry carrying <c>/u</c> (Windows-to-WSL only) would
    /// keep the marker on this side of the bridge.
    /// </summary>
    public static string WslEnvFor(string? existing)
    {
        var kept = (existing ?? string.Empty)
            .Split(':', StringSplitOptions.RemoveEmptyEntries)
            .Where(entry => entry.Split('/')[0] != RelayedVariable);
        return string.Join(':', [.. kept, RelayedVariable]);
    }

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

    /// <summary>The operator's escape hatch — set to <c>1</c> and the Windows half is launched directly (defect D guard off).</summary>
    /// <remarks>
    /// Product-neutral because the guard is shared: <see cref="WindowsBridge.StartPiped"/> serves BOTH the MCP pump
    /// and the relay's <c>relay-pipe</c> children, so an MCP-named switch would read as if it touched only MCP
    /// (code round, finding 3). For the rare machine where <c>setpriv</c> wrapping is unwelcome; never needed in
    /// normal use.
    /// </remarks>
    public const string NoParentDeathGuardVariable = "CREDS_NO_PDEATH_GUARD";

    /// <summary>Why the parent-death guard stands where it does — a value the startup log reports as a fact.</summary>
    public enum ParentDeathGuard
    {
        /// <summary><c>setpriv</c> is present; a piped launch of a resolvable binary will be guarded.</summary>
        Available,

        /// <summary>Not Linux — this host never relays a Windows half, so the guard does not apply.</summary>
        NotApplicable,

        /// <summary>The operator set <see cref="NoParentDeathGuardVariable"/> to <c>1</c>.</summary>
        SwitchedOff,

        /// <summary><c>setpriv</c> (util-linux) was not found in the trusted system directories.</summary>
        NoSetpriv,

        /// <summary><c>setpriv</c> is present but does not understand <c>--pdeathsig</c> (util-linux &lt; 2.33, or busybox).</summary>
        SetprivLacksPdeathsig,
    }

    /// <summary>The trusted system directories <c>setpriv</c> is looked for in — never an arbitrary PATH entry.</summary>
    /// <remarks>
    /// A credential broker must not execute a <c>setpriv</c> an attacker dropped earlier on the PATH (code round,
    /// finding 12): <c>setpriv</c> is a util-linux system binary, and these are the only places it legitimately
    /// lives. A <c>setpriv</c> in a non-standard prefix leaves the guard off — safe, the launch falls back — never an
    /// untrusted exec.
    /// </remarks>
    private static readonly string[] TrustedBinDirs = ["/usr/bin", "/bin", "/usr/sbin", "/sbin", "/usr/local/bin"];

    /// <summary>The guard's path and the reason it stands where it does — resolved ONCE for this process.</summary>
    /// <remarks>
    /// The Windows half of the bridge is launched through <c>setpriv --pdeathsig KILL --</c> so its interop proxy
    /// carries <c>PR_SET_PDEATHSIG(SIGKILL)</c>: when this Linux wrapper dies for any reason — a SIGKILL that runs no
    /// cleanup included — the kernel sends the proxy SIGKILL, and SIGKILL ends even a SIGSTOPped process, so a proxy a
    /// process-tree terminator left stopped-and-orphaned cannot sit forever failing to forward end-of-stream (defect D
    /// of PLAN_wsl_bridge_outlives_its_client.md, §5.11; measured in research/RESULTS_wsl_bridge_orphans.md). Resolved
    /// once because it runs a probe process; a fresh wrapper process re-resolves, so a corrected environment recovers
    /// on the next session.
    /// </remarks>
    internal readonly record struct GuardResolution(string? Setpriv, ParentDeathGuard Status);

    private static readonly Lazy<GuardResolution> Resolution = new(ResolveGuard);

    /// <summary><c>setpriv</c>'s path when the guard is armable, else <c>null</c>.</summary>
    internal static readonly Lazy<string?> ParentDeathArmer = new(() => Resolution.Value.Setpriv);

    private static GuardResolution ResolveGuard()
    {
        var isLinux = OperatingSystem.IsLinux();
        var killSwitch = Environment.GetEnvironmentVariable(NoParentDeathGuardVariable);
        var candidate = ResolveSetpriv(isLinux, killSwitch, File.Exists);
        var baseStatus = GuardStatus(isLinux, killSwitch, candidate);
        return Classify(baseStatus, candidate, candidate is not null && SupportsPdeathsig(candidate));
    }

    /// <summary>Pure: fold the base status and the probe result into the final resolution, so the probe-failed reason is a unit test.</summary>
    internal static GuardResolution Classify(ParentDeathGuard baseStatus, string? candidate, bool probeSupported) =>
        baseStatus != ParentDeathGuard.Available ? new GuardResolution(null, baseStatus)
        : probeSupported ? new GuardResolution(candidate, ParentDeathGuard.Available)
        : new GuardResolution(null, ParentDeathGuard.SetprivLacksPdeathsig);

    private const int ProbeTimeoutMs = 3000;

    /// <summary>The absolute <c>true</c> the probe runs through <c>setpriv</c> — from a trusted dir, never a bare name <c>execvp</c> could resolve to a planted binary on PATH (code round, security).</summary>
    private static readonly string TrustedTrue = FirstExisting(TrustedBinDirs, "true", File.Exists) ?? "/bin/true";

    /// <summary>
    /// Whether this <paramref name="setpriv"/> actually understands <c>--pdeathsig</c>, probed ONCE.
    /// </summary>
    /// <remarks>
    /// util-linux added <c>--pdeathsig</c> in 2.33 (2018), and a busybox applet lacks it. Existence is not enough: an
    /// armed launch on a <c>setpriv</c> that does not know the option would fail at once with "unrecognized option"
    /// and the Windows half would NEVER run — for the pump and every relay connection — a full outage where the design
    /// promises a graceful fallback (own review). So the capability is confirmed by running
    /// <c>setpriv --pdeathsig KILL -- &lt;trusted true&gt;</c> once; a non-zero exit or any launch failure leaves the
    /// guard unavailable, and the launch falls back to a direct exec.
    /// </remarks>
    private static bool SupportsPdeathsig(string setpriv)
    {
        try
        {
            var start = new ProcessStartInfo(setpriv)
            {
                ArgumentList = { "--pdeathsig", "KILL", "--", TrustedTrue },
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
            };
            using var probe = Process.Start(start);
            if (probe is null)
            {
                return false;
            }
            if (!probe.WaitForExit(ProbeTimeoutMs))
            {
                probe.Kill(entireProcessTree: true);
                probe.WaitForExit(ProbeTimeoutMs);
                return false;
            }
            return probe.ExitCode == 0;
        }
        catch (Exception)
        {
            // A best-effort capability probe: any failure (a launch error, a tree-kill that could not reach every
            // descendant, anything not foreseen) means the guard is simply unavailable, never a thrown startup.
            return false;
        }
    }

    /// <summary>Whether <c>setpriv</c> is available to arm the guard (the capability; a given launch also needs its binary to resolve).</summary>
    public static bool ParentDeathArmed => ParentDeathArmer.Value is not null;

    /// <summary>Why the guard stands where it does — for the one startup log line (code round, findings 1/5/10/13). Includes the probe-failed reason.</summary>
    public static ParentDeathGuard GuardStatus() => Resolution.Value.Status;

    /// <summary>Pure: the status from the three facts BEFORE the probe, so a configured off-switch is never reported as a missing tool.</summary>
    internal static ParentDeathGuard GuardStatus(bool isLinux, string? killSwitch, string? resolved)
    {
        if (!isLinux)
        {
            return ParentDeathGuard.NotApplicable;
        }
        if (killSwitch == "1")
        {
            return ParentDeathGuard.SwitchedOff;
        }
        return resolved is null ? ParentDeathGuard.NoSetpriv : ParentDeathGuard.Available;
    }

    /// <summary>Pure: <c>setpriv</c>'s candidate path from the three facts, so the kill switch and the trusted-dir order are unit tests.</summary>
    internal static string? ResolveSetpriv(bool isLinux, string? killSwitch, Func<string, bool> exists) =>
        !isLinux || killSwitch == "1" ? null : FirstExisting(TrustedBinDirs, "setpriv", exists);

    /// <summary>The first directory on <paramref name="pathVar"/> that holds <paramref name="name"/>, or <c>null</c> — the one PATH scan.</summary>
    internal static string? FindOnPath(string name, string? pathVar, Func<string, bool> exists) =>
        FirstExisting((pathVar ?? string.Empty).Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries), name, exists);

    /// <summary>The first of <paramref name="directories"/> that holds <paramref name="name"/>, or <c>null</c>.</summary>
    private static string? FirstExisting(IEnumerable<string> directories, string name, Func<string, bool> exists)
    {
        foreach (var directory in directories)
        {
            var candidate = Path.Combine(directory, name);
            if (exists(candidate))
            {
                return candidate;
            }
        }
        return null;
    }

}

/// <summary>
/// The one long-lived thread every parent-death-guarded child is forked on.
/// </summary>
/// <remarks>
/// <para><b>Why a dedicated thread.</b> <c>setpriv --pdeathsig KILL</c> arms <c>PR_SET_PDEATHSIG(SIGKILL)</c> on the
/// proxy, and the kernel sends that signal when the proxy's PARENT THREAD — the one that forked it — terminates, not
/// only when the whole process does (measured: a <c>.NET</c>-forked guarded child dies the moment its forking thread
/// exits, research/RESULTS_wsl_bridge_orphans.md, *Defect D*). <c>Process.Start</c> forks on the calling thread, and
/// the pump and the relay reach it on a thread-pool worker that retires after a few idle seconds — which would have
/// the kernel SIGKILL the Windows half under a LIVE client, a regression worse than the leak. So every guarded fork
/// runs on this one thread, which lives for the whole process; the signal then fires only at process exit, which is
/// exactly when the proxy should go. A BACKGROUND thread, so it never holds the process open.</para>
/// </remarks>
internal static class GuardedLauncher
{
    private sealed record Request(ProcessStartInfo Start, TaskCompletionSource<Process> Done);

    private static readonly Lazy<BlockingCollection<Request>> Queue = new(CreateQueue);

    /// <summary>Fork <paramref name="start"/> on the dedicated thread and return its process, or rethrow its launch failure.</summary>
    internal static Process Launch(ProcessStartInfo start)
    {
        var done = new TaskCompletionSource<Process>(TaskCreationOptions.RunContinuationsAsynchronously);
        Queue.Value.Add(new Request(start, done));
        return done.Task.GetAwaiter().GetResult();
    }

    private static BlockingCollection<Request> CreateQueue()
    {
        var queue = new BlockingCollection<Request>();
        new Thread(() => Consume(queue)) { IsBackground = true, Name = "creds-pdeath-launcher" }.Start();
        return queue;
    }

    private static void Consume(BlockingCollection<Request> queue)
    {
        foreach (var request in queue.GetConsumingEnumerable())
        {
            Fulfil(request);
        }
    }

    private static void Fulfil(Request request)
    {
        try
        {
            request.Done.SetResult(Process.Start(request.Start)
                ?? throw new InvalidOperationException($"could not start {request.Start.FileName}"));
        }
        catch (Exception e)
        {
            request.Done.SetException(e);
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

    /// <summary>The launch the one-shot forms share (never guarded): the binary, the arguments, and the loop guard.</summary>
    private ProcessStartInfo StartInfo(IReadOnlyList<string> args) => StartInfo(args, setpriv: null);

    /// <summary>
    /// The launch, wrapped in <paramref name="setpriv"/> (the parent-death guard, defect D) when it is non-null.
    /// </summary>
    /// <param name="setpriv">
    /// The resolved <c>setpriv</c> path for the long-lived PIPED launch, or <c>null</c>. Only the pump and the relay's
    /// <c>relay-pipe</c> children (<see cref="StartPiped"/>) pass it; the one-shot launches (<see cref="Relay"/>,
    /// <see cref="RelayWithInput"/>, <see cref="CaptureAsync"/>) exit within their own call and cannot be left
    /// orphaned, so they never arm it.
    /// </param>
    private ProcessStartInfo StartInfo(IReadOnlyList<string> args, string? setpriv)
    {
        var (fileName, launch) = WithParentDeath(setpriv, WindowsBinary(), args);
        var start = new ProcessStartInfo(fileName) { UseShellExecute = false };
        foreach (var arg in launch)
        {
            start.ArgumentList.Add(arg);
        }
        start.Environment[WslInterop.RelayedVariable] = "1";
        // Named in WSLENV, or it stays on this side of the bridge (see WslEnvVariable).
        start.Environment[WslInterop.WslEnvVariable] = WslInterop.WslEnvFor(Environment.GetEnvironmentVariable(WslInterop.WslEnvVariable));
        return start;
    }

    /// <summary>
    /// The <c>(fileName, arguments)</c> to spawn <paramref name="binary"/>: wrapped in
    /// <c>setpriv --pdeathsig KILL --</c> when <paramref name="setpriv"/> is a path, unchanged when it is
    /// <c>null</c>.
    /// </summary>
    /// <remarks>
    /// Pure, so the shaping is a unit test rather than a process launch. When wrapped, the kernel sends the launched
    /// interop proxy SIGKILL the instant this wrapper dies, which ends even a proxy a terminator left SIGSTOPped —
    /// defect D (§5.11). <c>setpriv</c> replaces itself in place (<c>execvp</c>), so the tracked pid is the proxy and
    /// <c>PR_SET_PDEATHSIG</c> survives the single <c>execve</c> into <c>/init</c> (measured: it is preserved across the
    /// interop dispatch, and <c>/init</c> does not reparent the proxy — research/RESULTS_wsl_bridge_orphans.md).
    /// </remarks>
    internal static (string FileName, IReadOnlyList<string> Arguments) WithParentDeath(
        string? setpriv, string binary, IReadOnlyList<string> args) =>
        setpriv is null
            ? (binary, args)
            : (setpriv, ["--pdeathsig", "KILL", "--", binary, .. args]);

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
    /// <see cref="Relay"/>, except that the child's stdin is fed <paramref name="input"/> and then closed.
    /// </summary>
    /// <remarks>
    /// <para>For a value that must cross the bridge and must NOT be an argument — the config key of
    /// <c>creds config -</c>. A command line is readable by every user inside WSL and by every process
    /// of the same user on Windows; a pipe is readable by the two ends of it.</para>
    /// <para>Only stdin is redirected. stdout and stderr stay inherited, so what the Windows half prints
    /// reaches the caller byte for byte, exactly as <see cref="Relay"/> delivers it — no pump, no
    /// re-encoding. The text is written as UTF-8 without a byte order mark.</para>
    /// <para>A child that exits before reading all of it breaks the pipe; that is its answer, not ours to
    /// raise, so the write failure is swallowed and the child's exit code returned.</para>
    /// </remarks>
    public int RelayWithInput(IReadOnlyList<string> args, string input)
    {
        using var child = Process.Start(StartInfoWithInput(args))
            ?? throw new InvalidOperationException($"could not start {WindowsBinary()}");
        try
        {
            child.StandardInput.Write(input);
            child.StandardInput.Close();
        }
        catch (IOException)
        {
            // The child closed its end first — it has already decided; its exit code says what.
        }

        child.WaitForExit();
        return child.ExitCode;
    }

    /// <summary>The launch <see cref="RelayWithInput"/> makes: stdin redirected, nothing else.</summary>
    internal ProcessStartInfo StartInfoWithInput(IReadOnlyList<string> args)
    {
        var start = StartInfo(args);
        start.RedirectStandardInput = true;
        start.StandardInputEncoding = new UTF8Encoding(encoderShouldEmitUTF8Identifier: false);
        return start;
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
        // The one long-lived launch: the pump's session and the relay's per-connection child. Arm the parent-death
        // guard so a proxy a process-tree terminator leaves SIGSTOPped and orphaned still dies with this wrapper
        // (defect D of PLAN_wsl_bridge_outlives_its_client.md, §5.11) — but ONLY when the Windows binary resolves,
        // so a missing one still reaches Process.Start un-wrapped and throws the Win32Exception that produces the
        // "set CREDS_MCP_WINDOWS_BINARY" diagnosis rather than a silent setpriv exec failure.
        var setpriv = WillArmParentDeath() ? WslInterop.ParentDeathArmer.Value : null;
        var start = StartInfo(args, setpriv);
        start.RedirectStandardInput = true;
        start.RedirectStandardOutput = true;
        // A guarded child is forked on the dedicated long-lived thread, so PR_SET_PDEATHSIG tracks a thread that
        // lives for the process and not a thread-pool worker that retires mid-session (code round, defect D).
        return setpriv is not null
            ? GuardedLauncher.Launch(start)
            : Process.Start(start) ?? throw new InvalidOperationException($"could not start {WindowsBinary()}");
    }

    /// <summary>Whether a piped launch of this binary arms the parent-death guard — <c>setpriv</c> present AND the binary resolves.</summary>
    public bool WillArmParentDeath() => WslInterop.ParentDeathArmer.Value is not null && WindowsBinaryResolves();

    /// <summary>
    /// Whether <see cref="WindowsBinary"/> resolves the way a direct launch would — an existing file for a path, or a
    /// name found on the PATH (which under WSL interop includes the translated Windows directories).
    /// </summary>
    /// <remarks>
    /// The parent-death guard prepends <c>setpriv</c>, whose own <c>execvp</c> of a missing target fails at run time
    /// rather than throwing at launch — which would swallow the missing-Windows-half diagnosis
    /// (<see cref="StartPiped"/>). So the guard is armed only when the binary is seen to resolve; a binary that does
    /// not falls through to the un-wrapped launch, whose throw <c>Program</c> turns into the fix-naming message.
    /// Evaluated per launch and NOT cached: the long-lived relay then sees an override path, or a binary on PATH,
    /// created or removed after it started (code round, cache-staleness). The pump launches once per session, and the
    /// shipped relay config is an absolute override path (one <see cref="File.Exists"/>), so the cost is negligible.
    /// <b>Deliberate gaps</b> (code round): this does not reproduce .NET's resolution of a bare name against the
    /// executable's own directory or the current directory, nor the execute bit; a bare name containing a backslash
    /// is treated as a path (legal in a Linux filename); and a literal Windows drive path (<c>C:\…</c>) resolves
    /// false — but .NET's own <c>Process.Start</c> cannot launch that on Linux either, so the un-armed launch throws
    /// the diagnosis, which is correct. Each unguarded case is SAFE (unguarded, not broken); the shipped layout is an
    /// absolute <c>/mnt</c> override path, for which <see cref="File.Exists"/> is exact.
    /// </remarks>
    private bool WindowsBinaryResolves() =>
        BinaryResolves(WindowsBinary(), Environment.GetEnvironmentVariable("PATH"), File.Exists);

    /// <summary>Pure: whether <paramref name="binary"/> resolves as a path or a name on <paramref name="pathVar"/>.</summary>
    internal static bool BinaryResolves(string binary, string? pathVar, Func<string, bool> exists) =>
        binary.AsSpan().IndexOfAny('/', '\\') >= 0
            ? exists(binary)
            : WslInterop.FindOnPath(binary, pathVar, exists) is not null;

    /// <summary>
    /// Run the Windows binary hermetically — every stream redirected, a bounded wait — and answer
    /// its stdout, or <c>null</c> for a non-zero exit or a timeout.
    /// </summary>
    /// <remarks>
    /// <para>For the one-shot <c>--help</c> probe the MCP relay makes before it starts a session. The
    /// relay's OWN stdio is the live JSON-RPC channel: nothing the probe prints may touch it, and it
    /// must not inherit the client's stdin either, so all three streams are redirected and its stdin
    /// is closed at once. A probe that hangs is killed as a tree at the timeout and reads as
    /// <c>null</c>; it may delay the caller by that much, never stop it.</para>
    /// <para>A launch failure — no such binary — throws, exactly as <see cref="StartPiped"/> does,
    /// because the caller is the one with the sentence for it.</para>
    /// </remarks>
    public async Task<string?> CaptureAsync(IReadOnlyList<string> args, TimeSpan timeout)
    {
        var start = StartInfo(args);
        start.RedirectStandardInput = true;
        start.RedirectStandardOutput = true;
        start.RedirectStandardError = true;
        using var child = Process.Start(start)
            ?? throw new InvalidOperationException($"could not start {WindowsBinary()}");
        child.StandardInput.Close();
        // BOUNDED, not `ReadToEndAsync` (code round, 2026-09-12): a stale or broken binary that
        // writes continuously would otherwise be buffered whole, and this runs at the start of
        // every WSL session, before the MCP server. A probe reads a help text — anything past the
        // cap is not one, and the answer is the same as any other failure: start without the flag.
        var stdout = ReadCappedAsync(child.StandardOutput);
        var stderr = ReadCappedAsync(child.StandardError);

        using var deadline = new CancellationTokenSource(timeout);
        try
        {
            await child.WaitForExitAsync(deadline.Token).ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            child.Kill(entireProcessTree: true);
            // The two reads are still pending on pipes the kill is about to close. Awaiting them
            // here is what keeps their faults observed rather than raised on the finalizer thread.
            await Settled(stdout, stderr).ConfigureAwait(false);
            return null;
        }

        await Settled(stdout, stderr).ConfigureAwait(false);
        return child.ExitCode == 0 ? await stdout.ConfigureAwait(false) : null;
    }

    /// <summary>At most <see cref="MaxProbeChars"/>, then stop reading — an oversized probe is a failed one.</summary>
    private static async Task<string?> ReadCappedAsync(TextReader reader)
    {
        var buffer = new char[4096];
        var text = new StringBuilder();
        int read;
        while ((read = await reader.ReadAsync(buffer, 0, buffer.Length).ConfigureAwait(false)) > 0)
        {
            text.Append(buffer, 0, read);
            if (text.Length > MaxProbeChars)
            {
                return null;
            }
        }

        return text.ToString();
    }

    /// <summary>Wait for both reads and swallow what a killed pipe throws — never a fault nobody sees.</summary>
    private static async Task Settled(params Task[] reads)
    {
        try
        {
            await Task.WhenAll(reads).ConfigureAwait(false);
        }
        catch (Exception e) when (e is IOException or ObjectDisposedException or OperationCanceledException or InvalidOperationException)
        {
            // The child was killed mid-write. That is the timeout path doing its job.
        }
    }

    /// <summary>A help text is a few hundred characters; past this it is not a help text.</summary>
    private const int MaxProbeChars = 64 * 1024;
}
