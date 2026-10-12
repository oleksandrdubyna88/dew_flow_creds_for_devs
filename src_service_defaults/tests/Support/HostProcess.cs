using System.Diagnostics;
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
    internal static Process Start(string assemblyName, IReadOnlyList<string> args, IReadOnlyDictionary<string, string> env)
    {
        var start = new ProcessStartInfo(Binary(assemblyName))
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
        return Process.Start(start) ?? throw new InvalidOperationException($"{assemblyName} did not start");
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
    internal static IDisposable KillOnDispose(Process process) => new Reaper(process);

    private sealed class Reaper(Process process) : IDisposable
    {
        public void Dispose()
        {
            try
            {
                if (!process.HasExited)
                {
                    process.Kill(entireProcessTree: true);
                }
            }
            catch (InvalidOperationException)
            {
                // It exited between the check and the kill — the ordinary race, nothing to do.
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

    /// <summary>A fresh, empty temporary directory.</summary>
    internal static string TempDirectory(string prefix)
    {
        var path = Path.Combine(Path.GetTempPath(), $"{prefix}-{Guid.NewGuid():N}");
        Directory.CreateDirectory(path);
        return path;
    }

    /// <summary>Delete a temporary directory, best effort — a child that is still exiting may hold a file.</summary>
    internal static void Remove(string path)
    {
        try
        {
            Directory.Delete(path, recursive: true);
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            // Left for the OS's temp sweep; a test must not fail on its own cleanup.
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
