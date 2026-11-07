using Xunit;

namespace CredsForDevs.Tests.Leftovers;

/// <summary>Makes a folder the teardown cannot remove, in the way each OS refuses: Windows — an open handle on a
/// file inside, held with no sharing; POSIX — the parent without write permission, so the folder's own entry cannot be
/// unlinked (skipped as root, who may). Dispose of the result makes it removable again. The refusal is a Windows
/// event in practice (an open handle stops a recursive delete there; on POSIX it does not).</summary>
internal static class Unremovable
{
    public static IDisposable Make(string parent, string dir)
    {
        if (OperatingSystem.IsWindows())
        {
            var held = File.Open(Path.Combine(dir, "held.txt"), FileMode.Create, FileAccess.Write, FileShare.None);
            return new Release(held.Dispose);
        }

        if (Native.GetUid() == 0) Assert.Skip("root removes a folder under a read-only parent, so the refusal cannot be provoked");
        File.SetUnixFileMode(parent, UnixFileMode.UserRead | UnixFileMode.UserExecute);
        return new Release(() =>
        {
            if (!OperatingSystem.IsWindows()) File.SetUnixFileMode(parent, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
        });
    }

    private sealed class Release(Action release) : IDisposable
    {
        public void Dispose() => release();
    }
}
