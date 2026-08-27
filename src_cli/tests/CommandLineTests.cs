using CredsBroker;
using CredsCli;
using FluentAssertions;

namespace CredsCli.Tests;

/// <summary>
/// Argument parsing, and the token format — the two places where this implementation could
/// disagree with the Node one without anything failing loudly.
/// </summary>
public class CommandLineTests
{
    [Fact]
    public void A_command_after_the_separator_is_taken_verbatim()
    {
        // Measured on the Node side across git-bash, PowerShell 5.1 and cmd.exe: all three
        // deliver the quoted whole as one argument. We must not re-quote or re-split it.
        var parsed = CommandLine.Parse(["ssh", "4242.abcdef", "--", "docker ps --format '{{.Names}}'"]);

        parsed.Should().BeOfType<Request.Use>()
            .Which.Payload.Should().Be("docker ps --format '{{.Names}}'");
    }

    [Fact]
    public void Several_words_after_the_separator_are_rejoined_with_single_spaces()
    {
        var parsed = (Request.Use)CommandLine.Parse(["ssh", "1.aa", "--", "uname", "-a"]);

        parsed.Payload.Should().Be("uname -a");
    }

    [Fact]
    public void Ssh_without_a_command_is_refused_rather_than_run_empty()
    {
        CommandLine.Parse(["ssh", "1.aa"]).Should().BeOfType<Request.Failed>();
    }

    [Fact]
    public void A_verb_that_takes_no_command_refuses_one_instead_of_dropping_it()
    {
        // Silently ignoring it would run something other than what was typed — the entry's
        // saved command, while the person believes theirs ran.
        CommandLine.Parse(["run", "1.aa", "--", "rm -rf /"]).Should().BeOfType<Request.Failed>();
    }

    [Fact]
    public void An_unknown_verb_names_itself_and_points_at_help()
    {
        var failed = CommandLine.Parse(["frobnicate", "1.aa"]).Should().BeOfType<Request.Failed>().Subject;

        failed.Message.Should().Contain("frobnicate").And.Contain("--help");
    }

    [Fact]
    public void No_arguments_prints_help_rather_than_an_error()
    {
        CommandLine.Parse([]).Should().BeOfType<Request.Help>();
    }

    [Fact]
    public void Ssh_posts_to_the_exec_route_because_that_is_what_the_broker_calls_it()
    {
        CommandLine.WireVerb("ssh").Should().Be("exec");
        CommandLine.WireVerb("db").Should().Be("db");
    }

    [Theory]
    [InlineData("4242.abcdef", 4242, "abcdef")]
    [InlineData("1.a", 1, "a")]
    [InlineData("65535.A-b_c", 65535, "A-b_c")]
    public void A_well_formed_token_parses(string raw, int port, string secret)
    {
        var token = GrantToken.Parse(raw);

        token.Should().NotBeNull();
        token!.Port.Should().Be(port);
        token.Secret.Should().Be(secret);
    }

    [Theory]
    // Every one of these is refused by grantToken.ts too. The signed and padded forms are the
    // reason this parser does not use int.TryParse on its own: that accepts " +80" and "80 ",
    // which the extension's regex does not, and the port half decides where a secret is sent.
    [InlineData("")]
    [InlineData("nodot")]
    [InlineData(".secret")]
    [InlineData("4242.")]
    [InlineData("+4242.abcdef")]
    [InlineData(" 4242.abcdef")]
    [InlineData("4242 .abcdef")]
    [InlineData("0.abcdef")]
    [InlineData("65536.abcdef")]
    [InlineData("-1.abcdef")]
    [InlineData("4242.abc def")]
    [InlineData("4242.abc+def")]
    [InlineData("4242.abc/def")]
    [InlineData("4242.abc=")]
    public void A_malformed_token_is_refused_rather_than_guessed_at(string raw)
    {
        GrantToken.Parse(raw).Should().BeNull();
    }

    [Fact]
    public void A_base64url_secret_of_any_length_is_accepted_because_the_extension_accepts_it()
    {
        // The extension's rule is a charset, not a length. Inventing a minimum here would
        // refuse tokens the window considers valid, which reads to the user as a broken CLI.
        GrantToken.Parse("80.x").Should().NotBeNull();
    }
}
