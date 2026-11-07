using System.Collections.Concurrent;
using System.Diagnostics;
using System.Runtime.CompilerServices;
using CredsForDevs.Tests.Leftovers;
using Serilog.Core;
using Serilog.Events;

namespace CredsForDevs.ServiceDefaults.Tests.Support;

/// <summary>
/// Starts a host binary from the test's own output folder — the real build, the real <c>Main</c> — and
/// finds the log file that run wrote.
/// </summary>
/// <remarks>
/// <para>Compiled into each binary's test project as a linked file, not copied: the MCP server and the CLI
/// both need exactly this, and a second copy is the drift <c>reuse-first.md</c> forbids. A referenced
/// executable project lands beside the test runner with its apphost and runtime config, so the binary
/// under test is <c>{BaseDirectory}/creds-mcp(.exe)</c> or <c>creds(.exe)</c>.</para>
/// <para>The child inherits this process's environment (its runtime lookup included — a filtered one
/// breaks on macOS runners, where .NET lives under the user's home) and then gets the test's own values
/// on top, <c>CREDS_LOG_DIR</c> always among them so no test writes into a person's real log folder.</para>
/// </remarks>
internal static class HostProcess
{
    /// <summary>The apphost of a referenced executable, by assembly name.</summary>
    internal static string Binary(string assemblyName) =>
        Path.Combine(AppContext.BaseDirectory, OperatingSystem.IsWindows() ? assemblyName + ".exe" : assemblyName);

    /// <summary>Start it with every stream redirected.</summary>
    internal static Process Start(string assemblyName, IReadOnlyList<string> args, IReadOnlyDictionary<string, string> env) =>
        StartFile(Binary(assemblyName), args, env);

    /// <summary>The same for any executable file (a host binary, or a fixture child a test wrote).</summary>
    internal static Process StartFile(string file, IReadOnlyList<string> args, IReadOnlyDictionary<string, string> env, Action? duringEnd = null)
    {
        var tied = FoldersNamedBy(args, env);
        var temp = ChildTemp(env);
        var start = new ProcessStartInfo(file)
        {
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        foreach (var arg in args)
        {
            start.ArgumentList.Add(arg);
        }
        foreach (var (name, value) in env)
        {
            start.Environment[name] = value;
        }
        Native(start.Environment, env, InsideWsl(ReadProcVersion()));
        if (temp is not null)
        {
            foreach (var name in TempVariables) start.Environment[name] = temp.Path;
        }

        Process process;
        try
        {
            process = Process.Start(start) ?? throw new InvalidOperationException($"{file} did not start");
        }
        catch
        {
            foreach (var folder in tied) folder.Untie();
            temp?.Dispose();
            throw;
        }

        var child = new Child(process, tied, temp, duringEnd);
        Children.Add(process, child);
        // The child's own exit is a confirmed end of the child too (a test may kill and await it by its own handle, with no Reaper): the OS reaped it.
        process.EnableRaisingEvents = true;
        process.Exited += (_, _) => child.End();
        return process;
    }

    /// <summary>Set by WSL in every distribution — <c>WslInterop</c>'s first signal for the pump path.</summary>
    internal const string DistroVariable = "WSL_DISTRO_NAME";

    /// <summary><c>WslInterop.RelayedVariable</c>: the one signal the binaries read as "this IS the native half".</summary>
    internal const string RelayedVariable = "CREDS_RELAYED_FROM_WSL";

    /// <summary>
    /// Makes the child take the NATIVE path on whatever machine runs the suite, unless the test asked for the pump.
    /// </summary>
    /// <remarks>
    /// <para>Inside a WSL distribution the built <c>creds-mcp</c> and <c>creds</c> take the WSL pump path
    /// (<c>WslInterop.ShouldRelayHere</c> reads <c>WSL_DISTRO_NAME</c> and <c>/proc/version</c>) and hand the
    /// session to a Windows binary — so five process tests written for the server itself talked to a relay
    /// there and failed (E5, PLAN_wsl_bridge_outlives_its_client.md), while passing on CI's plain Linux.</para>
    /// <para>So the child gets no <c>WSL_DISTRO_NAME</c>, and on a machine whose <c>/proc/version</c> names
    /// Microsoft — which a child's environment cannot change — the relayed marker. A test that names either
    /// variable itself (the pump tests do) gets exactly what it asked for. Plain Linux, macOS and Windows get the
    /// environment they always had.</para>
    /// </remarks>
    internal static void Native(IDictionary<string, string?> child, IReadOnlyDictionary<string, string> asked, bool insideWsl)
    {
        if (asked.ContainsKey(DistroVariable) || asked.ContainsKey(RelayedVariable))
        {
            return;
        }
        child.Remove(DistroVariable);
        if (insideWsl)
        {
            child[RelayedVariable] = "1";
        }
    }

    /// <summary>The product's second signal, read the same way: <c>/proc/version</c> naming Microsoft.</summary>
    internal static bool InsideWsl(string? procVersion) =>
        procVersion?.Contains("microsoft", StringComparison.OrdinalIgnoreCase) ?? false;

    private static string? ReadProcVersion()
    {
        try
        {
            return File.Exists("/proc/version") ? File.ReadAllText("/proc/version") : null;
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            return null;
        }
    }

    /// <summary>
    /// Kills the child's whole tree when disposed, unless it already exited — so a test that fails or times
    /// out while waiting never leaves the binary it started running. Only the process this test started, by
    /// its own handle; never anything found by name.
    /// </summary>
    internal static IDisposable KillOnDispose(Process process, Func<Process, TimeSpan, bool>? killAndWait = null) =>
        new Reaper(process, Children.TryGetValue(process, out var child) ? child : null, killAndWait ?? KillTreeAndWait);

    /// <summary>Kill the whole tree, then wait for the child's exit, at most <paramref name="bound"/>; the wait does not wait for the pipes. True when it ended.</summary>
    private static bool KillTreeAndWait(Process process, TimeSpan bound)
    {
        process.Kill(entireProcessTree: true);
        return process.WaitForExit(bound);
    }

    /// <summary>How long the <see cref="Reaper"/> waits for a killed tree to end before it gives up and fails the test.</summary>
    private static readonly TimeSpan EndBound = TimeSpan.FromSeconds(15);

    /// <summary>The state of a child started here: the registered folders its arguments or environment name (each is kept until the child's end is confirmed).</summary>
    private sealed class Child(Process process, IReadOnlyList<Folder> tied, OwnedDir? temp, Action? duringEnd)
    {
        private int _ended;

        public int Pid { get; } = process.Id;

        public IReadOnlyList<Folder> Tied => tied;

        public string? TempPath => temp?.Path;

        /// <summary>The confirmed end: the folders are free to go. Once.</summary>
        public void End()
        {
            if (Interlocked.Exchange(ref _ended, 1) != 0) return;
            duringEnd?.Invoke();
            foreach (var folder in tied) folder.Untie();
            temp?.Dispose(); // never throws; a removal that gives up stays in the helper's registry, so the audit names it
        }
    }

    private sealed class Reaper(Process process, Child? child, Func<Process, TimeSpan, bool> killAndWait) : IDisposable
    {
        /// <summary>Kill the tree, then wait (bounded, not for the pipes) for the child's exit. Confirmed: the tie ends. Not confirmed: the tie stays and
        /// ONE exception names the pid and the folders, so the test fails visibly and the audit names the folders.</summary>
        public void Dispose()
        {
            var confirmed = true;
            try
            {
                if (!process.HasExited)
                {
                    confirmed = killAndWait(process, EndBound);
                }
            }
            catch (InvalidOperationException)
            {
                // It exited (or its handle is gone) between the check and the kill - the ordinary race; the end is a fact.
            }

            if (!confirmed)
            {
                throw new InvalidOperationException(
                    $"host-process: the end of process {child?.Pid ?? process.Id} was not confirmed within {EndBound.TotalSeconds:0} s of the kill"
                    + (child is { Tied.Count: > 0 } ? $"; its folder(s) stay: {string.Join(", ", child.Tied.Select(f => f.Path))}" : string.Empty));
            }

            child?.End();
        }
    }

    /// <summary>Wait for the host to exit, at most <paramref name="bound"/>; true when it did.</summary>
    internal static async Task<bool> ExitsWithinAsync(Process host, TimeSpan bound, CancellationToken ct)
    {
        try
        {
            await host.WaitForExitAsync(ct).WaitAsync(bound, ct);
            return true;
        }
        catch (TimeoutException)
        {
            return false;
        }
    }

    /// <summary>The one file a run of <paramref name="app"/> with this pid wrote under <paramref name="root"/>.</summary>
    internal static string LogFileOf(string root, string app, int pid) =>
        Directory.GetFiles(root, $"{app}-*-{pid}.log", SearchOption.AllDirectories).Single();

    /// <summary>Read a log file even if a writer still holds it open.</summary>
    internal static string Read(string path)
    {
        using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }

    /// <summary>The owned temp folder a child was given (<c>TMPDIR</c>, <c>TEMP</c>, <c>TMP</c>), or null when it named its own or was not started here.</summary>
    internal static string? TempOf(Process process) => Children.TryGetValue(process, out var child) ? child.TempPath : null;

    /// <summary>The registered folders a child is tied to (a test's view of the ties).</summary>
    internal static IReadOnlyList<string> TiedFolders(Process process) =>
        Children.TryGetValue(process, out var child) ? [.. child.Tied.Select(f => f.Path)] : [];

    /// <summary>The variables a child's runtime reads for its temp folder: <c>TMPDIR</c> on Linux and macOS, <c>TEMP</c> and <c>TMP</c> on Windows.</summary>
    private static readonly string[] TempVariables = ["TMPDIR", "TEMP", "TMP"];

    /// <summary>
    /// A killed .NET child leaves <c>dotnet-diagnostic-*</c> and <c>clr-debug-pipe-*</c> in its temp folder (measured for E2.3: two killed hosts, six entries,
    /// in <c>CredsMcp.Tests</c> and in <c>CredsCli.Tests</c> alike). So a child gets an OWNED folder under the short root as <c>TMPDIR</c>, <c>TEMP</c> and
    /// <c>TMP</c> (rule §2), which goes with its confirmed end. A test that names one of the variables itself gets exactly what it asked for.
    /// </summary>
    private static OwnedDir? ChildTemp(IReadOnlyDictionary<string, string> asked) =>
        TempVariables.Any(asked.ContainsKey) ? null : OwnedDir.Create("child-tmp", OwnedCreds.ShortSocketRoot);

    /// <summary>A registered folder, with the number of children still tied to it.</summary>
    private sealed class Folder(OwnedDir dir)
    {
        private int _tied;

        public OwnedDir Dir { get; } = dir;

        public string Path => Dir.Path;

        public bool IsTied => Volatile.Read(ref _tied) > 0;

        public void Tie() => Interlocked.Increment(ref _tied);

        public void Untie() => Interlocked.Decrement(ref _tied);
    }

    /// <summary>Every folder <see cref="TempDirectory"/> made and <see cref="Remove"/> has not yet taken out, by path. The take-out is ONE atomic
    /// <c>TryRemove</c>: only the call that won it disposes. A disposal that gives up stays in <see cref="OwnedDir"/>'s own registry, where the audit sees it.</summary>
    private static readonly ConcurrentDictionary<string, Folder> Folders = new(PathComparer);

    private static readonly ConditionalWeakTable<Process, Child> Children = [];

    private static StringComparer PathComparer => OperatingSystem.IsWindows() ? StringComparer.OrdinalIgnoreCase : StringComparer.Ordinal;

    /// <summary>The registered folders that an argument or an environment value names or lies under (the callers pass the folder itself, or a path in it);
    /// each is tied to the child that is about to start.</summary>
    private static List<Folder> FoldersNamedBy(IReadOnlyList<string> args, IReadOnlyDictionary<string, string> env)
    {
        var comparison = OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal;
        var values = args.Concat(env.Values).ToList();
        var tied = new List<Folder>();
        foreach (var folder in Folders.Values)
        {
            // Names are unique per run (a random id ends each one), so containment cannot name a folder by accident.
            if (!values.Any(value => value.Contains(folder.Path, comparison))) continue;
            folder.Tie();
            tied.Add(folder);
        }

        return tied;
    }

    /// <summary>A fresh, empty temporary directory: an <see cref="OwnedDir"/> (claimed first, prefixed, registered), whose warning sink is
    /// <paramref name="warn"/> - the sink travels with that one folder, so no shared delegate exists for parallel tests to race on.</summary>
    internal static string TempDirectory(string what, Action<string>? warn = null)
    {
        var dir = OwnedDir.Create(what, null, warn);
        Folders[dir.Path] = new Folder(dir);
        return dir.Path;
    }

    /// <summary>Remove a folder <see cref="TempDirectory"/> gave. Never throws. A path it did not give, a path already taken out, and a folder
    /// whose child has not ended are each ONE warning and nothing removed. A disposal that gives up is warned about by the folder itself, keeps
    /// folder and claim, and stays in the helper's registry, so the end-of-run audit fails the run. <paramref name="onDispose"/> sees the path
    /// of each disposal just before it starts (a test's counting and ordering hook).</summary>
    internal static void Remove(string path, Action<string>? warn = null, Action<string>? onDispose = null, Action? afterTieCheck = null)
    {
        warn ??= Owned.DefaultWarn;
        if (Folders.TryGetValue(path, out var folder) && folder.IsTied)
        {
            warn($"host-process: {path} is kept - a child started with it has not ended; it stays registered, so the audit names it");
            return;
        }

        afterTieCheck?.Invoke();
        if (!Folders.TryRemove(path, out folder))
        {
            warn($"host-process: {path} was not given by TempDirectory, or was already removed - left alone");
            return;
        }

        onDispose?.Invoke(path);
        folder.Dir.Dispose();
    }
}

/// <summary>Keeps every event a logger emitted, for asserting on what was said.</summary>
internal sealed class CollectingSink : ILogEventSink
{
    private readonly List<LogEvent> _events = [];

    internal IReadOnlyList<string> Messages
    {
        get
        {
            lock (_events)
            {
                return [.. _events.Select(e => e.RenderMessage())];
            }
        }
    }

    /// <summary>The level of every event, in order.</summary>
    internal IReadOnlyList<LogEventLevel> Levels
    {
        get
        {
            lock (_events)
            {
                return [.. _events.Select(e => e.Level)];
            }
        }
    }

    /// <summary>The exceptions the events carried, in order.</summary>
    internal IReadOnlyList<Exception> Exceptions
    {
        get
        {
            lock (_events)
            {
                return [.. _events.Select(e => e.Exception).OfType<Exception>()];
            }
        }
    }

    public void Emit(LogEvent logEvent)
    {
        lock (_events)
        {
            _events.Add(logEvent);
        }
    }

    /// <summary>A logger at Verbose that writes only here.</summary>
    internal Logger Logger() =>
        new Serilog.LoggerConfiguration().MinimumLevel.Verbose().WriteTo.Sink(this).CreateLogger();
}
