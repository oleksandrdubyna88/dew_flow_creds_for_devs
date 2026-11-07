using System.Buffers.Binary;
using System.Runtime.Versioning;
using FluentAssertions;
using Xunit;

namespace CredsForDevs.Tests.Leftovers;

/// <summary>The OS calls the contract needs and .NET does not have: an entry's identity (device, file id,
/// kind, change and write times) without following a link, a directory made EXCLUSIVELY, and a rename that
/// refuses to replace what it should not. Everything here reads the entry itself and fails closed.</summary>
public sealed class NativeTests : IDisposable
{
    private readonly OwnedScope _owned = DarwinLayout.FreshOwnedScope();

    public void Dispose() => _owned.Dispose();

    [Fact]
    public void A_folder_and_a_file_report_their_own_kind_and_a_plausible_time()
    {
        var scratch = _owned.Dir("scratch");
        File.WriteAllText(Path.Combine(scratch, "f.txt"), "x");
        var before = DateTimeOffset.UtcNow.AddMinutes(-2);

        var folder = Native.IdentityOf(scratch)!.Value;
        var file = Native.IdentityOf(Path.Combine(scratch, "f.txt"))!.Value;

        (folder.IsDirectory, folder.IsLink, folder.IsRegular).Should().Be((true, false, false));
        (file.IsDirectory, file.IsLink, file.IsRegular).Should().Be((false, false, true));
        file.WriteTime.Should().BeAfter(before).And.BeBefore(DateTimeOffset.UtcNow.AddMinutes(2));
        file.ChangeTime.Should().BeAfter(before).And.BeBefore(DateTimeOffset.UtcNow.AddMinutes(2));
    }

    [Fact]
    public void The_uid_of_an_entry_is_the_callers_on_posix_and_absent_on_windows()
    {
        var scratch = _owned.Dir("scratch");

        var uid = Native.IdentityOf(scratch)!.Value.Uid;

        if (OperatingSystem.IsWindows()) uid.Should().BeNull();
        else uid.Should().Be(Native.GetUid());
    }

    [Fact]
    public void A_missing_path_has_no_identity()
    {
        var scratch = _owned.Dir("scratch");

        Native.IdentityOf(Path.Combine(scratch, "nope")).Should().BeNull();
    }

    [Fact]
    public void A_folder_is_the_same_entry_after_a_move_and_a_different_one_from_a_new_folder_of_the_old_name()
    {
        var scratch = _owned.Dir("scratch");
        var first = Path.Combine(scratch, "a");
        var moved = Path.Combine(scratch, "b");
        Directory.CreateDirectory(first);
        var before = Native.IdentityOf(first)!.Value;

        Directory.Move(first, moved);
        // The moved folder stays alive while the new one is made: an inode freed first is reused by the next mkdir.
        Directory.CreateDirectory(first);

        var after = Native.IdentityOf(moved)!.Value;
        (after.Dev, after.Ino).Should().Be((before.Dev, before.Ino));
        var recreated = Native.IdentityOf(first)!.Value;
        (recreated.Dev, recreated.Ino).Should().NotBe((before.Dev, before.Ino));
    }

    [Fact]
    public void A_link_is_reported_as_a_link_and_never_followed()
    {
        var scratch = _owned.Dir("scratch");
        Directory.CreateDirectory(Path.Combine(scratch, "real"));
        try
        {
            Directory.CreateSymbolicLink(Path.Combine(scratch, "link"), Path.Combine(scratch, "real"));
        }
        catch (Exception ex) when (ex is UnauthorizedAccessException or IOException)
        {
            Assert.Skip($"cannot create directory links here ({ex.Message})");
        }

        var link = Native.IdentityOf(Path.Combine(scratch, "link"))!.Value;
        var real = Native.IdentityOf(Path.Combine(scratch, "real"))!.Value;

        link.IsLink.Should().BeTrue();
        (link.Dev, link.Ino).Should().NotBe((real.Dev, real.Ino), "the link's own entry, not its target");
    }

    [Fact]
    public void A_statx_buffer_is_read_at_the_kernels_fixed_offsets()
    {
        var buffer = new byte[256];
        BinaryPrimitives.WriteUInt32LittleEndian(buffer.AsSpan(0), 0x7ff);
        BinaryPrimitives.WriteUInt32LittleEndian(buffer.AsSpan(20), 1234);
        BinaryPrimitives.WriteUInt16LittleEndian(buffer.AsSpan(28), 0x41ED);
        BinaryPrimitives.WriteUInt64LittleEndian(buffer.AsSpan(32), 987654321);
        BinaryPrimitives.WriteInt64LittleEndian(buffer.AsSpan(96), 1_700_000_000);
        BinaryPrimitives.WriteUInt32LittleEndian(buffer.AsSpan(104), 500_000_000);
        BinaryPrimitives.WriteInt64LittleEndian(buffer.AsSpan(112), 1_700_000_100);
        BinaryPrimitives.WriteUInt32LittleEndian(buffer.AsSpan(136), 8);
        BinaryPrimitives.WriteUInt32LittleEndian(buffer.AsSpan(140), 1);

        var identity = Native.ParseStatx(buffer);

        identity.Dev.Should().Be((8UL << 32) | 1);
        identity.Ino.Should().Be((UInt128)987654321);
        identity.Uid.Should().Be(1234u);
        (identity.IsDirectory, identity.IsLink, identity.IsRegular).Should().Be((true, false, false));
        identity.ChangeTime.Should().Be(DateTimeOffset.FromUnixTimeSeconds(1_700_000_000).AddTicks(5_000_000));
        identity.WriteTime.Should().Be(DateTimeOffset.FromUnixTimeSeconds(1_700_000_100));
    }

    [Theory]
    [InlineData(0x100u, "STATX_INO")]
    [InlineData(0x8u, "STATX_UID")]
    [InlineData(0x40u, "STATX_MTIME")]
    [InlineData(0x80u, "STATX_CTIME")]
    [InlineData(0x1u, "STATX_TYPE")]
    [InlineData(0x2u, "STATX_MODE")]
    public void A_statx_answer_without_a_field_this_reads_is_no_identity_and_fails_closed(uint missing, string name)
    {
        var buffer = new byte[256];
        BinaryPrimitives.WriteUInt32LittleEndian(buffer.AsSpan(0), 0x7ff & ~missing);
        BinaryPrimitives.WriteUInt16LittleEndian(buffer.AsSpan(28), 0x41ED);

        var act = () => Native.ParseStatx(buffer);

        act.Should().Throw<InvalidOperationException>($"a file system that answers without {name} gives no identity");
    }

    [Fact]
    public void A_directory_is_made_once_and_a_second_attempt_says_it_exists()
    {
        var scratch = _owned.Dir("scratch");

        Native.MakeDirectoryExclusively(Path.Combine(scratch, "d")).Should().BeTrue();
        Native.MakeDirectoryExclusively(Path.Combine(scratch, "d")).Should().BeFalse("an existing folder is somebody else's: never adopted");
        Directory.Exists(Path.Combine(scratch, "d")).Should().BeTrue();
    }

    [Fact]
    public void A_file_under_the_name_also_says_it_exists_and_a_missing_parent_throws()
    {
        var scratch = _owned.Dir("scratch");
        File.WriteAllText(Path.Combine(scratch, "f"), "x");

        Native.MakeDirectoryExclusively(Path.Combine(scratch, "f")).Should().BeFalse();
        var act = () => Native.MakeDirectoryExclusively(Path.Combine(scratch, "no", "d"));
        act.Should().Throw<IOException>("any failure but 'already exists' is an error, never a quiet false");
    }

    [Fact]
    public void On_posix_the_folder_is_private_to_the_caller()
    {
        if (!OperatingSystem.IsLinux() && !OperatingSystem.IsMacOS())
        {
            Assert.Skip("a POSIX mode — Linux and macOS only");
            return;
        }

        var scratch = _owned.Dir("scratch");

        Native.MakeDirectoryExclusively(Path.Combine(scratch, "d"));

        var others = UnixFileMode.GroupRead | UnixFileMode.GroupWrite | UnixFileMode.GroupExecute
            | UnixFileMode.OtherRead | UnixFileMode.OtherWrite | UnixFileMode.OtherExecute;
        (File.GetUnixFileMode(Path.Combine(scratch, "d")) & others).Should().Be((UnixFileMode)0, "mode 0700: only the caller's processes read a scratch folder");
    }

    [Fact]
    public void A_folder_is_renamed_onto_a_free_name_and_off_windows_onto_an_empty_folder()
    {
        var scratch = _owned.Dir("scratch");
        Directory.CreateDirectory(Path.Combine(scratch, "a"));
        File.WriteAllText(Path.Combine(Path.Combine(scratch, "a"), "keep.txt"), "kept");

        Native.RenameOnto(Path.Combine(scratch, "a"), Path.Combine(scratch, "b"));

        Directory.Exists(Path.Combine(scratch, "a")).Should().BeFalse();
        File.ReadAllText(Path.Combine(Path.Combine(scratch, "b"), "keep.txt")).Should().Be("kept");

        Directory.CreateDirectory(Path.Combine(scratch, "empty"));
        var onto = () => Native.RenameOnto(Path.Combine(scratch, "b"), Path.Combine(scratch, "empty"));
        if (OperatingSystem.IsWindows())
        {
            onto.Should().Throw<IOException>("Directory.Move refuses an existing target, so the restore is exclusive by itself");
        }
        else
        {
            onto.Should().NotThrow("rename(2) onto an EMPTY directory is atomic: the placeholder the restore reserved");
            File.ReadAllText(Path.Combine(Path.Combine(scratch, "empty"), "keep.txt")).Should().Be("kept");
        }
    }

    [Fact]
    public void An_exclusive_rename_takes_a_free_name_and_never_replaces_an_empty_folder_or_a_full_one()
    {
        var scratch = _owned.Dir("scratch");
        var from = Path.Combine(scratch, "a");
        Directory.CreateDirectory(from);
        File.WriteAllText(Path.Combine(from, "keep.txt"), "kept");

        Native.RenameExclusively(from, Path.Combine(scratch, "b")).Should().BeTrue("the name was free");
        File.ReadAllText(Path.Combine(scratch, "b", "keep.txt")).Should().Be("kept");
        Directory.Exists(from).Should().BeFalse();

        var empty = Path.Combine(scratch, "empty");
        Directory.CreateDirectory(empty);
        Native.RenameExclusively(Path.Combine(scratch, "b"), empty).Should().BeFalse("rename(2) would have replaced it; this must not");
        Directory.GetFileSystemEntries(empty).Should().BeEmpty("the empty folder is untouched");
        File.ReadAllText(Path.Combine(scratch, "b", "keep.txt")).Should().Be("kept", "the source stays where it was");

        var full = Path.Combine(scratch, "full");
        Directory.CreateDirectory(full);
        File.WriteAllText(Path.Combine(full, "theirs.txt"), "theirs");
        Native.RenameExclusively(Path.Combine(scratch, "b"), full).Should().BeFalse();
        File.ReadAllText(Path.Combine(full, "theirs.txt")).Should().Be("theirs");
    }

    [Fact]
    [SupportedOSPlatform("linux")]
    public void The_reservation_fallback_removes_its_placeholder_when_the_rename_fails()
    {
        if (!OperatingSystem.IsLinux())
        {
            Assert.Skip("the reservation fallback is the Linux form");
            return;
        }

        var scratch = _owned.Dir("scratch");
        var target = Path.Combine(scratch, "target");

        var failure = Record.Exception(() => Native.RenameByReservation(Path.Combine(scratch, "missing"), target));

        failure.Should().BeOfType<IOException>("the rename failed because the source is not there");
        Directory.Exists(target).Should().BeFalse("the placeholder was ours and empty");
    }

    [Fact]
    [SupportedOSPlatform("linux")]
    public void The_reservation_fallback_swallows_only_the_expected_failures_of_its_clean_up()
    {
        if (!OperatingSystem.IsLinux())
        {
            Assert.Skip("the reservation fallback is the Linux form");
            return;
        }

        var scratch = _owned.Dir("scratch");

        var expected = Record.Exception(() => Native.RenameByReservation(Path.Combine(scratch, "missing"), Path.Combine(scratch, "t1"), () => throw new IOException("gone")));
        expected.Should().BeOfType<IOException>().Which.Message.Should().Contain("rename", "an expected clean-up failure leaves the rename's own failure");

        var unexpected = Record.Exception(() => Native.RenameByReservation(Path.Combine(scratch, "missing"), Path.Combine(scratch, "t2"), () => throw new InvalidCastException("a bug")));
        unexpected.Should().BeOfType<InvalidCastException>("anything but the expected failures propagates");
    }

    [Fact]
    [SupportedOSPlatform("linux")]
    public void The_reservation_fallback_keeps_an_empty_folder_that_took_the_placeholders_place()
    {
        if (!OperatingSystem.IsLinux())
        {
            Assert.Skip("the reservation fallback is the Linux form");
            return;
        }

        var scratch = _owned.Dir("scratch");
        var target = Path.Combine(scratch, "target");
        var stranger = Path.Combine(scratch, "stranger");
        Directory.CreateDirectory(stranger); // made while the placeholder exists: a different inode, the caller's, empty

        var failure = Record.Exception(() => Native.RenameByReservation(Path.Combine(scratch, "missing"), target, () => Native.RenameOnto(stranger, target)));

        failure.Should().BeOfType<IOException>();
        Directory.Exists(target).Should().BeTrue("it is not the folder this call reserved, so it is not this call's to remove");
    }

    [Fact]
    [SupportedOSPlatform("linux")]
    public void The_reservation_fallback_keeps_a_link_and_a_full_folder_that_took_the_placeholders_place()
    {
        if (!OperatingSystem.IsLinux())
        {
            Assert.Skip("the reservation fallback is the Linux form");
            return;
        }

        var scratch = _owned.Dir("scratch");
        var real = Path.Combine(scratch, "real");
        Directory.CreateDirectory(real);
        File.WriteAllText(Path.Combine(real, "keep.txt"), "kept");
        var target = Path.Combine(scratch, "target");

        Record.Exception(() => Native.RenameByReservation(Path.Combine(scratch, "missing"), target, () =>
        {
            Directory.Delete(target);
            Directory.CreateSymbolicLink(target, real);
        })).Should().BeOfType<IOException>();
        Directory.ResolveLinkTarget(target, returnFinalTarget: false).Should().NotBeNull("a link is never removed, and never followed");
        File.ReadAllText(Path.Combine(real, "keep.txt")).Should().Be("kept");
    }
}
