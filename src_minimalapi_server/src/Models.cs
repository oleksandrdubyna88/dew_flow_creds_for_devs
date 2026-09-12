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

    /// <summary>The corporate project this entity came out of, when it came out of one.</summary>
    /// <remarks>
    /// <para>Carried for EVERY sender, whatever their role — <see cref="ShareRule"/> fences developers
    /// with it, epic 4 logs it, and story 4 binds it into the AAD — and interpreted by nobody here.</para>
    /// <para><b>Omitted rather than written as <c>null</c>, for the reason <see cref="Format"/> records
    /// one line above</b>, which is the same trap and cost six days the last time: a released
    /// extension's <c>isShareItem</c> guard accepts a field as a string or as ABSENT, and a JSON
    /// <c>null</c> is neither — the item is dropped and the recipient's inbox reads as empty rather
    /// than as anything a person could investigate. Every client in the field today sends no project,
    /// so this must stay byte-identical for them.</para>
    /// </remarks>
    [JsonPropertyName("projectId")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? ProjectId { get; init; }
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

    /// <summary>
    /// The corporate project the shared entity came out of, when the client can say.
    /// </summary>
    /// <remarks>
    /// <para>Absent from every client released so far, and that is the ordinary case rather than a
    /// fault: <see cref="ShareRule"/> reads a blank one as "no project", and only a DEVELOPER is
    /// refused for it.</para>
    /// <para><b>Counted by <see cref="PayloadBytes"/>.</b> The rule bounds it only for a developer —
    /// theirs has to name a real project — while a member's is carried verbatim and stored. Left
    /// uncounted it would be exactly what the remark on that method describes: a field nobody counts
    /// is a field an attacker fills, past <c>MaxShareBytes</c>, into an inbox that holds 500 of them.
    /// That hole was found once here already; it is not being reopened by a new field.</para>
    /// </remarks>
    public string? ProjectId { get; init; }

    /// <summary>
    /// The kind with its documented default applied — and the only form anything here may read.
    /// </summary>
    /// <remarks>
    /// <para><b>The property initializer above does not survive deserialization.</b> A client that
    /// omits <c>entityKind</c>, or sends it as <c>null</c>, produces an instance whose
    /// <see cref="EntityKind"/> is null rather than <c>"credential"</c> — so <c>EntityKind.Length</c>
    /// in <see cref="IsValid"/> threw, and a well-formed request from anybody who could authenticate
    /// came back <b>500</b>. Found by the `.http` contract suite on its first run; invisible to the
    /// tests because every envelope they build happens to send the field.</para>
    /// <para>Normalised here rather than at the call site, because <see cref="PayloadBytes"/> reads it
    /// too and the same dereference would simply move. The stored <c>ShareItem</c> takes this value,
    /// so a null never reaches a recipient's inbox — where a released extension's own shape check
    /// would drop the whole item and show an empty inbox instead of an error.</para>
    /// </remarks>
    [JsonIgnore]
    public string Kind => string.IsNullOrWhiteSpace(EntityKind) ? "credential" : EntityKind;

    /// <summary>The longest a project id can be — 32 hex characters; nothing longer names one.</summary>
    /// <remarks>
    /// Bounded by what the value can legally BE, not only by how much of it fits under
    /// <c>MaxShareBytes</c>. It is stored verbatim and carried to a recipient, and the budget alone
    /// would let most of a megabyte through — the shape of the hole <see cref="PayloadBytes"/>
    /// already documents for <c>entityKind</c>.
    /// </remarks>
    public const int MaxProjectIdLength = 32;

    public bool IsValid() =>
        !string.IsNullOrWhiteSpace(ToEmail)
        && ToEmail.Contains('@')
        && !string.IsNullOrWhiteSpace(EntityName)
        && Kind.Length <= 64
        && (ProjectId is null || IsProjectIdShaped(ProjectId))
        && IsBase64(Salt)
        && IsBase64(Iv)
        && IsBase64(Tag)
        && IsBase64(Data);

    /// <summary>
    /// A project id, or nothing that could be one.
    ///
    /// <para>Blank passes: every client released so far sends no project, and one that sends an empty
    /// string means the same thing — the endpoint normalises it away before anything is stored. What is
    /// refused is a value that is neither: it would be carried verbatim into a recipient's inbox and
    /// into the audit log, where an id nobody minted is noise at best.</para>
    /// </summary>
    private static bool IsProjectIdShaped(string value) =>
        value.Trim().Length == 0
        || (value.Length == MaxProjectIdLength && value.All(Uri.IsHexDigit));

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
        + EntityName.Length + Kind.Length + ToEmail.Length + (ProjectId?.Length ?? 0);
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

    /// <summary>
    /// Why the server withdrew this share on the sender's behalf — set when the recipient was blocked, so
    /// the sender learns once why it vanished; the row is then theirs to dismiss.
    /// </summary>
    /// <remarks>
    /// <para><b>Omitted rather than written as <c>null</c> or <c>""</c>, and nullable rather than
    /// defaulted</b> — the <c>Format</c> precedent on <see cref="ShareItem"/>, for its reason and one more.
    /// Every receipt written before this field existed has no such key, and a released extension's
    /// <c>isSentShare</c> checks its five fields and ignores extras, so an ABSENT field keeps the wire
    /// byte-identical for every client alive. And a deserializer runs no initializer: a <c>string</c>
    /// property with <c>= ""</c> would still arrive <c>null</c> for a receipt that lacks the key, while the
    /// type claimed otherwise (measured on <c>ShareRequest.EntityKind</c>, 2026-09-03). The one form
    /// anything here may read is <see cref="IsWithdrawn"/>.</para>
    /// </remarks>
    [JsonPropertyName("withdrawnReason")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? WithdrawnReason { get; init; }

    /// <summary>The project the shared entity came out of, when the sender named one.</summary>
    /// <remarks>
    /// <para>Here so that a WITHDRAWAL row can cite the project — the withdrawal paths hold the receipt
    /// and not the inbox item, and a log an admin can filter by project must not lose half the rows
    /// about one. Omitted rather than written as <c>null</c>, the <see cref="ShareItem.Format"/>
    /// precedent: a released extension's <c>isSentShare</c> checks its five fields and ignores extras,
    /// so an absent key keeps the wire byte-identical for every client alive.</para>
    /// <para>A receipt written before this ships has no such key and reads as <c>null</c>, which is the
    /// truthful answer — nobody recorded a project for it.</para>
    /// </remarks>
    [JsonPropertyName("projectId")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? ProjectId { get; init; }

    /// <summary>Whether the server withdrew this share — the sweep keeps such a receipt, the dismiss route removes it.</summary>
    [JsonIgnore]
    public bool IsWithdrawn => !string.IsNullOrEmpty(WithdrawnReason);
}

/// <summary>A person discoverable in this deployment.</summary>
/// <remarks>
/// <b>Unchanged, deliberately.</b> Epic 3 needs a wider row, and it gets a second TYPE rather than
/// optional fields on this one — see <see cref="TeamMemberDetailDto"/>.
/// </remarks>
public sealed record TeamMemberDto(string Email);

/// <summary>
/// The same person, as a client that speaks contract 3 or later reads them: with the role and the
/// projects the caller is entitled to see.
/// </summary>
/// <remarks>
/// <para><b>A second type, not two nullable fields on <see cref="TeamMemberDto"/>.</b> A header-less
/// client is served even on a corp server — <c>ContractVersion.Judge</c> serves an absent claim, and
/// a test pins the team shape as byte-identical to personal mode for one. Making that identity
/// structural means it cannot be lost by dropping a <c>WhenWritingNull</c> attribute, and it keeps
/// nullable fields off the wire model entirely.</para>
/// <para><b><see cref="ProjectIds"/> is what the CALLER may see, not everything the person is on.</b>
/// For a developer it is the intersection with their own assignments: a colleague on A1 with me and
/// on A5 without me must not hand me "A5" — the plan round's sharpest finding, and it would have
/// leaked the engagement list this epic exists to fence. For a member or an admin, who may read the
/// whole roster anyway, it is the full list.</para>
/// </remarks>
public sealed record TeamMemberDetailDto(string Email, string Role, IReadOnlyList<string> ProjectIds);

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

/// <summary>
/// The sealed backup key on disk.
/// </summary>
/// <remarks>
/// <para><b>What is sealed is the DERIVED key, never the words.</b> A person holds
/// <c>BK1-XXXXX-…</c>; this file holds the 32 bytes HKDF makes of it. That is what turns "shown once"
/// from a promise into a fact — HKDF does not run backwards — and it is why a rotation orphans
/// archives rather than being a button.</para>
/// <para><b>The schema version is here for the one failure that must not read as corruption.</b> A
/// record written by a later build is unreadable BY VERSION, with a message naming the number, which
/// sends an operator to fetch a newer build instead of throwing away a key that is fine.</para>
/// </remarks>
public sealed record SealedBackupKey(int SchemaVersion, string Iv, string Tag, string Data, long CreatedAt);

/// <summary>
/// What an admin chose: when a backup runs, and how long its archives are kept.
/// </summary>
/// <remarks>
/// The defaults are the shell backup's own (<c>deploy/backup/backup-once.sh</c>: 03:00 and 30 days),
/// so a deployment that switches from the script to this feature keeps the same behaviour rather than
/// silently changing schedule.
/// </remarks>
public sealed record BackupSettings(
    int ScheduleHourUtc,
    int RetentionDays,
    IReadOnlyList<SealedTarget> Targets)
{
    public static readonly BackupSettings Default = new(3, 30, []);
}

/// <summary>
/// The last run's outcome, in the words a person reads on the page.
/// </summary>
/// <remarks>
/// <c>LastRunAt == 0</c> is "never", not "the epoch": the alternative is a nullable that every caller
/// has to remember to check, and this repository's rule is that business logic does not carry null.
/// The distinction is stated here so the page does not have to guess it.
/// </remarks>
public sealed record BackupStatus(
    long LastRunAt,
    string LastResult,
    string LastError,
    long Bytes,
    IReadOnlyList<BackupTargetStatus> Targets)
{
    public static readonly BackupStatus NeverRun = new(0, "never run", string.Empty, 0, []);
}

/// <summary>
/// Everything the admin's backup page draws, from what is on disk.
/// </summary>
/// <remarks>
/// <para><c>Running</c> is DERIVED from <c>LastResult</c> rather than stored beside it, so the page cannot
/// be handed "finished" and a spinner at once. That is the half of rule 8 people forget: the in-flight
/// state has to survive a reload, and it has to have exactly one source.</para>
///
/// <para><b><c>ConfiguredTargetKinds</c> and <c>Targets</c> answer different questions</b>, which is why
/// there are two lists. <c>Targets</c> is the LAST RUN's per-destination outcomes, so a deployment that
/// has saved an S3 destination and not run yet answers <c>[]</c> — and "where does this server back up
/// to" is unanswerable from it in exactly the state where it matters most. The kinds come from the saved
/// settings instead: distinct, ordered, and never a destination — a bucket and a prefix are operational
/// detail for the backup page (<see cref="SealedTarget.Describe"/>), and a credential is for nobody.</para>
/// </remarks>
public sealed record BackupStatusDto(
    bool Configured,
    string KeyState,
    int ScheduleHourUtc,
    int RetentionDays,
    long LastRunAt,
    string LastResult,
    string LastError,
    bool Running,
    long LocalArchiveBytes,
    string LocalArchiveName,
    IReadOnlyList<string> ConfiguredTargetKinds,
    IReadOnlyList<BackupTargetDto> Targets);

/// <summary>
/// What an admin may change: when a backup runs, and how long its archives are kept.
/// </summary>
/// <remarks>
/// No credential fields, deliberately. The cloud targets are story 4 and there is nothing to hold
/// credentials for yet; an admin API that accepts secrets it does nothing with is worse than one that
/// does not accept them.
/// </remarks>
public sealed record BackupSettingsRequest(
    int ScheduleHourUtc,
    int RetentionDays,
    IReadOnlyList<BackupTargetRequest>? Targets);

/// <summary>
/// The words of a newly minted backup key, handed over the only time anybody can have them.
/// </summary>
/// <remarks>
/// Its own record rather than a field on the status: a status document is polled, and a secret shown
/// once must not live on a route anything polls.
/// </remarks>
public sealed record BackupKeyDto(string Key, double EntropyBits);

/// <summary>
/// A destination as an administrator describes it, credentials included.
/// </summary>
/// <remarks>
/// <para>The credential fields are nullable because leaving them out is MEANINGFUL: a target already
/// saved keeps the credentials it has, matched by kind, endpoint, bucket and prefix. Nothing ever
/// returns them, so an administrator editing a prefix has no way to copy them out and paste them
/// back — and without this rule, changing a schedule would silently wipe them and the next run would
/// answer 403 at three in the morning.</para>
/// <para>One record for both kinds: <c>AccessKeyId</c>/<c>SecretAccessKey</c> for S3,
/// <c>AccountName</c>/<c>AccountKey</c> for Azure, and the rest shared.</para>
/// </remarks>
public sealed record BackupTargetRequest(
    string Kind,
    string Endpoint,
    string Region,
    string Bucket,
    string Prefix,
    string? AccessKeyId,
    string? SecretAccessKey,
    string? AccountName,
    string? AccountKey);

/// <summary>
/// A destination as the status page sees it — where it is and how it went, never its keys.
/// </summary>
/// <remarks>
/// <c>Retention</c> is separate from <c>Error</c> because they are separate outcomes: an archive can
/// arrive at a destination whose old archives then cannot be listed or deleted, and a page that folded
/// the two would draw that row green with the problem hidden in a subtitle.
/// </remarks>
public sealed record BackupTargetDto(
    string Kind, string Where, string Result, string Error, string Retention, long At);
