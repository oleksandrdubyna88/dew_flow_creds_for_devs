using System.Text.Json.Serialization;

namespace CredsBroker;

/// <summary>
/// The types this library itself reads off the wire, declared for the source generator.
/// </summary>
/// <remarks>
/// <para>Native AOT has no reflection-based <c>JsonSerializer</c>, and both binaries that
/// reference this library set <c>JsonSerializerIsReflectionEnabledByDefault=false</c> so that
/// reaching for one is a compile-time error rather than a crash on a user's machine.</para>
/// <para><b>Only four types, and deliberately so.</b> A context is not a place to collect every
/// payload in the product: what belongs here is what this library deserializes on its own —
/// the contract file, the health probe, and a window's announcement. Each binary keeps its own
/// context for the requests and responses only it sends, so adding a verb to one of them cannot
/// make the other's binary any larger.</para>
/// </remarks>
[JsonSourceGenerationOptions(PropertyNameCaseInsensitive = false)]
[JsonSerializable(typeof(BrokerContract))]
[JsonSerializable(typeof(HealthRoute))]
[JsonSerializable(typeof(HealthResponse))]
[JsonSerializable(typeof(Endpoint))]
[JsonSerializable(typeof(Dictionary<string, int>))]
[JsonSerializable(typeof(Dictionary<string, string>))]
public sealed partial class BrokerJsonContext : JsonSerializerContext;

/// <summary>The unauthenticated probe a client makes before a token ever leaves the process.</summary>
public sealed record HealthResponse(
    [property: JsonPropertyName("ok")] bool Ok,
    [property: JsonPropertyName("service")] string? Service);
