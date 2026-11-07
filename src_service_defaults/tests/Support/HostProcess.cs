using System.Collections.Concurrent;
using System.Diagnostics;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
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
internal static partial class HostProcess
{
    /// <summary>The apphost of a referenced executable, by assembly name.</summary>
    internal static string Binary(string assemblyName) =>
        Path.Combine(AppContext.BaseDirectory, OperatingSystem.IsWindows() ? assemblyName + ".exe" : assemblyName);

    /// <summary>Start it with every stream redirected.</summary>
    internal static Process Start(string assemblyName, IReadOnlyList<string> args, IReadOnlyDictionary<string, string> env) =>
        StartFile(Binary(assemblyName), args, env);

    /// <summary>The same for any executable file (a host binary, or a fixture child a test wrote). On POSIX the child leads a session of its own, so
    /// "the child and everything it started" is one process group the adapter can ask about and end.</summary>
    internal static Process StartFile(string file, IReadOnlyList<string> args, IReadOnlyDictionary<string, string> env, Action? duringEnd = null)
    {
        var temp = ChildTemp(env);
        var child = new Child(temp, duringEnd);
        TieToFolders(child, args, env);
        var (program, programArgs, ownGroup) = InItsOwnGroup(file, args);
        var start = new ProcessStartInfo(program)
        {
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        foreach (var arg in programArgs)
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
            child.Abandon();
            throw;
        }

        child.Attach(process.Id, ownGroup);
        Children.Add(process, child);
        // The child's own exit is a confirmed end of the child (a test may kill and await it by its own handle, with no Reaper): the OS reaped it. It ends
        // the tie only once its group is empty too; a surviving descendant keeps the folder until the Reaper (or a later Remove) finds the group empty.
        process.EnableRaisingEvents = true;
        process.Exited += (_, _) =>
        {
            child.MarkExited();
            _ = child.TryEnd(GroupWait);
        };
        return process;
    }

    /// <summary>How long the child's own exit, or a <c>Remove</c>, waits for the rest of its group to be gone before the tie stays.</summary>
    private static readonly TimeSpan GroupWait = TimeSpan.FromMilliseconds(1500);

    /// <summary>
    /// On Linux and macOS the child is started through <c>perl</c>, which makes itself a session leader (<c>setsid</c>) and then <c>exec</c>s the real file: the pid
    /// is the same, and the pid is the group's id, so every descendant that does not leave the group is a member of it (a double fork keeps the group; only its own
    /// <c>setsid</c> leaves). .NET offers no way to put a child in a group of its own, and the parent cannot do it after the exec (EACCES). Where no <c>perl</c> is on the
    /// path, or on Windows, the child starts as it did: no group, and the tie ends with the direct child's confirmed exit.
    /// </summary>
    private static (string Program, IReadOnlyList<string> Args, bool OwnGroup) InItsOwnGroup(string file, IReadOnlyList<string> args)
    {
        if (OperatingSystem.IsWindows() || FindPerl() is not { } perl) return (file, args, false);
        const string Script = "POSIX::setsid() or die qq(setsid: $!); exec { $ARGV[0] } @ARGV or die qq(exec: $!);";
        return (perl, ["-MPOSIX", "-e", Script, "--", file, .. args], true);
    }

    private static string? FindPerl() =>
        (Environment.GetEnvironmentVariable("PATH") ?? string.Empty).Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries)
            .Append("/usr/bin").Select(dir => Path.Combine(dir, "perl")).FirstOrDefault(File.Exists);

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
    /// <remarks>On Linux .NET's <c>Kill</c> returns after the child is reaped (measured: 0 of 300 kills left <c>HasExited</c> false), so this wait is not pinned by a
    /// test there; it is the confirmation on Windows, where <c>TerminateProcess</c> is asynchronous. What a test does pin is the group wait in <see cref="Reaper"/>.</remarks>
    private static bool KillTreeAndWait(Process process, TimeSpan bound)
    {
        process.Kill(entireProcessTree: true);
        return process.WaitForExit(bound);
    }

    /// <summary>How long the <see cref="Reaper"/> waits for a killed tree to end before it gives up and fails the test.</summary>
    private static readonly TimeSpan EndBound = TimeSpan.FromSeconds(15);

    /// <summary>
    /// The state of a child started here: the registered folders its arguments or environment name, its own temp folder, and its process group. The tie to a folder
    /// ends in ONE place, <see cref="TryEnd"/>, only when the direct child has exited AND no member of its group is left; the body runs under the child's lock, so a
    /// caller that loses the race waits for the one that wins it.
    /// </summary>
    private sealed class Child(OwnedDir? temp, Action? duringEnd)
    {
        private readonly Lock _gate = new();
        private readonly List<Folder> _tied = [];
        private volatile bool _exited;
        private volatile bool _ended;
        private int _group;

        public int Pid { get; private set; }

        public IReadOnlyList<Folder> Tied
        {
            get
            {
                lock (_gate) return [.. _tied];
            }
        }

        public string? TempPath => temp?.Path;

        public void AddTied(Folder folder)
        {
            lock (_gate) _tied.Add(folder);
        }

        public void Attach(int pid, bool ownGroup)
        {
            Pid = pid;
            _group = ownGroup ? pid : 0;
        }

        /// <summary>The process never started: nothing runs, so the ties end now.</summary>
        public void Abandon()
        {
            MarkExited();
            _ = TryEnd(TimeSpan.Zero);
        }

        public void MarkExited() => _exited = true;

        /// <summary>SIGKILL to every member of the child's group (the tree kill finds only the descendants whose parent link is still there).</summary>
        public void KillGroup()
        {
            if (_group > 1) _ = KillNative(-_group, 9);
        }

        /// <summary>The direct child has exited and nothing is left of its group (zombies do not count: they hold nothing).</summary>
        private bool GroupGone() => _group <= 1 || !GroupHasMember(_group);

        /// <summary>The end of the tie: the direct child exited, its group is empty (waited for at most <paramref name="groupWait"/>), then the child's own temp folder goes.
        /// True once it has ended - whoever ended it; a caller that lost the race returns only after the winner has finished.</summary>
        public bool TryEnd(TimeSpan groupWait)
        {
            if (!_exited) return false;
            var waited = Stopwatch.StartNew();
            while (!GroupGone())
            {
                if (waited.Elapsed >= groupWait) return false;
                Thread.Sleep(25);
            }

            lock (_gate)
            {
                if (_ended) return true;
                duringEnd?.Invoke();
                temp?.Dispose(); // never throws; a removal that gives up stays in the helper's registry, so the audit names it
                _ended = true;
                return true;
            }
        }
    }

    [LibraryImport("libc", EntryPoint = "kill", SetLastError = true)]
    private static partial int KillNative(int pid, int signal);

    /// <summary>Is any live process (not a zombie) in group <paramref name="group"/>? Linux reads <c>/proc</c>, which can tell a zombie; elsewhere <c>kill(-group, 0)</c>.</summary>
    private static bool GroupHasMember(int group)
    {
        if (!OperatingSystem.IsLinux())
        {
            return KillNative(-group, 0) == 0 || Marshal.GetLastPInvokeError() == 1; // EPERM: it exists and is not ours to signal
        }

        foreach (var dir in Directory.EnumerateDirectories("/proc"))
        {
            if (!int.TryParse(Path.GetFileName(dir), out _)) continue;
            try
            {
                // pid (comm) state ppid pgrp ...: comm may hold spaces and parentheses, so the fields start after the LAST ')'.
                var stat = File.ReadAllText(Path.Combine(dir, "stat"));
                var fields = stat[(stat.LastIndexOf(')') + 2)..].Split(' ');
                if (fields[0] is not ("Z" or "X") && int.TryParse(fields[2], out var pgrp) && pgrp == group) return true;
            }
            catch (Exception e) when (e is IOException or UnauthorizedAccessException or ArgumentOutOfRangeException or IndexOutOfRangeException)
            {
                // The process ended while it was read: it is not a member any more.
            }
        }

        return false;
    }

    private sealed class Reaper(Process process, Child? child, Func<Process, TimeSpan, bool> killAndWait) : IDisposable
    {
        /// <summary>Kill the tree, then the rest of the child's group, then wait (bounded, not for the pipes) for the direct child's exit and for the group to be empty.
        /// Confirmed: the tie ends. Not confirmed: the tie stays and ONE exception names the pid and the folders, so the test fails visibly and the audit names the folders.</summary>
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

            if (confirmed && child is not null)
            {
                child.MarkExited();
                child.KillGroup();
                confirmed = child.TryEnd(EndBound);
            }

            if (!confirmed)
            {
                throw new InvalidOperationException(
                    $"host-process: the end of process {child?.Pid ?? process.Id} and of its group was not confirmed within {EndBound.TotalSeconds:0} s of the kill"
                    + (child is { Tied.Count: > 0 } ? $"; its folder(s) stay: {string.Join(", ", child.Tied.Select(f => f.Path))}" : string.Empty));
            }
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

    /// <summary>A registered folder, with the children tied to it. Its gate makes "is a child tied?" and "take it out" ONE step, and "tie a new child" another that
    /// cannot run between them.</summary>
    private sealed class Folder(OwnedDir dir)
    {
        private readonly List<Child> _children = [];

        public Lock Gate { get; } = new();

        public OwnedDir Dir { get; } = dir;

        public string Path => Dir.Path;

        /// <summary>Under <see cref="Gate"/>.</summary>
        public void Tie(Child child) => _children.Add(child);

        /// <summary>Under <see cref="Gate"/>: is a child still running (or its group not empty)? Waits at most <paramref name="groupWait"/> for a group to empty.</summary>
        public bool IsTied(TimeSpan groupWait)
        {
            _children.RemoveAll(child => child.TryEnd(groupWait));
            return _children.Count > 0;
        }
    }

    /// <summary>Every folder <see cref="TempDirectory"/> made and <see cref="Remove"/> has not yet taken out, by path. The take-out is ONE step with the tie check, under the
    /// folder's gate: only the call that won it disposes. A disposal that gives up stays in <see cref="OwnedDir"/>'s own registry, where the audit sees it.</summary>
    private static readonly ConcurrentDictionary<string, Folder> Folders = new(PathComparer);

    private static readonly ConditionalWeakTable<Process, Child> Children = [];

    private static StringComparer PathComparer => OperatingSystem.IsWindows() ? StringComparer.OrdinalIgnoreCase : StringComparer.Ordinal;

    /// <summary>Tie the child to each registered folder that an argument or an environment value names or lies under (the callers pass the folder itself, or a path in it).
    /// A folder taken out meanwhile is not tied: its child names a path that is gone, and no tie may point at a disposed folder.</summary>
    private static void TieToFolders(Child child, IReadOnlyList<string> args, IReadOnlyDictionary<string, string> env)
    {
        var comparison = OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal;
        var values = args.Concat(env.Values).ToList();
        foreach (var folder in Folders.Values.ToArray())
        {
            // Names are unique per run (a random id ends each one), so containment cannot name a folder by accident.
            if (!values.Any(value => value.Contains(folder.Path, comparison))) continue;
            lock (folder.Gate)
            {
                if (!Folders.TryGetValue(folder.Path, out var live) || !ReferenceEquals(live, folder)) continue;
                folder.Tie(child);
                child.AddTied(folder);
            }
        }
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
    /// whose child (or any process of the child's group) has not ended are each ONE warning and nothing removed. A disposal that gives up is warned about by the folder itself, keeps
    /// folder and claim, and stays in the helper's registry, so the end-of-run audit fails the run. <paramref name="onDispose"/> sees the path
    /// of each disposal just before it starts (a test's counting and ordering hook); <paramref name="afterTieCheck"/> runs between the tie check and the take-out.</summary>
    internal static void Remove(string path, Action<string>? warn = null, Action<string>? onDispose = null, Action? afterTieCheck = null)
    {
        warn ??= Owned.DefaultWarn;
        if (!Folders.TryGetValue(path, out var folder))
        {
            warn($"host-process: {path} was not given by TempDirectory, or was already removed - left alone");
            return;
        }

        lock (folder.Gate)
        {
            if (folder.IsTied(GroupWait))
            {
                warn($"host-process: {path} is kept - a child started with it, or a process of its group, has not ended; it stays registered, so the audit names it");
                return;
            }

            afterTieCheck?.Invoke();
            if (!Folders.TryRemove(path, out _))
            {
                warn($"host-process: {path} was not given by TempDirectory, or was already removed - left alone");
                return;
            }

            onDispose?.Invoke(path);
            folder.Dir.Dispose();
        }
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
