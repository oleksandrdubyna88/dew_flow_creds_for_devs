using System.Net;
using System.Text.Json;
using FluentAssertions;

namespace CredVaultServer.Tests;

/// <summary>
/// Corporate recovery, server side, phase one: the operator's roster, the guard that refuses a
/// roster which can never reach quorum, and the endpoint that tells every account on the server
/// what it is subject to.
/// </summary>
[Collection(ServerCollection.Name)]
public sealed class OrgRecoveryConfigTests
{
    private const string Officers = "cto@example.com,lead@example.com,devops@example.com";

    private static string Alice => $"alice@{VaultServer.Domain}";

    private static Dictionary<string, string?> WithRoster(string officers, string threshold = "2") =>
        new()
        {
            ["Vault__CorpRecovery__OfficerEmails"] = officers,
            ["Vault__CorpRecovery__Threshold"] = threshold,
        };

    private static async Task<JsonElement> ConfigFor(VaultServer server, string email)
    {
        using var client = server.ClientFor(email);
        var body = await client.GetStringAsync(
            "/api/org-recovery/config", TestContext.Current.CancellationToken);
        return JsonDocument.Parse(body).RootElement.Clone();
    }

    private static Exception? StartupFailure(Dictionary<string, string?> overrides)
    {
        using var server = new VaultServer(overrides);
        try
        {
            using var client = server.CreateClient();
            return null;
        }
        catch (Exception ex)
        {
            return ex;
        }
    }

    [Fact]
    public async Task AServerWithNoRosterReportsTheFeatureOffAndNamesNobody()
    {
        // The default, and it must be a real "off" rather than an empty-looking "on": a client
        // that enrolled against a blank roster would seal its master key to nothing.
        using var server = new VaultServer();

        var config = await ConfigFor(server, Alice);

        config.GetProperty("enabled").GetBoolean().Should().BeFalse();
        config.GetProperty("officerEmails").GetArrayLength().Should().Be(0);
        config.GetProperty("rosterFingerprint").GetString().Should().BeEmpty();
    }

    [Fact]
    public async Task AConfiguredRosterIsVisibleToEveryAccount_NotOnlyToOfficers()
    {
        // The transparency requirement, and the reason this endpoint is not officer-only:
        // every account on a server with a roster is enrolled automatically, and somebody
        // whose secrets a quorum of named colleagues can recover is entitled to know it and to
        // know which colleagues. A silent escrow is a backdoor by shape.
        using var server = new VaultServer(WithRoster(Officers));

        var seenByOrdinaryUser = await ConfigFor(server, Alice);

        seenByOrdinaryUser.GetProperty("enabled").GetBoolean().Should().BeTrue();
        seenByOrdinaryUser.GetProperty("officerEmails")
            .EnumerateArray().Select(e => e.GetString())
            .Should().BeEquivalentTo("cto@example.com", "lead@example.com", "devops@example.com");
        seenByOrdinaryUser.GetProperty("threshold").GetInt32().Should().Be(2);
    }

    [Fact]
    public async Task AConfiguredButUnfinishedSetupSaysSo_RatherThanLookingUsable()
    {
        // Two different facts, and collapsing them is how a client would try to enrol against a
        // key that does not exist yet: `enabled` means the operator asked for this, and
        // `setupComplete` means the officers have actually run the ceremony.
        using var server = new VaultServer(WithRoster(Officers));

        var config = await ConfigFor(server, Alice);

        config.GetProperty("enabled").GetBoolean().Should().BeTrue();
        config.GetProperty("setupComplete").GetBoolean().Should().BeFalse();
        config.GetProperty("orgPublicKey").GetString().Should().BeEmpty();
    }

    [Fact]
    public async Task TheRosterFingerprintIgnoresOrderAndChangesWithMembership()
    {
        // What clients pin. The order two operators write the same three addresses in is not a
        // change and must not read as one; adding a fourth officer IS a change and must.
        using var asWritten = new VaultServer(WithRoster(Officers));
        var first = (await ConfigFor(asWritten, Alice)).GetProperty("rosterFingerprint").GetString();
        asWritten.Dispose();

        using var reordered = new VaultServer(
            WithRoster("devops@example.com,cto@example.com,lead@example.com"));
        var second = (await ConfigFor(reordered, Alice)).GetProperty("rosterFingerprint").GetString();
        reordered.Dispose();

        using var extended = new VaultServer(WithRoster($"{Officers},cfo@example.com"));
        var third = (await ConfigFor(extended, Alice)).GetProperty("rosterFingerprint").GetString();

        first.Should().NotBeNullOrEmpty();
        second.Should().Be(first, "the order the same officers were written in is not a change");
        third.Should().NotBe(first, "a new officer is a change every client must be able to see");
    }

    [Fact]
    public async Task TheThresholdIsBoundIntoTheFingerprintToo()
    {
        // Lowering the threshold weakens every vault on the server without touching the
        // roster. It has to be as visible as adding a person.
        using var strict = new VaultServer(WithRoster(Officers, "3"));
        var atThree = (await ConfigFor(strict, Alice)).GetProperty("rosterFingerprint").GetString();
        strict.Dispose();

        using var loose = new VaultServer(WithRoster(Officers, "2"));
        var atTwo = (await ConfigFor(loose, Alice)).GetProperty("rosterFingerprint").GetString();

        atThree.Should().NotBe(atTwo);
    }

    [Fact]
    public async Task TheEndpointStillRefusesAnUnauthenticatedCaller()
    {
        // Public to everyone INSIDE, not to the internet: the roster names real people.
        using var server = new VaultServer(WithRoster(Officers));
        using var anonymous = server.CreateClient();

        var response = await anonymous.GetAsync(
            "/api/org-recovery/config", TestContext.Current.CancellationToken);

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    // ---------------------------------------------------------------- the guards

    [Fact]
    public void ARosterOfTwoIsRefused_ItCannotSurviveOneOfThemLeaving()
    {
        // The whole feature exists for the day somebody leaves. A 2-of-2 roster goes down with
        // the first departure, which is the event it was configured for.
        var failure = StartupFailure(WithRoster("cto@example.com,lead@example.com"));

        failure.Should().NotBeNull();
        failure!.ToString().Should().Contain("at least 3", "the message must say what the minimum is");
    }

    [Fact]
    public void AThresholdOfOneIsRefused_ThatIsNotAQuorum()
    {
        // With a threshold of 1 any single officer opens every vault on the server, which is
        // precisely the concentration of power the split exists to prevent.
        var failure = StartupFailure(WithRoster(Officers, "1"));

        failure.Should().NotBeNull();
        failure!.ToString().Should().Contain("outside 2..3");
    }

    [Fact]
    public void AThresholdAboveTheRosterSizeIsRefused_ItCanNeverBeReached()
    {
        // The misconfiguration that looks like a working feature for months and fails on the
        // one day it is used.
        var failure = StartupFailure(WithRoster(Officers, "4"));

        failure.Should().NotBeNull();
        failure!.ToString().Should().Contain("outside 2..3");
    }

    [Fact]
    public void DuplicatesAndCasingDoNotInflateTheRosterPastTheGuard()
    {
        // Three entries that are two people would pass a naive count and leave a 2-of-2 in
        // disguise — the exact shape the minimum is there to refuse.
        var failure = StartupFailure(WithRoster("CTO@example.com,cto@example.com,lead@example.com"));

        failure.Should().NotBeNull();
        failure!.ToString().Should().Contain("2 officer(s)", "the count must be of PEOPLE");
    }

    [Fact]
    public async Task OfficerEmailsAreNormalisedSoAMatchDoesNotDependOnHowTheyWereTyped()
    {
        using var server = new VaultServer(
            WithRoster(" CTO@Example.com , lead@example.com ,devops@example.com"));

        var config = await ConfigFor(server, Alice);

        config.GetProperty("officerEmails")
            .EnumerateArray().Select(e => e.GetString())
            .Should().BeEquivalentTo("cto@example.com", "lead@example.com", "devops@example.com");
    }
}
