using System.Text;
using System.Text.Json;
using CredsBroker;
using FluentAssertions;

namespace CredsBroker.Tests;

/// <summary>
/// Who is calling, as the two binaries work it out — and every way that working-out can fail.
/// </summary>
/// <remarks>
/// <para>The record is a LABEL. Nothing here decides anything with it; what these tests pin is
/// that the label is built from the right sources in the right order, that a missing or hostile
/// source leaves a field empty rather than throwing, and — the one rule with a security shape —
/// that the session-file read opens exactly one file under <c>~/.claude/sessions/</c> and never
/// another, because <c>.key</c> files live in that directory.</para>
/// <para>Every source is injected: the environment is a function, the file is a function, the
/// home and the process folder are strings. No test here touches a filesystem.</para>
/// </remarks>
public sealed class CallerIdentityTests
{
    private const string Home = "/home/strug";
    private const string Session = "98bf9f23-81ff-4bba-beaf-1fd8269ddc97";

    private static Func<string, string?> Env(params (string Name, string? Value)[] pairs) =>
        name => pairs.FirstOrDefault(p => p.Name == name).Value;

    /// <summary>A file reader that remembers every path it was asked for.</summary>
    private sealed class RecordingReader(string? content)
    {
        internal List<string> Asked { get; } = [];

        internal string? Read(string path)
        {
            Asked.Add(path);
            return content;
        }
    }

    private const string GoodFile =
        """{"pid":29960,"sessionId":"98bf9f23-81ff-4bba-beaf-1fd8269ddc97","cwd":"d:\\rsd\\ClaudeRag","name":"clauderag-d6","nameSource":"derived","kind":"interactive","version":"2.1.268"}""";

    // ---- the ladder (T7) --------------------------------------------------------------------

    [Fact]
    public void The_ladder_is_creds_then_claude_then_codex_then_gemini_and_the_first_non_blank_wins()
    {
        CallerIdentity.SessionLadder.Should().Equal(
            "CREDS_CALLER_SESSION", "CLAUDE_CODE_SESSION_ID", "CODEX_SESSION_ID", "GEMINI_CLI_SESSION_ID");

        CallerIdentity.SessionFrom(Env(("CLAUDE_CODE_SESSION_ID", "claude-1"), ("CODEX_SESSION_ID", "codex-1")))
            .Should().Be("claude-1");
        CallerIdentity.SessionFrom(Env(("CREDS_CALLER_SESSION", "mine"), ("CLAUDE_CODE_SESSION_ID", "claude-1")))
            .Should().Be("mine", "an explicit override comes first so a client without an id of its own can be given one");
        CallerIdentity.SessionFrom(Env(("GEMINI_CLI_SESSION_ID", "gem-1"))).Should().Be("gem-1");
    }

    [Fact]
    public void A_blank_rung_is_skipped_rather_than_taken()
    {
        CallerIdentity.SessionFrom(Env(("CREDS_CALLER_SESSION", "   "), ("CLAUDE_CODE_SESSION_ID", "claude-1")))
            .Should().Be("claude-1");
        CallerIdentity.SessionFrom(Env(("CLAUDE_CODE_SESSION_ID", ""), ("CODEX_SESSION_ID", " codex-1 ")))
            .Should().Be("codex-1", "and the value is trimmed");
    }

    [Fact]
    public void An_all_blank_ladder_empties_only_the_session_and_its_name_the_cli_keeps_its_label_and_folder()
    {
        // The first draft said "every field", which would have turned a person's own `creds` call
        // in a plain terminal into "An agent". Their terminal reads "creds CLI · in ClaudeRag".
        var reader = new RecordingReader(GoodFile);
        var record = CallerIdentity.Build("creds CLI", Env(("CLAUDE_PID", "29960")), reader.Read, Home, "/home/strug/ClaudeRag");

        record.Agent.Should().Be("creds CLI");
        record.Session.Should().BeEmpty();
        record.SessionName.Should().BeEmpty("a session NAME without a session id would be a name for nothing");
        record.Cwd.Should().Be("ClaudeRag");
        reader.Asked.Should().BeEmpty("with no session there is no session file to look for");
        record.IsEmpty.Should().BeFalse();
    }

    [Fact]
    public void The_session_is_shortened_to_eight_characters_because_it_is_a_label_not_a_key()
    {
        var record = CallerIdentity.Build("", Env(("CLAUDE_CODE_SESSION_ID", Session)), _ => null, Home, "/x/ClaudeRag");

        record.Session.Should().Be("98bf9f23");
        CallerIdentity.Build("", Env(("CODEX_SESSION_ID", "abc")), _ => null, Home, "/x").Session
            .Should().Be("abc", "a value shorter than the cut is used whole");
    }

    // ---- the session file (T8) ------------------------------------------------------------

    [Fact]
    public void A_good_session_file_yields_the_name_and_the_basename_of_its_cwd()
    {
        var reader = new RecordingReader(GoodFile);
        var record = CallerIdentity.Build("", Env(("CLAUDE_CODE_SESSION_ID", Session), ("CLAUDE_PID", "29960")), reader.Read, Home, "/somewhere/else");

        record.SessionName.Should().Be("clauderag-d6");
        record.Cwd.Should().Be("ClaudeRag", "the file holds the full path, and a full local path in a modal is a leak the label must not carry");
    }

    [Fact]
    public void Only_pid_json_is_ever_opened_and_no_other_path()
    {
        // `.key` files live beside the session files. The directory is never enumerated and no
        // other extension is ever opened — asserted by recording every path the reader saw.
        var reader = new RecordingReader(GoodFile);
        CallerIdentity.Build("", Env(("CLAUDE_CODE_SESSION_ID", Session), ("CLAUDE_PID", "29960")), reader.Read, Home, "/x");

        reader.Asked.Should().Equal(Path.Combine(Home, ".claude", "sessions", "29960.json"));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("29960.4c14beca.key")]
    [InlineData("../sessions/29960")]
    [InlineData("-1")]
    [InlineData("12345678901")]
    [InlineData("0x7500")]
    public void A_pid_that_is_not_one_to_ten_digits_opens_nothing_at_all(string pid)
    {
        // The pid comes from the environment, and a path segment built from environment data is
        // exactly the shape that is repeatedly mis-sanitised. Digits only, or no read.
        var reader = new RecordingReader(GoodFile);
        var record = CallerIdentity.Build("", Env(("CLAUDE_CODE_SESSION_ID", Session), ("CLAUDE_PID", pid)), reader.Read, Home, "/x/ClaudeRag");

        reader.Asked.Should().BeEmpty();
        record.SessionName.Should().BeEmpty();
        record.Cwd.Should().Be("ClaudeRag", "the process folder is the fallback");
    }

    [Fact]
    public void A_missing_pid_variable_opens_nothing()
    {
        var reader = new RecordingReader(GoodFile);
        CallerIdentity.Build("", Env(("CLAUDE_CODE_SESSION_ID", Session)), reader.Read, Home, "/x");

        reader.Asked.Should().BeEmpty();
    }

    [Fact]
    public void A_missing_file_yields_empty_fields_and_throws_nothing()
    {
        var record = CallerIdentity.Build("", Env(("CLAUDE_CODE_SESSION_ID", Session), ("CLAUDE_PID", "29960")), _ => null, Home, "/x/ClaudeRag");

        record.SessionName.Should().BeEmpty();
        record.Cwd.Should().Be("ClaudeRag");
        record.Session.Should().Be("98bf9f23", "the half that comes from the live process is unaffected");
    }

    [Theory]
    [InlineData("{not json")]
    [InlineData("[1,2,3]")]
    [InlineData("42")]
    [InlineData("\"a string\"")]
    [InlineData("null")]
    [InlineData("")]
    [InlineData("{\"name\":7,\"cwd\":[\"x\"]}")]
    public void A_malformed_or_wrong_shaped_file_yields_empty_fields_and_throws_nothing(string content)
    {
        var act = () => CallerIdentity.Build("", Env(("CLAUDE_CODE_SESSION_ID", Session), ("CLAUDE_PID", "29960")), _ => content, Home, "/x/ClaudeRag");

        var record = act.Should().NotThrow().Subject;
        record.SessionName.Should().BeEmpty();
        record.Cwd.Should().Be("ClaudeRag");
    }

    [Fact]
    public void A_one_megabyte_file_is_refused_rather_than_parsed()
    {
        var huge = "{\"name\":\"" + new string('n', 1024 * 1024) + "\"}";
        var record = CallerIdentity.Build("", Env(("CLAUDE_CODE_SESSION_ID", Session), ("CLAUDE_PID", "29960")), _ => huge, Home, "/x/ClaudeRag");

        record.SessionName.Should().BeEmpty();
        CallerIdentity.MaxSessionFileBytes.Should().Be(64 * 1024);
    }

    [Fact]
    public void Unknown_properties_in_the_file_are_ignored_the_way_the_entry_shape_ignores_them()
    {
        var record = CallerIdentity.Build("", Env(("CLAUDE_CODE_SESSION_ID", Session), ("CLAUDE_PID", "29960")),
            _ => """{"name":"strug-3c","cwd":"/home/strug/work/dew_flow_creds_for_devs/","messagingSocketPath":"/tmp/x.sock","extra":{"a":1}}""",
            Home, "/x");

        record.SessionName.Should().Be("strug-3c");
        record.Cwd.Should().Be("dew_flow_creds_for_devs", "a trailing separator does not make the basename empty");
    }

    [Theory]
    [InlineData(@"d:\rsd\ClaudeRag", "ClaudeRag")]
    [InlineData("/home/strug/ClaudeRag", "ClaudeRag")]
    [InlineData("/home/strug/ClaudeRag/", "ClaudeRag")]
    [InlineData(@"C:\", "C:")]
    [InlineData("/", "")]
    [InlineData("", "")]
    [InlineData("ClaudeRag", "ClaudeRag")]
    public void The_basename_is_the_last_segment_under_either_separator(string path, string expected)
    {
        // Both separators, always: the Linux half of the WSL bridge reads a Linux session file,
        // and a Windows client's file holds a Windows path — and the same binary must read both.
        CallerIdentity.Basename(path).Should().Be(expected);
    }

    // ---- caps and stripping on the client side too (T9) -------------------------------------

    [Fact]
    public void Every_field_is_stripped_of_control_characters_and_the_separator_and_capped()
    {
        var record = CallerIdentity.Build(
            "Claude\tCode\u0007 2.1.268\n",
            Env(("CLAUDE_CODE_SESSION_ID", "98bf\u200b9f23-rest"), ("CLAUDE_PID", "29960")),
            _ => """{"name":"a → b   c","cwd":"/x/""" + new string('w', 500) + "\"}",
            Home,
            "/x");

        record.Agent.Should().Be("Claude Code 2.1.268");
        record.Session.Should().Be("98bf 9f2", "the zero-width space became a space before the cut — eight characters, whatever they are");
        record.SessionName.Should().Be("a b c");
        record.Cwd.Should().HaveLength(CallerIdentity.MaxFieldChars);
        CallerIdentity.MaxFieldChars.Should().Be(80);
    }

    [Fact]
    public void The_cap_counts_characters_not_utf16_halves()
    {
        var cleaned = CallerIdentity.Clean(string.Concat(Enumerable.Repeat("🙂", 100)));

        cleaned.EnumerateRunes().Count().Should().Be(80);
        Rune.DecodeLastFromUtf16(cleaned, out _, out _).Should().Be(System.Buffers.OperationStatus.Done, "no lone surrogate at the cut");
    }

    [Fact]
    public void Clean_treats_null_and_whitespace_as_nothing()
    {
        CallerIdentity.Clean(null).Should().BeEmpty();
        CallerIdentity.Clean(" \t\r\n ").Should().BeEmpty();
        CallerIdentity.Clean("  two   words ").Should().Be("two words");
    }

    // ---- the record itself ----------------------------------------------------------------

    [Fact]
    public void An_empty_record_knows_it_is_empty_and_a_single_field_makes_it_not()
    {
        CallerRecord.Empty.IsEmpty.Should().BeTrue();
        (CallerRecord.Empty with { Cwd = "ClaudeRag" }).IsEmpty.Should().BeFalse();
    }

    [Fact]
    public void The_side_that_spoke_to_the_client_names_the_client_only_when_nobody_else_has()
    {
        // The rule for the WSL bridge: the Linux half forwards an empty Agent because it never
        // instantiates the server; the Windows half fills it from ClientInfo. A forwarded label
        // that is NOT empty is somebody's decision already and is kept.
        var forwarded = new CallerRecord("", "98bf9f23", "clauderag-d6", "ClaudeRag");

        var named = forwarded.NamedBy("Claude Code 2.1.268");
        named.Agent.Should().Be("Claude Code 2.1.268");
        named.Session.Should().Be("98bf9f23");
        named.SessionName.Should().Be("clauderag-d6");
        named.Cwd.Should().Be("ClaudeRag");

        (forwarded with { Agent = "Codex 0.4" }).NamedBy("Claude Code 2.1.268").Agent.Should().Be("Codex 0.4");
        forwarded.NamedBy("  ").Agent.Should().BeEmpty("a blank name names nobody");
        forwarded.NamedBy("X\n\n(verified)").Agent.Should().Be("X (verified)", "cleaned like every other field");
    }

    // ---- the wire and the command line ------------------------------------------------------

    [Fact]
    public void The_json_shape_is_the_contract_s_nested_object_with_its_four_fields()
    {
        var record = new CallerRecord("Claude Code 2.1.268", "98bf9f23", "clauderag-d6", "ClaudeRag");

        var json = CallerIdentity.ToJson(record).ToJsonString();

        json.Should().Be("""{"agent":"Claude Code 2.1.268","session":"98bf9f23","sessionName":"clauderag-d6","cwd":"ClaudeRag"}""");
        using var doc = JsonDocument.Parse(json);
        doc.RootElement.EnumerateObject().Select(p => p.Name).Should().Equal("agent", "session", "sessionName", "cwd");
    }

    [Fact]
    public void The_record_crosses_a_command_line_as_base64url_and_comes_back_whole()
    {
        var record = new CallerRecord("Claude Code 2.1.268", "98bf9f23", "clauderag-d6", "ClaudeRag");

        var encoded = CallerIdentity.Encode(record);

        encoded.Should().MatchRegex("^[A-Za-z0-9_-]+$", "no character an argument parser can reinterpret, and no padding");
        CallerIdentity.Decode(encoded).Should().Be(record);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("not base64!!")]
    [InlineData("=====")] // padding where base64url has none — ArgumentException, not FormatException
    [InlineData("ÿþ")] // not ASCII at all
    [InlineData("WzEsMl0")] // [1,2]
    [InlineData("bnVsbA")] // null
    [InlineData("e30")] // {}
    public void A_malformed_forwarded_record_decodes_to_the_empty_record_rather_than_throwing(string? encoded)
    {
        var act = () => CallerIdentity.Decode(encoded);

        act.Should().NotThrow().Subject.Should().Be(CallerRecord.Empty);
    }

    [Fact]
    public void A_forwarded_record_is_cleaned_on_the_way_in_because_the_other_half_is_somebody_else_s_binary()
    {
        var hostile = System.Buffers.Text.Base64Url.EncodeToString(
            Encoding.UTF8.GetBytes("""{"agent":"X\n\n(verified) → ","session":"98bf9f23","sessionName":"","cwd":"ClaudeRag"}"""));

        var record = CallerIdentity.Decode(hostile);

        record.Agent.Should().Be("X (verified)");
        record.Cwd.Should().Be("ClaudeRag");
    }

    // ---- the code round of 2026-09-12 -------------------------------------------------------

    /// <summary>
    /// The registry belongs to ONE product, so only that product's session id may open it.
    /// </summary>
    /// <remarks>
    /// Found independently by two reviewers. <c>CLAUDE_PID</c> is inherited by everything Claude
    /// Code spawns — a terminal, a shell, another vendor's CLI started inside one — so a Codex or
    /// Gemini session running there has its OWN session id and somebody else's pid beside it.
    /// Opening the registry on the strength of any rung attributed one agent's session name and
    /// folder to another agent's call, in the label a person reads before allowing a credential.
    /// </remarks>
    [Fact]
    public void Another_agents_session_never_opens_Claude_Codes_registry_even_with_its_pid_inherited()
    {
        var reader = new RecordingReader(GoodFile);

        var record = CallerIdentity.Build(
            "creds CLI",
            Env(("CODEX_SESSION_ID", "codex-1"), ("CLAUDE_PID", "29960")),
            reader.Read,
            Home,
            "/home/strug/other-repo");

        reader.Asked.Should().BeEmpty("the registry is Claude Code's, and this is not its session");
        record.SessionName.Should().BeEmpty();
        record.Session.Should().Be("codex-1");
        record.Cwd.Should().Be("other-repo", "the folder falls back to this process's own");
    }

    /// <summary>The override says which id to use; it says nothing about whose registry to read.</summary>
    [Fact]
    public void The_generic_override_does_not_open_the_registry_either()
    {
        var reader = new RecordingReader(GoodFile);

        CallerIdentity.Build("", Env(("CREDS_CALLER_SESSION", "mine"), ("CLAUDE_PID", "29960")), reader.Read, Home, "/x/y");

        reader.Asked.Should().BeEmpty();
    }

    /// <summary>Claude Code's own session still reads it — a fix must not close the door it opens.</summary>
    [Fact]
    public void Claude_Codes_own_session_still_reads_the_registry()
    {
        var reader = new RecordingReader(GoodFile);

        var record = CallerIdentity.Build(
            "", Env(("CLAUDE_CODE_SESSION_ID", Session), ("CLAUDE_PID", "29960")), reader.Read, Home, "/x/y");

        reader.Asked.Should().ContainSingle();
        record.SessionName.Should().Be("clauderag-d6");
    }

    /// <summary>
    /// A home that is not an absolute path would resolve the registry against the WORKING folder —
    /// which, for a CLI, is whatever repository somebody happens to be standing in.
    /// </summary>
    [Fact]
    public void A_home_that_is_not_an_absolute_path_opens_nothing()
    {
        CallerIdentity.SessionFilePath("29960", string.Empty).Should().BeNull();
        CallerIdentity.SessionFilePath("29960", "relative/home").Should().BeNull();
        CallerIdentity.SessionFilePath("29960", Home).Should().NotBeNull();
    }
}
