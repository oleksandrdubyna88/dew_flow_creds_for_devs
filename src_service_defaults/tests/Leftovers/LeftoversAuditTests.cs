using System.Diagnostics;
using FluentAssertions;
using Xunit;

namespace CredsForDevs.Tests.Leftovers;

/// <summary>The end-of-run audit (S4 scenarios 7 and 7a): it names only what THIS run claimed, it sees an undisposed folder under
/// any parent and a disposal that gave up, and its message carries each group under its own words. Every scenario that lists a
/// temp root passes a PRIVATE one; the kernel-owner seam stands in for the OS so the answers are the same on an elevated runner.</summary>
public sealed class LeftoversAuditTests : IDisposable
{
    private static readonly Func<string, bool> Mine = _ => true;

    /// <summary>No <c>TESTSTODELETE_RUN</c>: this process writes its own record, whatever the environment of the run that started it.</summary>
    private static readonly Func<string, string?> NoEnv = _ => null;

    private readonly OwnedScope _owned = DarwinLayout.FreshOwnedScope();

    public void Dispose() => _owned.Dispose();

    private static string Other => OwnerFixtures.Other;

    // ---- 7 ---------------------------------------------------------------------------------------------------------------

    [Fact]
    public void The_audit_names_only_what_this_run_claimed()
    {
        var tmp = _owned.Dir("audit-tmp");
        var me = Owner.This;
        var dead = UnmatchablePid.Next();
        var foreignHost = me with { Host = "other@" + (OperatingSystem.IsWindows() ? "windows" : "linux") };
        var ours = Plant(tmp, Owned.NameFor("ours"), me);
        Plant(tmp, Owned.NameFor("dead"), me with { Pid = dead });
        Plant(tmp, Owned.NameFor("otherowner"), me with { Token = Other });
        Plant(tmp, Owned.NameFor("otherhost"), foreignHost);
        Plant(tmp, Owned.NameFor("unclaimed"), claim: null);
        Plant(tmp, Owned.Prefix + OwnerToken.This + "-zzz-notmine-abc123", me);
        var orphan = Path.Combine(tmp, Owned.NameFor("orphan") + ".owner");
        File.WriteAllText(orphan, me.Format() + "\n");
        File.WriteAllText(Path.Combine(tmp, Owned.NameFor("orphan-dead") + ".owner"), (me with { Pid = dead }).Format() + "\n");

        var claimed = LeftoversAudit.ClaimedBy(tmp, me, Mine, NoEnv);

        claimed.Should().BeEquivalentTo([ours, orphan]);
    }

    [Fact]
    public void A_claim_whose_folder_sits_in_a_sibling_quarantine_is_not_an_orphan()
    {
        var tmp = _owned.Dir("audit-quarantined-tmp");
        var me = Owner.This;
        var name = Owned.NameFor("quarantined");
        File.WriteAllText(Path.Combine(tmp, name) + ".owner", me.Format() + "\n");
        Directory.CreateDirectory(Path.Combine(tmp, "." + name + "." + "teststo" + "delete-quarantine-" + Environment.ProcessId + "-deadbeef"));

        LeftoversAudit.ClaimedBy(tmp, me, Mine, NoEnv).Should().BeEmpty("deleting the claim would leave the quarantined folder with nobody's mark");
    }

    [Fact]
    public void The_sibling_quarantines_are_listed_once_per_audit_however_many_claims_are_orphans()
    {
        var tmp = _owned.Dir("audit-once-tmp");
        var me = Owner.This;
        const int orphans = 5;
        for (var i = 0; i < orphans; i++) File.WriteAllText(Path.Combine(tmp, Owned.NameFor("orphan" + i) + ".owner"), me.Format() + "\n");
        var listings = 0;

        var claimed = LeftoversAudit.Discover(tmp, me, Mine, NoEnv, dir =>
        {
            listings++;
            return LeftoversSweep.QuarantinedNames(dir);
        });

        claimed.Should().HaveCount(orphans);
        listings.Should().Be(1, "one directory listing per audit, not one per claim");
    }

    [Fact]
    public void A_symlinked_folder_is_not_followed()
    {
        var tmp = _owned.Dir("audit-link-tmp");
        var elsewhere = _owned.Dir("audit-link-target");
        var me = Owner.This;
        var name = Owned.NameFor("linked");
        File.WriteAllText(Path.Combine(tmp, name) + ".owner", me.Format() + "\n");
        DirectoryLinks.CreateOrSkip(Path.Combine(tmp, name), elsewhere); // a junction on Windows where symlinks need a privilege

        LeftoversAudit.ClaimedBy(tmp, me, Mine, NoEnv).Should().BeEmpty("a link is not a folder this run made");
    }


    // ---- A: a sibling child of the same run -----------------------------------------------------------------------------

    [Fact]
    public void A_sibling_childs_folder_survives_the_audit_of_a_run_whose_record_it_shares()
    {
        // Rule §3: every child of a run writes the run's record, so the folders of a sibling that is still working carry a
        // record this process is not. The first child to finish must not take them.
        var tmp = _owned.Dir("audit-sibling-tmp");
        using var sibling = LiveProcess.Start();
        var run = sibling.Record();
        string? Env(string name) => name == "TESTSTODELETE_RUN" ? run.Format() : null;
        var folder = Plant(tmp, Owned.NameFor("sibling"), run);
        File.WriteAllText(Path.Combine(folder, "data.txt"), "sibling's data");

        var audit = () => LeftoversSweepFixture.RealAudit(tmp, [], Mine, Env);

        audit.Should().NotThrow("nothing this process made is left");
        File.ReadAllText(Path.Combine(folder, "data.txt")).Should().Be("sibling's data");
        File.Exists(folder + ".owner").Should().BeTrue("the sibling's claim is not this process's to remove");
    }

    // ---- B: the removal is by identity ----------------------------------------------------------------------------------

    [Fact]
    public void A_folder_replaced_between_discovery_and_removal_survives_the_audit()
    {
        var tmp = _owned.Dir("audit-replaced-tmp");
        var me = Owner.This;
        var folder = Plant(tmp, Owned.NameFor("replaced"), me);
        var hooks = new SweepHooks(AfterVerdict: judged =>
        {
            // Aside first, then the new one, then the old one is deleted: an inode freed first is reused by the next mkdir.
            var aside = judged + "-aside";
            Directory.Move(judged, aside);
            Directory.CreateDirectory(judged);
            File.WriteAllText(Path.Combine(judged, "new.txt"), "a different folder");
            Directory.Delete(aside, recursive: true);
        });

        var run = () => LeftoversAudit.Run(tmp, me, [], Mine, NoEnv, hooks);

        run.Should().Throw<InvalidOperationException>("the folder was this run's when it was found");
        File.ReadAllText(Path.Combine(folder, "new.txt")).Should().Be("a different folder", "what stands there now was never judged");
        Directory.GetFileSystemEntries(tmp).Select(Path.GetFileName).Should().OnlyContain(n => !n!.Contains("quarantine", StringComparison.Ordinal), "nothing was renamed away");
    }

    [Fact]
    public void A_claim_rewritten_between_discovery_and_removal_keeps_its_folder()
    {
        var tmp = _owned.Dir("audit-reclaimed-tmp");
        var me = Owner.This;
        var folder = Plant(tmp, Owned.NameFor("reclaimed"), me);
        using var other = LiveProcess.Start();
        var hooks = new SweepHooks(AfterVerdict: judged => File.WriteAllText(judged + ".owner", other.Record().Format() + "\n"));

        var run = () => LeftoversAudit.Run(tmp, me, [], Mine, NoEnv, hooks);

        run.Should().Throw<InvalidOperationException>();
        Directory.Exists(folder).Should().BeTrue("the claim now names another run's process");
        File.ReadAllText(folder + ".owner").Should().Be(other.Record().Format() + "\n");
    }

    [Fact]
    public void A_process_that_writes_the_runs_record_scans_nothing_because_the_registry_covers_its_folders()
    {
        var tmp = _owned.Dir("audit-run-record-tmp");
        using var sibling = LiveProcess.Start();
        string? Env(string name) => name == "TESTSTODELETE_RUN" ? sibling.Record().Format() : null;
        Plant(tmp, Owned.NameFor("mine"), Owner.This);

        LeftoversAudit.ClaimedBy(tmp, Owner.This, Mine, Env).Should().BeEmpty();
        LeftoversAudit.ClaimedBy(tmp, Owner.This, Mine, NoEnv).Should().ContainSingle();
    }

    // ---- 7a --------------------------------------------------------------------------------------------------------------

    [Fact]
    public void An_undisposed_folder_under_any_parent_is_seen_by_the_registry_and_not_by_the_temp_root_scan()
    {
        var parent = _owned.Dir("audit-parent");
        var dir = OwnedDir.Create("custom", parent);
        try
        {
            LeftoversAudit.Unreclaimed().Should().Contain((dir.Path, false));
            LeftoversAudit.ClaimedBy(Owned.TempRoot(), Owner.This, env: NoEnv).Should().NotContain(dir.Path, "it is not at the depth-1 of the temp root");
        }
        finally
        {
            dir.Dispose();
        }

        LeftoversAudit.Unreclaimed().Select(u => u.Path).Should().NotContain(dir.Path);
    }

    [Fact]
    public void A_disposal_that_gave_up_stays_registered_until_a_later_disposal_removes_it()
    {
        var parent = _owned.Dir("audit-stuck-parent");
        var dir = OwnedDir.Create("stuck", parent);
        var release = Unremovable.Make(parent, dir.Path);
        try
        {
            dir.Dispose();

            LeftoversAudit.Unreclaimed().Should().Contain((dir.Path, true));
        }
        finally
        {
            release.Dispose();
        }

        dir.Dispose();
        LeftoversAudit.Unreclaimed().Select(u => u.Path).Should().NotContain(dir.Path);
        Directory.Exists(dir.Path).Should().BeFalse();
    }

    // ---- the message -----------------------------------------------------------------------------------------------------

    [Fact]
    public void The_failure_is_typed_and_its_message_has_a_first_line_one_folder_per_line_and_a_remedy()
    {
        var error = LeftoversAudit.Verdict([("/t/a", false), ("/t/b", true), ("/t/c", false)], ["/t/d", "/t/a"]);

        error.Should().BeOfType<LeftoversAuditException>().Which.Should().BeAssignableTo<InvalidOperationException>();
        error!.NeverDisposed.Should().Equal("/t/a", "/t/c");
        error.DisposedNotRemoved.Should().Equal("/t/b");
        error.ClaimedInTempRoot.Should().Equal("/t/d");
        var lines = error.Message.Split('\n');
        lines[0].Should().Be("creds tests: this run left 4 folder(s) it claimed — 2 never disposed, 1 disposed but not removed, 1 claimed in the temp root");
        lines[1..5].Should().Equal("  never disposed: /t/a", "  never disposed: /t/c", "  disposed but not removed: /t/b", "  claimed in the temp root: /t/d");
        lines.Should().HaveCount(6);
        lines[5].Should().StartWith("remedy: dispose the OwnedDir or OwnedScope").And.Contain("bash .agents/conventions/tools/janitor.sh --token creds --dry-run");
    }

    [Fact]
    public void An_empty_group_is_omitted_and_a_clean_run_has_no_failure()
    {
        LeftoversAudit.Verdict([("/t/b", true)], [])!.Message.Split('\n')[0].Should().Be("creds tests: this run left 1 folder(s) it claimed — 1 disposed but not removed");
        LeftoversAudit.Verdict([], ["/t/d"])!.Message.Split('\n')[0].Should().Be("creds tests: this run left 1 folder(s) it claimed — 1 claimed in the temp root");
        LeftoversAudit.Verdict([], []).Should().BeNull();
    }

    [Fact]
    public void A_run_that_left_a_folder_throws_one_exception_and_leaves_the_temp_root_clean()
    {
        var tmp = _owned.Dir("audit-run-tmp");
        var me = Owner.This;
        var undisposed = OwnedDir.Create("leaked", tmp);
        var orphan = Path.Combine(tmp, Owned.NameFor("orphan") + ".owner");
        File.WriteAllText(orphan, me.Format() + "\n");
        var claimedFolder = Plant(tmp, Owned.NameFor("claimed"), me);

        var run = () => LeftoversAudit.Run(tmp, me, [undisposed], Mine, NoEnv);

        var error = run.Should().Throw<LeftoversAuditException>().Which;
        error.Message.Should().StartWith("creds tests: this run left 3 folder(s) it claimed — ");
        error.NeverDisposed.Should().Equal(undisposed.Path);
        error.ClaimedInTempRoot.Should().BeEquivalentTo([claimedFolder, orphan]);
        error.DisposedNotRemoved.Should().BeEmpty();
        Directory.GetFileSystemEntries(tmp).Should().BeEmpty("the audit removes what it names");
        LeftoversAudit.Unreclaimed().Select(u => u.Path).Should().NotContain(undisposed.Path);
    }

    [Fact]
    public void A_clean_run_does_not_throw()
    {
        var tmp = _owned.Dir("audit-clean-tmp");

        var run = () => LeftoversAudit.Run(tmp, Owner.This, [], Mine, NoEnv);

        run.Should().NotThrow();
    }

    [Fact]
    public async Task The_assembly_fixture_fails_the_run_with_the_audits_message()
    {
        var fails = new LeftoversSweepFixture(() => SweepResult.Empty, _ => { }, () => throw new InvalidOperationException("creds tests: this run left 1 folder(s) it claimed — never disposed: x"));
        var passes = new LeftoversSweepFixture(() => SweepResult.Empty, _ => { }, () => { });

        var dispose = async () => await fails.DisposeAsync();

        await dispose.Should().ThrowAsync<InvalidOperationException>().WithMessage("creds tests: this run left*");
        await passes.DisposeAsync();
    }

    private static string Plant(string tmp, string name, Owner? claim)
    {
        var dir = Path.Combine(tmp, name);
        Directory.CreateDirectory(dir);
        if (claim is not null) File.WriteAllText(dir + ".owner", claim.Format() + "\n");
        return dir;
    }

    /// <summary>A live process of this user that is not this one (a sibling child of the run): <c>sleep</c>, or <c>ping</c> on Windows.</summary>
    private sealed class LiveProcess : IDisposable
    {
        private readonly Process _process;

        private LiveProcess(Process process) => _process = process;

        public static LiveProcess Start()
        {
            var start = OperatingSystem.IsWindows()
                ? new ProcessStartInfo("ping") { ArgumentList = { "-n", "120", "127.0.0.1" } }
                : new ProcessStartInfo("sleep") { ArgumentList = { "120" } };
            start.UseShellExecute = false;
            start.RedirectStandardOutput = true;
            start.CreateNoWindow = true;
            return new LiveProcess(Process.Start(start) ?? throw new InvalidOperationException("the process did not start"));
        }

        /// <summary>The owner record of that process, as a run hands it down.</summary>
        public Owner Record() => Owner.This with { Pid = _process.Id, Start = OperatingSystem.IsLinux() ? Liveness.ReadLinuxStart(_process.Id) : null };

        public void Dispose()
        {
            _process.Kill(entireProcessTree: true);
            _process.WaitForExit();
            _process.Dispose();
        }
    }
}
