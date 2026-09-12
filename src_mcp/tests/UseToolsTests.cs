using System.Text.Json;
using CredsBroker;
using CredsMcp;
using FluentAssertions;

namespace CredsMcp.Tests;

/// <summary>
/// The catalog an agent reads before it decides what to do.
/// </summary>
/// <remarks>
/// <para>A tool description is not documentation: it is the only thing a model sees before
/// choosing whether to call, and the two facts that change its behaviour most are that a human
/// will be asked and that a secret is not obtainable. A model that does not know the first writes
/// a plan that batches twenty calls; one that does not know the second spends a turn asking for a
/// password. So the descriptions are asserted rather than assumed.</para>
/// <para>The wire itself is covered end to end by `scripts/creds-mcp-itest.cjs`, which drives the
/// real binary against a real broker through a real consent modal.</para>
/// </remarks>
public sealed class UseToolsTests
{
    [Fact]
    public void Every_action_maps_to_a_route_under_the_contract_s_own_prefix()
    {
        var contract = BrokerContract.Current;

        foreach (var tool in UseTools.All.Where(t => !t.OwnRoute))
        {
            contract.McpUseRoute(tool.Action).Should().Be($"/v1/mcp/use/{tool.Action}");
        }
        // Two exceptions, and both are in the contract. Deleting is not a use of a credential,
        // and creating names no entry at all — there is not one yet.
        UseTools.All.Where(t => t.OwnRoute).Select(t => t.Name).Should().BeEquivalentTo("creds_delete", "creds_create");
        contract.DeleteRoute().Should().Be("/v1/mcp/delete");
        contract.CreateRoute().Should().Be("/v1/mcp/create");
    }

    [Fact]
    public void Every_action_is_a_verb_the_broker_already_routes()
    {
        // The actions are the broker's vocabulary, not a second one invented here. A name that is
        // in no route would 404 at the far end, and the person would be told the entry is gone.
        // `McpActions` and not `Routes`: the CLI's verb table has no `rotate`.
        var known = (BrokerContract.Current.McpActions ?? []).ToHashSet(StringComparer.Ordinal);

        foreach (var tool in UseTools.All.Where(t => !t.OwnRoute))
        {
            known.Should().Contain(tool.Action, $"{tool.Name} posts {tool.Action}");
        }
    }

    [Fact]
    public void Tool_names_are_unique_and_prefixed_so_they_cannot_collide_with_another_server_s()
    {
        var names = UseTools.All.Select(t => t.Name).Append(Tools.ListName).ToArray();

        names.Should().OnlyHaveUniqueItems();
        names.Should().AllSatisfy(n => n.Should().StartWith("creds_"));
    }

    [Fact]
    public void Every_description_says_a_human_will_be_asked()
    {
        // The fact that changes a plan most. Without it a model batches calls and turns one
        // approval into twenty prompts, which is how a person learns to click Allow without reading.
        // On the WORD, not on four hand-listed phrasings. The first version of this listed the
        // exact sentences in use and went red on a fifth that said the same thing — an assertion
        // about wording where the claim is about a fact.
        foreach (var tool in UseTools.All)
        {
            tool.Description
                .Should()
                .Contain("approve", $"{tool.Name} must tell the model a human is asked");
        }
    }

    [Fact]
    public void Every_description_names_the_argument_it_needs()
    {
        foreach (var tool in UseTools.All)
        {
            tool.Description.Should().Contain("creds_list", $"{tool.Name} must say where an id comes from");
            tool.Title.Should().NotBeEmpty();
        }
    }

    [Fact]
    public void The_secret_promise_is_repeated_where_it_could_be_doubted()
    {
        // The three that touch a stored secret most directly say what happens to it. `run` and the
        // VPN pair do not need to: there is no secret in a saved command, and a config file is
        // never handed over either way.
        Named("creds_exec").Description.Should().Contain("never receive the key");
        Named("creds_query").Description.Should().Contain("never reaches you");
        Named("creds_export_env").Description.Should().Contain("never their values");
    }

    [Fact]
    public async Task An_empty_entry_id_is_refused_here_rather_than_sent()
    {
        // A tool call with nothing in it must not become a request. The broker would refuse it,
        // but only after a round trip that says nothing useful to the model.
        var answer = await UseTools.InvokeAsync(BrokerContract.Current, Named("creds_exec"), Caller, "  ", "command", "ls");

        answer.Should().Contain("No entry id was given");
        answer.Should().Contain("creds_list");
    }

    private static readonly CallerRecord Caller = new("Claude Code 2.1.268", "98bf9f23", "clauderag-d6", "ClaudeRag");

    private static string[] Keys(string json)
    {
        using var doc = JsonDocument.Parse(json);
        return [.. doc.RootElement.EnumerateObject().Select(p => p.Name)];
    }

    // ---- T11: the body carries the caller, and still ONLY the named fields ----------------------

    [Fact]
    public void A_use_body_is_the_entry_the_one_extra_field_and_the_caller_and_nothing_else()
    {
        var body = UseTools.Body(BrokerContract.Current, Caller, "e-1", "command", "uname -a");

        Keys(body).Should().Equal("entry", "command", "caller");
        using var doc = JsonDocument.Parse(body);
        doc.RootElement.GetProperty("caller").EnumerateObject().Select(p => p.Name).Should().Equal("agent", "session", "sessionName", "cwd");
        doc.RootElement.GetProperty("caller").GetProperty("agent").GetString().Should().Be("Claude Code 2.1.268");
        doc.RootElement.GetProperty("caller").GetProperty("session").GetString().Should().Be("98bf9f23");
    }

    [Fact]
    public void A_body_with_no_extra_field_and_no_caller_is_the_entry_alone_as_it_always_was()
    {
        // The old wire, byte for byte: an old window meets exactly what it met before.
        UseTools.Body(BrokerContract.Current, CallerRecord.Empty, "e-1", null, null).Should().Be("""{"entry":"e-1"}""");
    }

    [Fact]
    public void A_rotate_body_carries_its_named_fields_and_the_caller_and_nothing_else()
    {
        var body = UseTools.RotateBody(BrokerContract.Current, Caller, "e-1", "ALTER USER app IDENTIFIED BY '{{creds:new}}'", "passphrase", [("words", "5"), ("separator", "")]);

        Keys(body).Should().Equal("entry", "statement", "secretKind", "words", "separator", "caller");
    }

    [Fact]
    public void A_create_body_carries_its_named_fields_and_the_caller_and_nothing_else()
    {
        var body = UseTools.CreateBody(BrokerContract.Current, Caller, "app-03", "ssh", null, "k", null, "app-03.internal", null, 22, null);

        Keys(body).Should().Equal("name", "kind", "secret", "host", "port", "caller");
    }

    [Fact]
    public void The_caller_field_is_named_by_the_contract_and_shaped_as_the_contract_declares()
    {
        var contract = BrokerContract.Current;
        var body = UseTools.Body(contract, Caller, "e-1", null, null);

        using var doc = JsonDocument.Parse(body);
        doc.RootElement.GetProperty(contract.CallerField()).EnumerateObject().Select(p => p.Name)
            .Should().Equal(contract.Caller!.Fields);
    }

    private static UseTools.UseTool Named(string name) =>
        UseTools.All.Single(t => t.Name == name);
}
