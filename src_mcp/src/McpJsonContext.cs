using System.Text.Json.Serialization;

namespace CredsMcp;

/// <summary>
/// The shapes this binary reads off the broker and hands back to an agent.
/// </summary>
/// <remarks>
/// <para>Its own context, not the CLI's: each binary declares the payloads only it sends, so a
/// tool added here cannot make <c>creds</c> any larger. The four protocol types both share live
/// in the broker client library's context.</para>
/// <para><b>There is no field here a secret could travel in</b>, which is the same structural
/// rule the broker keeps on its side. A password, a private key, a VPN config and a TOTP seed
/// have no property to arrive in; the connection string arrives with its password already
/// removed, by the window, before it is on the wire at all.</para>
/// </remarks>
[JsonSourceGenerationOptions(PropertyNameCaseInsensitive = false, WriteIndented = false)]
[JsonSerializable(typeof(McpEntriesResponse))]
[JsonSerializable(typeof(McpEntry))]
[JsonSerializable(typeof(McpCapabilities))]
[JsonSerializable(typeof(McpEntry[]))]
[JsonSerializable(typeof(McpFoldersResponse))]
[JsonSerializable(typeof(McpFolder))]
[JsonSerializable(typeof(McpFolderCapabilities))]
[JsonSerializable(typeof(McpFolder[]))]
[JsonSerializable(typeof(ToolFailure))]
[JsonSerializable(typeof(BrokerErrorEnvelope))]
[JsonSerializable(typeof(BrokerErrorDetail))]
[JsonSerializable(typeof(Dictionary<string, string>))]
internal sealed partial class McpJsonContext : JsonSerializerContext;

/// <summary>What <c>GET /v1/mcp/entries</c> answers with.</summary>
internal sealed record McpEntriesResponse(
    [property: JsonPropertyName("entries")] McpEntry[]? Entries);

/// <summary>
/// One entry a person opened to agents.
/// </summary>
/// <remarks>
/// Mirrors <c>mcpEntries.ts</c> field for field. A property this build does not know is dropped
/// on the way in rather than refused: a window running a newer extension must not become an
/// unreadable window.
/// </remarks>
internal sealed record McpEntry(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("kind")] string Kind,
    [property: JsonPropertyName("folder")] string Folder,
    [property: JsonPropertyName("host")] string? Host,
    [property: JsonPropertyName("port")] int? Port,
    [property: JsonPropertyName("user")] string? User,
    [property: JsonPropertyName("dbType")] string? DbType,
    [property: JsonPropertyName("connectionString")] string? ConnectionString,
    [property: JsonPropertyName("vpnType")] string? VpnType,
    [property: JsonPropertyName("command")] string? Command,
    [property: JsonPropertyName("scriptLanguage")] string? ScriptLanguage,
    [property: JsonPropertyName("hasPassword")] bool HasPassword,
    [property: JsonPropertyName("hasPrivateKey")] bool HasPrivateKey,
    [property: JsonPropertyName("hasNotes")] bool HasNotes,
    [property: JsonPropertyName("hasTotp")] bool HasTotp,
    [property: JsonPropertyName("dependsOn")] string[]? DependsOn,
    [property: JsonPropertyName("can")] McpCapabilities? Can);

/// <summary>What may be done with an entry beyond looking at it.</summary>
internal sealed record McpCapabilities(
    [property: JsonPropertyName("use")] bool Use,
    [property: JsonPropertyName("edit")] bool Edit,
    [property: JsonPropertyName("create")] bool Create,
    [property: JsonPropertyName("delete")] bool Delete);

/// <summary>
/// What a tool answers when it cannot do its job.
/// </summary>
/// <remarks>
/// A shape rather than a thrown exception, because an MCP client shows a tool error to the model
/// and the model has to be able to act on it. "No CredsForDevs window is open" is a thing a
/// person can fix in two seconds if the sentence says so; a stack trace is not.
/// </remarks>
internal sealed record ToolFailure(
    [property: JsonPropertyName("error")] string Error,
    [property: JsonPropertyName("hint")] string Hint);

/// <summary>
/// The broker's refusal, as it comes off the wire.
/// </summary>
/// <remarks>
/// Read rather than re-worded: the window already says the useful thing — which switch to turn
/// on, that the person declined, that this kind of entry has no such action. A second set of
/// sentences here would be a second set to keep correct, and the copy is always the vague one.
/// </remarks>
internal sealed record BrokerErrorEnvelope(
    [property: JsonPropertyName("error")] BrokerErrorDetail? Error);

internal sealed record BrokerErrorDetail(
    [property: JsonPropertyName("code")] string? Code,
    [property: JsonPropertyName("message")] string? Message);

/// <summary>What <c>GET /v1/mcp/folders</c> answers with.</summary>
internal sealed record McpFoldersResponse(
    [property: JsonPropertyName("folders")] McpFolder[]? Folders);

/// <summary>
/// One folder a person opened to agents.
/// </summary>
/// <remarks>
/// No secret half to leave out: a folder holds none. What limits this list is only what somebody
/// opened, which is why every field here is present unconditionally.
/// </remarks>
internal sealed record McpFolder(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("parent")] string? Parent,
    [property: JsonPropertyName("folderType")] string? FolderType,
    [property: JsonPropertyName("can")] McpFolderCapabilities? Can);

/// <summary>What may be done to a folder beyond seeing that it exists.</summary>
internal sealed record McpFolderCapabilities(
    [property: JsonPropertyName("create")] bool Create,
    [property: JsonPropertyName("edit")] bool Edit,
    [property: JsonPropertyName("delete")] bool Delete);
