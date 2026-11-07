using System.Diagnostics;
using System.Text.RegularExpressions;
using FluentAssertions;
using Xunit;

namespace CredsForDevs.Tests.Leftovers;

/// <summary>The process probe and the reads of the record's start and namespace (rule §3): the facts a
/// liveness verdict is built from. Every answer is three-valued — only "no such process" is dead — and
/// nothing here spawns a process on the helper's side.</summary>
public sealed partial class LivenessTests
{
    [Fact]
    public void A_pid_namespace_is_the_inode_of_proc_self_ns_pid_on_linux_and_absent_elsewhere()
    {
        if (!OperatingSystem.IsLinux())
        {
            Liveness.ReadPidNamespace().Should().BeNull("only Linux has a pid namespace to read");
            return;
        }

        var link = new FileInfo("/proc/self/ns/pid").LinkTarget;
        var expected = long.Parse(NamespaceInode().Match(link!).Groups[1].Value);
        Liveness.ReadPidNamespace().Should().Be(expected);
    }

    [GeneratedRegex(@"^pid:\[([0-9]+)\]\z")]
    private static partial Regex NamespaceInode();

    [Fact]
    public void The_clock_tick_rate_equals_what_getconf_prints()
    {
        if (!OperatingSystem.IsLinux())
        {
            Liveness.ClockTicksPerSecond().Should().BeNull("only Linux gives the rate without a child process");
            return;
        }

        // The TEST may spawn one child to learn a constant of the host; the helper may not.
        using var getconf = Process.Start(new ProcessStartInfo("getconf", "CLK_TCK") { RedirectStandardOutput = true })!;
        var printed = long.Parse(getconf.StandardOutput.ReadToEnd().Trim());
        getconf.WaitForExit();

        Liveness.ClockTicksPerSecond().Should().Be(printed);
    }

    [Theory]
    [InlineData(4, true)]
    [InlineData(4, false)]
    [InlineData(8, true)]
    [InlineData(8, false)]
    public void The_clock_tick_rate_is_read_from_an_auxiliary_vector_of_either_width_and_byte_order(int wordBytes, bool littleEndian)
    {
        var vector = Auxv(wordBytes, littleEndian, [17, 100, 0, 0]);

        Liveness.ClockTicksFromAuxv(vector, wordBytes, littleEndian).Should().Be(100);
    }

    [Fact]
    public void An_auxiliary_vector_without_an_end_marker_or_of_odd_length_or_with_a_zero_rate_gives_no_rate()
    {
        Liveness.ClockTicksFromAuxv(Auxv(8, true, [17, 100]), 8, true).Should().BeNull("a vector that never reaches AT_NULL is not trusted");
        Liveness.ClockTicksFromAuxv(Auxv(8, true, [17, 100, 0, 0]).AsSpan(0, 24), 8, true).Should().BeNull("the kernel writes whole pairs");
        Liveness.ClockTicksFromAuxv(Auxv(8, true, [17, 0, 0, 0]), 8, true).Should().BeNull("a rate of zero is no rate");
        Liveness.ClockTicksFromAuxv([], 8, true).Should().BeNull();
        Liveness.ClockTicksFromAuxv(Auxv(8, true, [17, 100, 0, 0]), 3, true).Should().BeNull("a word of 3 bytes is not a machine word");
    }

    [Fact]
    public void The_start_is_field_22_read_after_the_last_closing_parenthesis()
    {
        // field 3 (state) is the first after the name, so field 22 is the 20th: 350 ticks at 100/s over a boot at 1000.
        var fields = string.Join(' ', Enumerable.Range(3, 20).Select(f => f == 22 ? "350" : "0"));
        var stat = $"4242 (a b) c) {fields}";

        Liveness.StartFromProcStat(stat, 1000, 100).Should().Be(1003, "floor(btime + 350 / 100)");
    }

    [Fact]
    public void A_stat_line_with_too_few_fields_or_no_rate_gives_no_start()
    {
        var nineteen = "1 (a) " + string.Join(' ', Enumerable.Repeat("0", 19));
        var twenty = "1 (a) " + string.Join(' ', Enumerable.Repeat("0", 20));

        Liveness.StartFromProcStat(nineteen, 1000, 100).Should().BeNull("only 19 fields after the name: field 22 is missing");
        Liveness.StartFromProcStat(twenty, 1000, null).Should().BeNull("no rate, no start — never a guessed 100");
        Liveness.StartFromProcStat(twenty, 1000, 0).Should().BeNull();
        Liveness.StartFromProcStat(twenty, 1000, 100).Should().Be(1000);
        Liveness.StartFromProcStat("no closing parenthesis", 1000, 100).Should().BeNull();
    }

    [Fact]
    public void This_process_is_live_and_on_linux_carries_a_start_close_to_the_one_dotnet_reports()
    {
        var probe = Liveness.ProbeProcess(Environment.ProcessId);

        probe.State.Should().Be(ProbeState.Live);
        if (!OperatingSystem.IsLinux())
        {
            probe.Start.Should().BeNull("the record carries a start on Linux only");
            return;
        }

        var dotnet = new DateTimeOffset(Process.GetCurrentProcess().StartTime.ToUniversalTime()).ToUnixTimeSeconds();
        probe.Start.Should().NotBeNull();
        var delta = probe.Start!.Value - dotnet;
        TestContext.Current.AddWarning($"start measured: /proc formula = {probe.Start}, Process.StartTime = {dotnet}, delta = {delta} s");
        Math.Abs(delta).Should().BeLessThanOrEqualTo(StartToleranceSeconds);
    }

    private const int StartToleranceSeconds = 2;

    [Fact]
    public void A_pid_no_process_can_have_is_unknown_and_never_asked()
    {
        long[] never = [0, -1, (1L << 53) + 1, OperatingSystem.IsWindows() ? uint.MaxValue + 1L : int.MaxValue + 1L];

        foreach (var pid in never)
        {
            Liveness.ProbeProcess(pid).State.Should().Be(ProbeState.Unknown, $"pid {pid} addresses a group or nothing");
        }
    }

    [Fact]
    public void A_pid_past_the_largest_the_kernel_hands_out_is_dead()
    {
        UnmatchablePid.AssertNoSuchProcess(UnmatchablePid.Next());
        var pid = UnmatchablePid.Next();

        Liveness.ProbeProcess(pid).State.Should().Be(ProbeState.Dead);

        UnmatchablePid.AssertNoSuchProcess(pid);
    }

    [Fact]
    public void Consecutive_unmatchable_pids_differ_and_stay_unmatchable()
    {
        var first = UnmatchablePid.Next();
        var second = UnmatchablePid.Next(1);

        second.Should().NotBe(first);
        UnmatchablePid.AssertNoSuchProcess(second);
        if (OperatingSystem.IsWindows())
        {
            (first % 4).Should().Be(2);
            (second % 4).Should().Be(2);
        }
    }

    [Fact]
    public void Another_users_process_cannot_be_asked_and_is_unknown()
    {
        if (!Native.IsPosix) Assert.Skip("kill(2) answering EPERM for another user's process — Linux and macOS only");
        if (Native.GetUid() == 0) Assert.Skip("root may signal pid 1, so EPERM cannot be provoked");

        Liveness.ProbeProcess(1).State.Should().Be(ProbeState.Unknown, "EPERM says the process exists and nothing about its owner");
    }

    [Fact]
    public void On_windows_a_pid_two_above_a_live_one_answers_live_because_the_kernel_clears_the_tag_bits()
    {
        if (!OperatingSystem.IsWindows()) Assert.Skip("the pid tag bits — Windows only");

        // Windows pids are handle-table indices: OpenProcess(4n + 2) opens process 4n. The unmatchable-pid
        // premise (a pid = 2 mod 4 is never alive) rests on asking the way the probe asks, so measure it here.
        Liveness.ProbeProcess(Environment.ProcessId + 2L).State.Should().Be(ProbeState.Live);
    }

    [Fact]
    public void On_windows_pid_1_is_unknown_because_there_is_no_pid_1()
    {
        if (!OperatingSystem.IsWindows()) Assert.Skip("Windows has no pid 1 — Windows only");

        Liveness.ProbeProcess(1).State.Should().Be(ProbeState.Unknown);
    }

    [Fact]
    public void The_process_list_hides_nobody_here_unless_proc_1_is_invisible()
    {
        Liveness.HidepidActive().Should().Be(OperatingSystem.IsLinux() && !Directory.Exists("/proc/1"));
    }

    private static byte[] Auxv(int wordBytes, bool littleEndian, ulong[] words)
    {
        var bytes = new byte[words.Length * wordBytes];
        for (var i = 0; i < words.Length; i++)
        {
            var word = new byte[8];
            System.Buffers.Binary.BinaryPrimitives.WriteUInt64LittleEndian(word, words[i]);
            var part = word.AsSpan(0, wordBytes).ToArray();
            if (!littleEndian) Array.Reverse(part);
            part.CopyTo(bytes, i * wordBytes);
        }

        return bytes;
    }
}
