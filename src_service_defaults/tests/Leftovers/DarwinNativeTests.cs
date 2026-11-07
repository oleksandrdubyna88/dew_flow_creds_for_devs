using System.Runtime.Versioning;
using FluentAssertions;
using Xunit;

namespace CredsForDevs.Tests.Leftovers;

/// <summary>The macOS half of <see cref="Native"/>, which nothing proves from Linux: <c>renamex_np</c> with <c>RENAME_EXCL</c> onto a taken name,
/// the claim read on a FIFO swapped in (in a CHILD process, bounded and killed with its whole tree), and the <c>kill(pid, 0)</c> probe. Each
/// test skips off macOS and, on macOS, first requires the <see cref="DarwinLayout"/> self-test to hold.</summary>
public sealed class DarwinNativeTests : IDisposable
{
    /// <summary>What the child may take: a start of the whole test runner, then one read. Past it the child is a hang.</summary>
    private static readonly TimeSpan ChildTimeout = TimeSpan.FromSeconds(90);

    private readonly OwnedScope _owned = DarwinLayout.FreshOwnedScope();

    public void Dispose() => _owned.Dispose();

    [Fact]
    public void An_exclusive_rename_onto_a_taken_name_leaves_the_existing_entry_with_its_identity()
    {
        RequireMacOs();
        var scratch = _owned.Dir("scratch");
        var from = Path.Combine(scratch, "from");
        var empty = Path.Combine(scratch, "empty");
        var full = Path.Combine(scratch, "full");
        var file = Path.Combine(scratch, "file");
        Directory.CreateDirectory(from);
        File.WriteAllText(Path.Combine(from, "keep.txt"), "kept");
        Directory.CreateDirectory(empty);
        Directory.CreateDirectory(full);
        File.WriteAllText(Path.Combine(full, "theirs.txt"), "theirs");
        File.WriteAllText(file, "a file");
        var source = Native.IdentityOf(from)!.Value;

        foreach (var taken in new[] { empty, full, file })
        {
            var before = Native.IdentityOf(taken)!.Value;

            Native.RenameExclusively(from, taken).Should().BeFalse($"{Path.GetFileName(taken)} is taken: renamex_np answers EEXIST");

            var after = Native.IdentityOf(taken)!.Value;
            (after.Dev, after.Ino).Should().Be((before.Dev, before.Ino), "the existing entry survives, the same one");
            var stillThere = Native.IdentityOf(from)!.Value;
            (stillThere.Dev, stillThere.Ino).Should().Be((source.Dev, source.Ino), "the source stays where it was");
        }

        Directory.GetFileSystemEntries(empty).Should().BeEmpty();
        File.ReadAllText(Path.Combine(full, "theirs.txt")).Should().Be("theirs");
        File.ReadAllText(file).Should().Be("a file");
        File.ReadAllText(Path.Combine(from, "keep.txt")).Should().Be("kept");
    }

    [Fact]
    public void An_exclusive_rename_onto_a_free_name_moves_the_folder_with_its_identity()
    {
        RequireMacOs();
        var scratch = _owned.Dir("scratch");
        var from = Path.Combine(scratch, "from");
        var free = Path.Combine(scratch, "free");
        Directory.CreateDirectory(from);
        File.WriteAllText(Path.Combine(from, "keep.txt"), "kept");
        var before = Native.IdentityOf(from)!.Value;

        Native.RenameExclusively(from, free).Should().BeTrue();

        var after = Native.IdentityOf(free)!.Value;
        (after.Dev, after.Ino).Should().Be((before.Dev, before.Ino));
        Native.IdentityOf(from).Should().BeNull();
        File.ReadAllText(Path.Combine(free, "keep.txt")).Should().Be("kept");
    }

    [Fact]
    [SupportedOSPlatform("macos")]
    public void A_fifo_swapped_in_after_the_judgement_is_refused_by_a_child_that_never_blocks_and_nothing_is_left_running()
    {
        RequireMacOs();
        var scratch = _owned.Dir("scratch");
        var claim = Path.Combine(scratch, "claim");
        var fifo = Path.Combine(scratch, "fifo");
        File.WriteAllText(claim, "u1:h@macos:1\n");
        var judged = Native.IdentityOf(claim)!.Value;
        PosixFifo.Make(fifo);
        File.Move(fifo, claim, overwrite: true); // the swap: the judged file is gone, a FIFO is under its name
        var environment = new Dictionary<string, string> { [DarwinFifoChild.Variable] = $"{claim}|{judged.Dev}|{judged.Ino}" };

        DirectoryLinks.ToolRun run;
        try
        {
            run = DirectoryLinks.Run(Environment.ProcessPath!, ["--filter-class", "*DarwinFifoChild"], ChildTimeout, environment);
        }
        finally
        {
            PosixFifo.ReleaseReaders(claim); // a hung open (the defect) would hold the child; the kill below is the real stop
        }

        run.TimedOut.Should().BeFalse($"the child hung on a FIFO and was killed after {ChildTimeout.TotalSeconds} s, with its whole process tree");
        run.ExitCode.Should().Be(0, $"the child's read must be refused; it said: {run.Output}");
        Native.Kill(run.Pid).Should().Be(Errno.Current.Esrch, "the child is reaped: no process is left under its pid");
    }

    [Fact]
    public void The_kill_probe_says_live_for_this_process_and_dead_for_a_pid_no_process_can_have()
    {
        RequireMacOs();
        var dead = UnmatchablePid.Next();

        Native.Kill(Environment.ProcessId).Should().Be(0);
        Liveness.ProbeProcess(Environment.ProcessId).Should().Be(new Probe(ProbeState.Live, null), "macOS gives no start without a child");
        Native.Kill((int)dead).Should().Be(Errno.Current.Esrch);
        Liveness.ProbeProcess(dead).State.Should().Be(ProbeState.Dead);
        UnmatchablePid.AssertNoSuchProcess(dead);
    }

    private static void RequireMacOs()
    {
        if (!OperatingSystem.IsMacOS()) Assert.Skip("Darwin's native calls — macOS only");
        DarwinLayout.Require();
    }
}
