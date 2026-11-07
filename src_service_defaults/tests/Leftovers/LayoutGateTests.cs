using FluentAssertions;
using Xunit;

namespace CredsForDevs.Tests.Leftovers;

/// <summary>On macOS no removal by identity may run before the layout holds (<see cref="DarwinLayout"/>). The requirement is an argument here, so
/// Linux and Windows prove every gate with a requirement that throws: the real sweep and the real audit of the assembly fixture, and every
/// owned-folder creation and teardown. A gate with no companion that lets the work through would pass for a wall that never opens, so each
/// has one. What these cannot show is the real macOS layout failing; they show that when it does, nothing runs.</summary>
public sealed class LayoutGateTests : IDisposable
{
    private static readonly InvalidOperationException Broken = new("the macOS lstat layout does not hold, so no identity read here can be trusted: test");

    private readonly OwnedScope _owned = DarwinLayout.FreshOwnedScope();

    public void Dispose() => _owned.Dispose();

    [Fact]
    public void The_real_sweep_asks_for_the_layout_first_and_a_layout_that_fails_is_ONE_reported_error_and_no_sweep()
    {
        var swept = false;
        var lines = new List<string>();

        var built = new LeftoversSweepFixture(
            () => LeftoversSweepFixture.GuardedSweep(() => throw Broken, () =>
            {
                swept = true;
                return SweepResult.Empty;
            }),
            lines.Add);

        swept.Should().BeFalse("a sweep removes by identity, and the identity read is not trusted yet");
        lines.Should().ContainSingle().Which.Should().Contain("error: sweep failed").And.Contain("layout does not hold");
        built.LastRun.Count.Should().Be(0);
    }

    [Fact]
    public void The_real_sweep_runs_once_the_layout_holds()
    {
        var swept = 0;
        var required = 0;

        var result = LeftoversSweepFixture.GuardedSweep(() => required++, () =>
        {
            swept++;
            return SweepResult.Empty;
        });

        (required, swept).Should().Be((1, 1));
        result.Should().Be(SweepResult.Empty);
    }

    [Fact]
    public void The_real_audit_asks_for_the_layout_first_and_removes_nothing_when_it_fails()
    {
        var audited = false;

        var act = () => LeftoversSweepFixture.GuardedAudit(() => throw Broken, () => audited = true);

        act.Should().Throw<InvalidOperationException>().WithMessage("*layout does not hold*");
        audited.Should().BeFalse("the audit removes folders by identity");
    }

    [Fact]
    public void The_real_audit_runs_once_the_layout_holds()
    {
        var audited = false;

        LeftoversSweepFixture.GuardedAudit(() => { }, () => audited = true);

        audited.Should().BeTrue();
    }

    [Fact]
    public void An_owned_folder_is_not_created_when_the_layout_does_not_hold()
    {
        var parent = _owned.Dir("parent");

        var act = () => OwnedDir.Create("never", parent, null, null, requireLayout: () => throw Broken);

        act.Should().Throw<InvalidOperationException>().WithMessage("*layout does not hold*");
        Directory.GetFileSystemEntries(parent).Should().BeEmpty("not even the claim exists: the requirement comes before anything is made");
    }

    [Fact]
    public void An_owned_folder_is_created_once_the_layout_holds_and_the_requirement_is_asked_once_for_the_creation()
    {
        var parent = _owned.Dir("parent");
        var asked = 0;

        using var dir = OwnedDir.Create("made", parent, null, null, requireLayout: () => asked++);

        asked.Should().Be(1);
        Directory.Exists(dir.Path).Should().BeTrue();
    }

    [Fact]
    public void Teardown_asks_for_the_layout_and_a_layout_that_fails_removes_nothing_and_says_so_once()
    {
        var parent = _owned.Dir("parent");
        var holds = true;
        var warnings = new List<string>();
        var dir = OwnedDir.Create("kept", parent, warnings.Add, null, requireLayout: () => { if (!holds) throw Broken; });
        holds = false;

        var act = dir.Dispose;

        act.Should().NotThrow("teardown never throws");
        Directory.Exists(dir.Path).Should().BeTrue("no removal by identity runs on a layout that does not hold");
        File.Exists(dir.Path + ".owner").Should().BeTrue();
        warnings.Should().ContainSingle().Which.Should().Contain("layout does not hold");
        OwnedDir.Unreclaimed().Should().Contain(dir, "the audit still sees it");
        dir.DisposeAttempted.Should().BeTrue();

        holds = true;
        dir.Dispose();

        Directory.Exists(dir.Path).Should().BeFalse("with the layout holding again the same disposal removes it");
        OwnedDir.Unreclaimed().Should().NotContain(dir);
    }

    [Fact]
    public void The_removal_helper_itself_asks_for_the_layout()
    {
        var parent = _owned.Dir("parent");
        var victim = Path.Combine(parent, "victim");
        Directory.CreateDirectory(victim);
        var warnings = new List<string>();

        var removed = Removal.Quietly(victim, warnings.Add, () => throw Broken);

        removed.Should().BeFalse();
        Directory.Exists(victim).Should().BeTrue();
        warnings.Should().ContainSingle().Which.Should().Contain("layout does not hold");
    }
}
