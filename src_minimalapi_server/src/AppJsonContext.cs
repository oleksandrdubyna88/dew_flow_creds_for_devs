using System.Text.Json.Serialization;

namespace CredVaultServer;

/// <summary>Simple named payloads that used to be anonymous types — a source-generated
/// serializer cannot see an anonymous type, and AOT has no reflection to fall back to.</summary>
public sealed record ErrorDto(string Error);

public sealed record HealthDto(string Status, string Service, string Storage);

/// <summary>
/// What a client has to know BEFORE it can authenticate, and nothing else.
///
/// <para>Exactly one field, deliberately. The Microsoft scope is not a secret — a
/// client id appears in every authorization URL and in the audience claim of every
/// token this server accepts — but the temptation on an endpoint like this is to add
/// "just one more" useful value, and the next one would be the allowed email domains.
/// That IS a secret in the only sense that matters: it tells an attacker whose
/// addresses this server entertains. One field, and the reason it is one field.</para>
/// </summary>
public sealed record ClientConfigDto(string MicrosoftScope);

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
[JsonSerializable(typeof(MetricsDto))]
[JsonSerializable(typeof(ClientConfigDto))]
[JsonSerializable(typeof(WhoAmIDto))]
[JsonSerializable(typeof(List<TeamMemberDto>))]
[JsonSerializable(typeof(ShareRequest))]
[JsonSerializable(typeof(ShareItem))]
[JsonSerializable(typeof(List<ShareItem>))]
[JsonSerializable(typeof(SentShare))]
[JsonSerializable(typeof(List<SentShare>))]
[JsonSerializable(typeof(OrgRecoveryConfigDto))]
[JsonSerializable(typeof(EscrowInviteItem))]
[JsonSerializable(typeof(EscrowInviteRequest))]
[JsonSerializable(typeof(List<EscrowInviteItem>))]
[JsonSerializable(typeof(SetupStatusDto))]
[JsonSerializable(typeof(PublishSetupRequest))]
[JsonSerializable(typeof(OrgRecoverySetup))]
[JsonSerializable(typeof(CeremonyRecord))]
[JsonSerializable(typeof(RecoverySession))]
[JsonSerializable(typeof(RecoverySessionDto))]
[JsonSerializable(typeof(SessionContribution))]
[JsonSerializable(typeof(StartSessionRequest))]
[JsonSerializable(typeof(ContributeRequest))]
[JsonSerializable(typeof(AuditEntryDto))]
public sealed partial class AppJsonContext : JsonSerializerContext;

/// <summary>The instance file's contract, indented for the human who opens it.</summary>
[JsonSourceGenerationOptions(WriteIndented = true, PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(PublishedInstance))]
public sealed partial class InstanceJsonContext : JsonSerializerContext;
