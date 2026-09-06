using System.Net;
using System.Text;
using System.Text.Json;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;

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

    /// <summary>
    /// The admin's upsert, with the body built from the real request type — a hand-typed JSON fixture
    /// the server quietly declines is a test that passes for the wrong reason.
    /// </summary>
    public static Task<HttpResponseMessage> SetMemberAsync(
        HttpClient admin,
        string email,
        string? role = null,
        string? shareDefault = null) =>
        PutJsonAsync(
            admin,
            $"/api/org/members/{email}",
            JsonSerializer.Serialize(new SetMemberRequest(role, shareDefault), AppJsonContext.Default.SetMemberRequest));

    /// <summary>The admin's block or unblock — <c>PUT /api/org/members/{email}/active</c>, the body built from the real request type.</summary>
    public static Task<HttpResponseMessage> SetActiveAsync(HttpClient admin, string email, bool active) =>
        PutJsonAsync(
            admin,
            $"/api/org/members/{email}/active",
            JsonSerializer.Serialize(new SetActiveRequest(active), AppJsonContext.Default.SetActiveRequest));

    /// <summary>
    /// What the admin endpoint does, done underneath the server by a second store over the same
    /// directory — for the gate suites, which must not depend on the endpoint they are not testing, and for
    /// the one record the endpoint refuses to write: an officer's (the <c>409</c>). A restore or an
    /// operator's editor produces exactly this.
    /// </summary>
    public static Task WriteActiveByHandAsync(VaultServer server, string email, bool active) =>
        new OrgMembersStore(server.DataDir, NullLogger<OrgMembersStore>.Instance)
            .UpsertAsync(email, r => r with { Active = active }, "by-hand@example.com", Ct);

    public static Task<HttpResponseMessage> SetOfflineLeaseAsync(HttpClient admin, int hours) =>
        PutJsonAsync(
            admin,
            "/api/org/settings",
            JsonSerializer.Serialize(new SetSettingsRequest(hours), AppJsonContext.Default.SetSettingsRequest));

    /// <summary>A PUT with the body spelt out — for the requests whose point is a field the type does not have, or no JSON at all.</summary>
    public static Task<HttpResponseMessage> PutJsonAsync(HttpClient client, string path, string json) =>
        client.PutAsync(path, new StringContent(json, Encoding.UTF8, "application/json"), Ct);

    public static async Task<JsonElement> BodyAsync(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync(Ct);
        return JsonDocument.Parse(body).RootElement;
    }

    /// <summary>The <c>{error}</c> every refusal on <c>/api/org/*</c> carries — asserted to be JSON on the way.</summary>
    public static async Task<string> RefusalAsync(HttpResponseMessage response, HttpStatusCode expected)
    {
        response.StatusCode.Should().Be(expected);
        response.Content.Headers.ContentType!.MediaType.Should().Be("application/json", "an admin UI has to show WHY");
        return (await BodyAsync(response)).GetProperty("error").GetString()!;
    }

    public static MemberRecord ReadRecord(VaultServer server, string email) =>
        JsonSerializer.Deserialize(File.ReadAllBytes(RecordPath(server, email)), AppJsonContext.Default.MemberRecord)!;

    public const string Garbage = "{ this is not a record";

    /// <summary>
    /// Overwrite one record with something no build can parse — a half-written file, a bad sector, a
    /// restore from a truncated archive — and move its mtime on, as the seconds between a restore and
    /// the next request would, so the server's stat check cannot mistake it for the record it cached.
    /// </summary>
    public static async Task CorruptRecordAsync(VaultServer server, string email)
    {
        var path = RecordPath(server, email);
        await File.WriteAllTextAsync(path, Garbage, Ct);
        File.SetLastWriteTimeUtc(path, File.GetLastWriteTimeUtc(path).AddSeconds(2));
    }

    /// <summary>
    /// Make the event log unwritable before anything has written to it: a file where <c>org/events</c>
    /// should be a directory, which no append can create under, on any file system.
    /// </summary>
    public static void BlockTheEventLog(VaultServer server)
    {
        Directory.CreateDirectory(OrgDir(server));
        File.WriteAllText(Path.Combine(OrgDir(server), "events"), "a file where the folder should be");
    }

    /// <summary>
    /// Make one record impossible to delete, the way the OS at hand refuses a delete. Windows refuses to
    /// unlink a file another handle holds exclusively, so the handle is held — story 1's own trick for a
    /// failing read. Unix unlinks an open file happily and refuses only when the DIRECTORY is not
    /// writable, so the directory loses its write bit (CI runs as a non-root user; root ignores the bit).
    /// Dispose undoes either, so the temp tree can still be removed.
    /// </summary>
    public static IDisposable Undeletable(string recordPath) =>
        OperatingSystem.IsWindows()
            ? new FileStream(recordPath, FileMode.Open, FileAccess.ReadWrite, FileShare.None)
            : new WritableAgain(Path.GetDirectoryName(recordPath)!);

    private sealed class WritableAgain : IDisposable
    {
        private readonly string _dir;

        public WritableAgain(string dir)
        {
            _dir = dir;
            if (!OperatingSystem.IsWindows())
            {
                File.SetUnixFileMode(_dir, UnixFileMode.UserRead | UnixFileMode.UserExecute);
            }
        }

        public void Dispose()
        {
            if (!OperatingSystem.IsWindows())
            {
                File.SetUnixFileMode(_dir, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
            }
        }
    }

    /// <summary>
    /// Poll until <paramref name="condition"/> holds, or fail naming what never happened. For the tests that
    /// let a request run on after its client hung up: the server's continuation has no response to await,
    /// so the disk is the only place to watch. Five seconds, ten-millisecond steps.
    /// </summary>
    public static async Task Eventually(Func<bool> condition, string what)
    {
        var deadline = DateTime.UtcNow + TimeSpan.FromSeconds(5);
        while (!condition() && DateTime.UtcNow < deadline)
        {
            await Task.Delay(10, Ct);
        }
        condition().Should().BeTrue("within five seconds {0}", what);
    }

    /// <summary>
    /// Wait until <paramref name="condition"/> holds or <paramref name="atMost"/> passes — and assert
    /// nothing: for the moments a test must give an asynchronous abort time to land without being able
    /// to say which way it will go.
    /// </summary>
    public static async Task Within(TimeSpan atMost, Func<bool> condition)
    {
        var deadline = DateTime.UtcNow + atMost;
        while (!condition() && DateTime.UtcNow < deadline)
        {
            await Task.Delay(10, Ct);
        }
    }

    /// <summary>The rows of one kind, in the order they were appended.</summary>
    public static IReadOnlyList<OrgEventDto> Rows(VaultServer server, string kind) =>
        [.. EventRows(server).Where(r => r.Kind == kind)];

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
