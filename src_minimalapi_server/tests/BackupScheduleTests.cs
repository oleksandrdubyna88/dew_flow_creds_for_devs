using FluentAssertions;

namespace CredVaultServer.Tests;

/// <summary>
/// When a nightly backup is due — the part nobody can debug in production.
/// </summary>
/// <remarks>
/// A table, because every row here is a night somebody's backup either happened or did not, and the
/// two failures are opposite: sleeping until the hour skips the night on a restart at 02:59, while
/// asking <c>hour == configured</c> skips the whole DAY if the server was down through the window.
/// </remarks>
public class BackupScheduleTests
{
    private static DateTimeOffset At(string utc) => DateTimeOffset.Parse(utc).ToUniversalTime();

    private static long Ms(string utc) => At(utc).ToUnixTimeMilliseconds();

    [Fact]
    public void ARunIsDueAtTheHourWhenNothingHasRun()
    {
        BackupSchedule.IsDue(At("2026-09-07T03:00:00Z"), 3, 0).Should().BeTrue();
    }

    [Fact]
    public void ARestartAtTwoFiftyNineDoesNotSkipTheNight()
    {
        // The whole reason this is a question asked every five minutes rather than a sleep.
        BackupSchedule.IsDue(At("2026-09-07T02:59:00Z"), 3, 0).Should().BeFalse("the hour has not come");
        BackupSchedule.IsDue(At("2026-09-07T03:04:00Z"), 3, 0).Should().BeTrue("and five minutes later it has");
    }

    [Fact]
    public void AServerThatWasDownThroughTheWholeWindowStillTakesTheDaysBackup()
    {
        // `hour == configured` would skip the day entirely, which contradicts the promise to catch up
        // on the way in. The review round caught exactly this.
        BackupSchedule.IsDue(At("2026-09-07T07:00:00Z"), 3, 0).Should().BeTrue();
        BackupSchedule.IsDue(At("2026-09-07T23:55:00Z"), 3, 0).Should().BeTrue("still the same day");
    }

    [Fact]
    public void ADayThatHasAlreadyHadItsBackupDoesNotGetASecond()
    {
        BackupSchedule.IsDue(At("2026-09-07T09:00:00Z"), 3, Ms("2026-09-07T03:00:00Z")).Should().BeFalse();
    }

    [Fact]
    public void AndTomorrowItIsDueAgain()
    {
        BackupSchedule.IsDue(At("2026-09-08T03:00:00Z"), 3, Ms("2026-09-07T03:00:00Z")).Should().BeTrue();
    }

    [Fact]
    public void TheDayBoundaryIsUtcOnBothSidesOfTheComparison()
    {
        // A run at 23:30Z and a question at 00:30Z the next day are different days, and must be —
        // everything persisted here is UTC, so a local boundary would move the schedule for half the
        // world and make "already ran today" mean different things on two hosts.
        BackupSchedule.IsDue(At("2026-09-08T00:30:00Z"), 0, Ms("2026-09-07T23:30:00Z")).Should().BeTrue();
        BackupSchedule.IsDue(At("2026-09-07T23:59:00Z"), 0, Ms("2026-09-07T00:30:00Z")).Should().BeFalse();
    }

    [Fact]
    public void MidnightAsAScheduleHourIsNotASpecialCase()
    {
        BackupSchedule.IsDue(At("2026-09-07T00:00:00Z"), 0, 0).Should().BeTrue();
        BackupSchedule.IsDue(At("2026-09-07T13:00:00Z"), 0, 0).Should().BeTrue("the hour has long passed");
    }

    [Fact]
    public void TheIntervalIsFiveMinutes()
    {
        // Named rather than assumed: small enough that the run starts inside its window, large enough
        // that asking costs one status-file read a tick.
        BackupSchedule.Interval.Should().Be(TimeSpan.FromMinutes(5));
    }

    [Theory]
    [InlineData("2026-09-07T03:04:05Z", "cred-vault-20260907-030405Z.cvbk")]
    [InlineData("2026-01-01T00:00:00Z", "cred-vault-20260101-000000Z.cvbk")]
    public void AnArchiveIsNamedForTheInstantItWasTaken(string at, string name)
    {
        ArchiveName.For(At(at)).Should().Be(name);
        ArchiveName.InstantOf(name).Should().Be(At(at));
    }

    [Theory]
    [InlineData("cred-vault-20260907-030405Z.cvbk.partial", "a build in flight is not an archive")]
    [InlineData("somebody-elses-copy.cvbk", "not one of ours, and not this sweep's to delete")]
    [InlineData("cred-vault-notadate-Z.cvbk", "shaped like ours and unreadable")]
    [InlineData("cred-vault-20260907-030405.cvbk", "no Z, so not the name this build writes")]
    public void ANameThisBuildDidNotWriteHasNoInstantAndIsLeftAlone(string name, string why)
    {
        ArchiveName.InstantOf(name).Should().BeNull(why);
    }

    [Fact]
    public void TheRunningStateIsDerivedInOnePlace()
    {
        // Two fields would be two things that can disagree, and a page showing "finished" beside a
        // spinner is the shape of bug rule 8 exists to prevent.
        BackupRunResults.IsRunning(BackupRunResults.InProgress).Should().BeTrue();
        BackupRunResults.IsRunning(BackupRunResults.Succeeded).Should().BeFalse();
        BackupRunResults.IsRunning(BackupRunResults.Failed).Should().BeFalse();
        BackupRunResults.IsRunning(BackupRunResults.NeverRun).Should().BeFalse();
    }
}
