using System.Text.Json;
using System.Text.Json.Serialization;

namespace CredVaultServer;

/// <summary>One address this host serves, named the way a human would ask for it.</summary>
public sealed record PublishedApp(
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("url")] string Url);

/// <summary>Where a running instance is, as it published it.</summary>
public sealed record PublishedInstance(
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("url")] string Url,
    [property: JsonPropertyName("pid")] int ProcessId,
    [property: JsonPropertyName("startedUtc")] DateTimeOffset StartedUtc,
    [property: JsonPropertyName("apps")] IReadOnlyList<PublishedApp> Apps);

/// <summary>
/// Publishes this process's address to a well-known file so the DewFlow editor panel can
/// show a locally running server the same way it shows the other hosts in the family.
///
/// <para>
/// The convention is `dew_flow_rag_qln · src/ServiceDefaults/DaemonEndpointFile.cs`, and it is
/// deliberately copied rather than reinvented: same directory, same JSON shape, same
/// best-effort semantics. The one difference is the FILENAME. That daemon owns
/// <c>dew-flow/daemon.json</c>; a second product writing there would overwrite it and the
/// panel would show one host where two are running. Every other service publishes under
/// <c>dew-flow/services/&lt;name&gt;.json</c> instead.
/// </para>
///
/// <para>
/// <b>Why a file and not a fixed port.</b> The port is assigned per run — by an orchestrator, by
/// <c>ASPNETCORE_URLS</c>, or by whatever the operator typed. A reader that hardcodes one is
/// wrong the first time somebody looks.
/// </para>
///
/// <para>
/// <b>Staleness is the reader's problem, deliberately.</b> A killed process cannot delete its own
/// file, so the contents are a hint the reader confirms by asking. That is why the file carries a
/// pid and no status field: a status written by a process that has since died is worse than none.
/// </para>
/// </summary>
public static class InstanceFile
{
    private const string ServiceName = "cred-vault-server";

    private static readonly JsonSerializerOptions Json = new() { WriteIndented = true };

    /// <summary>Per-user, not per-checkout: an editor window opened anywhere has to find it.</summary>
    public static string Path { get; } = System.IO.Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "dew-flow",
        "services",
        $"{ServiceName}.json");

    /// <summary>
    /// Publishes this process's address. Best-effort in every direction: an unwritable profile
    /// directory, a container with no home, a read-only filesystem — none of them may keep the
    /// server from serving. Discovery degrades; the product does not.
    /// </summary>
    public static void Publish(string url)
    {
        if (string.IsNullOrWhiteSpace(url))
        {
            // No bound address means an in-process test server. Publishing then would point the
            // panel at nothing and, worse, scribble on the developer's real profile during a
            // test run.
            return;
        }

        try
        {
            var instance = new PublishedInstance(
                ServiceName,
                url.TrimEnd('/'),
                Environment.ProcessId,
                DateTimeOffset.UtcNow,
                [new PublishedApp("Health", $"{url.TrimEnd('/')}/api/health")]);

            Directory.CreateDirectory(System.IO.Path.GetDirectoryName(Path)!);
            File.WriteAllText(Path, JsonSerializer.Serialize(instance, Json));
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or NotSupportedException)
        {
            // Nothing to do and nothing worth failing over.
        }
    }

    /// <summary>
    /// Withdraws the file on a graceful stop, so the panel shows "not running" immediately rather
    /// than probing a dead address. A crash cannot do this — which is exactly why the reader treats
    /// the file as a hint.
    /// </summary>
    public static void Withdraw()
    {
        try
        {
            File.Delete(Path);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            // Same.
        }
    }
}
