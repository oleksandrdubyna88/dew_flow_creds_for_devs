using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;

namespace CredVaultServer.Tests;

/// <summary>
/// A full inbox is reachable state, not a hypothetical: any account inside the allowed
/// domain can post up to <c>Vault:MaxInboxItems</c> shares into someone else's inbox, and
/// the recipient's client fetches all of them in one GET. These tests hold the streaming
/// listing to the same contract the materialised one had.
/// </summary>
[Collection(ServerCollection.Name)]
public sealed class InboxScaleTests
{
    private static string Alice => $"alice@{VaultServer.Domain}";

    private static string Bob => $"bob@{VaultServer.Domain}";

    private static object Envelope(string toEmail, string entityName, int payloadBytes) => new
    {
        toEmail,
        entityName,
        entityKind = "credential",
        salt = Convert.ToBase64String(new byte[16]),
        iv = Convert.ToBase64String(new byte[12]),
        tag = Convert.ToBase64String(new byte[16]),
        data = Convert.ToBase64String(new byte[payloadBytes]),
    };

    [Fact]
    public async Task EveryItemOfALargeInboxIsListed()
    {
        using var server = new VaultServer();
        using var alice = server.ClientFor(Alice);
        using var bob = server.ClientFor(Bob);
        var ct = TestContext.Current.CancellationToken;

        const int count = 60;
        for (var i = 0; i < count; i++)
        {
            var posted = await alice.PostAsJsonAsync(
                "/api/shares", Envelope(Bob, $"secret-{i:D3}", 32 * 1024), ct);
            posted.EnsureSuccessStatusCode();
        }

        var body = await bob.GetStringAsync("/api/shares", ct);
        using var parsed = JsonDocument.Parse(body);

        parsed.RootElement.ValueKind.Should().Be(JsonValueKind.Array);
        parsed.RootElement.GetArrayLength().Should().Be(count);

        var names = parsed.RootElement.EnumerateArray()
            .Select(item => item.GetProperty("entityName").GetString())
            .ToList();
        names.Should().Contain("secret-000").And.Contain($"secret-{count - 1:D3}");
    }

    [Fact]
    public async Task AnEmptyInboxIsAnEmptyJsonArrayNotNull()
    {
        using var server = new VaultServer();
        using var bob = server.ClientFor(Bob);
        var ct = TestContext.Current.CancellationToken;

        var body = await bob.GetStringAsync("/api/shares", ct);
        using var parsed = JsonDocument.Parse(body);

        parsed.RootElement.ValueKind.Should().Be(JsonValueKind.Array);
        parsed.RootElement.GetArrayLength().Should().Be(0);
    }

    [Fact]
    public async Task ACorruptedItemIsSkippedAndTheRestStillList()
    {
        using var server = new VaultServer();
        using var alice = server.ClientFor(Alice);
        using var bob = server.ClientFor(Bob);
        var ct = TestContext.Current.CancellationToken;

        await alice.PostAsJsonAsync("/api/shares", Envelope(Bob, "good-one", 128), ct);

        // Drop a non-JSON file into Bob's inbox, exactly as a half-written crash would.
        var inboxDir = Path.Combine(
            server.DataDir, "shares", VaultStore.KeyFor(Bob));
        await File.WriteAllTextAsync(
            Path.Combine(inboxDir, $"{Guid.NewGuid()}.json"), "{ this is not json", ct);

        var body = await bob.GetStringAsync("/api/shares", ct);
        using var parsed = JsonDocument.Parse(body);

        parsed.RootElement.GetArrayLength().Should().Be(1);
        body.Should().Contain("good-one");
    }
}
