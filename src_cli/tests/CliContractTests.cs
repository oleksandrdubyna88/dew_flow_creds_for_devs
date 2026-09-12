using System.Text.Json;
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

    // ---- T11: every body this binary posts carries the caller, and still only its named fields ----

    private static readonly CallerRecord Caller = new("creds CLI", "98bf9f23", "clauderag-d6", "ClaudeRag");

    private static string[] Keys(string json)
    {
        using var doc = JsonDocument.Parse(json);
        return [.. doc.RootElement.EnumerateObject().Select(p => p.Name)];
    }

    [Fact]
    public void The_cli_names_itself_creds_CLI_and_never_a_product_it_is_not()
    {
        // Not `creds CLI <version>`: the binary is not version-stamped at publish, so a version
        // here would read `1.0.0` on every release, which is worse than none (plan §5.4).
        Program.CliAgent.Should().Be("creds CLI");
    }

    [Fact]
    public void An_alias_body_carries_the_alias_its_payload_and_the_caller_and_nothing_else()
    {
        Keys(Program.AliasBody("prod", "exec", "uname -a", Caller)).Should().Equal("alias", "command", "caller");
        Keys(Program.AliasBody("prod", "db", "select 1", Caller)).Should().Equal("alias", "query", "caller");
        Keys(Program.AliasBody("prod", "terminal", null, Caller)).Should().Equal("alias", "caller");
    }

    [Fact]
    public void A_token_body_carries_the_payload_and_the_caller_and_nothing_else()
    {
        Keys(Program.RequestBody("exec", "uname -a", Caller)).Should().Equal("command", "caller");
        Keys(Program.RequestBody("db", "select 1", Caller)).Should().Equal("query", "caller");
        Keys(Program.RequestBody("terminal", null, Caller)).Should().Equal("caller");
    }

    [Fact]
    public void The_caller_object_is_the_contract_s_four_fields_in_the_contract_s_order()
    {
        using var doc = JsonDocument.Parse(Program.AliasBody("prod", "exec", "uptime", Caller));

        var caller = doc.RootElement.GetProperty(BrokerContract.Current.CallerField());
        caller.EnumerateObject().Select(p => p.Name).Should().Equal(BrokerContract.Current.Caller!.Fields);
        caller.GetProperty("agent").GetString().Should().Be("creds CLI");
        caller.GetProperty("cwd").GetString().Should().Be("ClaudeRag");
    }

    [Fact]
    public void An_empty_record_sends_no_caller_field_so_an_old_wire_is_byte_for_byte_the_old_wire()
    {
        Program.RequestBody("terminal", null, CallerRecord.Empty).Should().Be("{}");
        Program.AliasBody("prod", "exec", "uptime", CallerRecord.Empty).Should().Be("""{"alias":"prod","command":"uptime"}""");
    }
}
