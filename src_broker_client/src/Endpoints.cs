using System.Text.Json;
using System.Text.Json.Serialization;

namespace CredsBroker;

/// <summary>One VS Code window, as it announced itself.</summary>
public sealed record Endpoint(
    [property: JsonPropertyName("pid")] int Pid,
    [property: JsonPropertyName("port")] int Port,
    [property: JsonPropertyName("socket")] string? Socket,
    [property: JsonPropertyName("startedAt")] string StartedAt,
    /// <summary>Where that window's SSH agent listens, when a key is loaded and it is up.</summary>
    /// <remarks>
    /// Absent most of the time: the agent starts on the first key and stops on the last, and the
    /// window re-announces on both edges. A relay treats it as a hint, never a promise — what
    /// decides is whether the connection opens.
    /// </remarks>
    [property: JsonPropertyName("agentSocket")] string? AgentSocket = null);

/// <summary>
/// Finding a window when the caller has a name rather than a token.
/// </summary>
/// <remarks>
/// <para>A grant token carries its own port, so token calls need no discovery at all and this is
/// not used for them — that remains the better path and the reason no services file existed
/// before. Aliases have no port to carry, hence these files.</para>
/// <para><b>Nothing here is trusted.</b> A window that crashed cannot delete its own note, so a
/// stale entry is the normal case; the file says only where something once listened. What
/// decides is the unauthenticated health probe, exactly as it does for a token — the OS reissues
/// port numbers, and a freed port can belong to anything by the time we dial it.</para>
/// </remarks>
public static class Endpoints
{
    /// <summary>
    /// Where the extension keeps its per-window notes.
    /// </summary>
    /// <remarks>
    /// VS Code's <c>globalStorage</c> path differs per platform and per flavour (Code, Insiders,
    /// VSCodium), so an override exists and is documented rather than a guess being buried. The
    /// defaults cover the ordinary install of stable VS Code, which is what most people have.
    /// </remarks>
    public const string DirectoryOverrideVariable = "CREDS_ENDPOINT_DIR";

    public static string? DirectoryFor(
        string? overrideValue,
        string? appData,
        string? home,
        bool isWindows)
    {
        if (!string.IsNullOrWhiteSpace(overrideValue))
        {
            return overrideValue;
        }

        var root = isWindows
            ? appData
            : (home is null ? null : Path.Combine(home, ".config"));

        return string.IsNullOrWhiteSpace(root)
            ? null
            : Path.Combine(root, "Code", "User", "globalStorage", "remsoftdev.creds-for-devs", "endpoints");
    }

    public static string? DirectoryHere() =>
        DirectoryFor(
            Environment.GetEnvironmentVariable(DirectoryOverrideVariable),
            Environment.GetEnvironmentVariable("APPDATA"),
            Environment.GetEnvironmentVariable("HOME"),
            OperatingSystem.IsWindows());

    /// <summary>Every announcement that parses, newest first. Never throws.</summary>
    public static IReadOnlyList<Endpoint> Read(string? directory)
    {
        if (directory is null || !Directory.Exists(directory))
        {
            return [];
        }

        var found = new List<Endpoint>();
        foreach (var file in SafeFiles(directory))
        {
            var endpoint = ParseOne(file);
            if (endpoint is not null)
            {
                found.Add(endpoint);
            }
        }

        // Newest first: the window a person just opened is the one they mean.
        found.Sort((a, b) => string.CompareOrdinal(b.StartedAt, a.StartedAt));
        return found;
    }

    /// <summary>The announcements a walk should probe: <see cref="Read"/>, minus the windows whose process is provably gone.</summary>
    public static IReadOnlyList<Endpoint> ReadLive(string? directory) => Live(Read(directory));

    /// <summary>
    /// These announcements, minus the windows whose process is provably gone — in the same order. Never touches a file.
    /// </summary>
    /// <remarks>
    /// <para>Measured on the reporting machine (research/PLAN_stale_endpoint_files_slow_every_refusal.md §3): 33 of 35
    /// announcements named a pid that no longer existed, and every walk dialled each one. A pid that is gone cannot be a
    /// live window, so it costs no probe here. Every other announcement is left for the health probe to decide, exactly
    /// as before — a REUSED pid (one of the 35 was) is still probed, and the probe still refuses a port that is not ours.</para>
    /// <para>The pid namespace is the right one: the extension host that wrote the file and the walk that reads it run on
    /// the same machine (under WSL the walk runs in the Windows binary). An announcement with no pid of its own — the
    /// Remote-SSH socket the CLI builds, pid 0 — is never filtered.</para>
    /// <para>Deleting the file is not this method's business: the folder is the extension's, and it sweeps it itself.</para>
    /// </remarks>
    public static IReadOnlyList<Endpoint> Live(IReadOnlyList<Endpoint> endpoints) =>
        [.. endpoints.Where(endpoint => !PidIsGone(endpoint.Pid))];

    /// <summary>
    /// True only when no process with this pid exists any more. Anything short of that proof — running, access denied,
    /// an unexpected error, no pid at all — is NOT gone.
    /// </summary>
    /// <remarks>
    /// <c>Process.GetProcessById</c> throws <see cref="ArgumentException"/> for a pid that is not running; a process that
    /// still has a handle open somewhere but has exited answers <c>HasExited</c>. A process this user may not open (the
    /// System process, another session's window) throws something else, and stays — reading "cannot open" as "gone"
    /// would skip a live window.
    /// </remarks>
    public static bool PidIsGone(int pid)
    {
        if (pid <= 0)
        {
            return false;
        }

        try
        {
            using var process = System.Diagnostics.Process.GetProcessById(pid);
            return process.HasExited;
        }
        catch (ArgumentException)
        {
            return true;
        }
        catch (Exception e) when (e is InvalidOperationException or System.ComponentModel.Win32Exception or NotSupportedException or UnauthorizedAccessException)
        {
            return false;
        }
    }

    private static string[] SafeFiles(string directory)
    {
        try
        {
            return Directory.GetFiles(directory, "window-*.json");
        }
        catch (IOException)
        {
            return [];
        }
        catch (UnauthorizedAccessException)
        {
            return [];
        }
    }

    private static Endpoint? ParseOne(string file)
    {
        try
        {
            // A half-written file from a window killed mid-announce is normal, not an error.
            var endpoint = JsonSerializer.Deserialize(File.ReadAllText(file), BrokerJsonContext.Default.Endpoint);
            return endpoint is { Port: > 0 and <= 65535, Pid: > 0 } ? endpoint : null;
        }
        catch (Exception e) when (e is JsonException or IOException or UnauthorizedAccessException)
        {
            return null;
        }
    }
}
