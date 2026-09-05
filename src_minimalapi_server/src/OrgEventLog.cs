using System.Globalization;
using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace CredVaultServer;

/// <summary>
/// One row of the corporate event log. Metadata only, by the umbrella's invariant: an entity NAME and
/// KIND, which a share already carries in plaintext, and never content. The shape belongs to the
/// event-log epic, which owns the reader; it is defined here because the writer ships first, so that
/// the registry, blocking and projects record from their first commit.
/// </summary>
public sealed record OrgEventDto(
    long At,
    string Kind,
    string Actor,
    string? Subject,
    string? Project,
    string? ShareId,
    string? EntityName,
    string? EntityKind,
    string? Outcome,
    string? Detail);

/// <summary>
/// The kinds this epic emits. The union of every epic's kinds lives in the event-log plan; a kind is
/// a string on the wire so an older reader shows one it does not know rather than dropping the row.
/// </summary>
public static class OrgEventKinds
{
    /// <summary>
    /// A record was CREATED. Two emitters, one kind: the sync hook, with the person as the actor, and an
    /// admin who sets a role before the person's first sync, with the admin as the actor.
    /// </summary>
    public const string MemberRegistered = "member.registered";

    public const string MemberRoleChanged = "member.role_changed";

    public const string MemberShareDefaultChanged = "member.share_default_changed";

    public const string SettingsChanged = "settings.changed";
}

/// <summary>
/// Append-only NDJSON at <c>${DataDir}/org/events/&lt;yyyy-MM-dd&gt;.ndjson</c>, one file per UTC day.
///
/// <para><b>Its own root, never under <c>org-recovery/</c>.</b> Both maintenance sweeps walk named
/// subdirectories, which is precisely why the break-glass audit log has survived; a log parked under a
/// folder somebody might one day enumerate wholesale is a log with a deletion waiting for it. A test
/// pins that both sweeps leave this folder alone. Kept forever, by owner decision 11: about 50 KB a
/// day, 18 MB a year, on the same disk as the vaults.</para>
///
/// <para><b>One dedicated lock, in two halves, not the vault's stripe of 64.</b> Striping works when
/// writers touch different files; here every writer appends to the same day file, so a "per-file lock"
/// is this lock under another name, and a stripe would race inside one day. The in-process half is a
/// <see cref="SemaphoreSlim"/>; the cross-process half is <c>.append.lock</c> in the same folder, opened
/// exclusively for the length of one probe and one write, because a rolling restart has two instances
/// writing the same day file for a while and the file system gives them no ordering on its own (see
/// <see cref="WriteRowAsync"/> for what was measured). <b>The wait is bounded</b> — both halves share one
/// deadline of <see cref="DefaultLockWait"/> — because an unbounded wait on a request path is how one
/// stuck writer becomes a stalled server. Past the bound the row is abandoned under the rule below.</para>
///
/// <para><b>A failed append never fails its caller.</b> The row is written AFTER the mutation has
/// landed, so a role change that happened must not be reported as a <c>500</c> — a client that retried
/// would be acting on a lie. <see cref="AppendAsync"/> answers <c>false</c> and logs at Error naming the
/// file, the kind, the actor and the subject, so that the trail degrades to the server log rather than
/// vanishing; that line is the operator's signal that the log has stopped recording.</para>
///
/// <para><b>The appender guarantees the shape of the file, not the reader's tolerance of it.</b> When
/// the file's last byte is not a newline — a process killed mid-append — a newline goes first, so the
/// torn row and the new one cannot fuse into one unparseable line; the reader then loses one row where
/// it would have lost two. The break-glass audit log's bare <c>File.AppendAllTextAsync</c> is the
/// precedent for the format, not for the locking: a recovery is rare, a role change is not.</para>
///
/// <para>The day is the clock's at append time, and the clock is injected so a day boundary is a test
/// rather than a wait until midnight.</para>
/// </summary>
public sealed class OrgEventLog(
    string dataDir,
    ILogger<OrgEventLog> log,
    Func<DateTimeOffset> clock,
    TimeSpan? lockWait = null)
{
    public static readonly TimeSpan DefaultLockWait = TimeSpan.FromSeconds(5);

    /// <summary>How long a writer sleeps between attempts on the cross-process lock. A write holds it for microseconds.</summary>
    private static readonly TimeSpan LockPoll = TimeSpan.FromMilliseconds(5);

    private static readonly byte[] Newline = "\n"u8.ToArray();

    private readonly string _dir = Path.Combine(dataDir, "org", "events");
    private readonly string _lockPath = Path.Combine(dataDir, "org", "events", ".append.lock");
    private readonly TimeSpan _lockWait = lockWait ?? DefaultLockWait;
    private readonly SemaphoreSlim _gate = new(1, 1);

    /// <summary>
    /// The day file a row appended at <paramref name="at"/> lands in — the UTC day, whatever offset the
    /// value carries. Public so a reader, and a test, asks the log for the name rather than guessing it.
    /// </summary>
    public string PathForDay(DateTimeOffset at) =>
        Path.Combine(_dir, at.UtcDateTime.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) + ".ndjson");

    /// <summary>Held from a test to prove the wait is bounded; nothing in the server touches this.</summary>
    internal SemaphoreSlim Gate => _gate;

    /// <summary>
    /// Append one row. Never throws; <c>false</c> means the row was lost, and the log names the file.
    /// </summary>
    public async Task<bool> AppendAsync(OrgEventDto row, CancellationToken ct)
    {
        var path = PathForDay(clock());
        var deadline = DateTime.UtcNow + _lockWait;
        if (!await TryEnterAsync(path, row, deadline, ct))
        {
            return false;
        }
        try
        {
            Directory.CreateDirectory(_dir);
            await using var held = await HoldAcrossProcessesAsync(deadline, ct);
            await WriteRowAsync(path, JsonSerializer.SerializeToUtf8Bytes(row, AppJsonContext.Default.OrgEventDto), ct);
            return true;
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or OperationCanceledException)
        {
            // Actor and subject ride along so that when the NDJSON append fails the trail degrades to
            // the server log instead of vanishing.
            log.LogError(
                e,
                "event log {Path}: a {Kind} row by {Actor} about {Subject} was lost; the log has stopped recording",
                path,
                row.Kind,
                row.Actor,
                row.Subject ?? "(nobody)");
            return false;
        }
        finally
        {
            _gate.Release();
        }
    }

    private async Task<bool> TryEnterAsync(string path, OrgEventDto row, DateTime deadline, CancellationToken ct)
    {
        try
        {
            if (await _gate.WaitAsync(Remaining(deadline), ct))
            {
                return true;
            }
            log.LogError(
                "event log {Path}: the writer lock was not free within {Wait}; a {Kind} row by {Actor} about {Subject} was abandoned rather than stall the request",
                path,
                _lockWait,
                row.Kind,
                row.Actor,
                row.Subject ?? "(nobody)");
            return false;
        }
        catch (OperationCanceledException)
        {
            log.LogError(
                "event log {Path}: the request was cancelled while waiting for the writer lock; a {Kind} row by {Actor} about {Subject} was abandoned",
                path,
                row.Kind,
                row.Actor,
                row.Subject ?? "(nobody)");
            return false;
        }
    }

    private static TimeSpan Remaining(DateTime deadline)
    {
        var left = deadline - DateTime.UtcNow;
        return left > TimeSpan.Zero ? left : TimeSpan.Zero;
    }

    /// <summary>
    /// The cross-process half of the lock: an exclusive handle on <c>.append.lock</c>, retried every
    /// <see cref="LockPoll"/> until the shared deadline. Past it the sharing violation propagates and the
    /// row is abandoned under the never-fail-the-caller rule, with the log naming the file. A separate
    /// file rather than the day file itself, so that readers — the query, an operator's <c>tail</c> — are
    /// never refused by a writer.
    /// </summary>
    private async Task<FileStream> HoldAcrossProcessesAsync(DateTime deadline, CancellationToken ct)
    {
        while (true)
        {
            try
            {
                return new FileStream(
                    _lockPath, FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None, bufferSize: 1, FileOptions.None);
            }
            catch (IOException) when (DateTime.UtcNow < deadline)
            {
                await Task.Delay(LockPoll, ct);
            }
        }
    }

    /// <summary>
    /// One write per row, so a crash costs at most the row being written.
    ///
    /// <para>Opened for append with <see cref="FileShare.ReadWrite"/>, and the torn-tail probe is a
    /// separate short read opened the same way. What this buys: a second instance — a rolling restart
    /// has two for a while — can open the same day file at all and append instead of being refused and
    /// losing its row, and a reader holding the file open never blocks a writer.</para>
    ///
    /// <para>What it does NOT buy, measured before <c>.append.lock</c> existed: an atomic append. .NET's
    /// <see cref="FileMode.Append"/> is <see cref="FileMode.OpenOrCreate"/> plus a seek to the end at open
    /// time — no <c>O_APPEND</c>, no <c>FILE_APPEND_DATA</c> — so two writers that opened at the same
    /// length wrote at the same offset, and 71 of 400 rows from two instances were overwritten while
    /// every one of them reported success. The lock file is what serialises writers across processes;
    /// this method assumes the caller holds it. What remains true, and is fine: two processes interleave
    /// whole rows, which NDJSON tolerates by construction — one row per line, none depending on the
    /// one before.</para>
    /// </summary>
    private static async Task WriteRowAsync(string path, byte[] row, CancellationToken ct)
    {
        byte[] separator = await EndsMidLineAsync(path, ct) ? Newline : [];
        byte[] line = [.. separator, .. row, .. Newline];
        await using var stream = new FileStream(
            path, FileMode.Append, FileAccess.Write, FileShare.ReadWrite, bufferSize: 0, useAsync: true);
        await stream.WriteAsync(line, ct);
        await stream.FlushAsync(ct);
    }

    private static async Task<bool> EndsMidLineAsync(string path, CancellationToken ct)
    {
        await using var probe = new FileStream(
            path, FileMode.OpenOrCreate, FileAccess.Read, FileShare.ReadWrite, bufferSize: 0, useAsync: true);
        if (probe.Length == 0)
        {
            return false;
        }
        probe.Seek(-1, SeekOrigin.End);
        var last = new byte[1];
        await probe.ReadExactlyAsync(last, ct);
        return last[0] != (byte)'\n';
    }
}
