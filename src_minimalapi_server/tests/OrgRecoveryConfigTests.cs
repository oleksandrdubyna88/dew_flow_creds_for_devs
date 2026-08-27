using System.Net;
using System.Text.Json;
using FluentAssertions;

namespace CredVaultServer.Tests;

/// <summary>
/// Corporate recovery, server side, phase one: the operator's roster, the guard that turns the
/// feature off on a roster which can never reach quorum, and the endpoint that tells every
/// account on the server what it is subject to.
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

    /// <summary>
    /// Start a server on a roster that cannot reach quorum and ask it what it thinks it has.
    ///
    /// <para>The point of the helper is that constructing the server is expected to WORK.
    /// Corporate recovery is one optional feature among many; a typo in its roster must not
    /// take ordinary vault sync down with it, on a server where nothing has been enrolled
    /// yet. The property that has to survive is narrower and is what these tests assert: a
    /// roster that cannot be assembled never becomes something a client can enrol against.</para>
    /// </summary>
    private static async Task<JsonElement> ConfigDespite(Dictionary<string, string?> overrides)
    {
        using var server = new VaultServer(overrides);
        return await ConfigFor(server, Alice);
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
    public async Task ARosterOfTwoTurnsTheFeatureOff_AndTheServerStillStarts()
    {
        // The whole feature exists for the day somebody leaves. A 2-of-2 roster goes down with
        // the first departure, which is the event it was configured for — so it must not be
        // used. But refusing to START on it punishes every account here for a setting none of
        // them touched, and takes ordinary sync down over a feature nobody had enrolled in yet.
        var config = await ConfigDespite(WithRoster("cto@example.com,lead@example.com"));

        config.GetProperty("enabled").GetBoolean().Should().BeFalse();
        config.GetProperty("officerEmails").GetArrayLength().Should()
            .Be(0, "naming the officers of a refused roster would read to a client as an enrolment");
    }

    [Fact]
    public async Task AThresholdOfOneTurnsTheFeatureOff_ThatIsNotAQuorum()
    {
        // With a threshold of 1 any single officer opens every vault on the server, which is
        // precisely the concentration of power the split exists to prevent.
        var config = await ConfigDespite(WithRoster(Officers, "1"));

        config.GetProperty("enabled").GetBoolean().Should().BeFalse();
        config.GetProperty("officerEmails").GetArrayLength().Should().Be(0);
    }

    [Fact]
    public async Task AThresholdAboveTheRosterSizeTurnsTheFeatureOff_ItCanNeverBeReached()
    {
        // The misconfiguration that looks like a working feature for months and fails on the
        // one day it is used.
        var config = await ConfigDespite(WithRoster(Officers, "4"));

        config.GetProperty("enabled").GetBoolean().Should().BeFalse();
        config.GetProperty("officerEmails").GetArrayLength().Should().Be(0);
    }

    [Fact]
    public async Task DuplicatesAndCasingDoNotInflateTheRosterPastTheMinimum()
    {
        // Three entries that are two people would pass a naive count and leave a 2-of-2 in
        // disguise — the exact shape the minimum is there to refuse.
        var config = await ConfigDespite(
            WithRoster("CTO@example.com,cto@example.com,lead@example.com"));

        config.GetProperty("enabled").GetBoolean().Should().BeFalse();
    }

    // ------------------------------------------------- and it has to SAY why, or it is silent

    [Fact]
    public void ARosterTooSmallToSurviveADepartureSaysSo()
    {
        // Off without a reason is indistinguishable from never configured, and the operator
        // who typed two addresses believes the feature is running. The string is what the
        // startup log prints.
        var config = OrgRecoveryConfig.Read(["cto@example.com", "lead@example.com"], 2);

        config.Enabled.Should().BeFalse();
        config.Misconfiguration.Should().Contain("2 officer(s)", "the count must be of PEOPLE");
        config.Misconfiguration.Should().Contain("at least 3", "and say what the minimum is");
    }

    [Fact]
    public void AnUnreachableThresholdSaysSo()
    {
        var tooLow = OrgRecoveryConfig.Read(["a@x.com", "b@x.com", "c@x.com"], 1);
        var tooHigh = OrgRecoveryConfig.Read(["a@x.com", "b@x.com", "c@x.com"], 4);

        tooLow.Enabled.Should().BeFalse();
        tooLow.Misconfiguration.Should().Contain("outside 2..3");
        tooHigh.Enabled.Should().BeFalse();
        tooHigh.Misconfiguration.Should().Contain("outside 2..3");
    }

    [Fact]
    public void AnEmptyRosterIsNotAMisconfiguration_ItIsTheDefault()
    {
        // The difference the startup log turns on: nothing configured is silence, something
        // configured wrongly is an error. Collapsing them would make the default noisy and
        // train operators to ignore the line that matters.
        var config = OrgRecoveryConfig.Read([], 2);

        config.Enabled.Should().BeFalse();
        config.Misconfiguration.Should().BeEmpty();
    }

    [Fact]
    public void AUsableRosterCarriesNoComplaint()
    {
        var config = OrgRecoveryConfig.Read(["a@x.com", "b@x.com", "c@x.com"], 2);

        config.Enabled.Should().BeTrue();
        config.Misconfiguration.Should().BeEmpty();
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
