using System.Globalization;

namespace CredVaultServer;

/// <summary>
/// The named owner of <c>logs/</c> retention: a startup prune, per the shared logging rule's
/// "everything that grows has an owner" clause.
///
/// <para>A file per run over a long-lived deployment is an unbounded count — a service restarted
/// daily for a year leaves 365 files. The extension settled this shape first
/// (`diagnosticLog.ts`, 14 days swept at activation); the server adopts the same number rather
/// than inventing a second answer for one product.</para>
///
/// <para>Whole DAY FOLDERS are deleted, never individual files: the folder name is the age, and
/// a day older than the cutoff cannot contain the current run's file — today's folder is never
/// eligible, so the file being written is structurally safe. A folder that does not parse as a
/// date is left alone: it is not ours to delete.</para>
/// </summary>
public static class LogRetention
{
    /// <summary>The extension's `retainDays` default — one product, one answer.</summary>
    public const int DefaultRetainDays = 14;

    /// <summary>
    /// The day folders under <paramref name="logRoot"/> that a prune at <paramref name="todayUtc"/>
    /// should delete. Pure — the decision, separated from the deleting, is the tested half.
    /// </summary>
    public static IReadOnlyList<string> FoldersToPrune(
        IEnumerable<string> dayFolderNames,
        DateOnly todayUtc,
        int retainDays)
    {
        if (retainDays <= 0)
        {
            return []; // 0 disables the sweep, mirroring the extension's contract.
        }

        var cutoff = todayUtc.AddDays(-retainDays);
        return [.. dayFolderNames.Where(name =>
            DateOnly.TryParseExact(name, "yyyy-MM-dd", CultureInfo.InvariantCulture,
                DateTimeStyles.None, out var day)
            && day < cutoff)];
    }

    /// <summary>
    /// Deletes expired day folders under <paramref name="logRoot"/>. Failures are reported to the
    /// console and swallowed — retention is housekeeping, and housekeeping that can stop a start
    /// is worse than a fat disk.
    /// </summary>
    public static void PruneAtStartup(string logRoot, DateOnly todayUtc, int retainDays)
    {
        try
        {
            if (!Directory.Exists(logRoot))
            {
                return;
            }

            var names = Directory.GetDirectories(logRoot).Select(Path.GetFileName).OfType<string>();
            foreach (var name in FoldersToPrune(names, todayUtc, retainDays))
            {
                Directory.Delete(Path.Combine(logRoot, name), recursive: true);
            }
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            Console.Error.WriteLine($"log retention sweep failed ({ex.Message}); continuing.");
        }
    }
}
