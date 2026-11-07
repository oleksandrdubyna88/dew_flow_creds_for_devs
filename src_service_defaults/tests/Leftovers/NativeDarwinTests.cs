using System.Buffers.Binary;
using FluentAssertions;
using Xunit;

namespace CredsForDevs.Tests.Leftovers;

/// <summary>Darwin's <c>struct stat</c> and the outcomes of <c>renamex_np</c>, as PURE reads: they run on every system, so the layout's offsets and the
/// fail-closed rules are pinned from Linux and Windows too. What a real macOS says is the business of <see cref="DarwinLayoutTests"/> and
/// <see cref="DarwinNativeTests"/>, on the runner.</summary>
public sealed class NativeDarwinTests
{
    private static byte[] Buffer(Action<byte[]>? tweak = null)
    {
        var buffer = new byte[Native.DarwinStatSize];
        BinaryPrimitives.WriteInt32LittleEndian(buffer.AsSpan(0), 16777234); // st_dev
        BinaryPrimitives.WriteUInt16LittleEndian(buffer.AsSpan(4), 0x41ED); // st_mode: a folder, 0755
        BinaryPrimitives.WriteUInt16LittleEndian(buffer.AsSpan(6), 7); // st_nlink
        BinaryPrimitives.WriteUInt64LittleEndian(buffer.AsSpan(8), 8_590_000_001); // st_ino: past 32 bits
        BinaryPrimitives.WriteUInt32LittleEndian(buffer.AsSpan(16), 501); // st_uid
        BinaryPrimitives.WriteUInt32LittleEndian(buffer.AsSpan(20), 20); // st_gid
        BinaryPrimitives.WriteInt32LittleEndian(buffer.AsSpan(24), 3); // st_rdev
        Time(buffer, 32, 1_700_000_000, 1); // atime
        Time(buffer, 48, 1_700_000_100, 500_000_000); // mtime
        Time(buffer, 64, 1_700_000_200, 999_999_999); // ctime
        Time(buffer, 80, 1_600_000_000, 0); // birth time
        BinaryPrimitives.WriteInt64LittleEndian(buffer.AsSpan(96), 123_456_789_012); // st_size: past 32 bits
        tweak?.Invoke(buffer);
        return buffer;
    }

    private static void Time(byte[] buffer, int at, long seconds, long nanoseconds)
    {
        BinaryPrimitives.WriteInt64LittleEndian(buffer.AsSpan(at), seconds);
        BinaryPrimitives.WriteInt64LittleEndian(buffer.AsSpan(at + 8), nanoseconds);
    }

    [Theory]
    [InlineData(0x1000, true)] // a FIFO
    [InlineData(0x4000, false)]
    [InlineData(0x8000, false)]
    [InlineData(0xA000, false)]
    [InlineData(0x2000, false)]
    [InlineData(0xC000, false)] // a socket
    [InlineData(0x0000, false)] // the type bits of a path that was not read at all
    public void A_fifo_is_told_by_the_type_bits_of_the_mode_and_by_nothing_else(int kind, bool fifo)
    {
        // The FIFO child asserts this on the claim BEFORE its read: a null read of a path that is missing (ENOENT) must not pass for a refused FIFO.
        var stat = Native.ParseDarwinStat(Buffer(b => BinaryPrimitives.WriteUInt16LittleEndian(b.AsSpan(4), (ushort)(kind | 0x1ED))));

        stat.IsFifo.Should().Be(fifo);
    }

    [Fact]
    public void A_stat_buffer_is_read_at_darwins_fixed_offsets()
    {
        var stat = Native.ParseDarwinStat(Buffer());

        (stat.Dev, stat.Mode, stat.Nlink, stat.Ino, stat.Uid, stat.Gid, stat.Rdev).Should().Be((16777234, (ushort)0x41ED, (ushort)7, 8_590_000_001UL, 501u, 20u, 3));
        stat.Atime.Should().Be(DateTimeOffset.FromUnixTimeSeconds(1_700_000_000).AddTicks(0));
        stat.Mtime.Should().Be(DateTimeOffset.FromUnixTimeSeconds(1_700_000_100).AddTicks(5_000_000));
        stat.Ctime.Should().Be(DateTimeOffset.FromUnixTimeSeconds(1_700_000_200).AddTicks(9_999_999));
        stat.Birthtime.Should().Be(DateTimeOffset.FromUnixTimeSeconds(1_600_000_000));
        stat.Size.Should().Be(123_456_789_012);
    }

    [Fact]
    public void A_darwin_stat_is_144_bytes_and_a_shorter_answer_is_no_identity()
    {
        Native.DarwinStatSize.Should().Be(144);

        var act = () => Native.ParseDarwinStat(new byte[Native.DarwinStatSize - 1]);

        act.Should().Throw<InvalidOperationException>().Which.Message.Should().Contain("143");
    }

    [Fact]
    public void An_inode_of_zero_or_a_time_that_cannot_be_one_fails_closed()
    {
        var noInode = () => Native.ParseDarwinStat(Buffer(b => BinaryPrimitives.WriteUInt64LittleEndian(b.AsSpan(8), 0)));
        var badNanoseconds = () => Native.ParseDarwinStat(Buffer(b => Time(b, 48, 1_700_000_100, 1_000_000_000)));
        var negativeNanoseconds = () => Native.ParseDarwinStat(Buffer(b => Time(b, 64, 1_700_000_100, -1)));
        var hugeSeconds = () => Native.ParseDarwinStat(Buffer(b => Time(b, 80, long.MaxValue, 0)));

        noInode.Should().Throw<InvalidOperationException>().Which.Message.Should().Contain("inode 0");
        badNanoseconds.Should().Throw<InvalidOperationException>();
        negativeNanoseconds.Should().Throw<InvalidOperationException>();
        hugeSeconds.Should().Throw<InvalidOperationException>("a layout that does not hold gives garbage seconds: never an unrelated exception type");
    }

    [Theory]
    [InlineData(0x4000, true, false, false)]
    [InlineData(0x8000, false, false, true)]
    [InlineData(0xA000, false, true, false)]
    [InlineData(0x1000, false, false, false)] // a FIFO
    [InlineData(0x2000, false, false, false)] // a character device
    public void The_kind_of_an_entry_is_its_mode_and_the_identity_is_device_and_inode(int kind, bool directory, bool link, bool regular)
    {
        var stat = Native.ParseDarwinStat(Buffer(b => BinaryPrimitives.WriteUInt16LittleEndian(b.AsSpan(4), (ushort)(kind | 0x1ED))));

        var identity = Native.DarwinIdentity(stat);

        (identity.IsDirectory, identity.IsLink, identity.IsRegular).Should().Be((directory, link, regular));
        (identity.Dev, identity.Ino, identity.Uid).Should().Be(((ulong)16777234, (UInt128)8_590_000_001UL, (uint?)501));
        identity.WriteTime.Should().Be(stat.Mtime);
        identity.ChangeTime.Should().Be(stat.Ctime);
    }

    [Fact]
    public void A_negative_device_number_is_an_identity_of_its_bits_not_a_sign_extension()
    {
        var stat = Native.ParseDarwinStat(Buffer(b => BinaryPrimitives.WriteInt32LittleEndian(b.AsSpan(0), -1)));

        Native.DarwinIdentity(stat).Dev.Should().Be(uint.MaxValue);
    }

    [Fact]
    public void An_exclusive_rename_is_done_taken_or_an_error_and_a_volume_that_does_not_take_the_flag_fails_closed()
    {
        var darwin = ErrnoTable.Darwin;

        Native.DarwinExclusiveRenameOutcome(darwin, 0, "a", "b").Should().BeTrue();
        Native.DarwinExclusiveRenameOutcome(darwin, darwin.Eexist, "a", "b").Should().BeFalse("EEXIST: the name is taken, nothing moved");
        foreach (var unsupported in new[] { darwin.Enotsup, darwin.Einval, darwin.Enosys })
        {
            var act = () => Native.DarwinExclusiveRenameOutcome(darwin, unsupported, "a", "b");

            act.Should().Throw<IOException>($"errno {unsupported}: no fallback on Darwin").Which.Message.Should().Contain("RENAME_EXCL").And.Contain("kept");
        }

        var other = () => Native.DarwinExclusiveRenameOutcome(darwin, darwin.Enoent, "a", "b");
        other.Should().Throw<IOException>().Which.Message.Should().Contain("renamex_np").And.NotContain("RENAME_EXCL");
    }

    [Fact]
    public void Linuxs_numbers_are_never_read_on_darwin()
    {
        var darwin = ErrnoTable.Darwin;
        var linuxNotSupported = () => Native.DarwinExclusiveRenameOutcome(darwin, ErrnoTable.Linux.Enotsup, "a", "b");
        var darwinNotEmpty = () => Native.DarwinExclusiveRenameOutcome(darwin, darwin.Enotempty, "a", "b");

        linuxNotSupported.Should().Throw<IOException>().Which.Message.Should().NotContain("RENAME_EXCL", "95 is not ENOTSUP on Darwin");
        darwinNotEmpty.Should().Throw<IOException>().Which.Message.Should().NotContain("RENAME_EXCL");
    }
}
