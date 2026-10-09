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
        return Process.Start(start) ?? throw new InvalidOperationException($"{assemblyName} did not start");
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
