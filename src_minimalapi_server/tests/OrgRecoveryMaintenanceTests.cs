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

    [Fact]
    public async Task AnExpiredSessionIsClosedAndALiveOneIsLeftAlone()
    {
        // A session is a live authorisation to read one person's vault. It carries its own
        // deadline rather than being aged like an invite, because how long that authorisation
        // stands is a decision made when it starts, not one derived later from a file's mtime.
        var (store, dir) = NewStore();
        try
        {
            var now = DateTimeOffset.UtcNow;
            await store.WriteSessionAsync(
                new RecoverySession
                {
                    SessionId = "expired",
                    InitiatorEmail = "cto@example.com",
                    TargetEmail = "departed@example.com",
                    ExpiresAt = now.AddHours(-1).ToUnixTimeMilliseconds(),
                },
                Ct);
            await store.WriteSessionAsync(
                new RecoverySession
                {
                    SessionId = "live",
                    InitiatorEmail = "cto@example.com",
                    TargetEmail = "departed@example.com",
                    ExpiresAt = now.AddHours(+1).ToUnixTimeMilliseconds(),
                },
                Ct);

            var sweep = new OrgRecoveryMaintenance(
                store, NullLogger<OrgRecoveryMaintenance>.Instance,
                TimeSpan.FromHours(1), TimeSpan.FromHours(72));
            await sweep.SweepAsync(Ct);

            (await store.ReadSessionAsync("expired", Ct)).Should().BeNull();
            (await store.ReadSessionAsync("live", Ct)).Should().NotBeNull("a live session must survive");
        }
        finally
        {
            Directory.Delete(dir, recursive: true);
        }
    }

    [Fact]
    public async Task ExpiringASessionTakesItsCollectedContributionsWithIt()
    {
        // The contributions ARE the sensitive part — each is an officer's share, resealed. A
        // sweep that dropped the session record and left them behind would leave a quorum's
        // worth of material on disk with nothing pointing at it.
        var (store, dir) = NewStore();
        try
        {
            await store.WriteSessionAsync(
                new RecoverySession
                {
                    SessionId = "expired",
                    InitiatorEmail = "cto@example.com",
                    TargetEmail = "departed@example.com",
                    ExpiresAt = DateTimeOffset.UtcNow.AddHours(-1).ToUnixTimeMilliseconds(),
                    Contributions =
                    [
                        new SessionContribution
                        {
                            OfficerEmail = "lead@example.com",
                            ShareIndex = 2,
                            Data = Convert.ToBase64String(new byte[48]),
                        },
                    ],
                },
                Ct);

            var sweep = new OrgRecoveryMaintenance(
                store, NullLogger<OrgRecoveryMaintenance>.Instance,
                TimeSpan.FromHours(1), TimeSpan.FromHours(72));
            await sweep.SweepAsync(Ct);

            (await store.ReadSessionAsync("expired", Ct)).Should().BeNull();
            Directory.EnumerateFiles(Path.Combine(dir, "org-recovery", "sessions"))
                .Should().BeEmpty("nothing of the session may outlive it");
        }
        finally
        {
            Directory.Delete(dir, recursive: true);
        }
    }

    [Fact]
    public async Task DroppingOneCeremonyLeavesAnotherCeremonyIntact()
    {
        // Superseding a ceremony must not disturb one that is still being run — the shares of
        // the second belong to a key that may already be published.
        var (store, dir) = NewStore();
        try
        {
            var doomed = Guid.NewGuid().ToString();
            var keep = Guid.NewGuid().ToString();
            var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            await store.AppendInviteAsync(Invite("lead@example.com", now, doomed), Ct);
            await store.AppendInviteAsync(Invite("devops@example.com", now, doomed), Ct);
            await store.AppendInviteAsync(Invite("lead@example.com", now, keep), Ct);

            var dropped = await store.DropInvitesAsync(doomed, Ct);

            dropped.Should().Be(2);
            (await CountAsync(store, "lead@example.com")).Should().Be(1, "the other ceremony survives");
            (await CountAsync(store, "devops@example.com")).Should().Be(0);
        }
        finally
        {
            Directory.Delete(dir, recursive: true);
        }
    }

    [Fact]
    public async Task TheAuditLogSurvivesEverySweepAndKeepsItsOrder()
    {
        // Never pruned, by design: a recovery nobody can look up afterwards is a recovery
        // nobody can question, and being witnessed is the point of a quorum.
        var (store, dir) = NewStore();
        try
        {
            foreach (var target in new[] { "first@example.com", "second@example.com" })
            {
                await store.AppendAuditAsync(
                    new AuditEntryDto(
                        Guid.NewGuid().ToString(), "vault-recovery", "cto@example.com", target,
                        ["cto@example.com", "lead@example.com"], 1, 2),
                    Ct);
            }

            var sweep = new OrgRecoveryMaintenance(
                store, NullLogger<OrgRecoveryMaintenance>.Instance,
                TimeSpan.FromHours(1), TimeSpan.FromMilliseconds(1));
            await sweep.SweepAsync(Ct);

            var entries = new List<AuditEntryDto>();
            await foreach (var entry in store.ReadAuditAsync(Ct))
            {
                entries.Add(entry);
            }

            entries.Should().HaveCount(2);
            entries[0].TargetEmail.Should().Be("first@example.com", "oldest first");
            entries[1].TargetEmail.Should().Be("second@example.com");
        }
        finally
        {
            Directory.Delete(dir, recursive: true);
        }
    }

    [Fact]
    public async Task ATornLastLineDoesNotHideTheAuditEntriesBeforeIt()
    {
        // NDJSON is chosen so a crash mid-append costs the line being written and nothing else.
        // That is only true if the reader actually skips it.
        var (store, dir) = NewStore();
        try
        {
            await store.AppendAuditAsync(
                new AuditEntryDto("s1", "vault-recovery", "cto@example.com", "departed@example.com",
                    ["cto@example.com"], 1, 2),
                Ct);
            await File.AppendAllTextAsync(
                Path.Combine(dir, "org-recovery", "audit.log"), "{\"sessionId\": \"tor", Ct);

            var entries = new List<AuditEntryDto>();
            await foreach (var entry in store.ReadAuditAsync(Ct))
            {
                entries.Add(entry);
            }

            entries.Should().HaveCount(1, "the complete line before the torn one survives");
        }
        finally
        {
            Directory.Delete(dir, recursive: true);
        }
    }
}
