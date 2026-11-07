using FluentAssertions;
using Xunit;

namespace CredsForDevs.Tests.Leftovers;

/// <summary>The helper through which every test here makes a scratch folder (rule §1, §2): the name from one
/// constant behind the caller's owner token, the claim written FIRST beside it, the folder made exclusively, and
/// exact teardown that never throws. Every scenario that counts what a call left behind passes a PRIVATE parent —
/// an <see cref="OwnedDir"/> of its own — and builds its names at run time from <see cref="Owned.NameBase"/>.</summary>
public sealed class OwnedTests : IDisposable
{
    private readonly OwnedScope _owned = new();

    public void Dispose() => _owned.Dispose();

    private static string Other => OwnerFixtures.Other;

    [Fact]
    public void A_name_carries_the_prefix_the_owner_the_token_what_and_six_random_characters()
    {
        var name = Owned.NameFor("pg");

        name.Should().StartWith(Owned.NameBase);
        name.Should().MatchRegex($"^{Owned.Prefix}[uw][0-9]{{1,10}}-creds-pg-[A-Za-z0-9]{{6}}$");
        Owned.NameFor("pg").Should().NotBe(name, "the id is random");
        Owned.NameFor("a-b ").Should().StartWith(Owned.NameBase + "a-b -", "a name may hold the separator and a space");
        Owned.NameFor(new string('x', Owned.Room)).Should().HaveLength(Owned.MaxName);
    }

    [Fact]
    public void The_full_name_pattern_accepts_a_six_to_twelve_character_id_in_both_spellings_and_nothing_else()
    {
        var full = Owned.FullName();

        full.IsMatch(Owned.NameFor("pg")).Should().BeTrue();
        full.IsMatch(Owned.NameBase + "pg-abcdef").Should().BeTrue("six characters");
        full.IsMatch(Owned.NameBase + "pg-abcdefghijkl").Should().BeTrue("twelve characters: a name another implementation made still reads as one");
        full.IsMatch(Owned.NameBase.ToLowerInvariant().Replace('-', '_') + "pg_abcdef").Should().BeTrue("the underscore spelling, lower case");
        full.IsMatch(Owned.NameBase + "pg-abcde").Should().BeFalse("five characters");
        full.IsMatch(Owned.NameBase + "pg-abcdefghijklm").Should().BeFalse("thirteen characters");
        full.IsMatch(Owned.NameBase + "pg-clxdyztb.njt").Should().BeFalse("the id of a framework-made temp folder holds a dot");
        full.IsMatch(Owned.NameBase.Replace(OwnerToken.This, Other) + "pg-abcdef").Should().BeFalse("another owner's name");
        Owned.Pattern().IsMatch(Owned.NameBase + "x").Should().BeTrue("selection is the anchored prefix, owner and token");
        Owned.Pattern().IsMatch("x-" + Owned.NameBase).Should().BeFalse("anchored");
    }

    [Fact]
    public void Every_name_in_the_mounted_vectors_is_classified_as_the_vectors_say()
    {
        using var scope = new FluentAssertions.Execution.AssertionScope();
        foreach (var v in OwnerVectors.Table("names"))
        {
            var form = Owned.Classify(v.Text("name"));
            switch (v.Text("form"))
            {
                case "owner":
                    form.Should().Be(new NameForm.Owner(v.Text("owner"), v.TextOrNull("token")), $"{v.Text("id")} {v.Text("name")}");
                    break;
                case "legacy":
                    form.Should().Be(new NameForm.Legacy(v.Text("token")), $"{v.Text("id")} {v.Text("name")}");
                    break;
                default:
                    form.Should().Be(NameForm.None, $"{v.Text("id")} {v.Text("name")}");
                    break;
            }
        }
    }

    [Theory]
    [InlineData("")]
    [InlineData("a/b")]
    [InlineData("a\\b")]
    [InlineData("-x")]
    [InlineData("a\u0001b")]
    [InlineData("a\u007fb")]
    [InlineData("a\0b")]
    public void A_bad_what_throws_before_anything_exists(string what)
    {
        var parent = _owned.Dir("parent");
        var before = Directory.GetFileSystemEntries(parent);

        var act = () => OwnedDir.Create(what, parent);

        act.Should().Throw<ArgumentException>().Which.Message.Should().Contain(Owned.Room.ToString());
        Directory.GetFileSystemEntries(parent).Should().BeEquivalentTo(before);
    }

    [Theory]
    [InlineData("a:b")]
    [InlineData("a<b")]
    [InlineData("a>b")]
    [InlineData("a\"b")]
    [InlineData("a|b")]
    [InlineData("a?b")]
    [InlineData("a*b")]
    public void On_windows_a_what_the_file_system_reads_as_syntax_is_refused_and_elsewhere_it_is_only_a_character(string what)
    {
        // A colon makes the claim "<name>.owner" an alternate data stream of <name>; the others are not file-name characters at all.
        var onWindows = () => Owned.CheckWhat(what, windows: true);
        var elsewhere = () => Owned.CheckWhat(what, windows: false);

        onWindows.Should().Throw<ArgumentException>().Which.Message.Should().Contain("Windows").And.Contain(Owned.Room.ToString());
        elsewhere.Should().NotThrow();
    }

    [Fact]
    public void The_real_check_is_the_windows_one_on_windows()
    {
        var parent = _owned.Dir("parent");

        var act = () => _owned.Dir("a:b", parent);

        if (OperatingSystem.IsWindows()) act.Should().Throw<ArgumentException>();
        else act.Should().NotThrow("on Linux a colon is a character; the scope removes the folder with the rest");
    }

    [Fact]
    public void A_what_longer_than_the_room_under_this_owner_throws_naming_the_room()
    {
        var parent = _owned.Dir("parent");

        var act = () => OwnedDir.Create(new string('x', Owned.Room + 1), parent);

        act.Should().Throw<ArgumentException>().Which.Message.Should().Contain($"{Owned.Room}");
        Directory.GetFileSystemEntries(parent).Should().BeEmpty();
    }

    [Fact]
    public void A_folder_and_its_claim_sit_side_by_side_and_the_claim_is_never_inside()
    {
        var parent = _owned.Dir("parent");

        using var dir = OwnedDir.Create("path Unicode пробел", parent);

        Path.GetFileName(dir.Path).Should().StartWith(Owned.NameBase + "path Unicode пробел-");
        Path.GetDirectoryName(dir.Path).Should().Be(parent);
        Directory.GetFileSystemEntries(dir.Path).Should().BeEmpty("nothing is ever written inside the folder");
        var claim = File.ReadAllText(dir.Path + ".owner");
        claim.Should().EndWith("\n").And.NotContain("\n\n");
        Owner.Parse(claim).Should().Be(Owner.RunRecord());
    }

    [Fact]
    public void Disposal_removes_the_folder_and_the_claim_and_is_idempotent()
    {
        var parent = _owned.Dir("parent");
        var warnings = new List<string>();
        var dir = OwnedDir.Create("x", parent, warnings.Add);
        OwnedDir.Unreclaimed().Should().Contain(dir, "between Create and Dispose");

        dir.Dispose();
        dir.Dispose();

        Directory.Exists(dir.Path).Should().BeFalse();
        File.Exists(dir.Path + ".owner").Should().BeFalse();
        warnings.Should().BeEmpty("a second Dispose writes no warning");
        OwnedDir.Unreclaimed().Should().NotContain(dir);
    }

    [Fact]
    public void A_disposal_that_fails_stays_visible_until_the_folder_and_its_claim_are_gone()
    {
        var parent = _owned.Dir("parent");
        var dir = OwnedDir.Create("stuck", parent, _ => { });
        var release = Unremovable.Make(parent, dir.Path);
        try
        {
            dir.Dispose();

            OwnedDir.Unreclaimed().Should().Contain(dir, "a disposal that gave up leaves the entry for the audit");
            dir.DisposeAttempted.Should().BeTrue();
        }
        finally
        {
            release.Dispose();
        }

        dir.Dispose();

        OwnedDir.Unreclaimed().Should().NotContain(dir);
        Directory.Exists(dir.Path).Should().BeFalse();
        File.Exists(dir.Path + ".owner").Should().BeFalse();
    }

    [Fact]
    public void Teardown_never_throws_and_what_it_cannot_remove_stays_prefixed_and_claimed()
    {
        var parent = _owned.Dir("parent");
        var warnings = new List<string>();
        var dir = OwnedDir.Create("held", parent, warnings.Add);
        var release = Unremovable.Make(parent, dir.Path);
        try
        {
            var act = dir.Dispose;

            act.Should().NotThrow();
            warnings.Should().ContainSingle().Which.Should().Match("owned: could not remove * left for the start-of-run sweep");
            Directory.Exists(dir.Path).Should().BeTrue();
            Owned.Pattern().IsMatch(Path.GetFileName(dir.Path)).Should().BeTrue();
            File.Exists(dir.Path + ".owner").Should().BeTrue("the claim stays beside the leftover so the next sweep can judge it");
        }
        finally
        {
            release.Dispose();
        }

        dir.Dispose();
        Directory.Exists(dir.Path).Should().BeFalse();
    }

    [Fact]
    public void A_test_body_that_throws_still_leaves_nothing()
    {
        var parent = _owned.Dir("parent");
        string? made = null;

        var act = () =>
        {
            using var dir = OwnedDir.Create("unwind", parent);
            made = dir.Path;
            throw new InvalidOperationException("the test body failed");
        };

        act.Should().Throw<InvalidOperationException>().WithMessage("the test body failed");
        Directory.Exists(made).Should().BeFalse();
        File.Exists(made + ".owner").Should().BeFalse();
    }

    [Fact]
    public void Three_folders_of_one_scope_the_third_under_the_second_are_all_gone_without_a_warning()
    {
        var parent = _owned.Dir("parent");
        var warnings = new List<string>();
        var scope = new OwnedScope(warnings.Add);
        var a = scope.Dir("a", parent);
        var b = scope.Dir("b", a);
        var c = scope.Dir("c", b);

        scope.Dispose();
        scope.Dispose();

        foreach (var path in new[] { a, b, c })
        {
            Directory.Exists(path).Should().BeFalse(path);
            File.Exists(path + ".owner").Should().BeFalse(path);
        }

        warnings.Should().BeEmpty();
    }

    [Fact]
    public void A_scope_tries_every_folder_when_one_disposal_throws_and_reports_all_the_failures_together()
    {
        var parent = _owned.Dir("scope-parent");
        var scope = new OwnedScope(_ => { });
        var first = scope.Dir("first", parent);
        scope.Own(new Throwing("one"), "/t/stuck-1");
        var middle = scope.Dir("middle", parent);
        scope.Own(new Throwing("two"), "/t/stuck-2");
        var last = scope.Dir("last", parent);

        var dispose = scope.Dispose;

        var error = dispose.Should().Throw<AggregateException>().Which;
        error.InnerExceptions.Should().HaveCount(2);
        error.InnerExceptions.Select(e => e.Message).Should().SatisfyRespectively(
            m => m.Should().Contain("/t/stuck-2").And.Contain("two"),
            m => m.Should().Contain("/t/stuck-1").And.Contain("one"));
        foreach (var path in new[] { first, middle, last })
        {
            Directory.Exists(path).Should().BeFalse($"{path} was still tried after a disposal threw");
            File.Exists(path + ".owner").Should().BeFalse(path);
        }

        scope.Dispose(); // nothing is left to dispose: a second call is silent
    }

    private sealed class Throwing(string why) : IDisposable
    {
        public void Dispose() => throw new IOException(why);
    }

    [Fact]
    public void A_link_inside_is_unlinked_and_never_followed()
    {
        var sentinel = _owned.Dir("sentinel");
        File.WriteAllText(Path.Combine(sentinel, "keep.txt"), "must survive");
        var parent = _owned.Dir("parent");
        var dir = OwnedDir.Create("links", parent);
        Directory.CreateDirectory(Path.Combine(dir.Path, "sub"));
        DirectoryLinks.CreateOrSkip(Path.Combine(dir.Path, "top"), sentinel);
        DirectoryLinks.CreateOrSkip(Path.Combine(dir.Path, "sub", "deep"), sentinel);

        dir.Dispose();

        Directory.Exists(dir.Path).Should().BeFalse();
        File.Exists(dir.Path + ".owner").Should().BeFalse();
        File.ReadAllText(Path.Combine(sentinel, "keep.txt")).Should().Be("must survive", "a link is removed as a link, never through");
    }

    [Fact]
    public void A_claim_already_there_for_the_first_name_makes_the_call_take_the_second_and_leaves_the_first_alone()
    {
        var parent = _owned.Dir("parent");
        var (first, second) = (Owned.NameFor("x"), Owned.NameFor("x"));
        File.WriteAllText(Path.Combine(parent, first + ".owner"), "somebody else's claim");

        using var dir = OwnedDir.Create("x", parent, null, Names(first, second));

        Path.GetFileName(dir.Path).Should().Be(second);
        File.ReadAllText(Path.Combine(parent, first + ".owner")).Should().Be("somebody else's claim");
        Directory.Exists(Path.Combine(parent, first)).Should().BeFalse();
    }

    [Fact]
    public void A_squatted_folder_is_never_adopted_and_gets_no_claim_of_ours()
    {
        var parent = _owned.Dir("parent");
        var (first, second) = (Owned.NameFor("x"), Owned.NameFor("x"));
        Directory.CreateDirectory(Path.Combine(parent, first));
        File.WriteAllText(Path.Combine(parent, first, "squatter.txt"), "mine");
        var warnings = new List<string>();

        using var dir = OwnedDir.Create("x", parent, warnings.Add, Names(first, second));

        warnings.Should().ContainSingle().Which.Should().Contain("already exists under the name this run claimed");
        File.ReadAllText(Path.Combine(parent, first, "squatter.txt")).Should().Be("mine");
        File.Exists(Path.Combine(parent, first + ".owner")).Should().BeFalse("a claim of a run that dies later must never govern a folder this run did not create");
        Path.GetFileName(dir.Path).Should().Be(second);
    }

    [Fact]
    public void A_claim_replaced_between_our_write_and_the_collision_is_not_ours_to_remove()
    {
        var parent = _owned.Dir("parent");
        var (first, second) = (Owned.NameFor("x"), Owned.NameFor("x"));
        Directory.CreateDirectory(Path.Combine(parent, first));
        var claim = Path.Combine(parent, first + ".owner");

        using var dir = OwnedDir.Create("x", parent, _ => { }, Names(first, second), afterClaim: path => File.WriteAllText(path, "another run's claim\n"));

        File.ReadAllText(claim).Should().Be("another run's claim\n");
        Path.GetFileName(dir.Path).Should().Be(second);
    }

    [Fact]
    public void A_parent_that_does_not_exist_is_a_failed_claim_and_nothing_is_created()
    {
        var grand = _owned.Dir("grand");

        var act = () => OwnedDir.Create("x", Path.Combine(grand, "missing"));

        act.Should().Throw<InvalidOperationException>().Which.Message.Should().StartWith("owned: could not claim");
        Directory.GetFileSystemEntries(grand).Should().BeEmpty();
    }

    [Fact]
    public void A_claim_write_that_fails_after_the_exclusive_create_removes_the_empty_claim()
    {
        var parent = _owned.Dir("parent");

        var act = () => OwnedDir.Create("x", parent, null, null, beforeClaimWrite: _ => throw new IOException("disk full"));

        act.Should().Throw<InvalidOperationException>().Which.Message.Should().Contain("could not claim");
        Directory.GetFileSystemEntries(parent).Should().BeEmpty("no file named for the helper remains: the empty claim was removed");
    }

    [Fact]
    public void A_claim_write_that_fails_with_any_kind_of_exception_removes_the_claim_and_lets_it_through()
    {
        var parent = _owned.Dir("parent");

        var act = () => OwnedDir.Create("x", parent, null, null, beforeClaimWrite: _ => throw new ArgumentException("not an I/O failure"));

        act.Should().Throw<ArgumentException>().WithMessage("not an I/O failure");
        Directory.GetFileSystemEntries(parent).Should().BeEmpty("the claim was created exclusively and must not outlive the failure");
    }

    [Fact]
    public void A_failure_of_any_kind_between_the_claim_and_the_folder_removes_the_claim_and_lets_it_through()
    {
        var parent = _owned.Dir("parent");

        var act = () => OwnedDir.Create("x", parent, null, null, afterClaim: _ => throw new DivideByZeroException("not an I/O failure"));

        act.Should().Throw<DivideByZeroException>();
        Directory.GetFileSystemEntries(parent).Should().BeEmpty("a claim with no folder and no owner to remove it would be an orphan");
    }

    [Fact]
    public void A_link_where_the_folder_was_is_unlinked_and_neither_it_nor_what_it_points_at_is_followed()
    {
        var parent = _owned.Dir("parent");
        var target = _owned.Dir("target");
        var sentinel = _owned.Dir("sentinel");
        File.WriteAllText(Path.Combine(sentinel, "keep.txt"), "must survive");
        DirectoryLinks.CreateOrSkip(Path.Combine(target, "inner"), sentinel);
        var name = Path.Combine(parent, Owned.NameFor("replaced"));
        DirectoryLinks.CreateOrSkip(name, target);
        File.WriteAllText(name + ".owner", Owner.This.Format() + "\n");

        var removed = Removal.Quietly(name, _ => { });

        removed.Should().BeTrue();
        Native.IdentityOf(name).Should().BeNull("the link itself is gone");
        File.Exists(name + ".owner").Should().BeFalse();
        Directory.Exists(target).Should().BeTrue("what the link pointed at is not the helper's");
        Native.IdentityOf(Path.Combine(target, "inner")).Should().NotBeNull("a link inside the target was never visited");
        File.ReadAllText(Path.Combine(sentinel, "keep.txt")).Should().Be("must survive");
    }

    [Fact]
    public void An_entry_that_is_not_a_folder_keeps_its_claim_because_it_is_not_gone()
    {
        var parent = _owned.Dir("parent");
        var name = Path.Combine(parent, Owned.NameFor("file"));
        File.WriteAllText(name, "somebody's file");
        File.WriteAllText(name + ".owner", Owner.This.Format() + "\n");
        var warnings = new List<string>();

        var removed = Removal.Quietly(name, warnings.Add);

        removed.Should().BeFalse();
        File.ReadAllText(name).Should().Be("somebody's file", "it is not a folder this helper made");
        File.Exists(name + ".owner").Should().BeTrue("the claim goes only when the entry is gone");
        warnings.Should().ContainSingle();
    }

    [Fact]
    public void A_claim_another_run_put_under_the_name_since_is_not_ours_and_stays()
    {
        if (OperatingSystem.IsWindows()) Assert.Skip("deleting a file held open with no sharing — Linux only");
        var parent = _owned.Dir("parent");
        var name = Owned.NameFor("x");

        var act = () => OwnedDir.Create("x", parent, null, Names(name), beforeClaimWrite: path =>
        {
            File.Delete(path);
            File.WriteAllText(path, "another run's claim\n");
        });

        act.Should().Throw<InvalidOperationException>().Which.Message.Should().Contain("could not claim");
        File.ReadAllText(Path.Combine(parent, name + ".owner")).Should().Be("another run's claim\n");
    }

    [Fact]
    public void After_three_draws_with_no_free_name_the_call_throws()
    {
        var parent = _owned.Dir("parent");
        var names = Enumerable.Range(0, 3).Select(_ => Owned.NameFor("x")).ToList();
        foreach (var name in names) File.WriteAllText(Path.Combine(parent, name + ".owner"), "taken");

        var act = () => OwnedDir.Create("x", parent, null, Names([.. names]));

        act.Should().Throw<InvalidOperationException>().Which.Message.Should().Contain("no free name for x").And.Contain("after 3 draws");
    }

    [Fact]
    public void A_scope_folder_without_a_parent_lives_directly_in_the_temp_root()
    {
        var path = _owned.Dir("scoped");

        Directory.Exists(path).Should().BeTrue();
        Path.GetDirectoryName(path).Should().Be(Owned.TempRoot().TrimEnd(Path.DirectorySeparatorChar));
    }

    private static Func<string> Names(params string[] names)
    {
        var queue = new Queue<string>(names);
        return () => queue.Dequeue();
    }
}
