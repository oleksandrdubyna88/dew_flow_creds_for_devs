using CredsCli;
using CredsForDevs.ServiceDefaults;
using FluentAssertions;

namespace CredsCli.Tests;

/// <summary>
/// What relay-pipe's exit line says about the copy that finished first (E1 code round 2, finding 3).
/// </summary>
public sealed class RelayPipeEndingTests
{
    [Fact]
    public void A_copy_that_ended_is_the_side_that_closed()
    {
        var toAgent = Task.CompletedTask;
        var fromAgent = new TaskCompletionSource().Task;

        RelayPipe.EndingOf(toAgent, toAgent).Should().Be(ExitReason.RelayClosed);
        RelayPipe.EndingOf(Task.CompletedTask, fromAgent).Should().Be(ExitReason.AgentClosed);
    }

    [Fact]
    public void A_copy_that_FAILED_is_not_reported_as_an_orderly_close()
    {
        // A broken pipe must not read as "the relay closed" in the one file somebody opens to learn
        // why a session ended.
        var broken = Task.FromException(new IOException("Broken pipe"));

        RelayPipe.EndingOf(broken, broken).Should().Be(ExitReason.CopyFailed);
        RelayPipe.EndingOf(broken, Task.CompletedTask).Should().Be(ExitReason.CopyFailed);
    }
}
