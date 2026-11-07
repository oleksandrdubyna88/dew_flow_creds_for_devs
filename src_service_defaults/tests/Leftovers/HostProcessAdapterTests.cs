using System.Diagnostics;
using System.Globalization;
using CredsForDevs.ServiceDefaults.Tests.Support;
using FluentAssertions;
using Xunit;

namespace CredsForDevs.Tests.Leftovers;

/// <summary>
/// The registry-correct adapter of <see cref="HostProcess"/> (E2.3.S2, S2.1-S2.3, S2.9, S2.10, and the child's own temp folder, which the Q5 measurement asked for).
/// <c>TempDirectory</c> makes an <see cref="OwnedDir"/> (claimed first, prefixed, registered) and <c>Remove</c> disposes it - never
/// <c>Removal.Quietly</c> on the path, never <c>Directory.Delete</c> - so a removal that gives up stays in the helper's own registry and the
/// end-of-run audit fails the run. The <c>Reaper</c> waits for the child's confirmed end before the folder it was started with goes.
/// </summary>
/// <remarks>
/// Every test keeps its own warning sink: no static, shared delegate exists for parallel tests to race on. The child fixtures are POSIX shell
/// scripts written into the folder under test; the Windows variant of a refused removal is a held handle (S2.2), and a Windows child that holds
/// a file is not built here (the removal of a folder with a running child is refused by the OS there, which is the brief's own proof).
/// </remarks>
public sealed class HostProcessAdapterTests
{
    private static readonly TimeSpan Bound = TimeSpan.FromSeconds(15);

    /// <summary>One test's own warning sink.</summary>
    private sealed class Sink
    {
        private readonly List<string> _lines = [];

        public IReadOnlyList<string> Lines
        {
            get
            {
                lock (_lines) return [.. _lines];
            }
        }

        public void Warn(string line)
        {
            lock (_lines) _lines.Add(line);
        }
    }

    private static OwnedDir? RegistryEntry(string path) => OwnedDir.Unreclaimed().SingleOrDefault(d => d.Path == path);

    /// <summary>The test's own clean-up of a folder it made: through the registry when it is there, else by identity.</summary>
    private static void Clean(string path)
    {
        if (RegistryEntry(path) is { } entry) entry.Dispose();
        _ = Removal.Quietly(path, _ => { });
    }

    private static string ClaimOf(string path) => path + ".owner";

    // ---- S2.1 ----------------------------------------------------------------------------------------------------

    [Fact]
    public void TempDirectory_makes_an_owned_claimed_folder_and_Remove_leaves_nothing_in_the_registry()
    {
        var sink = new Sink();
        var path = HostProcess.TempDirectory("mcp-pump", sink.Warn);
        try
        {
            Directory.Exists(path).Should().BeTrue("premise: the folder exists between the two calls");
            OwnedDir.Unreclaimed().Select(d => d.Path).Should().Contain(path, "premise: it is registered between the two calls");
            Owned.Pattern().IsMatch(Path.GetFileName(path)).Should().BeTrue("the folder is named by the helper: prefix, owner, token");
            File.Exists(ClaimOf(path)).Should().BeTrue("the claim is written first, beside the folder");

            HostProcess.Remove(path, sink.Warn);

            Directory.Exists(path).Should().BeFalse();
            File.Exists(ClaimOf(path)).Should().BeFalse("the claim goes with the folder");
            OwnedDir.Unreclaimed().Select(d => d.Path).Should().NotContain(path, "a disposed and removed folder leaves the registry");
            sink.Lines.Should().BeEmpty();
        }
        finally
        {
            Clean(path);
        }
    }

    // ---- S2.2 ----------------------------------------------------------------------------------------------------

    [Fact]
    public void A_removal_that_gives_up_is_one_warning_and_the_folder_stays_claimed_and_registered_so_the_audit_fails()
    {
        SkipWhenTheRefusalCannotBeMade();
        var sink = new Sink();
        var path = HostProcess.TempDirectory("mcp-pump", sink.Warn);
        using var release = Unremovable(path);
        using var privateRoot = OwnedDir.Create("audit-root");
        try
        {
            Directory.Exists(path).Should().BeTrue("premise: the folder exists before the removal");

            HostProcess.Remove(path, sink.Warn);

            Directory.Exists(path).Should().BeTrue("premise: the removal really failed");
            sink.Lines.Should().ContainSingle("the one line names the folder that was kept").Which.Should().Contain(path);
            Owned.Pattern().IsMatch(Path.GetFileName(path)).Should().BeTrue();
            File.Exists(ClaimOf(path)).Should().BeTrue("a folder that is not removed keeps its claim");
            var entry = RegistryEntry(path);
            entry.Should().NotBeNull("the helper's own registry still holds it");
            entry!.DisposeAttempted.Should().BeTrue();

            var audit = () => LeftoversAudit.Run(privateRoot.Path, Owner.This, [entry]);

            audit.Should().Throw<LeftoversAuditException>().Which.Message.Should().Contain("disposed but not removed").And.Contain(path);
        }
        finally
        {
            release.Dispose();
            Clean(path);
        }
    }

    // ---- S2.3 ----------------------------------------------------------------------------------------------------

    [Fact]
    public void Remove_of_a_path_TempDirectory_did_not_give_is_one_warning_and_the_path_is_untouched()
    {
        var sink = new Sink();
        using var foreign = OwnedDir.Create("not-from-host");
        File.WriteAllText(Path.Combine(foreign.Path, "keep.txt"), "must survive");
        Directory.Exists(foreign.Path).Should().BeTrue("premise: the path exists before");

        HostProcess.Remove(foreign.Path, sink.Warn);

        Directory.Exists(foreign.Path).Should().BeTrue("the path exists after");
        File.ReadAllText(Path.Combine(foreign.Path, "keep.txt")).Should().Be("must survive");
        File.Exists(ClaimOf(foreign.Path)).Should().BeTrue();
        sink.Lines.Should().ContainSingle().Which.Should().Contain(foreign.Path);
    }

    // ---- S2.10 ---------------------------------------------------------------------------------------------------

    [Fact]
    public async Task Many_TempDirectory_and_Remove_pairs_on_parallel_threads_each_remove_their_folder_once_and_each_sink_holds_only_its_own_lines()
    {
        const int Count = 12;
        using var overlap = new Barrier(Count);
        var sinks = Enumerable.Range(0, Count).Select(_ => new Sink()).ToArray();
        var paths = new string[Count];
        var overlapped = new bool[Count];
        var tasks = Enumerable.Range(0, Count).Select(i => Task.Factory.StartNew(() =>
        {
            paths[i] = HostProcess.TempDirectory("par-" + i.ToString(CultureInfo.InvariantCulture), sinks[i].Warn);
            overlapped[i] = overlap.SignalAndWait(Bound); // every folder exists while the others are made: the tasks really overlap
            HostProcess.Remove(paths[i], sinks[i].Warn);
            HostProcess.Remove(paths[i], sinks[i].Warn); // the second call of a pair is one warning in the SAME sink
        }, TaskCreationOptions.LongRunning)).ToArray();
        try
        {
            await Task.WhenAll(tasks).WaitAsync(Bound, TestContext.Current.CancellationToken);

            overlapped.Should().OnlyContain(ok => ok, "premise: all twelve folders existed at once");
            for (var i = 0; i < Count; i++)
            {
                Owned.Pattern().IsMatch(Path.GetFileName(paths[i])).Should().BeTrue($"folder {i} is prefixed");
                Directory.Exists(paths[i]).Should().BeFalse($"folder {i} was removed");
                sinks[i].Lines.Should().ContainSingle($"sink {i} holds the one warning of its own second call").Which.Should().Contain(paths[i]);
                foreach (var other in paths.Where(p => p != paths[i])) sinks[i].Lines[0].Should().NotContain(other);
            }
        }
        finally
        {
            foreach (var path in paths.Where(p => p is not null)) Clean(path);
        }
    }

    [Fact]
    public void Remove_called_twice_or_at_once_on_one_path_disposes_it_once_and_every_other_call_is_a_warning()
    {
        var sink = new Sink();
        var path = HostProcess.TempDirectory("twice", sink.Warn);
        var disposals = 0;
        try
        {
            HostProcess.Remove(path, sink.Warn, _ => Interlocked.Increment(ref disposals));
            HostProcess.Remove(path, sink.Warn, _ => Interlocked.Increment(ref disposals));

            disposals.Should().Be(1, "only the call that won the atomic take-out disposes");
            sink.Lines.Should().ContainSingle("the second call is one warning").Which.Should().Contain(path);
            Directory.Exists(path).Should().BeFalse();

            var raced = HostProcess.TempDirectory("raced", sink.Warn);
            disposals = 0;
            using var gate = new Barrier(8);
            Parallel.For(0, 8, new ParallelOptions { MaxDegreeOfParallelism = 8 }, _ =>
            {
                gate.SignalAndWait(Bound);
                HostProcess.Remove(raced, sink.Warn, _ => Interlocked.Increment(ref disposals));
            });
            disposals.Should().Be(1, "eight calls at once, one winner");
            sink.Lines.Should().HaveCount(1 + 7, "seven losers, one warning each (plus the first test's one)");
            Directory.Exists(raced).Should().BeFalse();
        }
        finally
        {
            Clean(path);
        }
    }

    [Fact]
    public void A_failed_dispose_stays_in_the_registry_even_when_many_calls_raced_for_it()
    {
        SkipWhenTheRefusalCannotBeMade();
        var sink = new Sink();
        var path = HostProcess.TempDirectory("raced-fail", sink.Warn);
        using var release = Unremovable(path);
        using var privateRoot = OwnedDir.Create("audit-root");
        var disposals = 0;
        try
        {
            using var gate = new Barrier(4);
            Parallel.For(0, 4, new ParallelOptions { MaxDegreeOfParallelism = 4 }, _ =>
            {
                gate.SignalAndWait(Bound);
                HostProcess.Remove(path, sink.Warn, _ => Interlocked.Increment(ref disposals));
            });

            disposals.Should().Be(1);
            Directory.Exists(path).Should().BeTrue("premise: the one disposal gave up");
            var entry = RegistryEntry(path);
            entry.Should().NotBeNull("a loser of the race does not hide the failure from the audit");

            var audit = () => LeftoversAudit.Run(privateRoot.Path, Owner.This, [entry!]);

            audit.Should().Throw<LeftoversAuditException>().Which.Message.Should().Contain("disposed but not removed").And.Contain(path);
        }
        finally
        {
            release.Dispose();
            Clean(path);
        }
    }

    // ---- S2.9 ----------------------------------------------------------------------------------------------------

    /// <summary>The child: holds a file of the folder open (fd 3), starts a grandchild that inherits it, and prints both pids.</summary>
    private const string HoldingChild = "#!/bin/sh\nexec 3>\"$1/held.txt\"\necho $$\nsleep 300 &\necho $!\nwait\n";

    private static async Task<(Process Child, int ChildPid, int GrandchildPid)> StartHoldingChildAsync(string folder, CancellationToken ct)
    {
        var script = Path.Combine(folder, "child.sh");
        File.WriteAllText(script, HoldingChild);
        var child = HostProcess.StartFile("/bin/sh", [script, folder], new Dictionary<string, string>());
        var childPid = int.Parse((await child.StandardOutput.ReadLineAsync(ct).AsTask().WaitAsync(Bound, ct))!, CultureInfo.InvariantCulture);
        var grandchildPid = int.Parse((await child.StandardOutput.ReadLineAsync(ct).AsTask().WaitAsync(Bound, ct))!, CultureInfo.InvariantCulture);
        return (child, childPid, grandchildPid);
    }

    [Fact]
    public async Task The_folder_goes_only_after_the_child_that_holds_a_file_in_it_has_ended()
    {
        Assert.SkipWhen(OperatingSystem.IsWindows(), "the fixture child is a POSIX shell script; on Windows the OS itself refuses to delete a folder a running child holds open");
        var ct = TestContext.Current.CancellationToken;
        var sink = new Sink();
        var folder = HostProcess.TempDirectory("host-end", sink.Warn);
        var (child, childPid, grandchildPid) = await StartHoldingChildAsync(folder, ct);
        try
        {
            Posix.Alive(childPid).Should().BeTrue("premise: the child was alive when the test's assertion failed");
            Posix.Alive(grandchildPid).Should().BeTrue("premise: the grandchild is alive");
            File.Exists(Path.Combine(folder, "held.txt")).Should().BeTrue("premise: the child holds a file of the folder open");
            var childAliveAtRemoval = new List<bool>();

            var early = 0;
            HostProcess.Remove(folder, sink.Warn, _ => early++); // the class disposes while the child still runs: the child may still write here
            early.Should().Be(0, "a folder with a running child tied to it is not disposed");
            Directory.Exists(folder).Should().BeTrue("the folder is kept while its child has not ended");
            sink.Lines.Should().ContainSingle("the kept folder is one warning").Which.Should().Contain(folder);

            using (HostProcess.KillOnDispose(child))
            {
                // the test's own assertion fails here, inside the using of its KillOnDispose: the using ends
            }

            HostProcess.Remove(folder, sink.Warn, _ => childAliveAtRemoval.Add(Posix.Alive(childPid)));

            childAliveAtRemoval.Should().Equal([false], "the removal started after the child's end was confirmed, not before");
            Directory.Exists(folder).Should().BeFalse();
            sink.Lines.Should().HaveCount(1, "only the early warning; the removal after the confirmed end is silent");
            (await Posix.GoneWithinAsync(grandchildPid, Bound, ct)).Should().BeTrue("the whole tree was killed, the grandchild with it");
        }
        finally
        {
            Posix.KillHard(grandchildPid);
            child.Dispose();
            Clean(folder);
        }
    }

    [Fact]
    public async Task A_child_whose_end_cannot_be_confirmed_fails_the_test_visibly_and_its_folder_stays_claimed_and_registered()
    {
        Assert.SkipWhen(OperatingSystem.IsWindows(), "the fixture child is a POSIX shell script");
        var ct = TestContext.Current.CancellationToken;
        var sink = new Sink();
        var folder = HostProcess.TempDirectory("host-unsure", sink.Warn);
        var (child, childPid, grandchildPid) = await StartHoldingChildAsync(folder, ct);
        var removals = 0;
        try
        {
            var unconfirmed = HostProcess.KillOnDispose(child, (_, _) => false);

            var thrown = Record.Exception(unconfirmed.Dispose);

            thrown.Should().BeOfType<InvalidOperationException>("the Reaper fails the test when it cannot confirm the end");
            thrown!.Message.Should().Contain(childPid.ToString(CultureInfo.InvariantCulture)).And.Contain(folder, "it names the pid and the folder");

            HostProcess.Remove(folder, sink.Warn, _ => removals++);

            removals.Should().Be(0, "a folder with a tie still open is not disposed");
            Directory.Exists(folder).Should().BeTrue();
            File.Exists(ClaimOf(folder)).Should().BeTrue();
            sink.Lines.Should().ContainSingle("the kept folder is one warning").Which.Should().Contain(folder);
            RegistryEntry(folder).Should().NotBeNull("it stays registered, so the audit is red too");

            using (HostProcess.KillOnDispose(child))
            {
                // the real wait: now the end is confirmed, and the tie ends with it
            }

            HostProcess.Remove(folder, sink.Warn, _ => removals++);

            removals.Should().Be(1);
            Directory.Exists(folder).Should().BeFalse("after the confirmed end the folder goes");
        }
        finally
        {
            Posix.KillHard(grandchildPid);
            child.Dispose();
            Clean(folder);
        }
    }

    // ---- the child's own temp folder (Q5, F13) ---------------------------------------------------------------------

    private const string TempEchoingChild = "#!/bin/sh\nprintf '%s\\n%s\\n%s\\n' \"$TMPDIR\" \"$TEMP\" \"$TMP\"\nread line\n";

    [Fact]
    public async Task A_child_gets_an_owned_folder_under_the_short_root_as_its_temp_path_and_the_folder_goes_with_its_confirmed_end()
    {
        Assert.SkipWhen(OperatingSystem.IsWindows(), "the fixture child is a POSIX shell script");
        var ct = TestContext.Current.CancellationToken;
        using var scratch = OwnedDir.Create("child-tmp-scratch");
        var script = Path.Combine(scratch.Path, "child.sh");
        File.WriteAllText(script, TempEchoingChild);
        using var child = HostProcess.StartFile("/bin/sh", [script], new Dictionary<string, string>());
        var reaper = HostProcess.KillOnDispose(child);
        string[] temp = [];
        try
        {
            temp = new string[3];
            for (var i = 0; i < 3; i++) temp[i] = (await child.StandardOutput.ReadLineAsync(ct).AsTask().WaitAsync(Bound, ct))!;
            temp.Distinct().Should().ContainSingle("TMPDIR, TEMP and TMP are one folder");
            var given = temp[0];
            Owned.Pattern().IsMatch(Path.GetFileName(given)).Should().BeTrue("the child's temp folder is owned: prefixed and claimed");
            Path.GetDirectoryName(given).Should().Be(OwnedCreds.Canonical(OwnedCreds.ShortSocketRoot), "it lies under the short socket root");
            Directory.Exists(given).Should().BeTrue("premise: it exists while the child runs");
            File.Exists(ClaimOf(given)).Should().BeTrue();
        }
        finally
        {
            reaper.Dispose();
        }

        Directory.Exists(temp[0]).Should().BeFalse("the folder went after the child's end was confirmed");
        File.Exists(ClaimOf(temp[0])).Should().BeFalse();
        OwnedDir.Unreclaimed().Select(d => d.Path).Should().NotContain(temp[0]);
    }

    [Fact]
    public async Task A_test_that_names_the_temp_variables_itself_gets_exactly_what_it_asked_for()
    {
        Assert.SkipWhen(OperatingSystem.IsWindows(), "the fixture child is a POSIX shell script");
        var ct = TestContext.Current.CancellationToken;
        using var scratch = OwnedDir.Create("child-tmp-asked");
        var script = Path.Combine(scratch.Path, "child.sh");
        File.WriteAllText(script, TempEchoingChild);
        var asked = new Dictionary<string, string> { ["TMPDIR"] = scratch.Path, ["TEMP"] = scratch.Path, ["TMP"] = scratch.Path };
        var before = OwnedDir.Unreclaimed().Count;
        using var child = HostProcess.StartFile("/bin/sh", [script], asked);
        using var reaper = HostProcess.KillOnDispose(child);

        var first = await child.StandardOutput.ReadLineAsync(ct).AsTask().WaitAsync(Bound, ct);

        first.Should().Be(scratch.Path);
        OwnedDir.Unreclaimed().Count.Should().BeLessThanOrEqualTo(before, "no extra temp folder was made for a child that was given its own");
    }

    // ---- the refusal ---------------------------------------------------------------------------------------------

    /// <summary>Called FIRST in a test that provokes a refused removal: root unlinks a file under a read-only folder, so there the refusal cannot be made, and a skip must come before any folder exists.</summary>
    private static void SkipWhenTheRefusalCannotBeMade()
    {
        if (!OperatingSystem.IsWindows() && Native.GetUid() == 0) Assert.Skip("root unlinks a file under a read-only folder, so the refusal cannot be provoked");
    }

    /// <summary>The OS's own way to refuse a removal: Windows - a file held open with no sharing; POSIX - a read-only sub-folder, so the file in it cannot be unlinked.</summary>
    private static IDisposable Unremovable(string dir)
    {
        var locked = Path.Combine(dir, "locked");
        Directory.CreateDirectory(locked);
        var file = Path.Combine(locked, "held.txt");
        File.WriteAllText(file, "held");
        if (OperatingSystem.IsWindows())
        {
            var held = File.Open(file, FileMode.Open, FileAccess.Read, FileShare.None);
            return new Undo(held.Dispose);
        }

        File.SetUnixFileMode(locked, UnixFileMode.UserRead | UnixFileMode.UserExecute);
        return new Undo(() =>
        {
            if (!OperatingSystem.IsWindows()) File.SetUnixFileMode(locked, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
        });
    }

    private sealed class Undo(Action undo) : IDisposable
    {
        private int _done;

        public void Dispose()
        {
            if (Interlocked.Exchange(ref _done, 1) == 0) undo();
        }
    }
}
