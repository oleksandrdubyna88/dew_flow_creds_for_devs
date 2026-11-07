using System.Runtime.Versioning;
using System.Security.Principal;
using CredsForDevs.ServiceDefaults.Tests.Support;
using FluentAssertions;
using Xunit;

namespace CredsForDevs.Tests.Leftovers;

/// <summary>
/// The second root (E2.3.S2, S2.4-S2.6 and S2.8's unit half): a socket folder lives under a SHORT root (<c>/tmp</c>) because a socket path has a hard
/// byte limit, and where that root is not the temp root (macOS by default; Linux with <c>TMPDIR</c> set) a killed run's socket folder is collected by
/// <see cref="LeftoversSocketRootSweepFixture"/>, and its own folders are audited at the end. Every test passes a PRIVATE pair of roots; the
/// roots are made by an <see cref="OwnedScope"/>, and "old" is the sweep's clock, set 11 minutes on, never a rewritten file time.
/// </summary>
public sealed class SocketRootSweepTests : IDisposable
{
    private const string ProducerRoot = "CREDS_SOCKET_PRODUCER_ROOT";
    private const string ProducerHandshake = "CREDS_SOCKET_PRODUCER_HANDSHAKE";
    private static readonly TimeSpan Bound = TimeSpan.FromSeconds(60);
    private static readonly TimeSpan Old = TimeSpan.FromMinutes(11);

    private readonly OwnedScope _owned = DarwinLayout.FreshOwnedScope();

    public void Dispose() => _owned.Dispose();

    private static SweepResult SweepAt(string root, DateTimeOffset now) =>
        LeftoversSweep.Run(new SweepOptions(root, now, LeftoversSweep.MinAge, Liveness.ProbeProcess, Scope.IsMine));

    private static long Dead()
    {
        var pid = UnmatchablePid.Next();
        UnmatchablePid.AssertNoSuchProcess(pid);
        return pid;
    }

    private static string? ReasonOf(SweepResult result, string path) =>
        result.Preserved.Where(p => p.Path == path).Select(p => p.Reason).SingleOrDefault();

    /// <summary>A folder of this owner and token with a claim of a dead run. On Windows both are re-owned to the caller first (revision row 11): a
    /// real entry of an elevated run reads as a stranger's, so a test that says "collected" must say whose it is.</summary>
    private static string PlantDead(string root, string what, long pid)
    {
        var dir = Path.Combine(root, Owned.NameBase + what + "-abc123");
        Directory.CreateDirectory(dir);
        File.WriteAllText(Path.Combine(dir, "file.txt"), "x");
        File.WriteAllText(dir + ".owner", (Owner.This with { Pid = pid }).Format() + "\n");
        if (OperatingSystem.IsWindows()) ReOwn(dir);
        return dir;
    }

    [SupportedOSPlatform("windows")]
    private static void ReOwnOnWindows(string dir)
    {
        using var ownership = new WindowsOwnership();
        ownership.OwnedByCaller(dir);
        ownership.OwnedByCaller(dir + ".owner");
        Scope.IsMine(dir).Should().BeTrue("premise: the folder reads as the caller's after the re-owning");
        Scope.IsMine(dir + ".owner").Should().BeTrue("premise: so does its claim");
    }

    private static void ReOwn(string dir)
    {
        if (OperatingSystem.IsWindows()) ReOwnOnWindows(dir);
    }

    private (string Temp, string Socket) PrivatePair() => (_owned.Dir("roots-temp"), _owned.Dir("roots-socket"));

    // ---- S2.4 (a) (b) --------------------------------------------------------------------------------------------

    [Fact]
    public void A_dead_claimed_folder_in_the_second_root_is_removed_by_the_socket_root_fixture_and_the_main_sweep_alone_keeps_it()
    {
        var (temp, socket) = PrivatePair();
        OwnedCreds.RootsDiffer(temp, socket).Should().BeTrue("premise: the pair of roots differs");
        var dead = Dead();
        var folder = PlantDead(socket, "sock", dead);
        Directory.Exists(folder).Should().BeTrue("premise: the folder exists before");
        File.Exists(folder + ".owner").Should().BeTrue("premise: and its claim");
        var clock = DateTimeOffset.UtcNow + Old;

        var main = new LeftoversSweepFixture(() => SweepAt(temp, clock), _ => { });

        main.LastRun.Removed.Should().BeEmpty("(b) the main fixture's sweep reads the other root");
        Directory.Exists(folder).Should().BeTrue();
        File.Exists(folder + ".owner").Should().BeTrue();

        var reported = new List<string>();
        var sockets = new LeftoversSocketRootSweepFixture(socket, temp, () => { }, root => SweepAt(root, clock), reported.Add);

        sockets.OwnsASweep.Should().BeTrue("(a) the roots differ, so this fixture owns the sweep of the second root");
        sockets.SweptRoot.Should().Be(socket);
        sockets.LastRun!.Removed.Should().Equal(folder);
        Directory.Exists(folder).Should().BeFalse();
        File.Exists(folder + ".owner").Should().BeFalse("the claim goes with the folder");
        reported.Should().NotBeEmpty("a sweep that did something says so").And.OnlyContain(line => line.Contains(socket), "each line names the root it swept");
        UnmatchablePid.AssertNoSuchProcess(dead);
    }

    // ---- S2.4 (c): a separate live process makes the folder the natural way -----------------------------------------

    /// <summary>
    /// Not a test of its own. It is the PRODUCER half of the live-folder test below, and it does something only when the test process was started
    /// with <c>CREDS_SOCKET_PRODUCER_ROOT</c>: it makes <c>OwnedScope.Dir("sock", root)</c> (claim first, exclusive create, this process's record),
    /// publishes the path, and stays alive until the stop file appears. Anywhere else it skips, saying why.
    /// </summary>
    [Fact]
    public async Task The_producer_side_of_the_live_folder_test()
    {
        var root = Environment.GetEnvironmentVariable(ProducerRoot);
        if (string.IsNullOrEmpty(root)) Assert.Skip($"{ProducerRoot} is not set - this runs only as the separate producer process of the live-folder test");
        var handshake = Environment.GetEnvironmentVariable(ProducerHandshake)!;
        using var scope = new OwnedScope();
        var dir = scope.Dir("sock", root);
        File.WriteAllText(handshake + ".part", dir);
        File.Move(handshake + ".part", handshake);
        await WaitForFileAsync(handshake + ".stop", TestContext.Current.CancellationToken);
    }

    private static async Task WaitForFileAsync(string path, CancellationToken ct)
    {
        using var give = CancellationTokenSource.CreateLinkedTokenSource(ct);
        give.CancelAfter(Bound);
        while (!File.Exists(path)) await Task.Delay(50, give.Token);
    }

    [Fact]
    public async Task A_folder_a_live_process_made_survives_the_socket_root_sweep_as_live_or_as_foreign_uid_on_an_elevated_windows_process()
    {
        var ct = TestContext.Current.CancellationToken;
        var (temp, socket) = PrivatePair();
        var handshake = Path.Combine(_owned.Dir("handshake"), "folder.txt");
        var env = new Dictionary<string, string> { [ProducerRoot] = socket, [ProducerHandshake] = handshake };
        // The producer is a whole test run of its own. Its run record must be ITS pid: an ambient TESTSTODELETE_RUN (an npm runner exports one) would make its claim
        // the parent's record, and the folder would read as the parent's. An empty value is "none".
        env["TESTSTODELETE_RUN"] = string.Empty;
        // The host id of a claim carries the WSL distribution (Owner.HostId); HostProcess takes that variable out of a child's environment unless the test names it.
        if (Environment.GetEnvironmentVariable(HostProcess.DistroVariable) is { Length: > 0 } distro) env[HostProcess.DistroVariable] = distro;
        using var producer = HostProcess.StartFile(Environment.ProcessPath!, ["--filter-method", "*The_producer_side_of_the_live_folder_test*"], env);
        var reaper = HostProcess.KillOnDispose(producer);
        // Its reports are read to the end, so a long one cannot fill a pipe and block it. NOTE: the producer is handed an owned temp folder (HostProcess), so its roots DIFFER
        // and its socket-root fixture sweeps the real /tmp: only dead, aged, claimed folders of this user and token, as every run of this suite does.
        _ = producer.StandardOutput.ReadToEndAsync(ct);
        _ = producer.StandardError.ReadToEndAsync(ct);
        try
        {
            await WaitForFileAsync(handshake, ct);
            var folder = await File.ReadAllTextAsync(handshake, ct);

            Directory.Exists(folder).Should().BeTrue("premise: the producer made the folder");
            File.Exists(folder + ".owner").Should().BeTrue("premise: and its claim");
            producer.HasExited.Should().BeFalse("premise: the producer's pid is alive at the sweep");
            var claimed = Owner.Parse(File.ReadAllText(folder + ".owner"));
            claimed.Should().NotBeNull("premise: the claim parses");
            claimed!.Pid.Should().Be(producer.Id, "the claim is the producer's own record, made the natural way");
            SweepAt(socket, DateTimeOffset.UtcNow).Preserved.Should().Contain((folder, "young"), "premise: without the clock seam the folder is under the age floor");

            var sockets = new LeftoversSocketRootSweepFixture(socket, temp, () => { }, root => SweepAt(root, DateTimeOffset.UtcNow + Old), _ => { });

            var expected = IsElevatedWindows() ? "foreign-uid" : "live";
            ReasonOf(sockets.LastRun!, folder).Should().Be(expected, "the owner is asked before liveness; a live process keeps its folder");
            sockets.LastRun!.Removed.Should().BeEmpty();
            Directory.Exists(folder).Should().BeTrue();
            File.Exists(folder + ".owner").Should().BeTrue("the claim survives with it");
        }
        finally
        {
            await File.WriteAllTextAsync(handshake + ".stop", string.Empty, CancellationToken.None);
            _ = producer.WaitForExit(Bound);
            reaper.Dispose();
        }
    }

    private static bool IsElevatedWindows() => OperatingSystem.IsWindows() && ElevatedOnWindows();

    [SupportedOSPlatform("windows")]
    private static bool ElevatedOnWindows() => new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator);

    // ---- S2.5 ------------------------------------------------------------------------------------------------------

    [Fact]
    public async Task A_layout_requirement_that_throws_means_no_sweep_one_report_line_and_no_audit_removal()
    {
        var (temp, socket) = PrivatePair();
        var layoutCalls = 0;
        var swept = 0;
        var audited = 0;
        var lines = new List<string>();

        var fixture = new LeftoversSocketRootSweepFixture(
            socket, temp, () => { layoutCalls++; throw new InvalidOperationException("the layout does not hold (a seam)"); }, _ => { swept++; return SweepResult.Empty; }, lines.Add, _ => audited++);

        layoutCalls.Should().BeGreaterThan(0, "premise: the seam was called");
        swept.Should().Be(0, "no sweep runs on a layout that does not hold");
        lines.Should().ContainSingle().Which.Should().Contain("the layout does not hold");
        var dispose = async () => await fixture.DisposeAsync();
        await dispose.Should().ThrowAsync<InvalidOperationException>().WithMessage("*the layout does not hold*");
        audited.Should().Be(0, "no audit removal on a layout that does not hold");
    }

    [Fact]
    public async Task Where_the_roots_are_one_this_fixture_runs_no_sweep_and_no_audit_and_says_so()
    {
        var (temp, _) = PrivatePair();
        var swept = 0;
        var audited = 0;
        var lines = new List<string>();

        var fixture = new LeftoversSocketRootSweepFixture(temp, temp, () => { }, _ => { swept++; return SweepResult.Empty; }, lines.Add, _ => audited++);
        await fixture.DisposeAsync();

        fixture.OwnsASweep.Should().BeFalse("the main fixture's sweep IS the sweep of that root");
        fixture.LastRun.Should().BeNull();
        swept.Should().Be(0);
        audited.Should().Be(0);
        lines.Should().BeEmpty();
    }

    [Fact]
    public async Task Roots_that_are_one_through_a_link_are_one_root_and_roots_that_are_two_stay_two()
    {
        var (temp, socket) = PrivatePair();
        var link = Path.Combine(_owned.Dir("link-holder"), "alias");
        DirectoryLinks.CreateOrSkip(link, temp);
        var swept = 0;

        var same = new LeftoversSocketRootSweepFixture(link, temp, () => { }, _ => { swept++; return SweepResult.Empty; }, _ => { }, _ => { });
        var other = new LeftoversSocketRootSweepFixture(socket, temp, () => { }, _ => { swept++; return SweepResult.Empty; }, _ => { }, _ => { });
        await same.DisposeAsync();
        await other.DisposeAsync();

        same.OwnsASweep.Should().BeFalse("a link to the temp root is the temp root: one sweep, not two");
        other.OwnsASweep.Should().BeTrue();
        swept.Should().Be(1);
    }

    // ---- S2.6 ------------------------------------------------------------------------------------------------------

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task A_never_disposed_folder_fails_the_run_whichever_fixture_is_disposed_first(bool mainFirst)
    {
        var (temp, socket) = PrivatePair();
        var dir = OwnedDir.Create("never", socket);
        Func<IReadOnlyList<OwnedDir>> mine = () => [.. OwnedDir.Unreclaimed().Where(d => d.Path == dir.Path)];
        OwnedDir.Unreclaimed().Select(d => d.Path).Should().Contain(dir.Path, "premise: the folder is registered before the disposals");
        var main = new LeftoversSweepFixture(() => SweepResult.Empty, _ => { }, () => LeftoversSweepFixture.RealAudit(temp, mine()));
        var sockets = new LeftoversSocketRootSweepFixture(socket, temp, () => { }, _ => SweepResult.Empty, _ => { }, root => LeftoversSweepFixture.RealAudit(root, mine()));
        Func<ValueTask> first = mainFirst ? main.DisposeAsync : sockets.DisposeAsync;
        Func<ValueTask> second = mainFirst ? sockets.DisposeAsync : main.DisposeAsync;
        try
        {
            var failed = async () => await first();

            var thrown = (await failed.Should().ThrowAsync<LeftoversAuditException>()).Which;

            thrown.Message.Should().Contain("never disposed").And.Contain(dir.Path, "the message names the folder under its words");
            thrown.NeverDisposed.Should().Equal(dir.Path);
            Directory.Exists(dir.Path).Should().BeFalse("the audit removed it, so the next run starts clean");
            var again = async () => await second();
            await again.Should().NotThrowAsync("the first audit already took the folder: it is named once");
        }
        finally
        {
            dir.Dispose();
        }
    }

    // ---- S2.8 (the unit half) ----------------------------------------------------------------------------------------

    [Fact]
    public void Canonical_follows_every_link_of_every_component_and_a_path_that_does_not_exist_yet_through_its_nearest_folder()
    {
        var holder = _owned.Dir("canonical");
        var real = Path.Combine(holder, "real");
        Directory.CreateDirectory(Path.Combine(real, "sub"));
        var first = Path.Combine(holder, "first");
        var second = Path.Combine(holder, "second");
        DirectoryLinks.CreateOrSkip(first, real);
        DirectoryLinks.CreateOrSkip(second, first);
        var wanted = OwnedCreds.Canonical(Path.Combine(real, "sub"));

        OwnedCreds.Canonical(Path.Combine(first, "sub")).Should().Be(wanted, "a link in the middle of a path is followed");
        OwnedCreds.Canonical(Path.Combine(second, "sub")).Should().Be(wanted, "a chain of links is followed to its end");
        OwnedCreds.Canonical(second).Should().Be(OwnedCreds.Canonical(real), "a link as the last component is followed too");
        OwnedCreds.Canonical(Path.Combine(second, "sub") + Path.DirectorySeparatorChar).Should().Be(wanted, "a trailing separator is not part of the path");
        OwnedCreds.Canonical(Path.Combine(second, "not-there", "yet")).Should().Be(Path.Combine(OwnedCreds.Canonical(real), "not-there", "yet"));
        OwnedCreds.RootsDiffer(Path.Combine(second, "sub"), Path.Combine(real, "sub")).Should().BeFalse("two spellings of one folder are one root");
        OwnedCreds.RootsDiffer(real, holder).Should().BeTrue();
    }

    [Fact]
    public void On_macOS_tmp_and_private_tmp_are_one_root_and_the_per_user_temp_root_and_tmp_are_two()
    {
        Assert.SkipUnless(OperatingSystem.IsMacOS(), "the short root is a link to /private and the per-user temp root lies under another link, on macOS only");
        var temp = OwnedCreds.Canonical(Owned.TempRoot());
        TestContext.Current.AddWarning($"socket roots: the short root -> {OwnedCreds.Canonical(OwnedCreds.ShortSocketRoot)}, temp root {Owned.TempRoot()} -> {temp}");

        // testsToDelete-exempt: raw-temp — the test is about exactly these two spellings of the short root on macOS
        OwnedCreds.RootsDiffer("/tmp", "/private/tmp").Should().BeFalse("one sweep");
        // testsToDelete-exempt: raw-temp — the other spelling of the short root, against macOS's per-user temp root
        OwnedCreds.RootsDiffer(Owned.TempRoot(), "/tmp").Should().BeTrue("two sweeps");
    }

    [Fact]
    public void On_Windows_the_short_socket_root_is_the_temp_root()
    {
        Assert.SkipUnless(OperatingSystem.IsWindows(), "Windows has no short-path limit of its own to dodge: its sockets live in the temp root");

        OwnedCreds.RootsDiffer(OwnedCreds.ShortSocketRoot, Owned.TempRoot()).Should().BeFalse();
    }

    [Fact]
    public void On_Linux_and_macOS_the_short_socket_root_is_tmp()
    {
        Assert.SkipWhen(OperatingSystem.IsWindows(), "the short root is a fixed path on Linux and macOS only");

        // testsToDelete-exempt: raw-temp — the constant under test: the short root's one spelling
        OwnedCreds.ShortSocketRoot.Should().Be("/tmp");
    }
}
