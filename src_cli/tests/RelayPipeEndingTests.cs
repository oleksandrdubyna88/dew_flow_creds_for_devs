using CredsBroker;
using CredsCli;
using CredsForDevs.ServiceDefaults;
using CredsForDevs.ServiceDefaults.Tests.Support;
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

    [Fact]
    public async Task No_announced_agent_ends_the_run_with_its_reason_and_the_sentence()
    {
        // In-process, unlike RelayLogTests' process run, so the coverage of this path is visible.
        var sink = new CollectingSink();
        using var log = sink.Logger();
        var none = Path.Combine(Path.GetTempPath(), "creds-no-endpoints-" + Guid.NewGuid().ToString("N"));

        var code = await RelayPipe.RunAsync(BrokerContract.Current, none, log);

        code.Should().Be(BrokerContract.Current.Exit("brokerUnreachable"));
        sink.Messages.Should().Contain(m => m.Contains("no VS Code window is serving an SSH agent"));
        sink.Messages.Should().Contain(m => m.Contains("\"noAgentAnnounced\""));
    }

    [Fact]
    public async Task An_announced_agent_that_does_not_answer_is_its_own_ending()
    {
        var sink = new CollectingSink();
        using var log = sink.Logger();
        var dir = HostProcess.TempDirectory("creds-dead-agent");
        try
        {
            // A window that announced an agent and died: the file outlives the socket.
            var gone = Path.Combine(dir, "gone.sock");
            File.WriteAllText(
                Path.Combine(dir, "window-1.json"),
                $$"""{"pid":1,"port":1,"startedAt":"2026-10-10T00:00:00Z","agentSocket":"{{gone.Replace("\\", "\\\\")}}"}""");

            var code = await RelayPipe.RunAsync(BrokerContract.Current, dir, log);

            code.Should().Be(BrokerContract.Current.Exit("brokerUnreachable"));
            sink.Messages.Should().Contain(m => m.Contains("an SSH agent was announced but none answered"));
            sink.Messages.Should().Contain(m => m.Contains("\"noAgentAnswered\""));
        }
        finally
        {
            HostProcess.Remove(dir);
        }
    }
}
