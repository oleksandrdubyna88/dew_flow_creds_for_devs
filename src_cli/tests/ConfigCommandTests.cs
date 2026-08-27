using CredsCli;
using FluentAssertions;

namespace CredsCli.Tests;

/// <summary>
/// <c>creds config &lt;key&gt;</c> — one config file, for an application reading it at startup.
/// </summary>
/// <remarks>
/// Its own request shape rather than a <see cref="Request.Use"/> with a differently-parsed second
/// argument, because a config key is not a grant token: a grant carries the window's port in its
/// own text and dies with that window, while this outlives it and carries nothing. Making them one
/// shape would have hidden that difference behind a field.
/// </remarks>
public class ConfigCommandTests
{
    [Fact]
    public void The_verb_takes_a_key_and_nothing_else()
    {
        var parsed = CommandLine.Parse(["config", "cfgk_abc"]).Should().BeOfType<Request.ReadConfig>().Subject;

        parsed.Key.Should().Be("cfgk_abc");
    }

    [Fact]
    public void A_key_is_required_and_a_payload_is_refused()
    {
        // There is nothing to say after the key: it names the entry, and the whole document comes
        // back. A `--` here would be a shape somebody expects to work and it never would.
        CommandLine.Parse(["config"]).Should().BeOfType<Request.Failed>();
        CommandLine.Parse(["config", "cfgk_abc", "--", "anything"]).Should().BeOfType<Request.Failed>();
    }

    [Fact]
    public void The_refusal_names_where_the_key_came_from()
    {
        // Somebody typing this has either not enabled code access or lost the key, and both are
        // fixed in the same place. "Wrong number of arguments" would send them to the wrong one.
        var failed = CommandLine.Parse(["config"]).Should().BeOfType<Request.Failed>().Subject;

        failed.Message.Should().Contain("code access");
    }

    [Fact]
    public void It_is_listed_in_the_help_beside_the_verbs_that_take_a_token()
    {
        // The help is the only place the difference between a key and a token is visible before
        // somebody gets it wrong, so the line has to be there and has to say "key".
        var help = CommandLine.Parse(["--help"]).Should().BeOfType<Request.Help>().Subject;

        help.Text.Should().Contain("creds config <key>");
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
