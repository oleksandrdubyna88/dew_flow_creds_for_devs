using System.Text.Json.Serialization;

namespace CredVaultServer;

/// <summary>Simple named payloads that used to be anonymous types — a source-generated
/// serializer cannot see an anonymous type, and AOT has no reflection to fall back to.</summary>
public sealed record ErrorDto(string Error);

public sealed record HealthDto(string Status, string Service, string Storage);

/// <summary>
/// The one <see cref="System.Text.Json"/> contract for the whole server.
///
/// <para>Source-generated so the binary can be published Native AOT: the reflection
/// serializer is the single biggest AOT blocker in a minimal API, and generating the
/// contract at compile time removes it while making every JIT build faster too. Every
/// type that crosses HTTP or lands on disk is listed here — a type that is not listed
/// fails at RUNTIME with "metadata not found", which is why the tests exercise every
/// endpoint rather than trusting the list.</para>
/// </summary>
[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(ErrorDto))]
[JsonSerializable(typeof(HealthDto))]
[JsonSerializable(typeof(WhoAmIDto))]
[JsonSerializable(typeof(List<TeamMemberDto>))]
[JsonSerializable(typeof(ShareRequest))]
[JsonSerializable(typeof(ShareItem))]
[JsonSerializable(typeof(List<ShareItem>))]
public sealed partial class AppJsonContext : JsonSerializerContext;

/// <summary>The instance file's contract, indented for the human who opens it.</summary>
[JsonSourceGenerationOptions(WriteIndented = true, PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(PublishedInstance))]
public sealed partial class InstanceJsonContext : JsonSerializerContext;
