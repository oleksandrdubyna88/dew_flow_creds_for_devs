using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace CredVaultServer;

/// <summary>The two kinds of destination this server can talk to.</summary>
public static class TargetKinds
{
    public const string S3 = "s3";

    public const string AzureBlob = "azure-blob";

    public static bool Known(string kind) =>
        kind is S3 or AzureBlob;
}

/// <summary>
/// What opens a destination. Sealed on disk, never returned by any route.
/// </summary>
/// <remarks>
/// One record for both kinds rather than two: the alternative is a discriminated shape that every
/// reader has to branch on, for four strings of which two are always empty.
/// </remarks>
public sealed record TargetSecrets(
    string AccessKeyId,
    string SecretAccessKey,
    string AccountName,
    string AccountKey)
{
    public static readonly TargetSecrets None = new(string.Empty, string.Empty, string.Empty, string.Empty);

    public bool Empty =>
        AccessKeyId.Length == 0 && SecretAccessKey.Length == 0
        && AccountName.Length == 0 && AccountKey.Length == 0;
}

/// <summary>
/// A destination as the settings file holds it: where it is, and its credentials sealed.
/// </summary>
/// <remarks>
/// The identity of a target — what makes an edit an EDIT rather than a new target — is its kind,
/// endpoint, bucket and prefix. That is what lets an administrator change the schedule without
/// retyping a secret they were never shown again.
/// </remarks>
public sealed record SealedTarget(
    string Kind,
    string Endpoint,
    string Region,
    string Bucket,
    string Prefix,
    string Iv,
    string Tag,
    string Data)
{
    public string Identity => $"{Kind}|{Endpoint}|{Bucket}|{Prefix}";

    /// <summary>What a status or a page may see. Never the sealed half.</summary>
    public string Describe => Kind == TargetKinds.S3
        ? $"s3 {Bucket}/{Prefix}".TrimEnd('/')
        : $"azure {Bucket}/{Prefix}".TrimEnd('/');
}

/// <summary>What one target did during a run.</summary>
public sealed record BackupTargetStatus(string Kind, string Where, string Result, string Error, long At);

/// <summary>
/// Sealing a target's credentials, opening them again, and building the client that uses them.
/// </summary>
/// <remarks>
/// <para>The KEK is the deployment's own — the same one that seals developer login keys and the backup
/// key — through <see cref="KekSeal"/>, so there is one AEAD call in this server and not three.</para>
///
/// <para><b>Credentials are write-only, and that has a consequence the review round named.</b> Nothing
/// returns them, so an administrator editing a target's prefix cannot copy the secret out of a GET and
/// paste it back. Omitting the credential fields therefore KEEPS what is sealed, matched by the
/// target's identity; sending them replaces it. Without that rule, changing a schedule would silently
/// wipe the credentials and the next run would answer 403 at three in the morning.</para>
/// </remarks>
public sealed class BackupTargets(byte[] kek, IHttpClientFactory clients, TimeProvider clock, ILogger log)
{
    /// <summary>Seal these credentials into a target record.</summary>
    public SealedTarget Seal(
        string kind, string endpoint, string region, string bucket, string prefix, TargetSecrets secrets)
    {
        var sealedBytes = KekSeal.Seal(
            kek, JsonSerializer.SerializeToUtf8Bytes(secrets, AppJsonContext.Default.TargetSecrets));
        return new SealedTarget(
            Text(kind),
            Text(endpoint),
            Text(region),
            Text(bucket),
            Text(prefix),
            Convert.ToBase64String(sealedBytes.Iv),
            Convert.ToBase64String(sealedBytes.Tag),
            Convert.ToBase64String(sealedBytes.Data));
    }

    /// <summary>Open a target's credentials, or nothing when this server cannot.</summary>
    public TargetSecrets Open(SealedTarget target)
    {
        try
        {
            return JsonSerializer.Deserialize(
                KekSeal.Open(
                    kek,
                    new SealedBytes(
                        Convert.FromBase64String(target.Iv),
                        Convert.FromBase64String(target.Tag),
                        Convert.FromBase64String(target.Data))),
                AppJsonContext.Default.TargetSecrets) ?? TargetSecrets.None;
        }
        catch (Exception e) when (e is System.Security.Cryptography.CryptographicException
            or FormatException or ArgumentException or JsonException)
        {
            log.LogError(
                "the credentials for backup target {Where} cannot be opened by this server. Its KEK has "
                + "changed, or the settings file was restored from elsewhere; re-enter them.",
                target.Describe);
            return TargetSecrets.None;
        }
    }

    /// <summary>The client for this target, or nothing when its credentials cannot be opened.</summary>
    public IArchiveTarget? Build(SealedTarget target)
    {
        var secrets = Open(target);
        if (secrets.Empty)
        {
            return null;
        }
        var http = clients.CreateClient(nameof(BackupTargets));
        return target.Kind == TargetKinds.S3
            ? new S3Target(
                http,
                new S3TargetConfig(
                    target.Endpoint, target.Region, target.Bucket, target.Prefix,
                    secrets.AccessKeyId, secrets.SecretAccessKey),
                clock)
            : new AzureBlobTarget(
                http,
                new AzureTargetConfig(
                    target.Endpoint, target.Bucket, target.Prefix, secrets.AccountName, secrets.AccountKey),
                clock);
    }

    /// <summary>
    /// What is wrong with a target an administrator is trying to save, or nothing.
    /// </summary>
    /// <remarks>
    /// Everything checkable WITHOUT a request happens here, so an obvious mistake does not cost a round
    /// trip to somebody else's service. Whether the credentials actually work is a separate question,
    /// asked by <see cref="IArchiveTarget.UsableAsync"/> before the settings are written.
    /// </remarks>
    public static string Problem(BackupTargetRequest target, bool hasSealedCredentials)
    {
        var kind = Text(target.Kind);
        if (!TargetKinds.Known(kind))
        {
            return $"'{kind}' is not a kind of target this server knows. It takes "
                + $"'{TargetKinds.S3}' and '{TargetKinds.AzureBlob}'.";
        }
        var endpoint = ArchiveTargets.EndpointProblem(Text(target.Endpoint));
        if (endpoint.Length > 0)
        {
            return endpoint;
        }
        if (Text(target.Bucket).Length == 0)
        {
            return kind == TargetKinds.S3 ? "a bucket name is required." : "a container name is required.";
        }
        return Missing(target, kind, hasSealedCredentials);
    }

    /// <summary>
    /// Credentials must be COMPLETE, or absent and already sealed. Never half.
    /// </summary>
    /// <remarks>
    /// <para>Half a credential is the case that used to reach the cipher: an Azure account name with no
    /// key made "did they send credentials?" answer yes, and the save-time probe then handed an empty
    /// string to a base64 decoder — a 500 where a sentence belongs.</para>
    /// <para>The message names the FIELD that is missing rather than the pair, because an administrator
    /// who forgot one of two has to guess otherwise.</para>
    /// </remarks>
    private static string Missing(BackupTargetRequest target, string kind, bool hasSealedCredentials)
    {
        var secrets = Secrets(target);
        if (secrets.Empty)
        {
            return hasSealedCredentials ? string.Empty : FirstTime(kind);
        }
        var missing = kind == TargetKinds.S3
            ? Named(secrets.AccessKeyId, "accessKeyId", secrets.SecretAccessKey, "secretAccessKey")
            : Named(secrets.AccountName, "accountName", secrets.AccountKey, "accountKey");
        return missing.Length == 0
            ? string.Empty
            : $"{missing} is missing. Both halves of a credential are needed, or neither — leaving both "
              + "out keeps the ones already sealed for this target.";
    }

    private static string Named(string first, string firstName, string second, string secondName) =>
        first.Length == 0 ? firstName : second.Length == 0 ? secondName : string.Empty;

    private static string FirstTime(string kind) => kind == TargetKinds.S3
        ? "an access key id and a secret access key are required the first time this target is saved. "
          + "They are sealed and never shown again, so a later edit that leaves them out keeps the ones "
          + "already here."
        : "an account name and an account key are required the first time this target is saved. They "
          + "are sealed and never shown again, so a later edit that leaves them out keeps the ones "
          + "already here.";

    /// <summary>The credentials a request carried, with the nulls flattened away.</summary>
    public static TargetSecrets Secrets(BackupTargetRequest target) => new(
        Text(target.AccessKeyId),
        Text(target.SecretAccessKey),
        Text(target.AccountName),
        Text(target.AccountKey));

    public static string IdentityOf(BackupTargetRequest target) =>
        $"{Text(target.Kind)}|{Text(target.Endpoint)}|{Text(target.Bucket)}|{Text(target.Prefix)}";

    /// <summary>
    /// A field the client omitted is NULL, whatever the record says.
    /// </summary>
    /// <remarks>
    /// A non-nullable string on a DTO is a promise the deserialiser does not keep: an omitted member
    /// arrives as null and the first <c>Trim()</c> on it is a 500 where a 400 belongs. Normalised here,
    /// where the value is READ, so every reader gets the same answer rather than each call site
    /// remembering.
    /// </remarks>
    public static string Text(string? value) => (value ?? string.Empty).Trim();
}
