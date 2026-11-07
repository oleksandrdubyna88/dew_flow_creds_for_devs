using System.Runtime.Versioning;
using FluentAssertions;
using Xunit;

namespace CredsForDevs.Tests.Leftovers;

/// <summary>The start-of-run sweep (rule §4): a killed run's folders are collected by the same user's next run, on TWO
/// keys only — scope (the name's owner, the record's owner and the caller are one, and the kernel owner is the caller)
/// and abandonment (the record's liveness is <c>Gone</c>) — and removed BY IDENTITY. What is not its to remove, it
/// names. Every scenario passes a PRIVATE <c>Tmp</c> (an <see cref="OwnedDir"/> of its own), never the real temp root;
/// dead owners are <see cref="UnmatchablePid"/> with the premise asserted; "old" is a last-write time 11 minutes back.
/// The <c>Mine</c> seam stands in for a second uid, which a test cannot have — except in the one scenario that proves
/// COLLECTION through the real <see cref="Scope.IsMine"/>.</summary>
public sealed class LeftoversSweepTests(LeftoversSweepFixture fixture) : IDisposable
{
    // Spelled in two pieces: the machine scan reads this file for the bare prefix too (owner decision 3).
    private const string QuarantineWord = "teststo" + "delete-quarantine-";

    private static readonly TimeSpan Old = TimeSpan.FromMinutes(11);

    /// <summary>On macOS every test here stands on the identity read, so the layout self-test must hold first (it fails them all, loudly, when it does not).</summary>
    private readonly OwnedScope _owned = DarwinLayout.FreshOwnedScope();

    public void Dispose() => _owned.Dispose();

    private static string Other => OwnerFixtures.Other;

    private static string OsTag => OperatingSystem.IsWindows() ? "windows" : OperatingSystem.IsMacOS() ? "macos" : "linux";

    private static string OtherTag => OperatingSystem.IsWindows() ? "linux" : "windows";

    // ---- 1 -------------------------------------------------------------------------------------------------------

    [Fact]
    public void A_killed_runs_folder_is_collected_and_a_link_inside_it_never_costs_its_target()
    {
        var tmp = NewTmp();
        var sentinel = _owned.Dir("sentinel");
        File.WriteAllText(Path.Combine(sentinel, "keep.txt"), "must survive");
        var dead = Dead();
        var dir = PlantFolder(tmp, Name("killed"), Rec(dead), withLink: sentinel);

        var result = LeftoversSweep.Run(Options(tmp));

        result.Removed.Should().Equal(dir);
        Directory.Exists(dir).Should().BeFalse();
        File.Exists(dir + ".owner").Should().BeFalse("the claim goes with the folder");
        Quarantines(tmp).Should().BeEmpty();
        File.ReadAllText(Path.Combine(sentinel, "keep.txt")).Should().Be("must survive");
        result.Errors.Should().BeEmpty();
        UnmatchablePid.AssertNoSuchProcess(dead);
    }

    // ---- 2 -------------------------------------------------------------------------------------------------------

    [Fact]
    public void A_live_foreign_unknown_or_unmarked_folder_is_never_reclaimed_however_old()
    {
        var tmp = NewTmp();
        var dead = Dead();
        var me = Owner.This;
        var folders = new Dictionary<string, (string Path, string Reason)>();

        void Plant(string key, string? claim, string reason, bool old = true, Action<string>? alter = null)
        {
            var dir = PlantFolder(tmp, Name(key), claim, old);
            alter?.Invoke(dir);
            if (old) AgeFolder(dir); // the change made its last-write time new again
            folders[key] = (dir, reason);
        }

        Plant("live", Rec(me with { Pid = Environment.ProcessId }), "live");
        Plant("otherowner", Rec(me with { Token = Other }), "unknown");
        Plant("otherhost", Rec(me with { Host = "other@" + OsTag, Pid = dead }), "foreign host");
        Plant("othertag", Rec(me with { Host = me.Host[..me.Host.LastIndexOf('@')] + "@" + OtherTag, Pid = dead }), "foreign host");
        Plant("handsoff", "hands off", "unreadable");
        Plant("toolong", new string('x', 513), "unreadable");
        Plant("oldgrammar", "devbox@" + OsTag + ":" + dead, "unreadable");
        Plant("young", Rec(dead), "young", old: false);
        Plant("clone", null, "other clone", alter: dir => File.WriteAllText(Path.Combine(dir, ".git"), "gitdir: /elsewhere\n"));
        Plant("unmarked", null, "unmarked");
        if (me.Host.EndsWith("@linux", StringComparison.Ordinal))
        {
            Plant("nons", Rec(me with { Pid = dead, Ns = null }), "unknown");
            Plant("otherns", Rec(me with { Pid = dead, Ns = me.Ns + 1 }), "unknown");
        }

        if (me.Start is not null) Plant("start3", Rec(me with { Pid = Environment.ProcessId, Start = me.Start + 3 }), "unknown");
        var mineNo = PlantFolder(tmp, Name("mineno"), Rec(dead));
        var claimNo = PlantFolder(tmp, Name("claimno"), Rec(dead));
        var foreignName = PlantFolder(tmp, Foreign("foreignname"), Rec(dead));
        var deadAnyStart = PlantFolder(tmp, Name("deadstart"), Rec(me with { Pid = dead, Start = (me.Start ?? 1_700_000_000) + 3 }));
        var collected = PlantFolder(tmp, Name("collected"), Rec(dead));

        var result = LeftoversSweep.Run(Options(tmp, mine: path => path != mineNo && path != claimNo + ".owner"));

        using var scope = new FluentAssertions.Execution.AssertionScope();
        foreach (var (key, (dir, reason)) in folders)
        {
            ReasonOf(result, dir).Should().Be(reason, key);
            Directory.Exists(dir).Should().BeTrue($"{key} is kept, whatever its age");
            result.Removed.Should().NotContain(dir, key);
        }

        ReasonOf(result, mineNo).Should().Be("foreign-uid");
        ReasonOf(result, claimNo).Should().Be("foreign-uid", "the Mine seam reaches the claim read too");
        result.Listed.Should().Contain(line => line.StartsWith("foreign: folder " + Path.GetFileName(mineNo), StringComparison.Ordinal));
        result.Listed.Should().Contain(line => line.StartsWith("foreign: folder " + Path.GetFileName(claimNo), StringComparison.Ordinal));
        Directory.Exists(mineNo).Should().BeTrue();
        Directory.Exists(claimNo).Should().BeTrue();
        File.Exists(claimNo + ".owner").Should().BeTrue();
        ReasonOf(result, foreignName).Should().BeNull("another owner's folder is listed, not preserved");
        result.Listed.Should().ContainSingle(line => line.StartsWith("foreign: folder " + Path.GetFileName(foreignName) + " — owner " + Other, StringComparison.Ordinal));
        Directory.Exists(foreignName).Should().BeTrue();
        result.Listed.Should().ContainSingle(line => line == "unmarked: folder " + Path.GetFileName(folders["unmarked"].Path), "an unmarked folder is listed, never collected");
        result.Removed.Should().BeEquivalentTo([deadAnyStart, collected], "a dead pid is answered before the starts are compared");
        Directory.Exists(deadAnyStart).Should().BeFalse();
        Directory.Exists(collected).Should().BeFalse();
        result.Errors.Should().BeEmpty();
        UnmatchablePid.AssertNoSuchProcess(dead);
    }

    [Fact]
    public void A_link_under_an_own_name_is_never_a_candidate_and_never_followed()
    {
        var tmp = NewTmp();
        var target = PlantFolder(_owned.Dir("targets"), Name("target"), null, old: true);
        File.WriteAllText(Path.Combine(target, "keep.txt"), "must survive");
        AgeFolder(target);
        var dead = Dead();
        var link = Path.Combine(tmp, Name("linked"));
        DirectoryLinks.CreateOrSkip(link, target);
        File.WriteAllText(link + ".owner", Rec(dead));
        File.SetLastWriteTimeUtc(link + ".owner", DateTime.UtcNow - Old);
        var plain = PlantFolder(tmp, Name("plain"), Rec(dead));

        var result = LeftoversSweep.Run(Options(tmp));

        result.Removed.Should().Equal(plain);
        result.Removed.Should().NotContain(link);
        result.Preserved.Should().NotContain(p => p.Path == link, "a link is no candidate, so it is not even preserved");
        Directory.Exists(link).Should().BeTrue("the link is still there");
        File.ReadAllText(Path.Combine(target, "keep.txt")).Should().Be("must survive");
        File.Exists(link + ".owner").Should().BeTrue("its claim is untouched");
        result.Errors.Should().BeEmpty();
        UnmatchablePid.AssertNoSuchProcess(dead);
    }

    // ---- 3 -------------------------------------------------------------------------------------------------------

    [Fact]
    public void Only_this_owners_names_of_this_token_are_swept_anchored_in_both_spellings_and_any_case()
    {
        var tmp = NewTmp();
        var dead = Dead();
        string[] outOfScope =
        [
            "x-" + Owned.NameBase + "a-abc123",
            Owned.Prefix[..^1] + OwnedToken.RepoToken + "-a-abc123", // the word glued to the token with no separator: not a name of this sweep
            Owned.Prefix + OwnerToken.This + "-conventions-a-abc123",
            Owned.Prefix + OwnerToken.This + "-mcpx-a-abc123",
            "mcp-workspace-abc123",
        ];
        var survivors = new List<string>();
        foreach (var name in outOfScope)
        {
            survivors.Add(PlantFolder(tmp, name, Rec(dead)));
            survivors.Add(PlantFolder(tmp, name + "-unmarked", null));
        }

        var legacyName = Owned.Prefix + OwnedToken.RepoToken + "-a-abc123";
        var legacy = PlantFolder(tmp, legacyName, Rec(dead));
        var upper = PlantFolder(tmp, Owned.NameBase.ToUpperInvariant() + "A-XYZ123", Rec(dead));
        var underscore = PlantFolder(tmp, Owned.NameBase.ToLowerInvariant().Replace('-', '_') + "a_xyz123", Rec(dead));

        var result = LeftoversSweep.Run(Options(tmp));

        result.Removed.Should().BeEquivalentTo([upper, underscore], "case-insensitive, both separators");
        survivors.Concat([legacy]).Should().OnlyContain(path => Directory.Exists(path), "everything else survives untouched");
        result.Preserved.Should().Equal([(legacy, "legacy")], "an out-of-scope name appears in no list");
        var line = result.Listed.Should().ContainSingle().Subject;
        line.Should().StartWith("legacy: folder " + legacyName + " — remove with: ");
        line.Should().Contain(legacy).And.Contain(legacy + ".owner", "the exact command names the folder and its claim");
        result.Errors.Should().BeEmpty();
        UnmatchablePid.AssertNoSuchProcess(dead);
    }

    // ---- 4 -------------------------------------------------------------------------------------------------------

    [Fact]
    public void An_orphan_claim_is_judged_by_its_owner_never_by_age_alone()
    {
        var tmp = NewTmp();
        var dead = Dead();
        var me = Owner.This;
        var live = Orphan(tmp, Name("live"), Rec(me with { Pid = Environment.ProcessId }));
        var gone = Orphan(tmp, Name("gone"), Rec(dead));
        var foreignHost = Orphan(tmp, Name("host"), Rec(me with { Host = "other@" + OsTag, Pid = dead }));
        var unreadable = Orphan(tmp, Name("unreadable"), "hands off");
        var young = Orphan(tmp, Name("young"), Rec(dead), old: false);
        var foreignName = Orphan(tmp, Foreign("name"), Rec(dead));

        var result = LeftoversSweep.Run(Options(tmp));

        result.Removed.Should().Equal(gone);
        File.Exists(gone).Should().BeFalse();
        new[] { live, foreignHost, unreadable, young, foreignName }.Should().OnlyContain(path => File.Exists(path), "age only selects; the owner decides");
        ReasonOf(result, live).Should().Be("live");
        ReasonOf(result, foreignHost).Should().Be("foreign host");
        ReasonOf(result, unreadable).Should().Be("unreadable");
        ReasonOf(result, young).Should().BeNull("a young orphan is a creation in progress: kept, unlisted");
        result.Listed.Should().ContainSingle().Which.Should().StartWith("foreign: claim " + Path.GetFileName(foreignName) + " — owner " + Other);
        result.Errors.Should().BeEmpty();
        UnmatchablePid.AssertNoSuchProcess(dead);
    }

    [Fact]
    public void Only_a_regular_file_is_an_orphan_claim_never_a_link_or_a_folder()
    {
        var tmp = NewTmp();
        var dead = Dead();
        var real = Path.Combine(_owned.Dir("targets"), "real.txt");
        File.WriteAllText(real, Rec(dead));
        var link = Path.Combine(tmp, Name("linkclaim") + ".owner");
        try
        {
            File.CreateSymbolicLink(link, real);
        }
        catch (Exception ex) when (ex is UnauthorizedAccessException or IOException)
        {
            Assert.Skip($"cannot create symbolic links here ({ex.Message})");
        }

        var folderNamedLikeAClaim = Path.Combine(tmp, Name("dirclaim") + ".owner");
        Directory.CreateDirectory(folderNamedLikeAClaim);
        File.SetLastWriteTimeUtc(link, DateTime.UtcNow - Old);
        File.SetLastWriteTimeUtc(real, DateTime.UtcNow - Old);
        Directory.SetLastWriteTimeUtc(folderNamedLikeAClaim, DateTime.UtcNow - Old);

        var result = LeftoversSweep.Run(Options(tmp));

        result.Removed.Should().BeEmpty();
        // The folder is an own-named folder like any other (old, no claim: unmarked) — it is judged as a FOLDER; the
        // link is judged by neither pass.
        result.Preserved.Should().Equal([(folderNamedLikeAClaim, "unmarked")]);
        result.Listed.Should().ContainSingle().Which.Should().StartWith("unmarked: folder ");
        result.Errors.Should().BeEmpty();
        File.Exists(real).Should().BeTrue("a link is never followed to its target");
        new FileInfo(link).LinkTarget.Should().NotBeNull("the link itself is still there");
        Directory.Exists(folderNamedLikeAClaim).Should().BeTrue();
        UnmatchablePid.AssertNoSuchProcess(dead);
    }

    // ---- 5 -------------------------------------------------------------------------------------------------------

    [Fact]
    public void A_folder_replaced_after_the_verdict_is_not_removed_because_removal_is_by_identity()
    {
        var tmp = NewTmp();
        var dead = Dead();
        var dir = PlantFolder(tmp, Name("swapped"), Rec(dead));
        var renamed = false;
        var hooks = new SweepHooks(
            AfterRename: (_, _) => renamed = true,
            AfterVerdict: judged =>
            {
                // Move the judged folder aside, put a new one under the old name, and only then delete the moved one: an
                // inode freed first is reused by the next mkdir on ext4, which would make the two identities equal.
                var aside = judged + "-aside";
                Directory.Move(judged, aside);
                Directory.CreateDirectory(judged);
                File.WriteAllText(Path.Combine(judged, "new.txt"), "a different folder");
                Directory.Delete(aside, recursive: true);
            });

        var result = LeftoversSweep.Run(Options(tmp, hooks: hooks));

        result.Removed.Should().BeEmpty();
        renamed.Should().BeFalse("the identity is re-checked BEFORE the rename: the new folder was never touched");
        ReasonOf(result, dir).Should().Be("replaced");
        File.ReadAllText(Path.Combine(dir, "new.txt")).Should().Be("a different folder", "the new folder is untouched");
        File.Exists(dir + ".owner").Should().BeTrue();
        Quarantines(tmp).Should().BeEmpty();
        UnmatchablePid.AssertNoSuchProcess(dead);
    }

    [Fact]
    public void A_claim_rewritten_after_the_rename_puts_the_folder_back_and_removes_nothing()
    {
        var tmp = NewTmp();
        var dead = Dead();
        var dir = PlantFolder(tmp, Name("rewritten"), Rec(dead));
        var hooks = new SweepHooks(AfterRename: (original, _) => File.WriteAllText(original + ".owner", Rec(Environment.ProcessId)));

        var result = LeftoversSweep.Run(Options(tmp, hooks: hooks));

        result.Removed.Should().BeEmpty();
        ReasonOf(result, dir).Should().Be("replaced");
        File.Exists(Path.Combine(dir, "file.txt")).Should().BeTrue("restored under its name, with what it held");
        Quarantines(tmp).Should().BeEmpty();
        UnmatchablePid.AssertNoSuchProcess(dead);
    }

    [Fact]
    public void A_claim_replaced_between_the_capture_and_the_removal_keeps_the_folder_because_the_capture_comes_first()
    {
        var tmp = NewTmp();
        var dead = Dead();
        var dir = PlantFolder(tmp, Name("captured"), Rec(Environment.ProcessId));
        var hooks = new SweepHooks(AfterCapture: judged => File.WriteAllText(judged + ".owner", Rec(dead)));

        var result = LeftoversSweep.Run(Options(tmp, hooks: hooks));

        result.Removed.Should().BeEmpty("the verdict read a claim that was not the one captured");
        ReasonOf(result, dir).Should().Be("replaced");
        Directory.Exists(dir).Should().BeTrue();
        Quarantines(tmp).Should().BeEmpty();
        UnmatchablePid.AssertNoSuchProcess(dead);
    }

    [Fact]
    public void A_quarantine_a_killed_sweep_left_is_restored_when_its_name_is_free()
    {
        var tmp = NewTmp();
        var dead = Dead();
        var name = Name("restored");
        var quarantine = Quarantine(tmp, name, dead, "deadbeef");
        File.WriteAllText(Path.Combine(quarantine, "file.txt"), "x");
        File.WriteAllText(Path.Combine(tmp, name + ".owner"), Rec(Environment.ProcessId));

        var result = LeftoversSweep.Run(Options(tmp, now: DateTimeOffset.UtcNow + Old));

        // The window is passed through Now: a quarantine's change time cannot be set from .NET.
        Directory.Exists(quarantine).Should().BeFalse();
        File.ReadAllText(Path.Combine(tmp, name, "file.txt")).Should().Be("x");
        result.Listed.Should().ContainSingle().Which.Should().Be($"notice: restored {name} from a quarantine a killed sweep left");
        result.Errors.Should().BeEmpty();
        UnmatchablePid.AssertNoSuchProcess(dead);
    }

    [Fact]
    public void A_quarantine_whose_name_is_taken_is_listed_with_its_command_and_retried_by_every_run()
    {
        var tmp = NewTmp();
        var dead = Dead();
        var name = Name("taken");
        var quarantine = Quarantine(tmp, name, dead, "deadbeef");
        File.WriteAllText(Path.Combine(quarantine, "file.txt"), "from the quarantine");
        var taken = Path.Combine(tmp, name);
        Directory.CreateDirectory(taken);
        File.WriteAllText(Path.Combine(taken, "other.txt"), "holds the name");
        File.WriteAllText(taken + ".owner", Rec(Environment.ProcessId));
        var options = Options(tmp, now: DateTimeOffset.UtcNow + Old);

        var first = LeftoversSweep.Run(options);

        ReasonOf(first, quarantine).Should().Be("quarantine-conflict");
        var line = first.Listed.Should().ContainSingle(l => l.StartsWith("quarantine-conflict:", StringComparison.Ordinal)).Subject;
        line.Should().Contain(Path.GetFileName(quarantine)).And.Contain(name).And.Contain(quarantine, "the command removes the quarantine folder alone");
        File.ReadAllText(Path.Combine(quarantine, "file.txt")).Should().Be("from the quarantine");
        File.ReadAllText(Path.Combine(taken, "other.txt")).Should().Be("holds the name");

        Directory.Delete(taken, recursive: true);
        var second = LeftoversSweep.Run(options);

        Directory.Exists(quarantine).Should().BeFalse("the retry restored it");
        File.ReadAllText(Path.Combine(taken, "file.txt")).Should().Be("from the quarantine");
        second.Listed.Should().Contain($"notice: restored {name} from a quarantine a killed sweep left");
        UnmatchablePid.AssertNoSuchProcess(dead);
    }

    [Fact]
    public void A_quarantine_whose_renamer_may_still_be_working_is_untouched_and_unlisted()
    {
        var tmp = NewTmp();
        var dead = Dead();
        var mine = Quarantine(tmp, Name("mine"), Environment.ProcessId, "deadbeef");

        var result = LeftoversSweep.Run(Options(tmp, now: DateTimeOffset.UtcNow + Old));

        Directory.Exists(mine).Should().BeTrue("its renamer is this process");
        result.Listed.Should().BeEmpty();
        result.Preserved.Should().BeEmpty();
        UnmatchablePid.AssertNoSuchProcess(dead);
    }

    [Fact]
    public void A_quarantine_inside_the_window_is_untouched_and_unlisted_even_when_its_renamer_is_gone()
    {
        var tmp = NewTmp();
        var dead = Dead();
        var young = Quarantine(tmp, Name("young"), dead, "cafebabe");

        var result = LeftoversSweep.Run(Options(tmp));

        Directory.Exists(young).Should().BeTrue("a renamer in another pid namespace reads as dead here and may be mid-delete");
        Directory.Exists(Path.Combine(tmp, Name("young"))).Should().BeFalse();
        result.Listed.Should().BeEmpty();
        result.Preserved.Should().BeEmpty();
        UnmatchablePid.AssertNoSuchProcess(dead);
    }

    [Fact]
    public void A_quarantine_that_is_a_link_is_never_restored()
    {
        var tmp = NewTmp();
        var dead = Dead();
        var target = _owned.Dir("targets");
        var link = Path.Combine(tmp, "." + Name("linked") + "." + QuarantineWord + dead + "-deadbeef");
        DirectoryLinks.CreateOrSkip(link, target);

        var result = LeftoversSweep.Run(Options(tmp, now: DateTimeOffset.UtcNow + Old));

        Directory.Exists(Path.Combine(tmp, Name("linked"))).Should().BeFalse();
        Directory.Exists(link).Should().BeTrue();
        result.Listed.Should().BeEmpty();
        UnmatchablePid.AssertNoSuchProcess(dead);
    }

    [Fact]
    public void A_restore_never_removes_a_placeholder_that_has_something_in_it()
    {
        if (OperatingSystem.IsWindows()) Assert.Skip("the exclusive placeholder is the Linux restore — Windows moves back by itself");
        var tmp = NewTmp();
        var dead = Dead();
        var dir = PlantFolder(tmp, Name("reserved"), Rec(dead));
        var hooks = new SweepHooks(
            AfterRename: (original, _) => File.WriteAllText(original + ".owner", Rec(Environment.ProcessId)),
            AfterReserve: (original, _) => File.WriteAllText(Path.Combine(original, "squatter.txt"), "took the placeholder"));

        var result = LeftoversSweep.Run(Options(tmp, hooks: hooks));

        var quarantine = Quarantines(tmp).Should().ContainSingle("the rename onto a folder with something in it failed, so the quarantine stays").Subject;
        ReasonOf(result, quarantine).Should().Be("quarantine-conflict");
        File.ReadAllText(Path.Combine(dir, "squatter.txt")).Should().Be("took the placeholder");
        File.Exists(Path.Combine(quarantine, "file.txt")).Should().BeTrue();
        result.Removed.Should().BeEmpty();
        UnmatchablePid.AssertNoSuchProcess(dead);
    }

    [Fact]
    public void A_claim_rewritten_after_the_removal_is_kept_and_reported_because_it_is_deleted_only_under_its_captured_text()
    {
        var tmp = NewTmp();
        var dead = Dead();
        var dir = PlantFolder(tmp, Name("claimtext"), Rec(dead));
        var claim = dir + ".owner";
        var hooks = new SweepHooks(AfterRemove: (_, _) => File.WriteAllText(claim, "written by another run after the removal\n")); // in place: the same file, other text

        var result = LeftoversSweep.Run(Options(tmp, hooks: hooks));

        File.ReadAllText(claim).Should().Be("written by another run after the removal\n", "that claim is not the one captured");
        ReasonOf(result, claim).Should().Be("replaced");
        Directory.Exists(dir).Should().BeFalse("the folder itself was the captured one");
        Quarantines(tmp).Should().BeEmpty();
        UnmatchablePid.AssertNoSuchProcess(dead);
    }

    [Fact]
    public void A_claim_replaced_by_another_file_with_the_same_text_is_kept_because_the_identity_differs()
    {
        var tmp = NewTmp();
        var dead = Dead();
        var text = Rec(dead);
        var dir = PlantFolder(tmp, Name("claimid"), text);
        var claim = dir + ".owner";
        var hooks = new SweepHooks(AfterRemove: (_, _) =>
        {
            // The old file stays alive under another name while the new one is made, so the two inodes differ.
            var aside = claim + ".aside";
            File.Move(claim, aside);
            File.WriteAllText(claim, text);
            File.Delete(aside);
        });

        var result = LeftoversSweep.Run(Options(tmp, hooks: hooks));

        File.Exists(claim).Should().BeTrue("another identity under the name is not the claim that was judged");
        ReasonOf(result, claim).Should().Be("replaced");
        UnmatchablePid.AssertNoSuchProcess(dead);
    }

    // ---- 6 -------------------------------------------------------------------------------------------------------

    [Fact]
    public void A_temp_root_that_does_not_exist_is_one_error_and_never_a_throw()
    {
        var tmp = NewTmp();

        var result = LeftoversSweep.Run(Options(Path.Combine(tmp, "does-not-exist")));

        result.Errors.Should().ContainSingle();
        result.Removed.Should().BeEmpty();
    }

    [Fact]
    public void A_folder_the_scope_seam_throws_on_is_one_error_and_the_next_folder_is_still_judged()
    {
        var tmp = NewTmp();
        var dead = Dead();
        var bad = PlantFolder(tmp, Name("bad"), Rec(dead));
        var good = PlantFolder(tmp, Name("good"), Rec(dead));

        var result = LeftoversSweep.Run(Options(tmp, mine: path => path == bad ? throw new IOException("the seam threw") : true));

        result.Errors.Should().ContainSingle().Which.Should().Contain(bad).And.Contain("the seam threw");
        result.Removed.Should().Equal(good);
        Directory.Exists(bad).Should().BeTrue();
        UnmatchablePid.AssertNoSuchProcess(dead);
    }

    [Fact]
    public void A_sweep_that_throws_in_the_fixture_is_one_reported_line_and_the_constructor_still_completes()
    {
        var lines = new List<string>();

        var built = new LeftoversSweepFixture(() => throw new InvalidOperationException("the sweep broke"), lines.Add);

        lines.Should().ContainSingle().Which.Should().Contain("the sweep broke");
        built.LastRun.Count.Should().Be(0);
    }

    // ---- 7 -------------------------------------------------------------------------------------------------------

    [Fact]
    public void Nothing_to_say_is_silence()
    {
        var tmp = NewTmp();
        var reported = new List<string>();

        var result = LeftoversSweep.Run(Options(tmp));
        var built = new LeftoversSweepFixture(() => LeftoversSweep.Run(Options(tmp)), reported.Add);

        result.Count.Should().Be(0);
        reported.Should().BeEmpty();
        built.LastRun.Count.Should().Be(0);
    }

    [Fact]
    public void Something_to_say_is_one_summary_line_and_one_line_per_listed_preserved_and_error_entry()
    {
        var reported = new List<string>();
        var result = new SweepResult(["a"], [("b", "live")], ["foreign: folder f — owner u1"], ["folder g: it broke"]);

        var built = new LeftoversSweepFixture(() => result, reported.Add);

        reported.Should().HaveCount(4);
        reported[0].Should().Be($"{OwnedToken.RepoToken} tests: leftovers — removed 1, preserved 1, listed 1");
        reported.Should().Contain(l => l.Contains("foreign: folder f — owner u1", StringComparison.Ordinal));
        reported.Should().Contain("  preserved: b — live");
        reported.Should().Contain(l => l.Contains("folder g: it broke", StringComparison.Ordinal));
        built.LastRun.Should().BeSameAs(result);
    }

    [Fact]
    public void Preserved_entries_are_named_with_their_reason_up_to_a_bound_and_a_summary_says_how_many_were_left_out()
    {
        var limit = LeftoversSweepFixture.MaxPreservedLines;
        var over = Enumerable.Range(0, limit + 5).Select(i => ($"/t/kept-{i}", "live")).ToList();
        var exact = over.Take(limit).ToList();
        var reportedOver = new List<string>();
        var reportedExact = new List<string>();

        var built = new LeftoversSweepFixture(() => new SweepResult([], over, [], []), reportedOver.Add);
        _ = new LeftoversSweepFixture(() => new SweepResult([], exact, [], []), reportedExact.Add);

        reportedOver.Count(l => l.StartsWith("  preserved: ", StringComparison.Ordinal)).Should().Be(limit);
        reportedOver[1].Should().Be("  preserved: /t/kept-0 — live");
        reportedOver[^1].Should().Be("  … 5 more preserved entries are not shown (preserved 25 in all; the first 20 are named above)");
        reportedExact.Should().HaveCount(1 + limit, "at the bound nothing is left out, so there is no summary");
        built.LastRun.Preserved.Should().HaveCount(limit + 5, "the result itself is never trimmed");
    }

    // ---- 8 -------------------------------------------------------------------------------------------------------

    [Fact]
    public void The_fixture_ran_before_this_test_over_the_real_temp_root()
    {
        fixture.LastRun.Should().NotBeNull("the assembly fixture swept at the start of THIS run");
    }

    // ---- 9 -------------------------------------------------------------------------------------------------------

    [Fact]
    public void Collection_is_proven_with_the_real_scope_key_whatever_the_runners_elevation()
    {
        // No Mine seam: Scope.IsMine itself. MEASURED on the windows-latest leg (PR #58, scenario 0): the runner IS
        // elevated, and a new %TEMP% file's owner SID is S-1-5-32-544 (BUILTIN\Administrators), not the token user — so
        // there Scope.IsMine is FALSE for this run's own files. The WindowsOwnership fixtures make both outcomes on any
        // runner: OwnedByCaller (the caller's own SID) must be REMOVED, ForeignToCaller kept as foreign-uid. Against an
        // IsMine that checks the profile alone, the second would be removed on an elevated runner; against the
        // measured-only scenario, an elevated runner would never remove anything and this leg would prove
        // preservation only.
        var tmp = NewTmp();
        var dead = Dead();
        var dir = PlantFolder(tmp, Name("collect"), Rec(dead));
        if (OperatingSystem.IsWindows()) WindowsOwnedByCaller(dir, dir + ".owner");

        var result = LeftoversSweep.Run(new SweepOptions(tmp, DateTimeOffset.UtcNow, LeftoversSweep.MinAge, Liveness.ProbeProcess));

        result.Removed.Should().Equal(dir);
        Directory.Exists(dir).Should().BeFalse();
        File.Exists(dir + ".owner").Should().BeFalse();
        result.Errors.Should().BeEmpty();
        UnmatchablePid.AssertNoSuchProcess(dead);
    }

    [Fact]
    public void On_windows_a_folder_that_is_not_the_callers_by_the_kernel_owner_is_listed_and_kept()
    {
        if (!OperatingSystem.IsWindows()) Assert.Skip("the owner SID and profile keys — Windows only");
        var dead = Dead();

        if (OperatingSystem.IsWindows()) WindowsForeignIsKept(Name("stranger"), Rec(dead));

        UnmatchablePid.AssertNoSuchProcess(dead);
    }

    [SupportedOSPlatform("windows")]
    private static void WindowsOwnedByCaller(string dir, string claim)
    {
        using var ownership = new WindowsOwnership();
        ownership.OwnedByCaller(dir);
        ownership.OwnedByCaller(claim);
    }

    [SupportedOSPlatform("windows")]
    private void WindowsForeignIsKept(string name, string claimText)
    {
        using var ownership = new WindowsOwnership();
        // Its own Tmp: where the fixture's fallback is the out-of-profile path, the Tmp itself moves there.
        var seed = _owned.Dir("foreign-tmp");
        var tmp = ownership.ForeignToCaller(seed);
        var inPlace = tmp == seed;
        var dir = PlantFolder(tmp, name, claimText);
        if (inPlace)
        {
            ownership.ForeignToCaller(dir);
            ownership.ForeignToCaller(dir + ".owner");
        }

        var result = LeftoversSweep.Run(new SweepOptions(tmp, DateTimeOffset.UtcNow, LeftoversSweep.MinAge, Liveness.ProbeProcess));

        ReasonOf(result, dir).Should().Be("foreign-uid", $"taken branch: {ownership.LastForeignBranch}");
        result.Listed.Should().ContainSingle(line => line.StartsWith("foreign: folder " + name, StringComparison.Ordinal));
        result.Removed.Should().BeEmpty();
        Directory.Exists(dir).Should().BeTrue();
        File.Exists(dir + ".owner").Should().BeTrue();
        TestContext.Current.AddWarning($"sweep scenario 9: ForeignToCaller took the {ownership.LastForeignBranch}");
    }

    // ---- lessons from the E4 review -----------------------------------------------------------------------------

    [Fact]
    public void The_rename_into_quarantine_never_replaces_an_existing_empty_folder_and_draws_another_name()
    {
        var tmp = NewTmp();
        var dead = Dead();
        var dir = PlantFolder(tmp, Name("collide"), Rec(dead));
        var taken = Path.Combine(tmp, "." + Path.GetFileName(dir) + "." + QuarantineWord + Environment.ProcessId + "-aaaaaaaa");
        var free = Path.Combine(tmp, "." + Path.GetFileName(dir) + "." + QuarantineWord + Environment.ProcessId + "-bbbbbbbb");
        Directory.CreateDirectory(taken); // somebody else's empty folder at the first name drawn
        var draws = new Queue<string>([taken, free]);

        var result = LeftoversSweep.Run(Options(tmp, hooks: new SweepHooks(QuarantineName: _ => draws.Dequeue())));

        Directory.Exists(taken).Should().BeTrue("rename(2) replaces an empty folder; the quarantine move must not");
        result.Removed.Should().Equal(dir);
        result.Errors.Should().BeEmpty();
        draws.Should().BeEmpty("a second name was drawn after the first was found taken");
        Directory.Exists(free).Should().BeFalse("the folder was quarantined under the free name and removed");
        UnmatchablePid.AssertNoSuchProcess(dead);
    }

    [Fact]
    public void A_folder_whose_every_quarantine_name_is_taken_stays_where_it_is()
    {
        var tmp = NewTmp();
        var dead = Dead();
        var dir = PlantFolder(tmp, Name("allTaken"), Rec(dead));
        var taken = Enumerable.Range(0, Owned.MaxDraws)
            .Select(n => Path.Combine(tmp, "." + Path.GetFileName(dir) + "." + QuarantineWord + Environment.ProcessId + "-0000000" + n)).ToArray();
        foreach (var path in taken) Directory.CreateDirectory(path);
        var draws = new Queue<string>(taken);

        var result = LeftoversSweep.Run(Options(tmp, hooks: new SweepHooks(QuarantineName: _ => draws.Dequeue())));

        result.Removed.Should().BeEmpty();
        result.Errors.Should().ContainSingle().Which.Should().Contain("no free quarantine name");
        File.Exists(Path.Combine(dir, "file.txt")).Should().BeTrue("the folder was never moved");
        taken.Should().OnlyContain(path => Directory.Exists(path));
        UnmatchablePid.AssertNoSuchProcess(dead);
    }

    [Fact]
    public void A_rename_into_quarantine_that_the_file_system_refuses_keeps_the_folder_with_one_error()
    {
        // What a macOS volume that does not take RENAME_EXCL does (ENOTSUP, EINVAL): the exclusive rename throws, there is no fallback, and
        // the sweep says so once and leaves the folder and its claim alone. Made here by a name under a parent that is not there.
        var tmp = NewTmp();
        var dead = Dead();
        var dir = PlantFolder(tmp, Name("refused"), Rec(dead));
        var impossible = Path.Combine(tmp, "no-such-parent", "." + Path.GetFileName(dir) + "." + QuarantineWord + Environment.ProcessId + "-cccccccc");

        var result = LeftoversSweep.Run(Options(tmp, hooks: new SweepHooks(QuarantineName: _ => impossible)));

        result.Removed.Should().BeEmpty();
        result.Errors.Should().ContainSingle();
        File.Exists(Path.Combine(dir, "file.txt")).Should().BeTrue("the folder was never moved");
        File.Exists(dir + ".owner").Should().BeTrue("its claim stays with it");
        UnmatchablePid.AssertNoSuchProcess(dead);
    }

    private static string[] Unaskable() =>
        OperatingSystem.IsWindows() ? ["0", "007", "9007199254740993", "4294967296", "1"] : ["0", "007", "9007199254740993", "2147483648", "99999999999999999999"];

    [Fact]
    public void A_quarantine_whose_renamer_is_no_process_id_is_never_restored_and_never_probed()
    {
        var tmp = NewTmp();
        var probed = new List<long>();
        foreach (var (digits, index) in Unaskable().Select((d, i) => (d, i)))
        {
            var name = Name("badpid" + index);
            var quarantine = Path.Combine(tmp, "." + name + "." + QuarantineWord + digits + "-deadbeef");
            Directory.CreateDirectory(quarantine);
            File.WriteAllText(Path.Combine(quarantine, "file.txt"), "x");
            File.WriteAllText(Path.Combine(tmp, name + ".owner"), Rec(Environment.ProcessId));
        }

        var options = new SweepOptions(tmp, DateTimeOffset.UtcNow + Old, LeftoversSweep.MinAge, pid =>
        {
            probed.Add(pid);
            return EverythingIsDeadProbe(pid);
        }, _ => true);
        var result = LeftoversSweep.Run(options);

        Quarantines(tmp).Should().HaveCount(Unaskable().Length, "every quarantine stays: its renamer's pid is not a pid");
        Directory.GetDirectories(tmp).Where(d => !Path.GetFileName(d).StartsWith('.')).Should().BeEmpty("nothing was restored under its name");
        probed.Should().BeEmpty("the owner-state checks come first: the probe is never asked about these");
        result.Errors.Should().BeEmpty();
    }

    [Fact]
    public void A_quarantine_whose_renamer_is_a_gone_process_is_restored_by_the_same_pass()
    {
        var tmp = NewTmp();
        var dead = Dead();
        var name = Name("goodpid");
        var quarantine = Quarantine(tmp, name, dead, "deadbeef");
        File.WriteAllText(Path.Combine(quarantine, "file.txt"), "x");
        File.WriteAllText(Path.Combine(tmp, name + ".owner"), Rec(Environment.ProcessId));

        var result = LeftoversSweep.Run(new SweepOptions(tmp, DateTimeOffset.UtcNow + Old, LeftoversSweep.MinAge, Liveness.ProbeProcess, _ => true));

        File.Exists(Path.Combine(tmp, name, "file.txt")).Should().BeTrue("a canonical pid that no process has is the one answer that restores");
        result.Listed.Should().ContainSingle().Which.Should().StartWith("notice: restored ");
        result.Errors.Should().BeEmpty();
        UnmatchablePid.AssertNoSuchProcess(dead);
    }

    /// <summary>A probe that calls every pid dead: the sweep's own checks must keep a pid that is no process id from ever reaching it.</summary>
    private static Probe EverythingIsDeadProbe(long _) => new(ProbeState.Dead, null);

    [Fact]
    public void An_orphan_claim_whose_folder_sits_in_a_quarantine_is_kept_with_it()
    {
        var tmp = NewTmp();
        var dead = Dead();
        var name = Name("inquarantine");
        // The renamer is alive (this process), so the quarantine pass leaves the folder where it is; its claim, still at the old
        // path, names a gone owner and is old: judged alone it is an orphan. It is not one: its folder is in the sibling.
        var quarantine = Quarantine(tmp, name, Environment.ProcessId, "deadbeef");
        File.WriteAllText(Path.Combine(quarantine, "file.txt"), "x");
        var claim = Orphan(tmp, name, Rec(dead));

        var result = LeftoversSweep.Run(Options(tmp, now: DateTimeOffset.UtcNow + Old));

        result.Removed.Should().BeEmpty();
        File.Exists(claim).Should().BeTrue("the claim belongs to the folder in the quarantine; deleting it would orphan that folder");
        File.Exists(Path.Combine(quarantine, "file.txt")).Should().BeTrue();
        result.Errors.Should().BeEmpty();
        UnmatchablePid.AssertNoSuchProcess(dead);
    }

    [Fact]
    public void An_orphan_claim_with_no_folder_anywhere_is_still_removed_when_its_owner_is_gone()
    {
        var tmp = NewTmp();
        var dead = Dead();
        var claim = Orphan(tmp, Name("lonely"), Rec(dead));
        Quarantine(tmp, Name("someoneelse"), Environment.ProcessId, "deadbeef"); // a quarantine of ANOTHER name is no reason to keep this one

        var result = LeftoversSweep.Run(Options(tmp));

        result.Removed.Should().Equal(claim);
        UnmatchablePid.AssertNoSuchProcess(dead);
    }

    // ---- helpers -------------------------------------------------------------------------------------------------

    private string NewTmp() => _owned.Dir("sweep");

    private static string Name(string what) => Owned.NameBase + what + "-abc123";

    private static string Foreign(string what) => Owned.NameBase.Replace(OwnerToken.This, Other) + what + "-abc123";

    private static long Dead()
    {
        var pid = UnmatchablePid.Next();
        UnmatchablePid.AssertNoSuchProcess(pid);
        return pid;
    }

    /// <summary>A claim's text: this process's record with the pid of the owner it claims.</summary>
    private static string Rec(long pid) => Rec(Owner.This with { Pid = pid });

    private static string Rec(Owner owner) => owner.Format() + "\n";

    private static SweepOptions Options(
        string tmp, Func<string, bool>? mine = null, SweepHooks? hooks = null, DateTimeOffset? now = null) =>
        new(tmp, now ?? DateTimeOffset.UtcNow, LeftoversSweep.MinAge, Liveness.ProbeProcess, mine ?? (_ => true), hooks);

    private static string? ReasonOf(SweepResult result, string path) =>
        result.Preserved.Where(p => p.Path == path).Select(p => p.Reason).SingleOrDefault();

    private static string[] Quarantines(string tmp) =>
        [.. Directory.GetFileSystemEntries(tmp).Where(p => Path.GetFileName(p).Contains(QuarantineWord, StringComparison.OrdinalIgnoreCase))];

    private static string Quarantine(string tmp, string name, long renamer, string hex)
    {
        var path = Path.Combine(tmp, "." + name + "." + QuarantineWord + renamer + "-" + hex);
        Directory.CreateDirectory(path);
        return path;
    }

    /// <summary>A folder with a file in it (and optionally a top-level link), its claim beside it, both aged.</summary>
    private static string PlantFolder(string tmp, string name, string? claim, bool old = true, string? withLink = null)
    {
        var dir = Path.Combine(tmp, name);
        Directory.CreateDirectory(dir);
        File.WriteAllText(Path.Combine(dir, "file.txt"), "x");
        if (withLink is not null) DirectoryLinks.CreateOrSkip(Path.Combine(dir, "top"), withLink);
        if (claim is not null) File.WriteAllText(dir + ".owner", claim);
        if (!old) return dir;
        AgeFolder(dir);
        if (claim is not null) File.SetLastWriteTimeUtc(dir + ".owner", DateTime.UtcNow - Old);
        return dir;
    }

    private static string Orphan(string tmp, string name, string claim, bool old = true)
    {
        var path = Path.Combine(tmp, name + ".owner");
        File.WriteAllText(path, claim);
        if (old) File.SetLastWriteTimeUtc(path, DateTime.UtcNow - Old);
        return path;
    }

    private static void AgeFolder(string dir) => Directory.SetLastWriteTimeUtc(dir, DateTime.UtcNow - Old);
}
