using System.Runtime.Versioning;
using System.Security.AccessControl;
using System.Security.Principal;
using Xunit;

namespace CredsForDevs.Tests.Leftovers;

/// <summary>Test fixtures that make BOTH answers of the Windows kernel-owner key on any machine.
///
/// <para>On an elevated runner every file the caller makes is owned by <c>BUILTIN\Administrators</c>, so a green
/// leg could prove preservation and never collection. These two make each outcome on demand:
/// <see cref="OwnedByCaller"/> sets the owner to the caller's OWN user SID (needs only <c>WRITE_OWNER</c>, which
/// the creator's default DACL grants — no privilege), <see cref="ForeignToCaller"/> makes the entry not the
/// caller's by the owner SID where the token may own the <c>Administrators</c> group, and by the path key
/// otherwise (an entry under the public documents folder, outside the caller's profile). Both return the path they
/// prepared and neither skips; the one that may create an entry elsewhere removes it when disposed.</para></summary>
[SupportedOSPlatform("windows")]
internal sealed class WindowsOwnership : IDisposable
{
    private readonly List<OwnedDir> _outside = [];

    /// <summary>Which branch <see cref="ForeignToCaller"/> took last: the owner SID, or the out-of-profile path.</summary>
    public string? LastForeignBranch { get; private set; }

    public string OwnedByCaller(string path)
    {
        SetOwner(path, WindowsIdentity.GetCurrent().User!);
        return path;
    }

    public string ForeignToCaller(string path)
    {
        try
        {
            SetOwner(path, new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null));
            return Took("owner SID BUILTIN\\Administrators", path);
        }
        catch (Exception ex) when (ex is PrivilegeNotHeldException or UnauthorizedAccessException or InvalidOperationException)
        {
            // A token that may not own that group: the entry goes where the caller's profile is not — as an OwnedDir, so it is
            // claimed first, prefixed and removed like every other folder of the run, never an unprefixed one.
            var outside = OwnedDir.Create("foreign-owner", Environment.GetFolderPath(Environment.SpecialFolder.CommonDocuments));
            _outside.Add(outside);
            var copy = Directory.Exists(path) ? outside.Path : CopyInto(outside.Path, path);
            return Took("path outside the profile (the token may not own Administrators)", copy);
        }
    }

    private static string CopyInto(string folder, string file)
    {
        var copy = Path.Combine(folder, Path.GetFileName(file));
        File.Copy(file, copy);
        return copy;
    }

    private string Took(string branch, string path)
    {
        LastForeignBranch = branch;
        TestContext.Current.AddWarning($"ownership fixture: ForeignToCaller took the {branch}");
        return path;
    }

    public void Dispose()
    {
        foreach (var folder in _outside) folder.Dispose();
    }

    private static void SetOwner(string path, SecurityIdentifier owner)
    {
        if (Directory.Exists(path))
        {
            var info = new DirectoryInfo(path);
            var security = info.GetAccessControl();
            security.SetOwner(owner);
            info.SetAccessControl(security);
            return;
        }

        var file = new FileInfo(path);
        var fileSecurity = file.GetAccessControl();
        fileSecurity.SetOwner(owner);
        file.SetAccessControl(fileSecurity);
    }
}
