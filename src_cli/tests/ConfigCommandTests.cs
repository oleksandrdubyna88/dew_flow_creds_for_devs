using CredsCli;
using FluentAssertions;

namespace CredsCli.Tests;

/// <summary>
/// <c>creds config</c> — one config file, for an application reading it at startup, with the key
/// arriving on stdin or from <c>CREDSFORDEVS_KEY</c> and NEVER as an argument.
/// </summary>
/// <remarks>
/// <para>Its own request shape rather than a <see cref="Request.Use"/> with a differently-parsed second
/// argument, because a config key is not a grant token: a grant carries the window's port in its
/// own text and dies with that window, while this outlives it and carries nothing.</para>
/// <para>The argument form was refused outright on 2026-10-09
/// (<c>research/PLAN_config_key_off_the_command_line.md</c>): a command line is readable by every user
/// inside WSL and by every process of the same user on Windows, and a config key lives for a year.</para>
/// </remarks>
public class ConfigCommandTests
{
    /// <summary>Key-shaped, and fake: no window ever minted it.</summary>
    private const string FakeKey = "cfgk_FAKEFAKEFAKEFAKEFAKEFAKEFAKE";

    [Fact]
    public void No_argument_reads_the_key_from_the_environment_variable()
    {
        var parsed = CommandLine.Parse(["config"]).Should().BeOfType<Request.ReadConfig>().Subject;

        parsed.Source.Should().Be(ConfigKeySource.Environment);
    }

    [Fact]
    public void A_dash_reads_the_key_from_stdin()
    {
        var parsed = CommandLine.Parse(["config", "-"]).Should().BeOfType<Request.ReadConfig>().Subject;

        parsed.Source.Should().Be(ConfigKeySource.Stdin);
    }

    [Theory]
    [InlineData(FakeKey)]
    [InlineData("--")]
    [InlineData("anything-at-all")]
    public void A_key_on_the_command_line_is_refused_at_once(string argument)
    {
        // Refused, not deprecated: every release that accepted it would be a release in which a
        // snippet or a script kept leaking the key into every process listing.
        CommandLine.Parse(["config", argument]).Should().BeOfType<Request.Failed>();
    }

    [Fact]
    public void Anything_after_the_dash_is_refused_too()
    {
        CommandLine.Parse(["config", "-", FakeKey]).Should().BeOfType<Request.Failed>();
        CommandLine.Parse(["config", "-", "--", "anything"]).Should().BeOfType<Request.Failed>();
    }

    [Fact]
    public void The_refusal_never_echoes_what_it_was_given()
    {
        // stderr is captured by service managers, CI logs and crash reporters. A refusal that
        // quoted the argument back would copy the key into exactly those places.
        var failed = CommandLine.Parse(["config", FakeKey]).Should().BeOfType<Request.Failed>().Subject;

        failed.Message.Should().NotContain(FakeKey);
        failed.Message.Should().NotContain("FAKE");
        failed.Message.Should().Be(CommandLine.ConfigArgumentRefused, "the refusal is a constant, never built from the input");
    }

    [Fact]
    public void The_refusal_names_both_safe_forms()
    {
        CommandLine.ConfigArgumentRefused.Should().Contain("creds config -");
        CommandLine.ConfigArgumentRefused.Should().Contain("CREDSFORDEVS_KEY");
    }

    [Fact]
    public void The_help_shows_the_two_safe_forms_and_no_argument_form()
    {
        var help = CommandLine.Parse(["--help"]).Should().BeOfType<Request.Help>().Subject;

        help.Text.Should().Contain("creds config -");
        help.Text.Should().Contain("CREDSFORDEVS_KEY");
        help.Text.Should().NotContain("creds config <key>");
    }

    [Fact]
    public void The_help_carries_the_stdin_marker_callers_probe_for()
    {
        // The WSL relay and coai's KeyVault both look for this exact string in --help before they
        // send a key on stdin. Changing its VALUE breaks them, which is why the value is pinned
        // here and not only the reference.
        CommandLine.ConfigStdinMarker.Should().Be("config-key-stdin");
        CommandLine.HelpText.Should().Contain(CommandLine.ConfigStdinMarker);
    }

    [Fact]
    public void The_old_help_does_not_carry_the_marker()
    {
        // The probe is only as good as its negative: the help line every released CLI up to 0.3.0
        // printed must NOT match, or an old binary would be fed a key on stdin it never reads.
        const string OldHelpLine = "  creds config <key>                 print one config file (for an app at startup)";

        OldHelpLine.Should().NotContain(CommandLine.ConfigStdinMarker);
    }

    [Fact]
    public void The_reply_reader_takes_the_body_and_refuses_anything_else()
    {
        // Answering null rather than throwing: this runs at an application's startup, and a stack
        // trace there is the worst possible place for one.
        ConfigBodyReader.Read("{\"format\":\"json\",\"body\":\"{\\\"a\\\":1}\"}").Should().Be("{\"a\":1}");
        ConfigBodyReader.Read("{\"format\":\"json\"}").Should().BeNull();
        ConfigBodyReader.Read("{\"body\":42}").Should().BeNull();
        ConfigBodyReader.Read("not json at all").Should().BeNull();
        ConfigBodyReader.Read("").Should().BeNull();
    }
}
