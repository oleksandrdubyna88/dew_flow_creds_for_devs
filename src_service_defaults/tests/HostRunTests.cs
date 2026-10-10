using CredsForDevs.ServiceDefaults;
using CredsForDevs.ServiceDefaults.Tests.Support;
using FluentAssertions;

namespace CredsForDevs.ServiceDefaults.Tests;

/// <summary>The start and exit lines every serving host writes, and the words its reasons are written as.</summary>
public sealed class HostRunTests
{
    [Fact]
    public void Every_exit_reason_is_written_as_one_camel_case_word()
    {
        // Enumerated from the type, never retyped here: a reason added later is checked the day it lands.
        foreach (var reason in Enum.GetValues<ExitReason>())
        {
            var word = HostRun.Word(reason);
            word.Should().MatchRegex("^[a-z][A-Za-z]*$", "{0} is grepped for in logs and in the release smoke", reason);
            word.Should().BeEquivalentTo(reason.ToString(), "the word is the name, only its first letter lowered");
        }
        HostRun.Word(ExitReason.NoAgentAnnounced).Should().Be("noAgentAnnounced");
    }

    [Fact]
    public void A_run_logs_its_start_and_its_end_and_returns_the_code_unchanged()
    {
        var sink = new CollectingSink();
        using var log = sink.Logger();

        var run = HostRun.Start(log, "relay", "1.2.3");
        var code = run.End(new HostEnding(42, ExitReason.Busy));

        code.Should().Be(42, "logging never changes the contract's exit code");
        sink.Messages.Should().HaveCount(2);
        sink.Messages[0].Should().Contain("started: \"relay\", version \"1.2.3\"").And.Contain($"pid {Environment.ProcessId}");
        sink.Messages[1].Should().Contain("exited: code 42, reason \"busy\"");
    }

    [Fact]
    public void A_run_has_one_exit_line_even_when_two_paths_end_it()
    {
        // The shutdown deadline and the normal return can both reach End in the same instant (E2 own review,
        // finding 2); a file with two exit lines says the run ended twice.
        var sink = new CollectingSink();
        using var log = sink.Logger();

        var run = HostRun.Start(log, "serve", "1.0.0");
        run.End(new HostEnding(143, ExitReason.Signalled)).Should().Be(143);
        run.End(new HostEnding(0, ExitReason.ClientClosed)).Should().Be(0, "the code is still handed back to its caller");

        sink.Messages.Where(m => m.Contains("exited:")).Should().ContainSingle()
            .Which.Should().Contain("code 143");
    }

    [Fact]
    public void A_crash_is_logged_with_its_exception_first()
    {
        var sink = new CollectingSink();
        using var log = sink.Logger();

        HostRun.Start(log, "serve", "1.0.0").Crash(new InvalidOperationException("boom"));

        sink.Messages.Should().HaveCount(2);
        sink.Messages[1].Should().Contain("exited: reason crashed");
        sink.Exceptions.Should().ContainSingle().Which.Message.Should().Be("boom", "the doctrine: the exception travels with the line");
    }

    [Fact]
    public void The_parent_pid_is_known_on_every_platform_this_runs_on()
    {
        // The test runner always has a parent; 0 would mean the platform call silently failed.
        ParentProcess.Id().Should().BePositive();
    }
}
