using System.Text.Json;
using System.Text.Json.Serialization;

namespace CredsCli;

/// <summary>One VS Code window, as it announced itself.</summary>
internal sealed record Endpoint(
    [property: JsonPropertyName("pid")] int Pid,
    [property: JsonPropertyName("port")] int Port,
    [property: JsonPropertyName("socket")] string? Socket,
    [property: JsonPropertyName("startedAt")] string StartedAt);

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
internal static class Endpoints
{
    /// <summary>
    /// Where the extension keeps its per-window notes.
    /// </summary>
    /// <remarks>
    /// VS Code's <c>globalStorage</c> path differs per platform and per flavour (Code, Insiders,
    /// VSCodium), so an override exists and is documented rather than a guess being buried. The
    /// defaults cover the ordinary install of stable VS Code, which is what most people have.
    /// </remarks>
    internal const string DirectoryOverrideVariable = "CREDS_ENDPOINT_DIR";

    internal static string? DirectoryFor(
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

    internal static string? DirectoryHere() =>
        DirectoryFor(
            Environment.GetEnvironmentVariable(DirectoryOverrideVariable),
            Environment.GetEnvironmentVariable("APPDATA"),
            Environment.GetEnvironmentVariable("HOME"),
            OperatingSystem.IsWindows());

    /// <summary>Every announcement that parses, newest first. Never throws.</summary>
    internal static IReadOnlyList<Endpoint> Read(string? directory)
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
            var endpoint = JsonSerializer.Deserialize(File.ReadAllText(file), CredsJsonContext.Default.Endpoint);
            return endpoint is { Port: > 0 and <= 65535, Pid: > 0 } ? endpoint : null;
        }
        catch (Exception e) when (e is JsonException or IOException or UnauthorizedAccessException)
        {
            return null;
        }
    }
}
