using CredsBroker;
using CredsMcp;
using FluentAssertions;

namespace CredsMcp.Tests;

/// <summary>
/// What this binary decides before it decides anything else — including whether to relay.
/// </summary>
/// <remarks>
/// The consequence worth a test is the one that is not obvious from reading <c>Main</c>: help and
/// a usage error are answered on the side the person ran, WSL or not. Both halves print the same
/// sentence, so launching a Windows process to produce it would only make the release smoke check
/// — which is <c>--help | grep creds_list</c> — slower and able to fail for a new reason.
/// </remarks>
public sealed class StartupTests
{
    [Fact]
    public void No_arguments_is_the_only_way_to_speak_the_protocol()
    {
        Program.Classify([]).Should().Be(Program.Startup.Serve);
    }

    [Theory]
    [InlineData("--help")]
    [InlineData("-h")]
    [InlineData("help")]
    public void The_three_spellings_of_help_are_all_answered_here(string spelling)
    {
        Program.Classify([spelling]).Should().Be(Program.Startup.Help);
    }

    [Fact]
    public void Anything_else_is_a_usage_error_rather_than_a_session()
    {
        // Never Serve: an argument this build does not know must not become a relayed session
        // that fails on the other side with a different message.
        Program.Classify(["--stdio"]).Should().Be(Program.Startup.Usage);
        Program.Classify(["serve", "--help"]).Should().Be(Program.Startup.Usage);
    }

    [Fact]
    public void Help_is_only_help_when_it_comes_first()
    {
        Program.Classify(["--verbose", "--help"]).Should().Be(Program.Startup.Usage);
    }

    [Fact]
    public void A_forwarded_caller_record_is_a_session_and_the_record_is_handed_on_as_it_came()
    {
        // The Linux half of the WSL bridge computed it; this half must not recompute it (its own
        // environment belongs to wsl.exe, and a pid in it would name somebody else's session).
        var record = new CallerRecord(string.Empty, "98bf9f23", "clauderag-d6", "ClaudeRag");
        var encoded = CallerIdentity.Encode(record);

        Program.Classify([CallerForwarding.Flag, encoded]).Should().Be(Program.Startup.Serve);
        Program.ForwardedCaller([CallerForwarding.Flag, encoded]).Should().Be(encoded);
        CallerIdentity.Decode(Program.ForwardedCaller([CallerForwarding.Flag, encoded])).Should().Be(record);
        Program.ForwardedCaller([]).Should().BeNull("a plain start computes its own record");
    }

    [Fact]
    public void The_caller_flag_takes_exactly_one_value_and_everything_else_stays_a_usage_error()
    {
        Program.Classify([CallerForwarding.Flag]).Should().Be(Program.Startup.Usage);
        Program.Classify([CallerForwarding.Flag, "abc", "extra"]).Should().Be(Program.Startup.Usage);
        Program.Classify(["--nonsense"]).Should().Be(Program.Startup.Usage);
        Program.Classify(["--caller=abc"]).Should().Be(Program.Startup.Usage);
    }

    [Fact]
    public void A_malformed_forwarded_record_serves_with_an_empty_label_rather_than_dying()
    {
        // The old-Windows-half problem in reverse: a value this build cannot read must not turn a
        // session into a usage error, because that would be a dead server, not a degradation.
        Program.Classify([CallerForwarding.Flag, "not base64!!"]).Should().Be(Program.Startup.Serve);
        CallerIdentity.Decode("not base64!!").Should().Be(CallerRecord.Empty);
    }

    [Fact]
    public void The_help_text_names_the_flag_because_the_probe_reads_it_there()
    {
        // The Linux half runs `creds-mcp.exe --help` once per session and passes `--caller` only
        // when the text names it. Rename the flag in one place and an old Windows half is handed
        // an argument it refuses — a dead bridge, not a degraded one.
        Program.HelpText.Should().Contain(CallerForwarding.Flag);
        Program.HelpText.Should().Contain("creds_list", "the release smoke check greps for this");
    }
}
