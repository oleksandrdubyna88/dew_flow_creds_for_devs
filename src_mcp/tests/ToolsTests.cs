using CredsBroker;
using CredsMcp;
using FluentAssertions;

namespace CredsMcp.Tests;

/// <summary>
/// What this binary decides on its own, tested without a window.
/// </summary>
/// <remarks>
/// <para>Most of what <c>creds_list</c> does is ask somebody else and pass the answer on, and
/// that whole path is covered end to end by <c>scripts/creds-mcp-itest.cjs</c>, which runs the
/// real binary against a real broker over real stdio. What is left here is the part with a
/// decision in it: merging several windows' answers, and surviving one that answers something
/// this build cannot read.</para>
/// <para>That last case is not hypothetical. Two binaries and an extension version
/// independently — the whole reason each has its own release tag — so a window running a newer
/// extension answering a shape this build does not know is the normal state of affairs a week
/// after any release.</para>
/// </remarks>
public sealed class ToolsTests
{
    private static string Body(params string[] ids) =>
        $$"""
          { "entries": [ {{string.Join(",", ids.Select(One))}} ] }
          """;

    private static string One(string id) =>
        $$"""
          { "id": "{{id}}", "name": "{{id}}-name", "kind": "db", "folder": "F",
            "hasPassword": true, "hasPrivateKey": false, "hasNotes": false, "hasTotp": false }
          """;

    [Fact]
    public void One_window_s_entries_come_back_in_order()
    {
        var merged = Tools.Merge([Body("a", "b")]);

        merged.Select(e => e.Id).Should().Equal("a", "b");
        merged[0].Name.Should().Be("a-name");
    }

    [Fact]
    public void The_same_vault_open_in_two_windows_is_listed_once()
    {
        // The case this merge exists for. An agent reading the same database twice would
        // reasonably conclude there are two of them.
        var merged = Tools.Merge([Body("a", "b"), Body("b", "c")]);

        merged.Select(e => e.Id).Should().Equal("a", "b", "c");
    }

    [Fact]
    public void The_first_window_wins_because_windows_are_asked_newest_first()
    {
        var older = """{ "entries": [ { "id": "a", "name": "stale", "kind": "db", "folder": "F" } ] }""";
        var newer = """{ "entries": [ { "id": "a", "name": "current", "kind": "db", "folder": "F" } ] }""";

        Tools.Merge([newer, older]).Single().Name.Should().Be("current");
    }

    [Fact]
    public void A_window_answering_something_unreadable_does_not_take_the_others_with_it()
    {
        // Versioned independently, so this is the ordinary state of affairs rather than a fault:
        // one window on a newer extension must not cost an agent the answers it could have had.
        var merged = Tools.Merge(["{ not json at all", Body("a")]);

        merged.Select(e => e.Id).Should().Equal("a");
    }

    [Fact]
    public void A_window_with_nothing_opened_contributes_nothing_rather_than_failing()
    {
        Tools.Merge(["""{ "entries": [] }""", "{}"]).Should().BeEmpty();
    }

    [Fact]
    public void Fields_this_build_does_not_know_are_dropped_rather_than_refused()
    {
        var fromTheFuture =
            """{ "entries": [ { "id": "a", "name": "n", "kind": "db", "folder": "F", "somethingNew": 42 } ] }""";

        Tools.Merge([fromTheFuture]).Single().Name.Should().Be("n");
    }

    [Fact]
    public void The_capabilities_arrive_as_the_booleans_they_are()
    {
        var body =
            """
            { "entries": [ { "id": "a", "name": "n", "kind": "ssh", "folder": "F",
              "can": { "use": true, "edit": false, "create": false, "delete": true } } ] }
            """;

        var can = Tools.Merge([body]).Single().Can;

        can.Should().NotBeNull();
        can!.Use.Should().BeTrue();
        can.Delete.Should().BeTrue();
        can.Edit.Should().BeFalse();
    }

    [Fact]
    public void The_tool_description_says_what_cannot_be_asked_for()
    {
        // The description is the only thing a model reads before deciding whether to try. It has
        // to say that a secret is not obtainable, or the model will spend a turn asking.
        // Asserted on phrases that cannot wrap. The first version of this test looked for
        // "empty list" and went red against a description that says exactly that — with the line
        // break the raw string literal put between the two words.
        Tools.ListDescription.Should().Contain("never get a password");
        Tools.ListDescription.Should().Contain("nothing has been opened to you");
        Tools.ListName.Should().Be("creds_list");
    }
}

/// <summary>
/// The config-snippet tool's own decisions (tails T10): the description that teaches the
/// boundary, and the first-window-that-recognises rule.
/// </summary>
public sealed class ConfigSnippetToolTests
{
    [Fact]
    public void TheDescriptionTeachesTheBoundary_NotJustTheHappyPath()
    {
        // What stops a model from hunting for a way around the wall is the wall being stated.
        Tools.ConfigSnippetDescription.Should().Contain("never read the config");
        Tools.ConfigSnippetDescription.Should().Contain("never mint the key");
        Tools.ConfigSnippetDescription.Should().Contain("Enable Code Access");
        Tools.ConfigSnippetDescription.Should().Contain("codeAccessEnabled");
    }

    [Fact]
    public void TheToolNameFollowsTheFamily()
    {
        Tools.ConfigSnippetName.Should().Be("creds_config_snippet");
    }
}

/// <summary>
/// Which of the two empty answers a read gets — the one defect here that costs an afternoon.
/// </summary>
/// <remarks>
/// <para>Reading no body has two causes and one of them used to be unspeakable. "No window
/// answered" is true when every announced window is gone. It is FALSE when a window passed our
/// health probe and then declined the route, and that is the case <c>creds_folders</c> lived in
/// from 0.85.0 to 0.89.0: the listing sat behind POST while every client GETs it, so a 404 from
/// a perfectly healthy window arrived at the person as a closed one — and the hint invented a
/// number of windows that had "probably been closed" while the same window answered
/// <c>creds_list</c> in the same second.</para>
/// </remarks>
public sealed class NoAnswerTests
{
    [Fact]
    public void NothingAnswered_ReadsAsNoWindow()
    {
        var answer = Tools.NoAnswer(0);

        Answer.IsRefusal(answer).Should().BeTrue();
        answer.Should().Contain("No CredsForDevs window answered");
    }

    [Fact]
    public void AWindowThatDeclinedTheRoute_IsNotReportedAsAClosedWindow()
    {
        // The whole point: it answered. Telling someone to open a window they are looking at is
        // worse than saying nothing, because it is a direction they can follow and it goes nowhere.
        var answer = Tools.NoAnswer(1);

        Answer.IsRefusal(answer).Should().BeTrue();
        answer.Should().NotContain("No CredsForDevs window answered");
        answer.Should().NotContain("probably been closed");
        answer.Should().Contain("does not serve that request");
        answer.Should().Contain("it is open and listening");
        answer.Should().Contain("update the CredsForDevs");
    }
}

/// <summary>
/// The kind catalogue — what an agent is told exists, and that the relay names kinds from ONE place.
/// </summary>
/// <remarks>
/// <para>Two descriptions each carried a hand-typed list of kinds, and both had drifted from the
/// window's <c>ENTITY_KINDS</c> by the time anyone looked (plan §2.4). A literal a human keeps in
/// step is a literal that stops being in step; so the lists are read from the embedded contract,
/// which the window's own code generates, and this asserts the description's words are exactly
/// those. The emitter enumerates, the consumer compares — the testing rule for a contract with two
/// implementations.</para>
/// </remarks>
public sealed class KindCatalogTests
{
    /// <summary>The comma-separated words inside the parentheses that follow the named argument.</summary>
    private static string[] ListedAfter(string description, string marker)
    {
        var start = description.IndexOf(marker, StringComparison.Ordinal);
        start.Should().BeGreaterThanOrEqualTo(0, $"the description names the list after \"{marker}\"");
        var open = description.IndexOf('(', start);
        var close = description.IndexOf(')', open);
        return [.. description[(open + 1)..close].Replace("\n", " ").Split(',').Select(w => w.Trim().TrimStart("or ".ToCharArray()).Trim())];
    }

    [Fact]
    public void The_create_description_names_exactly_the_kinds_the_contract_says_an_agent_may_create()
    {
        var expected = BrokerContract.Current.AgentCreatableKinds;
        expected.Should().NotBeNullOrEmpty("the contract names the creatable kinds — regenerate it with npm run contract");

        var listed = ListedAfter(UseTools.All.Single(t => t.Name == "creds_create").Description, "a `kind`");

        listed.Should().Equal(expected);
        listed.Should().NotContain("payment", "D-A: an agent cannot create a payment entry");
    }

    [Fact]
    public void The_folder_type_description_names_every_creatable_kind_and_any_from_the_same_list()
    {
        var expected = BrokerContract.Current.AgentCreatableKinds!.Append("any");

        var listed = ListedAfter(FolderTools.CreateDescription, "`folderType`");

        listed.Should().Equal(expected);
    }

    [Fact]
    public void The_two_catalogue_tools_exist_and_say_that_nothing_else_can_be_set()
    {
        Tools.KindsName.Should().Be("creds_kinds");
        Tools.KindHelpName.Should().Be("creds_kind_help");
        Tools.KindsDescription.Should().Contain("creds_kind_help");
        Tools.KindHelpDescription.Should().Contain("cannot be set by you");
        Tools.KindHelpDescription.Should().Contain("payment");
    }

    [Fact]
    public void The_create_description_says_to_look_at_the_folder_first_and_lists_no_switch()
    {
        var description = UseTools.All.Single(t => t.Name == "creds_create").Description;

        description.Should().Contain("`holds`");
        description.Should().Contain("`fields`");
        description.Should().Contain("creds_kind_help");
        description.Should().NotContain("mcp", "the switches are never named to an agent (O4)");
    }

    [Fact]
    public void The_folder_listing_description_explains_holds_and_fields()
    {
        FolderTools.ListDescription.Should().Contain("`holds`");
        FolderTools.ListDescription.Should().Contain("`fields`");
        FolderTools.ListDescription.Should().Contain("creds_kinds");
    }

    [Fact]
    public void A_folder_answer_with_holds_and_fields_is_read_through_rather_than_dropped()
    {
        // The relay parses and re-serialises the window's answer, so a field this build does not
        // declare is a field the agent never sees — which is exactly how `folderType` would have
        // stayed invisible had it not been declared.
        var body =
            """
            { "folders": [ { "id": "f1", "name": "Commands", "parent": null, "folderType": "terminal",
              "holds": "terminal", "fields": [ { "name": "command", "required": true, "summary": "the base command" } ],
              "can": { "create": true, "edit": true, "delete": false } } ] }
            """;

        var folder = FolderTools.Merge([body]).Single();

        folder.Holds.Should().Be("terminal");
        folder.Fields.Should().ContainSingle().Which.Name.Should().Be("command");
        folder.Fields![0].Required.Should().BeTrue();
    }

    [Fact]
    public void A_refused_request_passes_the_window_sentence_on_and_says_nothing_was_done()
    {
        // Before `fields`, an invalid request fell to the catch-all hint — "the window's own log has
        // the detail" — which sends an agent to a log it cannot read, for a refusal whose message
        // already names the field to fix.
        var reply = new BrokerReply(400, """{ "error": { "code": "invalid_request", "message": "`host` is not a field of a terminal entry." } }""");

        var answer = FailureOf(UseTools.Refused(reply));

        answer.Error.Should().Be("`host` is not a field of a terminal entry.");
        answer.Hint.Should().Contain("Nothing was done");
        answer.Hint.Should().Contain("creds_kind_help");
    }

    [Fact]
    public void A_kind_no_agent_may_create_is_not_answered_with_only_advice_to_turn_a_switch_on()
    {
        // D-A: payment is refused as a policy (`denied`), and the generic denied hint alone — "turn
        // the switch on" — would send the agent to ask for a switch that opens nothing here.
        var reply = new BrokerReply(403, """{ "error": { "code": "denied", "message": "A payment entry cannot be created by an agent. Ask the person to add the card or account themselves in VS Code." } }""");

        var answer = FailureOf(UseTools.Refused(reply));

        answer.Error.Should().StartWith("A payment entry cannot be created by an agent.");
        answer.Hint.Should().Contain("cannot be done by an agent");
    }

    private static ToolFailure FailureOf(string json) =>
        System.Text.Json.JsonSerializer.Deserialize(json, McpJsonContext.Default.ToolFailure)!;
}
