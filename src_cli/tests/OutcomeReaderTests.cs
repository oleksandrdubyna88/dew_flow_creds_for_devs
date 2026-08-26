using System.Text.Json;
using CredsCli;
using FluentAssertions;

namespace CredsCli.Tests;

/// <summary>
/// The C# half of how a 200 is reported — the mirror of <c>agentCliOutcome.ts</c>.
/// </summary>
/// <remarks>
/// <para>These matter more than most: an agent reads the exit code and decides what to do next,
/// so "this succeeded" meaning <c>0</c> in the Node client and something else here is one of the
/// two clients lying to a caller that cannot check.</para>
/// <para>The cases are deliberately the same ones the TypeScript suite asserts, including the
/// defect that started it: every verb whose answer carries no <c>exitCode</c> once reported a
/// SUCCESSFUL call as broker failure 95 and printed nothing.</para>
/// </remarks>
public class OutcomeReaderTests
{
    private static readonly BrokerContract Contract = BrokerContract.Current;

    private static string ExecJson(int? exitCode, string stdout = "", string stderr = "",
        bool stdoutTruncated = false, bool timedOut = false) =>
        JsonSerializer.Serialize(
            new ExecResponse(exitCode, stdout, stderr, stdoutTruncated, false, timedOut, 5),
            CredsJsonContext.Default.ExecResponse);

    [Fact]
    public void A_finished_command_passes_the_remote_exit_code_through_untouched()
    {
        // `creds ssh host -- false` must exit 1, not "our" 0.
        var outcome = OutcomeReader.Interpret("exec", ExecJson(3, "out", "err"), Contract);

        outcome.ExitCode.Should().Be(3);
        outcome.Stdout.Should().Be("out");
        outcome.Stderr.Should().Be("err");
    }

    [Fact]
    public void A_successful_env_export_exits_zero_and_names_the_variables()
    {
        var json = JsonSerializer.Serialize(
            new EnvExportResponse(["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"]),
            CredsJsonContext.Default.EnvExportResponse);

        var outcome = OutcomeReader.Interpret("env", json, Contract);

        outcome.ExitCode.Should().Be(0, "success is not a broker failure");
        outcome.Stdout.Should().Contain("AWS_ACCESS_KEY_ID").And.Contain("AWS_SECRET_ACCESS_KEY");
    }

    [Fact]
    public void An_env_export_that_wrote_nothing_says_so_rather_than_printing_an_empty_line()
    {
        var json = JsonSerializer.Serialize(new EnvExportResponse([]), CredsJsonContext.Default.EnvExportResponse);

        var outcome = OutcomeReader.Interpret("env", json, Contract);

        outcome.ExitCode.Should().Be(0);
        string.Join(" ", outcome.Notes).Should().Contain("no variables");
    }

    [Theory]
    [InlineData("vpn-up")]
    [InlineData("vpn-down")]
    public void A_tunnel_that_was_actioned_exits_zero_and_says_so(string verb)
    {
        var json = JsonSerializer.Serialize(new OpenedResponse(true), CredsJsonContext.Default.OpenedResponse);

        var outcome = OutcomeReader.Interpret(verb, json, Contract);

        outcome.ExitCode.Should().Be(0);
        outcome.Stdout.Should().NotBeNullOrWhiteSpace();
    }

    [Fact]
    public void A_tunnel_the_human_refused_is_reported_as_refused_not_as_success()
    {
        // `opened: false` is a 200 — the call worked, the person declined. Exiting 0 would tell
        // the agent the tunnel is up when it is not, and it would act on that.
        var json = JsonSerializer.Serialize(new OpenedResponse(false), CredsJsonContext.Default.OpenedResponse);

        var outcome = OutcomeReader.Interpret("vpn-up", json, Contract);

        outcome.ExitCode.Should().NotBe(0);
        outcome.ExitCode.Should().Be(Contract.Exit("refused"));
        outcome.Stderr.Should().Contain("not");
    }

    [Fact]
    public void An_opened_terminal_exits_zero_and_says_where()
    {
        var json = JsonSerializer.Serialize(new OpenedResponse(true), CredsJsonContext.Default.OpenedResponse);

        var outcome = OutcomeReader.Interpret("terminal", json, Contract);

        outcome.ExitCode.Should().Be(0);
        outcome.Stdout.Should().Contain("VS Code");
    }

    [Fact]
    public void Truncation_and_a_timeout_are_both_reported()
    {
        OutcomeReader.Interpret("exec", ExecJson(0, "x", stdoutTruncated: true), Contract)
            .Notes.Should().ContainMatch("*truncated*");

        OutcomeReader.Interpret("exec", ExecJson(null, timedOut: true), Contract)
            .ExitCode.Should().Be(Contract.Exit("remoteTimeout"));
    }

    [Fact]
    public void An_exec_shaped_answer_with_no_exit_code_is_still_a_broker_failure()
    {
        // The one verb family for which the original fall-through was right: an exec that came
        // back without a code is a broker that did not do its job.
        OutcomeReader.Interpret("exec", ExecJson(null), Contract)
            .ExitCode.Should().Be(Contract.Exit("brokerFailure"));
    }

    [Fact]
    public void Every_verb_the_cli_can_send_reports_a_success_as_success()
    {
        // The table this replaced let an unhandled verb fall through to failure silently, which
        // is exactly how env and vpn came to report success as 95.
        var bodies = new Dictionary<string, string>
        {
            ["exec"] = ExecJson(0),
            ["db"] = ExecJson(0),
            ["run"] = ExecJson(0),
            ["script"] = ExecJson(0),
            ["terminal"] = JsonSerializer.Serialize(new OpenedResponse(true), CredsJsonContext.Default.OpenedResponse),
            ["env"] = JsonSerializer.Serialize(new EnvExportResponse([]), CredsJsonContext.Default.EnvExportResponse),
            ["vpn-up"] = JsonSerializer.Serialize(new OpenedResponse(true), CredsJsonContext.Default.OpenedResponse),
            ["vpn-down"] = JsonSerializer.Serialize(new OpenedResponse(true), CredsJsonContext.Default.OpenedResponse),
        };

        foreach (var (verb, body) in bodies)
        {
            OutcomeReader.Interpret(verb, body, Contract).ExitCode.Should().Be(0, verb);
        }
    }

    [Fact]
    public void A_verb_this_build_does_not_know_is_a_visible_gap_rather_than_a_silent_failure()
    {
        var outcome = OutcomeReader.Interpret("frobnicate", "{}", Contract);

        outcome.ExitCode.Should().Be(Contract.Exit("brokerFailure"));
        string.Join(" ", outcome.Notes).Should().Contain("frobnicate");
    }

    [Fact]
    public void An_unreadable_answer_is_reported_rather_than_thrown_over()
    {
        // The broker is trusted but the wire is not: a truncated response must not crash the
        // client with a stack trace an agent cannot act on.
        var outcome = OutcomeReader.Interpret("exec", "{\"exitCode\": ", Contract);

        outcome.ExitCode.Should().Be(Contract.Exit("brokerFailure"));
    }
}
