using CredsBroker;
using FluentAssertions;

namespace CredsMcp.Tests;

/// <summary>
/// The one startup line about the parent-death guard (defect D) names the REAL reason it is off — a missing tool, an
/// old tool, the operator's switch and an unresolved binary are different facts (code round, findings 1/5/10/13).
/// </summary>
public sealed class ProgramGuardLogTests
{
    [Fact]
    public void An_armed_guard_logs_a_quiet_confirmation()
    {
        var (warn, message) = Program.GuardLogLine(willArm: true, WslInterop.ParentDeathGuard.Available);

        warn.Should().BeFalse("an armed guard is not a problem to warn about");
        message.Should().Contain("setpriv --pdeathsig KILL");
    }

    [Fact]
    public void A_missing_setpriv_and_an_old_setpriv_are_named_as_different_warnings()
    {
        var missing = Program.GuardLogLine(willArm: false, WslInterop.ParentDeathGuard.NoSetpriv);
        var old = Program.GuardLogLine(willArm: false, WslInterop.ParentDeathGuard.SetprivLacksPdeathsig);

        missing.Warn.Should().BeTrue();
        missing.Message.Should().Contain("was not found").And.Contain("Install setpriv");
        old.Warn.Should().BeTrue();
        old.Message.Should().Contain("does not support --pdeathsig").And.Contain("Upgrade");
        missing.Message.Should().NotBe(old.Message, "a missing tool and an old tool get different remedies, not one 'install it'");
    }

    [Fact]
    public void The_kill_switch_and_an_unresolved_binary_are_quiet()
    {
        // The operator chose the switch; an unresolved binary is reported by the exit-99 diagnosis as it starts.
        Program.GuardLogLine(willArm: false, WslInterop.ParentDeathGuard.SwitchedOff).Warn.Should().BeFalse();
        Program.GuardLogLine(willArm: false, WslInterop.ParentDeathGuard.NotApplicable).Warn.Should().BeFalse();
    }
}
