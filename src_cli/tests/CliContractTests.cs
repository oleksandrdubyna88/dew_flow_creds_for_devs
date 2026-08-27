using CredsBroker;
using CredsCli;
using FluentAssertions;

namespace CredsCli.Tests;

/// <summary>
/// What this binary, specifically, promises the shared contract — and the alias grammar that
/// decides whether an argument is a name or a token.
/// </summary>
/// <remarks>
/// <para>Split out of the broker library's own tests when the client became a library shared
/// with <c>creds-mcp</c> (2026-08-27). The library's tests assert what the CONTRACT says; these
/// assert that <b>this</b> binary's verbs and exit codes are all in it, which is a claim about
/// <c>creds</c> and would be false for a second binary with a different verb list.</para>
/// <para>The alias grammar is here for the same reason: it exists so that
/// <c>creds ssh &lt;token&gt;</c> and <c>creds ssh &lt;alias&gt;</c> can share one argument
/// position. That is a fact about this command line, not about the protocol.</para>
/// </remarks>
public sealed class CliContractTests
{
    [Fact]
    public void Every_verb_this_binary_offers_has_a_route_in_the_contract()
    {
        var contract = BrokerContract.Current;

        foreach (var spoken in new[] { "ssh", "terminal", "run", "script", "db", "env", "vpn-up", "vpn-down" })
        {
            var wire = CommandLine.WireVerb(spoken);
            contract.RouteFor(wire).Should().NotBeNull($"`creds {spoken}` posts to the {wire} route");
        }
    }

    [Fact]
    public void Every_exit_code_this_binary_names_exists_in_the_contract()
    {
        // `Exit` falls back to brokerFailure for an unknown name, which is right at runtime and
        // wrong to rely on: a typo would silently report every refusal as 95.
        var contract = BrokerContract.Current;
        var used = new[]
        {
            "usage", "brokerUnreachable", "unknownToken", "denied", "entityGone",
            "busy", "brokerFailure", "consentTimeout", "remoteTimeout", "toolMissing", "refused",
        };

        foreach (var name in used)
        {
            contract.ExitCodes.Should().ContainKey(name);
        }
    }

    [Theory]
    [InlineData("prod-db")]
    [InlineData("a")]
    [InlineData("srv_01")]
    [InlineData("x9")]
    public void A_valid_alias_is_accepted(string name) => AliasName.IsValid(name).Should().BeTrue();

    [Theory]
    [InlineData("")]
    [InlineData("Prod-DB")]
    [InlineData("-leading")]
    [InlineData("has space")]
    [InlineData("semi;colon")]
    [InlineData("dollar$sign")]
    [InlineData("../escape")]
    [InlineData("star*")]
    [InlineData("pipe|")]
    public void An_alias_that_a_shell_could_misread_is_refused(string name) =>
        AliasName.IsValid(name).Should().BeFalse();

    [Fact]
    public void An_alias_never_contains_a_dot_so_it_can_never_be_read_as_a_token()
    {
        // This is what lets `creds ssh <token>` and `creds ssh <alias>` share one argument
        // position: the two grammars cannot overlap.
        AliasName.IsValid("4242.abcdef").Should().BeFalse();
        GrantToken.Parse("prod-db").Should().BeNull();
    }

    [Fact]
    public void An_over_long_alias_is_refused()
    {
        AliasName.IsValid(new string('a', AliasName.MaxLength)).Should().BeTrue();
        AliasName.IsValid(new string('a', AliasName.MaxLength + 1)).Should().BeFalse();
    }
}
