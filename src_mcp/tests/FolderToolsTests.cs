using System.Text.Json;
using CredsBroker;
using CredsMcp;
using FluentAssertions;

namespace CredsMcp.Tests;

/// <summary>
/// The folder bodies — which until this file had no unit test at all.
/// </summary>
/// <remarks>
/// What is worth pinning is the SET of keys. The no-escalation rule on this side is structural: a
/// model cannot add a key to a body it does not compose, and that holds only while the body is
/// exactly the named fields plus the caller label and nothing else. A body that carried one extra
/// key would be the first crack in it.
/// </remarks>
public sealed class FolderToolsTests
{
    private static readonly CallerRecord Caller = new("Claude Code 2.1.268", "98bf9f23", "clauderag-d6", "ClaudeRag");

    private static string[] Keys(string json)
    {
        using var doc = JsonDocument.Parse(json);
        return [.. doc.RootElement.EnumerateObject().Select(p => p.Name)];
    }

    [Fact]
    public void A_folder_body_is_the_named_fields_plus_the_caller_and_nothing_else()
    {
        var body = FolderTools.Body(BrokerContract.Current, Caller, [("name", "staging"), ("parent", "f-open"), ("folderType", null)]);

        Keys(body).Should().Equal("name", "parent", "caller");
        using var doc = JsonDocument.Parse(body);
        doc.RootElement.GetProperty("name").GetString().Should().Be("staging");
        doc.RootElement.GetProperty("caller").EnumerateObject().Select(p => p.Name).Should().Equal("agent", "session", "sessionName", "cwd");
        doc.RootElement.GetProperty("caller").GetProperty("sessionName").GetString().Should().Be("clauderag-d6");
    }

    [Fact]
    public void A_blank_field_is_left_out_rather_than_sent_empty()
    {
        var body = FolderTools.Body(BrokerContract.Current, Caller, [("folder", "f-1"), ("name", "  "), ("parent", null)]);

        Keys(body).Should().Equal("folder", "caller");
    }

    [Fact]
    public void An_empty_caller_record_sends_no_caller_field_so_the_window_says_an_agent()
    {
        var body = FolderTools.Body(BrokerContract.Current, CallerRecord.Empty, [("folder", "f-1")]);

        Keys(body).Should().Equal("folder");
    }

    [Fact]
    public void The_caller_field_is_named_by_the_contract_not_by_this_file()
    {
        var body = FolderTools.Body(BrokerContract.Current, Caller, [("folder", "f-1")]);

        Keys(body).Should().Contain(BrokerContract.Current.CallerField());
    }
}
