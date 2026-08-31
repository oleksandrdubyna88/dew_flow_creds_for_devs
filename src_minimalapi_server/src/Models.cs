using System.Text.Json.Serialization;

namespace CredVaultServer;

/// <summary>
/// One encrypted share sitting in a recipient's inbox. Everything except
/// `Data` (plus salt/iv/tag) is plaintext metadata so the recipient can see
/// who sent what BEFORE decrypting; the payload itself is AES-256-GCM
/// ciphertext produced on the sender's machine.
/// `From*` fields are stamped by the SERVER from the verified token, so the
/// sender identity cannot be forged (unlike the file-share transport).
/// </summary>
public sealed record ShareItem
{
    [JsonPropertyName("id")] public string Id { get; init; } = Guid.NewGuid().ToString();
    [JsonPropertyName("fromEmail")] public string FromEmail { get; init; } = "";
    [JsonPropertyName("fromName")] public string? FromName { get; init; }
    [JsonPropertyName("toEmail")] public string ToEmail { get; init; } = "";
    [JsonPropertyName("entityName")] public string EntityName { get; init; } = "";
    [JsonPropertyName("entityKind")] public string EntityKind { get; init; } = "credential";
    [JsonPropertyName("createdAt")] public long CreatedAt { get; init; }
    [JsonPropertyName("salt")] public string Salt { get; init; } = "";
    [JsonPropertyName("iv")] public string Iv { get; init; } = "";
    [JsonPropertyName("tag")] public string Tag { get; init; } = "";
    [JsonPropertyName("data")] public string Data { get; init; } = "";
    // scrypt params of the client-sealed payload (opaque to the server).
    [JsonPropertyName("kdfN")] public int? KdfN { get; init; }
    [JsonPropertyName("kdfR")] public int? KdfR { get; init; }
    [JsonPropertyName("kdfP")] public int? KdfP { get; init; }

    /// <summary>
    /// Which fields the client bound into the payload's GCM additional authenticated data.
    /// </summary>
    /// <remarks>
    /// <para>Carried verbatim and never read: like the scrypt parameters above, it is a number the
    /// sender needs the recipient to see and the server has no opinion about. Dropping it is not a
    /// harmless omission — the recipient cannot choose the right AAD without it, and until contract
    /// 2 this field did not exist, so every share posted here between extension 0.82.1 and 0.87
    /// arrived unopenable and was reported as sent by an extension that was too old.</para>
    /// <para><b>Omitted rather than written as <c>null</c>, and that is not cosmetic.</b> A client
    /// older than contract 2 sends no format, and its own <c>isShareItem</c> guard accepts the
    /// field as a number or as ABSENT — a JSON <c>null</c> is neither, so it drops the whole item
    /// and the recipient's inbox reads as empty rather than as unopenable. Every released
    /// extension is such a client, so a server that wrote the null would hide their shares on the
    /// day it was deployed. The wire shape for a client that sends nothing stays byte-identical to
    /// contract 1.</para>
    /// </remarks>
    [JsonPropertyName("format")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? Format { get; init; }
}

/// <summary>What a client POSTs to share one entity with one person.</summary>
public sealed record ShareRequest
{
    public string ToEmail { get; init; } = "";
    public string EntityName { get; init; } = "";
    public string EntityKind { get; init; } = "credential";
    public string Salt { get; init; } = "";
    public string Iv { get; init; } = "";
    public string Tag { get; init; } = "";
    public string Data { get; init; } = "";
    public int? KdfN { get; init; }
    public int? KdfR { get; init; }
    public int? KdfP { get; init; }

    /// <summary>Which fields the client bound as AAD — carried through, never interpreted.</summary>
    public int? Format { get; init; }

    public bool IsValid() =>
        !string.IsNullOrWhiteSpace(ToEmail)
        && ToEmail.Contains('@')
        && !string.IsNullOrWhiteSpace(EntityName)
        && EntityKind.Length <= 64
        && IsBase64(Salt)
        && IsBase64(Iv)
        && IsBase64(Tag)
        && IsBase64(Data);

    private static bool IsBase64(string value) =>
        !string.IsNullOrWhiteSpace(value) && Convert.TryFromBase64String(value, new byte[value.Length], out _);

    /// <summary>
    /// Every field the client controls, for the size cap.
    ///
    /// <para>It used to count the sealed fields and the entity name. <c>EntityKind</c> was
    /// left out because it is never routed on and never hashed into a path — but a field
    /// nobody counts is a field an attacker fills. Padding it kept <c>ToEmail</c> pointing
    /// at a real colleague while slipping past <c>MaxShareBytes</c> entirely, bounded only
    /// by Kestrel's global body limit, into an inbox that holds 500 of them.</para>
    /// </summary>
    public long PayloadBytes() =>
        (long)Salt.Length + Iv.Length + Tag.Length + Data.Length
        + EntityName.Length + EntityKind.Length + ToEmail.Length;
}

/// <summary>
/// The sender's own receipt for one share they posted — what they sent, to whom, and when.
/// </summary>
/// <remarks>
/// <para><b>A receipt, never a second copy.</b> It carries no <c>salt</c>, <c>iv</c>, <c>tag</c>
/// or <c>data</c>: the sealed payload exists once, in the recipient's inbox. Putting it here too
/// would double the exposure of every share to buy a listing nobody needs it for.</para>
/// <para>It exists so a sender can find the id of something they sent, which is the one thing
/// that made withdrawal impossible before — the inbox is keyed by the RECIPIENT, so the sender
/// could neither see nor name what was waiting there. Listing a sender's own actions to that
/// sender discloses nothing new; scanning every inbox for their name would have.</para>
/// </remarks>
public sealed record SentShare
{
    [JsonPropertyName("id")] public string Id { get; init; } = "";
    [JsonPropertyName("toEmail")] public string ToEmail { get; init; } = "";
    [JsonPropertyName("entityName")] public string EntityName { get; init; } = "";
    [JsonPropertyName("entityKind")] public string EntityKind { get; init; } = "";
    [JsonPropertyName("createdAt")] public long CreatedAt { get; init; }
}

/// <summary>A person discoverable in this deployment.</summary>
public sealed record TeamMemberDto(string Email);

public sealed record WhoAmIDto(string Email, string? Name, bool HasVault);

/// <summary>
/// What a client requires to be true before its vault write is accepted.
///
/// <para>
/// Both forms come straight from HTTP so no vocabulary is invented: <c>If-Match</c>
/// with a version means "only if the vault is still what I read", and
/// <c>If-None-Match: *</c> means "only if I am the first to write one".
/// </para>
/// </summary>
public readonly record struct VaultPrecondition(string? IfMatch, bool RequireAbsent)
{
    /// <summary>No precondition — the older clients that predate conditional writes.</summary>
    public static readonly VaultPrecondition None = new(null, false);

    public bool IsUnconditional => IfMatch is null && !RequireAbsent;

    /// <summary>Reads the two conditional headers off a request.</summary>
    public static VaultPrecondition FromHeaders(string? ifMatch, string? ifNoneMatch)
    {
        var requireAbsent = string.Equals(ifNoneMatch?.Trim(), "*", StringComparison.Ordinal);
        var match = string.IsNullOrWhiteSpace(ifMatch) ? null : ifMatch.Trim();
        return new VaultPrecondition(match, requireAbsent);
    }
}
