using System.Text;
using System.Text.Json;

namespace CredVaultServer.Tests;

/// <summary>
/// What every corporate-surface suite needs and none should spell out again: a server with a roster,
/// the registry's on-disk layout, and a sync. Four suites reach for these; four private copies are how
/// one of them ends up asserting against a path the store no longer writes.
/// </summary>
internal static class Corp
{
    /// <summary>Three officers, threshold two — the smallest roster the quorum guard accepts.</summary>
    public const string Officers = "cto@example.com,lead@example.com,devops@example.com";

    public const string Cto = "cto@example.com";

    public static readonly byte[] Blob = Encoding.UTF8.GetBytes("""{"data":"ciphertext"}""");

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    /// <summary>A server in corp mode: a roster is configured, and that is the whole switch.</summary>
    public static VaultServer Server() => new(new Dictionary<string, string?>
    {
        ["Vault__CorpRecovery__OfficerEmails"] = Officers,
        ["Vault__CorpRecovery__Threshold"] = "2",
    });

    public static string OrgDir(VaultServer server) => Path.Combine(server.DataDir, "org");

    /// <summary>The documented layout: <c>org/members/&lt;KeyFor(email)&gt;.json</c>.</summary>
    public static string RecordPath(VaultServer server, string email) =>
        Path.Combine(OrgDir(server), "members", VaultStore.KeyFor(email) + ".json");

    /// <summary>The write that registers — a vault sync.</summary>
    public static Task<HttpResponseMessage> SyncAsync(HttpClient client) =>
        client.PutAsync("/api/vault", new ByteArrayContent(Blob), Ct);

    public static MemberRecord ReadRecord(VaultServer server, string email) =>
        JsonSerializer.Deserialize(File.ReadAllBytes(RecordPath(server, email)), AppJsonContext.Default.MemberRecord)!;

    /// <summary>Every row the event log holds, whatever day file it landed in. Empty when nothing was ever written.</summary>
    public static IReadOnlyList<OrgEventDto> EventRows(VaultServer server)
    {
        var dir = Path.Combine(OrgDir(server), "events");
        if (!Directory.Exists(dir))
        {
            return [];
        }
        return
        [
            .. Directory.EnumerateFiles(dir, "*.ndjson")
                .SelectMany(File.ReadAllLines)
                .Where(line => line.Length > 0)
                .Select(line => JsonSerializer.Deserialize(line, AppJsonContext.Default.OrgEventDto)!),
        ];
    }
}
