using System.Security.Cryptography;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;

namespace CredVaultServer.Tests;

/// <summary>
/// The decisions a settings save makes about its destinations, before anything is sealed, probed or
/// written — pure, so every branch is a fact rather than a request.
/// </summary>
/// <remarks>
/// The endpoint tests drive the same decisions over the wire with a stubbed transport; this file is
/// where each branch is named on its own. The two agreeing is what makes a regression in one of them
/// visible as a sentence about a decision rather than as a 400 about a bucket.
/// </remarks>
public class BackupTargetPlanTests
{
    private static readonly TargetSecrets Secrets = new("AKIDEXAMPLE", "secret", string.Empty, string.Empty);

    private static readonly BackupTargets Sealer = new(
        RandomNumberGenerator.GetBytes(Key32.Bytes),
        new NoClients(),
        TimeProvider.System,
        NullLogger<BackupTargets>.Instance);

    private static readonly SealedTarget Nightly =
        Sealer.Seal(TargetKinds.S3, "https://s3.example.com", "eu-central-1", "vaults", "nightly", Secrets);

    [Fact]
    public void AKeptRecordCarriesTheRequestedRegionAndIsProvedForIt()
    {
        // Fix 1 of #134: the kept record used to be written back whole, so a save that changed only the
        // region wrote the old region back — silently, and S3 signs with the region.
        var plan = BackupTargetPlan.Of([Request("nightly", region: "eu-west-1")], [Nightly]);

        var decision = plan.Decisions.Should().ContainSingle().Subject;
        decision.NeedsSeal.Should().BeFalse("no credentials were sent, so the sealed ones are kept");
        decision.RegionChanged.Should().BeTrue();
        decision.Probe.Should().BeTrue("what the run will sign with changed");
        decision.KeptWithRegion.Region.Should().Be("eu-west-1");
        (decision.KeptWithRegion.Iv, decision.KeptWithRegion.Tag, decision.KeptWithRegion.Data)
            .Should().Be((Nightly.Iv, Nightly.Tag, Nightly.Data), "and the sealed half is exactly what it was");
        decision.Mark.Should().Be("~");
    }

    [Fact]
    public void AnUnchangedDestinationIsNeitherSealedNorProved()
    {
        var plan = BackupTargetPlan.Of([Request("nightly")], [Nightly]);

        var decision = plan.Decisions.Should().ContainSingle().Subject;
        decision.NeedsSeal.Should().BeFalse();
        decision.Probe.Should().BeFalse("nothing the run will sign with changed");
        decision.KeptWithRegion.Should().Be(Nightly);
        decision.Mark.Should().BeEmpty();
        plan.NeedsSeal.Should().BeFalse("so this save needs no KEK at all");
        plan.Delta.Should().Be("destinations unchanged");
    }

    [Fact]
    public void NewCredentialsSealAFreshRecordAndProveIt()
    {
        var plan = BackupTargetPlan.Of([Request("nightly", accessKeyId: "AKIDNEW", secret: "rotated")], [Nightly]);

        var decision = plan.Decisions.Should().ContainSingle().Subject;
        decision.IsNew.Should().BeFalse("the identity is known");
        decision.NeedsSeal.Should().BeTrue();
        decision.Probe.Should().BeTrue();
        decision.Mark.Should().Be("~");
        plan.NeedsSeal.Should().BeTrue("and this save DOES need the KEK");
    }

    [Fact]
    public void ANewDestinationIsAddedSealedAndProved()
    {
        var plan = BackupTargetPlan.Of(
            [Request("nightly"), Request("weekly", accessKeyId: "AKIDEXAMPLE", secret: "secret")], [Nightly]);

        plan.Problem.Should().BeEmpty();
        var added = plan.Decisions[1];
        added.IsNew.Should().BeTrue();
        added.NeedsSeal.Should().BeTrue();
        added.Probe.Should().BeTrue();
        added.Mark.Should().Be("+");
        plan.Removed.Should().BeEmpty();
    }

    [Fact]
    public void TheDeltaNamesAddedChangedAndRemovedAndNeverAKeyOrAnEndpoint()
    {
        var weekly = Sealer.Seal(TargetKinds.S3, "https://s3.example.com", "eu-central-1", "vaults", "weekly", Secrets);
        var plan = BackupTargetPlan.Of(
            [
                Request("nightly", region: "eu-west-1"),
                Request("daily", accessKeyId: "AKIDEXAMPLE", secret: "secret"),
            ],
            [Nightly, weekly]);

        plan.Removed.Should().ContainSingle().Which.Should().Be(weekly);
        plan.Delta.Should().Be("destinations ~s3 vaults/nightly +s3 vaults/daily -s3 vaults/weekly");
        plan.Delta.Should().NotContain("AKIDEXAMPLE").And.NotContain("secret").And.NotContain("s3.example.com");
    }

    [Fact]
    public void TwoRequestsWithOneIdentityAreRefusedByName()
    {
        // The keep-the-keys rule matches by identity, so two records with one identity would leave every
        // later edit matching the first and the second unreachable for ever.
        var plan = BackupTargetPlan.Of(
            [
                Request("nightly", accessKeyId: "a", secret: "b"),
                Request("nightly", region: "eu-west-1", accessKeyId: "c", secret: "d"),
            ],
            []);

        plan.Problem.Should().Contain("s3 vaults/nightly").And.Contain("twice");
        plan.Decisions.Should().BeEmpty("a refused plan decides nothing");
    }

    [Fact]
    public void ARequestTheValidatorRefusesIsRefusedWithItsNameInFront()
    {
        // The validator's own sentence, prefixed with which destination — a settings document can carry
        // several, and "a bucket name is required" alone does not say which one.
        var plan = BackupTargetPlan.Of([Request("nightly") with { Endpoint = "http://s3.example.com" }], [Nightly]);

        plan.Problem.Should().StartWith("s3 vaults/nightly: ").And.Contain("must be https");
    }

    [Fact]
    public void AFirstSaveWithoutCredentialsIsRefusedBecauseThereIsNothingToKeep()
    {
        var plan = BackupTargetPlan.Of([Request("brand-new")], [Nightly]);

        plan.Problem.Should().Contain("required the first time this target is saved");
    }

    [Fact]
    public void AnAzureRecordDescribesItselfWithoutARegionAndTheDeltaAgrees()
    {
        // The delta and the page share one spelling — SealedTarget.DescribeAs — so the history and the
        // tab name the same destination the same way.
        var azure = new BackupTargetRequest(
            TargetKinds.AzureBlob, "https://acct.blob.core.windows.net", string.Empty, "vaults", "nightly",
            null, null, "acct", "a2V5");

        var plan = BackupTargetPlan.Of([azure], []);

        plan.Decisions.Should().ContainSingle().Which.Describe.Should().Be("azure vaults/nightly");
        plan.Delta.Should().Be("destinations +azure vaults/nightly");
    }

    private static BackupTargetRequest Request(
        string prefix, string region = "eu-central-1", string? accessKeyId = null, string? secret = null) =>
        new(TargetKinds.S3, "https://s3.example.com", region, "vaults", prefix, accessKeyId, secret, null, null);

    /// <summary>Nothing here builds a client; the plan never reaches the network.</summary>
    private sealed class NoClients : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => throw new InvalidOperationException("a plan sends nothing");
    }
}
