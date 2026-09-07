using System.Globalization;

namespace CredVaultServer;

/// <summary>What one run did, in the words the status file and the event row both use.</summary>
public static class BackupRunResults
{
    /// <summary>Written BEFORE the work starts, so a page reloaded mid-run says the truth.</summary>
    public const string InProgress = "in progress";

    public const string Succeeded = "ok";

    public const string Failed = "failed";

    /// <summary>A run that never started, because something was not ready for it.</summary>
    public const string Refused = "refused";

    public const string NeverRun = "never run";

    /// <summary>
    /// Whether a run is live, asked in ONE place.
    /// </summary>
    /// <remarks>
    /// The status file carries a single field saying what state the last run is in, and every reader —
    /// the DTO's <c>Running</c> flag, the scheduler, the page — derives from it here. Two fields would
    /// be two things that can disagree, and a page showing "finished" beside a spinner is the shape of
    /// bug rule 8 exists to prevent.
    /// </remarks>
    public static bool IsRunning(string lastResult) =>
        string.Equals(lastResult, InProgress, StringComparison.Ordinal);
}

/// <summary>
/// When a scheduled backup is due — a pure function, because nobody can debug this in production.
/// </summary>
/// <remarks>
/// <para><b>Due is a question about the DAY, not a sleep until the hour.</b> Sleeping until 03:00
/// means a restart at 02:59 skips the day, which is exactly the shape of failure a nightly backup
/// cannot have. So a five-minute timer asks this instead.</para>
///
/// <para><b>And it asks <c>hour >= configured</c>, not <c>==</c>.</b> A server that was stopped,
/// restarting or unreachable through its whole window would otherwise skip the day entirely — the
/// review round caught that this contradicted the plan's own promise to catch up on the way in. With
/// <c>>=</c>, a server that comes back at 07:00 takes the day's backup at 07:00 and then not again
/// until tomorrow.</para>
///
/// <para><b>"Not again today" is measured from the last run, in UTC.</b> Everything persisted here is
/// UTC (<c>utc-timestamps.md</c>), so the calendar day is the UTC one on both sides of the
/// comparison — a local-time day boundary would move the whole schedule for half the world.</para>
/// </remarks>
public static class BackupSchedule
{
    /// <summary>How often the question is asked. Small enough to be prompt, large enough to be free.</summary>
    public static readonly TimeSpan Interval = TimeSpan.FromMinutes(5);

    /// <summary>Whether a run should start now, given when the last one finished.</summary>
    public static bool IsDue(DateTimeOffset now, int scheduleHourUtc, long lastRunAtUnixMs) =>
        now.UtcDateTime.Hour >= scheduleHourUtc && !AlreadyRanToday(now, lastRunAtUnixMs);

    private static bool AlreadyRanToday(DateTimeOffset now, long lastRunAtUnixMs) =>
        lastRunAtUnixMs > 0
        && DateTimeOffset.FromUnixTimeMilliseconds(lastRunAtUnixMs).UtcDateTime.Date == now.UtcDateTime.Date;
}

/// <summary>
/// What an archive on disk is called, and how a name is read back as an instant.
/// </summary>
/// <remarks>
/// <para><b>The name carries the date, and retention reads the NAME.</b> Not the mtime: a restore
/// rewrites every mtime, so a sweep that trusted them would delete a month of archives the first time
/// somebody recovered a server — the one moment nobody can afford a second failure. This is the same
/// reason the share prune reads each item's own <c>createdAt</c> rather than its file's timestamp.</para>
///
/// <para>UTC, sortable, and the same shape the shell backup's files already use, so a directory
/// holding both is still a directory somebody can read.</para>
/// </remarks>
public static class ArchiveName
{
    public const string Extension = ".cvbk";

    /// <summary>What the scan matches. A half-written archive is <c>*.cvbk.partial</c> and never matches.</summary>
    public const string Pattern = "cred-vault-*" + Extension;

    private const string Stamp = "yyyyMMdd-HHmmss";

    private const string Prefix = "cred-vault-";

    public static string For(DateTimeOffset at) =>
        $"{Prefix}{at.UtcDateTime.ToString(Stamp, CultureInfo.InvariantCulture)}Z{Extension}";

    /// <summary>
    /// The instant a name stands for, or nothing when it is not one of ours.
    /// </summary>
    /// <remarks>
    /// A file in the archives directory that this cannot read is left alone by retention rather than
    /// being deleted on a guess: somebody's own copy of something, sitting where they put it, is not
    /// this sweep's to remove.
    /// </remarks>
    public static DateTimeOffset? InstantOf(string fileName)
    {
        var name = Path.GetFileName(fileName);
        if (!name.StartsWith(Prefix, StringComparison.Ordinal) || !name.EndsWith($"Z{Extension}", StringComparison.Ordinal))
        {
            return null;
        }
        var stamp = name[Prefix.Length..^(Extension.Length + 1)];
        return DateTime.TryParseExact(
            stamp, Stamp, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
            out var parsed)
            ? new DateTimeOffset(parsed, TimeSpan.Zero)
            : null;
    }
}

/// <summary>
/// One archive on disk: what it is called, when it was taken, and how big it is.
/// </summary>
public sealed record LocalArchive(string Path, DateTimeOffset TakenAt, long Bytes)
{
    public static readonly LocalArchive None = new(string.Empty, DateTimeOffset.MinValue, 0);

    public bool Exists => Path.Length > 0;

    public string Name => System.IO.Path.GetFileName(Path);
}
