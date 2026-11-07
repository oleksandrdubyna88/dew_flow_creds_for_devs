using Xunit;

namespace CredsForDevs.Tests.Leftovers;

/// <summary>The audit's teeth (S4 scenario 8). These tests LEAK on purpose, so they run ONLY when <c>CREDS_LEFTOVERS_SELFTEST</c> is
/// set — by the CI step that runs them after the normal <c>Test</c> step and asserts the whole run FAILS with the audit's own
/// message, and that the temp root holds nothing of theirs afterwards. The normal run never sets it, and they skip.
///
/// <para>Value <c>1</c>: a folder made and never disposed. Value <c>failed-dispose</c>: a folder whose disposal is tried and gives up
/// (a held handle on Windows; on Linux a read-only subfolder, so the file inside cannot be unlinked), then made removable again, so
/// the audit's own second disposal removes it and the temp root is clean.</para></summary>
public sealed class LeftoversSelfTest
{
    private const string Variable = "CREDS_LEFTOVERS_SELFTEST";

    [Fact]
    public void Leaves_one_owned_dir_undisposed()
    {
        RequireCase("1");

        _ = OwnedDir.Create("selftest");
    }

    [Fact]
    public void Disposes_but_the_removal_fails()
    {
        RequireCase("failed-dispose");
        if (!OperatingSystem.IsWindows() && Native.GetUid() == 0) Assert.Skip("root unlinks a file under a read-only folder, so the refusal cannot be provoked");
        var dir = OwnedDir.Create("selftest-failed");
        var locked = Path.Combine(dir.Path, "locked");
        Directory.CreateDirectory(locked);
        var file = Path.Combine(locked, "held.txt");
        File.WriteAllText(file, "held");
        if (OperatingSystem.IsWindows())
        {
            using var held = File.Open(file, FileMode.Open, FileAccess.Read, FileShare.None);
            dir.Dispose(); // one warning; the entry stays, DisposeAttempted
        }
        else
        {
            File.SetUnixFileMode(locked, UnixFileMode.UserRead | UnixFileMode.UserExecute);
            try
            {
                dir.Dispose();
            }
            finally
            {
                File.SetUnixFileMode(locked, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
            }
        }

        Assert.True(dir.DisposeAttempted && Directory.Exists(dir.Path), "premise: the disposal was tried and the folder is still there");
    }

    private static void RequireCase(string value)
    {
        var set = Environment.GetEnvironmentVariable(Variable);
        if (string.IsNullOrEmpty(set)) Assert.Skip($"{Variable} is not set — the audit's self-test runs only in the CI step that asserts the audit fails the run");
        if (set != value) Assert.Skip($"{Variable}={set} selects the other case of the self-test");
    }
}
