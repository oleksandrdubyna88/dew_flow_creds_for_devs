using System.Text.Json.Serialization;

namespace CredsCli;

/// <summary>
/// Every type that crosses the wire or comes out of the contract file, declared for the
/// source generator.
/// </summary>
/// <remarks>
/// Native AOT has no reflection-based <c>JsonSerializer</c>, and the project sets
/// <c>JsonSerializerIsReflectionEnabledByDefault=false</c> so that reaching for one is a
/// compile-time error rather than a crash on a user's machine. Every payload here is small and
/// known, which is what makes that requirement cheap — but it has to be remembered from the
/// first line, not retrofitted.
/// </remarks>
[JsonSourceGenerationOptions(PropertyNameCaseInsensitive = false)]
[JsonSerializable(typeof(BrokerContract))]
[JsonSerializable(typeof(HealthRoute))]
[JsonSerializable(typeof(HealthResponse))]
[JsonSerializable(typeof(ErrorEnvelope))]
[JsonSerializable(typeof(ErrorDetail))]
[JsonSerializable(typeof(ExecResponse))]
[JsonSerializable(typeof(EnvExportResponse))]
[JsonSerializable(typeof(OpenedResponse))]
[JsonSerializable(typeof(ExecRequest))]
[JsonSerializable(typeof(QueryRequest))]
[JsonSerializable(typeof(EmptyRequest))]
[JsonSerializable(typeof(Endpoint))]
[JsonSerializable(typeof(AliasRequest))]
[JsonSerializable(typeof(AliasExecRequest))]
[JsonSerializable(typeof(AliasQueryRequest))]
[JsonSerializable(typeof(AliasListResponse))]
[JsonSerializable(typeof(AliasListEntry))]
[JsonSerializable(typeof(Dictionary<string, int>))]
[JsonSerializable(typeof(Dictionary<string, string>))]
internal sealed partial class CredsJsonContext : JsonSerializerContext;

/// <summary>The unauthenticated probe the CLI makes before a token ever leaves the process.</summary>
internal sealed record HealthResponse(
    [property: JsonPropertyName("ok")] bool Ok,
    [property: JsonPropertyName("service")] string? Service);

internal sealed record ErrorEnvelope([property: JsonPropertyName("error")] ErrorDetail? Error);

internal sealed record ErrorDetail(
    [property: JsonPropertyName("code")] string? Code,
    [property: JsonPropertyName("message")] string? Message);

/// <summary>What a command-shaped action answers: the remote's own output and its own code.</summary>
internal sealed record ExecResponse(
    [property: JsonPropertyName("exitCode")] int? ExitCode,
    [property: JsonPropertyName("stdout")] string? Stdout,
    [property: JsonPropertyName("stderr")] string? Stderr,
    [property: JsonPropertyName("stdoutTruncated")] bool StdoutTruncated,
    [property: JsonPropertyName("stderrTruncated")] bool StderrTruncated,
    [property: JsonPropertyName("timedOut")] bool TimedOut,
    [property: JsonPropertyName("durationMs")] int DurationMs);

/// <summary>Names only. The values are never sent, which is the point of the verb.</summary>
internal sealed record EnvExportResponse(
    [property: JsonPropertyName("written")] string[]? Written);

/// <summary>A terminal or a tunnel: it happened, or the person declined.</summary>
internal sealed record OpenedResponse([property: JsonPropertyName("opened")] bool Opened);

internal sealed record ExecRequest([property: JsonPropertyName("command")] string Command);

internal sealed record QueryRequest([property: JsonPropertyName("query")] string Query);

internal sealed record EmptyRequest;

/// <summary>A call that names its entry rather than holding a token.</summary>
internal sealed record AliasRequest([property: JsonPropertyName("alias")] string Alias);

internal sealed record AliasExecRequest(
    [property: JsonPropertyName("alias")] string Alias,
    [property: JsonPropertyName("command")] string Command);

internal sealed record AliasQueryRequest(
    [property: JsonPropertyName("alias")] string Alias,
    [property: JsonPropertyName("query")] string Query);

/// <summary>What `creds ls` reads: names and kinds, and by design nothing else.</summary>
internal sealed record AliasListResponse(
    [property: JsonPropertyName("aliases")] AliasListEntry[]? Aliases);

internal sealed record AliasListEntry(
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("kind")] string Kind);
