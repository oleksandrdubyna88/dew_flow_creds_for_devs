using System.Text.Json;
using CredsCli;
using FluentAssertions;

namespace CredsCli.Tests;

/// <summary>
/// `creds ls` — the verb that names no entry.
/// </summary>
/// <remarks>
/// It is the only verb that takes neither a token nor an alias, which makes it the one place the
/// argument parser could plausibly demand something that does not exist. The rest is about what
/// the wire shape may carry: names and kinds, and by design nothing that addresses an entry.
/// </remarks>
public class ListCommandTests
{
    [Fact]
    public void Ls_needs_no_token_and_no_alias()
    {
        var parsed = CommandLine.Parse(["ls"]).Should().BeOfType<Request.Use>().Subject;

        parsed.Verb.Should().Be("ls");
        parsed.Token.Should().BeEmpty();
        parsed.Payload.Should().BeNull();
    }

    [Fact]
    public void Ls_with_an_argument_is_refused_rather_than_ignored()
    {
        // `creds ls prod` reads as "list this one", which is not a thing. Ignoring the argument
        // would answer a different question from the one asked.
        CommandLine.Parse(["ls", "prod"]).Should().BeOfType<Request.Failed>();
        CommandLine.Parse(["ls", "--", "x"]).Should().BeOfType<Request.Failed>();
    }

    [Fact]
    public void Ls_is_not_confused_with_a_verb_that_needs_a_token()
    {
        // The tokenless branch runs before the payload table is consulted; a regression that
        // dropped `ls` out of it would produce "needs a grant token", which is nonsense here.
        CommandLine.Parse(["ssh"]).Should().BeOfType<Request.Failed>()
            .Which.Message.Should().Contain("grant token");
        CommandLine.Parse(["ls"]).Should().BeOfType<Request.Use>();
    }

    [Fact]
    public void The_help_text_mentions_it_before_the_verbs_that_need_a_token()
    {
        // It is the first thing somebody needs: without it they cannot learn a name to pass to
        // any of the others.
        var help = CommandLine.HelpText;

        help.Should().Contain("creds ls");
        help.IndexOf("creds ls", StringComparison.Ordinal)
            .Should().BeLessThan(help.IndexOf("creds terminal", StringComparison.Ordinal));
    }

    [Fact]
    public void The_listing_shape_carries_names_and_kinds_and_nothing_else()
    {
        // The safety argument for an unauthenticated listing rests entirely on this. An
        // accountId or entityId here would hand a local process the addresses it would otherwise
        // have to be given.
        var json = """{"aliases":[{"name":"prod","kind":"ssh"},{"name":"staging-db","kind":"db"}]}""";

        var parsed = JsonSerializer.Deserialize(json, CredsJsonContext.Default.AliasListResponse);

        parsed!.Aliases.Should().HaveCount(2);
        parsed.Aliases![0].Name.Should().Be("prod");
        parsed.Aliases[0].Kind.Should().Be("ssh");

        var round = JsonSerializer.Serialize(parsed, CredsJsonContext.Default.AliasListResponse);
        foreach (var forbidden in new[] { "accountId", "entityId", "secret", "token", "host" })
        {
            round.Should().NotContain(forbidden);
        }
    }

    [Fact]
    public void An_empty_or_absent_list_is_not_a_crash()
    {
        // A window with nothing enabled, and a build that answers without the field at all.
        JsonSerializer.Deserialize("""{"aliases":[]}""", CredsJsonContext.Default.AliasListResponse)!
            .Aliases.Should().BeEmpty();
        JsonSerializer.Deserialize("""{}""", CredsJsonContext.Default.AliasListResponse)!
            .Aliases.Should().BeNull();
    }
}
