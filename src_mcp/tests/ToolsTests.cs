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
