using System.Globalization;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;

namespace CredsForDevs.Tests.Leftovers;

/// <summary>The layout self-test of the macOS <c>lstat</c> read. Nobody has measured Darwin's <c>struct stat</c> on a machine of this
/// repository, so every field the helper uses is checked on the runner against something KNOWN before any other test is trusted: the
/// caller's uid from <c>getuid</c>, the kind of a folder, a file and a link, a mode the managed API reports, an inode that is not zero and
/// does not change between two reads, a modification time set to a known second and then moved by a write, a size equal to the bytes written,
/// and — as a second witness that shares no code with this read — what <c>/usr/bin/stat -f</c> says about the same file.
///
/// <para>A wrong offset gives a plausible number, never an error, and an identity that is guessed could authorise a removal. So
/// <see cref="Require"/> runs this once per process and THROWS when any check fails: every sweep and audit test calls it first, and fails
/// with the list of the checks that did not hold.</para></summary>
internal static class DarwinLayout
{
    private const int Written = 1234, Appended = 100;
    private const long KnownSeconds = 1_000_000_000; // 2001-09-09T01:46:40Z

    private static readonly Lazy<Report> Once = new(() => OperatingSystem.IsMacOS() ? MeasureInAFolderOfItsOwn() : throw new PlatformNotSupportedException("the layout is measured on macOS only"));

    /// <summary>The values read (one line each, for the log) and the checks that failed (none = the layout holds).</summary>
    internal sealed record Report(IReadOnlyList<string> Values, IReadOnlyList<string> Problems)
    {
        public bool Passed => Problems.Count == 0;
    }

    /// <summary>Off macOS nothing. On macOS: the first call measures, a layout that does not hold throws on this call and every later one.</summary>
    internal static void Require()
    {
        if (!OperatingSystem.IsMacOS()) return;
        var report = Once.Value;
        if (!report.Passed)
        {
            throw new InvalidOperationException($"the macOS lstat layout does not hold, so no identity read here can be trusted: {string.Join("; ", report.Problems)}");
        }
    }

    /// <summary>The scope of a test class whose every test stands on the identity read: the layout is required BEFORE the scope exists, so a
    /// class built on a wrong layout fails in its constructor. Used as a field initializer of the class.</summary>
    internal static OwnedScope FreshOwnedScope()
    {
        Require();
        return new OwnedScope();
    }

    /// <summary>The shared measurement, for the tests that print its values (macOS only).</summary>
    internal static Report Shared() => Once.Value;

    [SupportedOSPlatform("macos")]
    private static Report MeasureInAFolderOfItsOwn()
    {
        // INSIDE the lazy that Require reads: a Require here would re-enter it and throw. The folder and its teardown therefore use no requirement.
        using var folder = OwnedDir.Create("darwin-layout", null, null, null, requireLayout: static () => { });
        return Measure(folder.Path);
    }

    [SupportedOSPlatform("macos")]
    internal static Report Measure(string dir)
    {
        var values = new List<string> { $"arch={RuntimeInformation.ProcessArchitecture}", $"os={RuntimeInformation.OSDescription}" };
        var problems = new List<string>();
        var uid = Native.GetUid();
        values.Add($"getuid={uid}");

        var file = Path.Combine(dir, "layout.bin");
        var link = Path.Combine(dir, "layout.link");
        var folder = Path.Combine(dir, "layout.d");
        File.WriteAllBytes(file, new byte[Written]);
        File.CreateSymbolicLink(link, file);
        if (!Native.MakeDirectoryExclusively(folder)) problems.Add("the folder made for the self-test already existed");

        var first = Stat(file);
        var second = Stat(file);
        var inDir = Stat(dir);
        var inDirAgain = Stat(dir);
        var asLink = Stat(link);
        var asFolder = Stat(folder);
        Check(problems, first.Ino != 0 && first.Ino == second.Ino, $"the file's inode is {first.Ino} then {second.Ino}: it must be non-zero and stable");
        Check(problems, inDir.Ino != 0 && inDir.Ino == inDirAgain.Ino, $"the folder's inode is {inDir.Ino} then {inDirAgain.Ino}: it must be non-zero and stable");
        Check(problems, new[] { first.Ino, inDir.Ino, asLink.Ino, asFolder.Ino }.Distinct().Count() == 4, "four different entries share an inode");
        Check(problems, first.Dev == inDir.Dev && first.Dev == asFolder.Dev, $"the device differs inside one folder: {first.Dev}, {inDir.Dev}, {asFolder.Dev}");
        Check(problems, first.Uid == uid && inDir.Uid == uid && asLink.Uid == uid && asFolder.Uid == uid, $"uid is {first.Uid}/{inDir.Uid}/{asLink.Uid}/{asFolder.Uid} but getuid says {uid}");
        Check(problems, IsFolder(inDir) && IsFolder(asFolder) && !IsRegular(inDir), $"S_ISDIR fails on a folder (mode 0x{inDir.Mode:x4}, 0x{asFolder.Mode:x4})");
        Check(problems, IsRegular(first) && !IsFolder(first), $"S_ISREG fails on a file (mode 0x{first.Mode:x4})");
        Check(problems, (asLink.Mode & 0xF000) == 0xA000, $"S_ISLNK fails on a link (mode 0x{asLink.Mode:x4}): lstat must not follow it");
        Check(problems, (first.Mode & 0x1FF) == (int)File.GetUnixFileMode(file), $"the permission bits read 0x{first.Mode & 0x1FF:x} but .NET says 0x{(int)File.GetUnixFileMode(file):x}");
        Check(problems, (asFolder.Mode & 0x1FF) == 0x1C0, $"mkdir mode 0700 reads back as 0x{asFolder.Mode & 0x1FF:x}");
        Check(problems, first.Nlink == 1 && first.Rdev == 0, $"a fresh file has nlink {first.Nlink} and rdev {first.Rdev}, expected 1 and 0");
        Check(problems, first.Size == Written, $"the size is {first.Size} but {Written} bytes were written");

        File.SetLastWriteTimeUtc(file, DateTimeOffset.FromUnixTimeSeconds(KnownSeconds).UtcDateTime);
        var stamped = Stat(file);
        Check(problems, stamped.Mtime.ToUnixTimeSeconds() == KnownSeconds, $"mtime set to {KnownSeconds} reads as {stamped.Mtime.ToUnixTimeSeconds()}");
        using (var stream = new FileStream(file, FileMode.Append, FileAccess.Write)) stream.Write(new byte[Appended]);
        var written = Stat(file);
        var now = DateTimeOffset.UtcNow;
        Check(problems, written.Mtime > stamped.Mtime && Near(written.Mtime, now), $"mtime did not move to now after a write: {stamped.Mtime:O} then {written.Mtime:O}");
        Check(problems, Near(written.Ctime, now) && Near(first.Birthtime, now), $"ctime {written.Ctime:O} or birth time {first.Birthtime:O} is not near now {now:O}");
        Check(problems, written.Size == Written + Appended, $"the size is {written.Size} but {Written + Appended} bytes are in the file");

        values.Add($"file: {Describe(written)}");
        values.Add($"folder: {Describe(inDir)}");
        values.Add($"link: {Describe(asLink)}");
        AgainstStat(file, written, values, problems);
        return new Report(values, problems);
    }

    [SupportedOSPlatform("macos")]
    private static DarwinStat Stat(string path) => Native.DarwinLstat(path) ?? throw new InvalidOperationException($"lstat found nothing at {path}");

    private static bool IsFolder(DarwinStat s) => (s.Mode & 0xF000) == 0x4000;

    private static bool IsRegular(DarwinStat s) => (s.Mode & 0xF000) == 0x8000;

    private static bool Near(DateTimeOffset moment, DateTimeOffset now) => (now - moment).Duration() < TimeSpan.FromMinutes(10);

    private static void Check(List<string> problems, bool holds, string what)
    {
        if (!holds) problems.Add(what);
    }

    private static string Describe(DarwinStat s) =>
        $"dev={s.Dev} mode=0x{s.Mode:x4} nlink={s.Nlink} ino={s.Ino} uid={s.Uid} gid={s.Gid} rdev={s.Rdev} size={s.Size} atime={s.Atime:O} mtime={s.Mtime:O} ctime={s.Ctime:O} birth={s.Birthtime:O}";

    /// <summary>A second witness that shares no code with the read: <c>stat -f "%i %u %z %d %m"</c> (inode, uid, size, device, mtime in seconds).</summary>
    private static void AgainstStat(string file, DarwinStat mine, List<string> values, List<string> problems)
    {
        var run = DirectoryLinks.Run("/usr/bin/stat", ["-f", "%i %u %z %d %m", file], TimeSpan.FromSeconds(30));
        var fields = run.Output.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (run.TimedOut || run.ExitCode != 0 || fields.Length != 5)
        {
            problems.Add($"/usr/bin/stat -f gave no answer to compare with (exit {run.ExitCode}, timed out {run.TimedOut}, said '{run.Output.Trim()}')");
            return;
        }

        values.Add($"stat(1): ino={fields[0]} uid={fields[1]} size={fields[2]} dev={fields[3]} mtime={fields[4]}");
        var theirs = fields.Select(f => long.Parse(f, CultureInfo.InvariantCulture)).ToArray();
        Check(problems, theirs[0] == (long)mine.Ino, $"stat(1) says inode {theirs[0]}, this read says {mine.Ino}");
        Check(problems, theirs[1] == mine.Uid, $"stat(1) says uid {theirs[1]}, this read says {mine.Uid}");
        Check(problems, theirs[2] == mine.Size, $"stat(1) says size {theirs[2]}, this read says {mine.Size}");
        Check(problems, theirs[3] == mine.Dev, $"stat(1) says device {theirs[3]}, this read says {mine.Dev}");
        Check(problems, theirs[4] == mine.Mtime.ToUnixTimeSeconds(), $"stat(1) says mtime {theirs[4]}, this read says {mine.Mtime.ToUnixTimeSeconds()}");
    }
}
