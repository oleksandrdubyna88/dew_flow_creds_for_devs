using System.IO.Pipes;
using System.Runtime.Versioning;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using FluentAssertions;
using Xunit;

namespace CredsForDevs.Tests.Leftovers;

/// <summary>The kernel owner is the scope key (rule §3, "scope evidence"): the name selects, the file system
/// authorises. POSIX: the entry's own uid is the caller's real uid. Windows (owner decision 2): the entry is
/// inside the caller's profile AND its owner SID is the caller's user SID — both read from one handle that opens
/// the entry itself. Any failure is "not mine".</summary>
public sealed class ScopeTests : IDisposable
{
    private readonly OwnedScope _owned = DarwinLayout.FreshOwnedScope();

    public void Dispose() => _owned.Dispose();

    [Fact]
    public void A_file_this_test_made_is_mine_exactly_where_the_runner_makes_files_the_callers()
    {
        var scratch = _owned.Dir("scratch");
        var file = Path.Combine(scratch, "mine.txt");
        File.WriteAllText(file, "x");

        // POSIX: always. Windows: the answer scenario 0 printed — true where the new file's owner SID is the
        // user's and it lies inside the profile, false where it is Administrators (an elevated runner). Asserted,
        // never skipped.
        Scope.IsMine(file).Should().Be(!OperatingSystem.IsWindows() || WindowsMeasuredIsMine(file));
    }

    [Fact]
    public void A_missing_path_is_not_mine()
    {
        var scratch = _owned.Dir("scratch");

        Scope.IsMine(Path.Combine(scratch, "nope")).Should().BeFalse("an entry that cannot be read is no evidence");
    }

    [Fact]
    public void On_windows_both_outcomes_are_made_on_any_runner_through_the_fixtures()
    {
        if (!OperatingSystem.IsWindows()) Assert.Skip("the owner SID and profile keys — Windows only");

        if (OperatingSystem.IsWindows()) WindowsBothOutcomes(_owned.Dir("scratch"));
    }

    [Fact]
    public void A_link_is_judged_on_its_own_owner_never_on_its_targets()
    {
        var scratch = _owned.Dir("scratch");
        var link = Path.Combine(scratch, "link");
        IDisposable? cleanup = null;
        string target;
        if (OperatingSystem.IsWindows())
        {
            (target, cleanup) = WindowsForeignTarget(scratch);
        }
        else
        {
            target = "/etc/passwd";
            if (Native.IdentityOf(target)?.Uid == Native.GetUid()) Assert.Skip("the target is the caller's own, so a target's owner cannot differ from the link's");
        }

        using var _ = cleanup;
        CreateFileLinkOrSkip(link, target);
        var plain = Path.Combine(scratch, "plain.txt");
        File.WriteAllText(plain, "x");

        Native.IdentityOf(link)!.Value.IsLink.Should().BeTrue();
        Scope.IsMine(target).Should().BeFalse("the target is not the caller's");
        Scope.IsMine(link).Should().Be(Scope.IsMine(plain), "the link's own owner decides, a link is never followed");
    }

    [Fact]
    public void On_windows_a_link_to_the_callers_own_file_is_judged_on_the_links_own_owner_not_the_targets()
    {
        // The test above cannot tell a link-following reader from a correct one on an ELEVATED runner: the link, the plain file and
        // the foreign target are all Administrators', so every answer is false. Here the TARGET is made the caller's own first
        // (a link's own owner cannot be set through the managed API, which follows the link): a reader that followed the link would
        // say true where the link's own owner, Administrators, says false.
        if (!OperatingSystem.IsWindows()) Assert.Skip("the owner SID key — Windows only");

        if (OperatingSystem.IsWindows()) WindowsLinkToOwnTarget(_owned.Dir("scratch"));
    }

    [Fact]
    public void A_claim_that_is_not_there_is_missing_and_one_there_reads_as_text()
    {
        var scratch = _owned.Dir("scratch");
        File.WriteAllText(Path.Combine(scratch, "claim"), "u1:h@linux:1\n");

        Scope.ReadClaimText(Path.Combine(scratch, "nope")).Should().BeOfType<ClaimRead.Missing>();
        Scope.ReadClaimText(Path.Combine(scratch, "claim"), _ => true).Should().BeOfType<ClaimRead.Text>().Which.Value.Should().Be("u1:h@linux:1\n");
    }

    [Fact]
    public void A_claim_the_scope_key_refuses_is_unreadable_as_a_foreign_uid()
    {
        var scratch = _owned.Dir("scratch");
        File.WriteAllText(Path.Combine(scratch, "claim"), "u1:h@linux:1\n");

        Scope.ReadClaimText(Path.Combine(scratch, "claim"), _ => false).Should().BeOfType<ClaimRead.Unreadable>().Which.Reason.Should().Be("foreign-uid");
    }

    [Fact]
    public void The_default_scope_key_is_the_kernel_owner()
    {
        var scratch = _owned.Dir("scratch");
        var file = Path.Combine(scratch, "claim");
        File.WriteAllText(file, "u1:h@linux:1\n");

        var read = Scope.ReadClaimText(file);

        if (Scope.IsMine(file)) read.Should().BeOfType<ClaimRead.Text>();
        else read.Should().BeOfType<ClaimRead.Unreadable>().Which.Reason.Should().Be("foreign-uid");
    }

    [Fact]
    public void A_folder_named_like_a_claim_is_unreadable_because_only_a_regular_file_is_read()
    {
        var scratch = _owned.Dir("scratch");
        Directory.CreateDirectory(Path.Combine(scratch, "claim"));

        Scope.ReadClaimText(Path.Combine(scratch, "claim"), _ => true).Should().BeOfType<ClaimRead.Unreadable>().Which.Reason.Should().BeNull();
    }

    [Fact]
    public void A_link_named_like_a_claim_is_unreadable_because_a_link_is_never_followed()
    {
        var scratch = _owned.Dir("scratch");
        var target = Path.Combine(scratch, "real");
        File.WriteAllText(target, "u1:h@linux:1\n");
        CreateFileLinkOrSkip(Path.Combine(scratch, "claim"), target);

        Scope.ReadClaimText(Path.Combine(scratch, "claim"), _ => true).Should().BeOfType<ClaimRead.Unreadable>();
    }

    [Fact]
    public void At_most_one_byte_past_the_limit_is_read_so_a_513_byte_claim_is_seen_as_too_long()
    {
        var scratch = _owned.Dir("scratch");
        File.WriteAllText(Path.Combine(scratch, "long"), new string('x', 2000));

        var text = Scope.ReadClaimText(Path.Combine(scratch, "long"), _ => true).Should().BeOfType<ClaimRead.Text>().Subject.Value;

        text.Should().HaveLength(513, "512 bytes are the most a claim may hold; the 513th makes it unreadable");
    }

    [Fact]
    public void On_posix_a_fifo_swapped_in_after_the_identity_check_is_unreadable_and_never_blocks()
    {
        if (!OperatingSystem.IsLinux() && !OperatingSystem.IsMacOS())
        {
            Assert.Skip("open(2) with O_NONBLOCK on the claim — Linux and macOS only");
            return;
        }

        PosixFifoSwappedIn(_owned.Dir("scratch"));
    }

    [SupportedOSPlatform("linux")]
    [SupportedOSPlatform("macos")]
    private static void PosixFifoSwappedIn(string scratch)
    {
        var claim = Path.Combine(scratch, "claim");
        File.WriteAllText(claim, "u1:h@linux:1\n");
        var fifo = Path.Combine(scratch, "fifo");
        PosixFifo.Make(fifo);

        // The scope-key seam runs after the identity check and before the first byte is read: the swap lands exactly between the two.
        var read = Task.Run(() => Scope.ReadClaimText(claim, _ =>
        {
            File.Move(fifo, claim, overwrite: true);
            return true;
        }));
        try
        {
            read.Wait(TimeSpan.FromSeconds(5)).Should().BeTrue("a FIFO is refused by its type; the open must not wait for a writer");
            read.Result.Should().BeOfType<ClaimRead.Unreadable>().Which.Reason.Should().BeNull();
        }
        finally
        {
            PosixFifo.ReleaseReaders(claim); // a hung open (the defect) would hold its thread for ever
        }
    }

    [Fact]
    public void On_posix_another_regular_file_swapped_in_after_the_identity_check_is_unreadable()
    {
        if (!Native.IsPosix)
        {
            Assert.Skip("fstat on the opened descriptor — Linux and macOS only");
            return;
        }

        var scratch = _owned.Dir("scratch");
        var claim = Path.Combine(scratch, "claim");
        var other = Path.Combine(scratch, "other");
        File.WriteAllText(claim, "u1:h@linux:1\n");
        File.WriteAllText(other, "u1:h@linux:2\n"); // made while the claim exists, so its inode is a different one

        var read = Scope.ReadClaimText(claim, _ =>
        {
            File.Move(other, claim, overwrite: true);
            return true;
        });

        read.Should().BeOfType<ClaimRead.Unreadable>("the descriptor names another file than the one judged");
    }

    [Fact]
    public void On_windows_a_pipe_a_device_or_another_file_in_place_of_the_claim_is_refused_without_a_read()
    {
        if (!OperatingSystem.IsWindows())
        {
            Assert.Skip("GetFileType on the open handle — Windows only");
            return;
        }

        WindowsVerifiedRead(_owned.Dir("scratch"));
    }

    [SupportedOSPlatform("windows")]
    private static void WindowsVerifiedRead(string scratch)
    {
        var claim = Path.Combine(scratch, "claim");
        File.WriteAllText(claim, "u1:h@windows:1\n");
        var judged = Native.IdentityOf(claim)!.Value;
        Encoding.UTF8.GetString(Native.ReadVerifiedRegular(claim, judged, 513)!).Should().Be("u1:h@windows:1\n", "premise: the judged file reads");

        var name = "mcp-leftovers-" + Guid.NewGuid().ToString("N");
        using var server = new NamedPipeServerStream(name, PipeDirection.InOut, 1); // nobody writes to it: a read would block for ever
        var pipe = Task.Run(() => Native.ReadVerifiedRegular(@"\\.\pipe\" + name, judged, 513));
        pipe.Wait(TimeSpan.FromSeconds(10)).Should().BeTrue("a named pipe is refused by its file type, not read");
        pipe.Result.Should().BeNull();
        Native.ReadVerifiedRegular(@"\\.\NUL", judged, 513).Should().BeNull("a device is not a disk file");

        var swapped = Path.Combine(scratch, "swapped");
        File.WriteAllText(swapped, "u1:h@windows:2\n");
        Native.ReadVerifiedRegular(swapped, judged, 513).Should().BeNull("another file than the one judged: the 128-bit id differs");
    }

    [SupportedOSPlatform("windows")]
    private static bool WindowsMeasuredIsMine(string file)
    {
        // The measured answer from independent reads: the managed ACL API for the owner, full paths for the profile.
        var user = WindowsIdentity.GetCurrent().User;
        var owner = new FileInfo(file).GetAccessControl().GetOwner(typeof(SecurityIdentifier));
        var profile = new DirectoryInfo(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile)).FullName.TrimEnd('\\');
        var inside = new FileInfo(file).FullName.StartsWith(profile + "\\", StringComparison.OrdinalIgnoreCase);
        return inside && owner is not null && owner.Equals(user);
    }

    [SupportedOSPlatform("windows")]
    private static (string Target, IDisposable Cleanup) WindowsForeignTarget(string scratch)
    {
        var ownership = new WindowsOwnership();
        var made = Path.Combine(scratch, "target.txt");
        File.WriteAllText(made, "x");
        return (ownership.ForeignToCaller(made), ownership);
    }

    [SupportedOSPlatform("windows")]
    private static void WindowsLinkToOwnTarget(string scratch)
    {
        using var ownership = new WindowsOwnership();
        var made = Path.Combine(scratch, "target.txt");
        File.WriteAllText(made, "x");
        var target = ownership.OwnedByCaller(made);
        var link = Path.Combine(scratch, "link");
        CreateFileLinkOrSkip(link, target);
        var plain = Path.Combine(scratch, "plain.txt");
        File.WriteAllText(plain, "x");

        Scope.IsMine(target).Should().BeTrue("premise: the target is the caller's, in the caller's profile");
        Native.IdentityOf(link)!.Value.IsLink.Should().BeTrue();
        Scope.IsMine(link).Should().Be(Scope.IsMine(plain), "the link's own owner decides, exactly as a file made beside it, whatever its target's owner is");
    }

    [SupportedOSPlatform("windows")]
    private static void WindowsBothOutcomes(string scratch)
    {
        using var ownership = new WindowsOwnership();
        var mine = Path.Combine(scratch, "mine.txt");
        File.WriteAllText(mine, "x");
        var foreign = Path.Combine(scratch, "foreign.txt");
        File.WriteAllText(foreign, "x");

        ownership.OwnedByCaller(mine);
        var foreignPath = ownership.ForeignToCaller(foreign);

        Scope.IsMine(mine).Should().BeTrue("the owner SID is the caller's and the file lies in the profile");
        Native.OwnerSidOf(mine).Should().Be(WindowsIdentity.GetCurrent().User!);
        Scope.IsMine(foreignPath).Should().BeFalse($"taken branch: {ownership.LastForeignBranch}");
    }

    private static void CreateFileLinkOrSkip(string link, string target)
    {
        try
        {
            File.CreateSymbolicLink(link, target);
        }
        catch (Exception ex) when (ex is UnauthorizedAccessException or IOException)
        {
            Assert.Skip($"cannot create symbolic links here ({ex.Message})");
        }
    }
}
