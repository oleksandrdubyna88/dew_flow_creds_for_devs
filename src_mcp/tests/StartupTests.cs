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
}
