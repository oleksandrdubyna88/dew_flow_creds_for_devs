using Microsoft.Extensions.Logging.Abstractions;
using FluentAssertions;

namespace CredVaultServer.Tests;

/// <summary>
/// The sweep that stops a stalled ceremony living forever.
///
/// <para>Driven against the store directly rather than through the hosted service: the timer is
/// the part least worth testing and the hardest to test quickly, while the decision — which
/// invites are too old — is the part that can be wrong.</para>
/// </summary>
public sealed class OrgRecoveryMaintenanceTests
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static (OrgRecoveryStore Store, string Dir) NewStore()
    {
        var dir = Path.Combine(Path.GetTempPath(), "cred-vault-tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        return (new OrgRecoveryStore(dir), dir);
    }

    private static EscrowInviteItem Invite(string toEmail, long createdAt, string? setupId = null) =>
        new()
        {
            SetupId = setupId ?? Guid.NewGuid().ToString(),
            FromEmail = "cto@example.com",
            ToEmail = toEmail,
            ShareIndex = 1,
            Threshold = 2,
            TotalShares = 3,
            CreatedAt = createdAt,
            Salt = Convert.ToBase64String(new byte[16]),
            Iv = Convert.ToBase64String(new byte[12]),
            Tag = Convert.ToBase64String(new byte[16]),
            Data = Convert.ToBase64String(new byte[48]),
        };

    private static async Task<int> CountAsync(OrgRecoveryStore store, string email)
    {
        var seen = 0;
        await foreach (var _ in store.ListInvitesAsync(email, Ct))
        {
            seen++;
        }
        return seen;
    }

    [Fact]
    public async Task AnInviteNobodyAnsweredIsDroppedOnceItIsOldEnough()
    {
        // A ceremony that stalls otherwise leaves sealed shares in inboxes forever, and an
        // officer cannot tell a live invitation from a dead one.
        var (store, dir) = NewStore();
        try
        {
            var now = DateTimeOffset.UtcNow;
            await store.AppendInviteAsync(
                Invite("lead@example.com", now.AddHours(-100).ToUnixTimeMilliseconds()), Ct);
            await store.AppendInviteAsync(
                Invite("lead@example.com", now.AddHours(-1).ToUnixTimeMilliseconds()), Ct);

            var sweep = new OrgRecoveryMaintenance(
                store, NullLogger<OrgRecoveryMaintenance>.Instance,
                TimeSpan.FromHours(1), TimeSpan.FromHours(72));
            await sweep.SweepAsync(Ct);

            (await CountAsync(store, "lead@example.com"))
                .Should().Be(1, "only the one past the TTL goes");
        }
        finally
        {
            Directory.Delete(dir, recursive: true);
        }
    }

    [Fact]
    public async Task ThePublishedKeySurvivesASweep()
    {
        // The sweep bounds an unfinished ceremony. Taking the FINISHED one's key with it would
        // disable corporate recovery on a working server, silently.
        var (store, dir) = NewStore();
        try
        {
            await store.WriteSetupAsync(
                new OrgRecoverySetup
                {
                    SetupId = Guid.NewGuid().ToString(),
                    OrgPublicKey = Convert.ToBase64String(new byte[32]),
                    PublishedAt = DateTimeOffset.UtcNow.AddYears(-2).ToUnixTimeMilliseconds(),
                },
                Ct);

            var sweep = new OrgRecoveryMaintenance(
                store, NullLogger<OrgRecoveryMaintenance>.Instance,
                TimeSpan.FromHours(1), TimeSpan.FromHours(1));
            await sweep.SweepAsync(Ct);

            (await store.ReadSetupAsync(Ct)).Should().NotBeNull("a published key has no TTL");
        }
        finally
        {
            Directory.Delete(dir, recursive: true);
        }
    }

    [Fact]
    public async Task AnUnreadableInviteDoesNotHideTheRestOfAnInbox()
    {
        // One hand-edited or half-written file must not take an officer's whole inbox with it.
        var (store, dir) = NewStore();
        try
        {
            await store.AppendInviteAsync(
                Invite("lead@example.com", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()), Ct);
            var inbox = Path.Combine(dir, "org-recovery", "invites", VaultStore.KeyFor("lead@example.com"));
            await File.WriteAllTextAsync(Path.Combine(inbox, "broken.json"), "{ not json", Ct);

            (await CountAsync(store, "lead@example.com")).Should().Be(1);
        }
        finally
        {
            Directory.Delete(dir, recursive: true);
        }
    }
}
