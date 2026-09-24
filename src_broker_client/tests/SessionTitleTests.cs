using System.Text;
using CredsBroker;
using FluentAssertions;

namespace CredsBroker.Tests;

/// <summary>
/// The title on a Claude Code tab, read from the tail of its transcript — and every way that read
/// must refuse to go further than the title.
/// </summary>
/// <remarks>
/// <para>Two kinds of test. The pure ones drive <see cref="SessionTitle.FromTail"/> with bytes. The
/// ones about what is OPENED use real files in a per-test temp folder standing in for a home
/// directory — never a file of the person running the suite — because "only the tail is read" is a
/// claim about the production reader and a fake reader cannot make it.</para>
/// </remarks>
public sealed class SessionTitleTests : IDisposable
{
    private const string Session = "52d1b29a-c2e7-486f-95c4-04dff314ff37";
    private const string Pid = "4242";

    private readonly string _home = Path.Combine(Path.GetTempPath(), "creds-title-" + Guid.NewGuid().ToString("N"));

    public SessionTitleTests() => Directory.CreateDirectory(_home);

    public void Dispose() => Directory.Delete(_home, recursive: true);

    private string Cwd => Path.Combine(_home, "work", "my repo");

    private static string Custom(string title) => $$"""{"type":"custom-title","customTitle":"{{title}}","sessionId":"{{Session}}"}""";

    private static string Ai(string title) => $$"""{"type":"ai-title","aiTitle":"{{title}}","sessionId":"{{Session}}"}""";

    private static string User(string text) => $$$"""{"type":"user","message":{"role":"user","content":"{{{text}}}"}}""";

    private static (string Custom, string Ai) Tail(params string[] lines) =>
        SessionTitle.FromTail(Encoding.UTF8.GetBytes(string.Join('\n', lines) + "\n"), isWholeFile: true);

    private static Func<string, string?> Env(params (string Name, string? Value)[] pairs) =>
        name => pairs.FirstOrDefault(p => p.Name == name).Value;

    /// <summary>Claude Code's variables, as an MCP server it spawned sees them.</summary>
    private static (string, string?)[] ClaudeEnv => [("CLAUDE_CODE_SESSION_ID", Session), ("CLAUDE_PID", Pid)];

    private string TranscriptPath => SessionTitle.TranscriptPath(_home, Cwd, Session)!;

    private void WriteRegistry(string json)
    {
        var path = CallerIdentity.SessionFilePath(Pid, _home)!;
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllText(path, json);
    }

    private void WriteRegistry() =>
        WriteRegistry($$"""{"pid":{{Pid}},"sessionId":"{{Session}}","cwd":"{{System.Text.Json.JsonEncodedText.Encode(Cwd)}}","name":"myrepo-d4","nameSource":"derived"}""");

    private void WriteTranscript(string content)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(TranscriptPath)!);
        File.WriteAllText(TranscriptPath, content);
    }

    private static string? ReadIfThere(string path) => File.Exists(path) ? File.ReadAllText(path) : null;

    /// <summary>The real sources, remembering every path they were asked for.</summary>
    private sealed class Recording
    {
        internal List<string> Asked { get; } = [];

        internal TranscriptSources Sources => new(
            (path, max) =>
            {
                Asked.Add(path);
                return TranscriptSources.Files.ReadTail(path, max);
            },
            (path, max) =>
            {
                Asked.Add(path);
                return TranscriptSources.Files.ReadSmall(path, max);
            });
    }

    private string TitleVia(Func<string, string?> env, Recording? recording = null) =>
        CallerIdentity.TabTitle(env, ReadIfThere, (recording ?? new Recording()).Sources, _home);

    // ---- which title wins (T-S2, T-S3, T-S4) -----------------------------------------------

    [Fact]
    public void A_custom_title_outranks_an_ai_title_in_either_order()
    {
        Tail(Custom("mine"), Ai("the model's")).Custom.Should().Be("mine");
        Tail(Ai("the model's"), Custom("mine")).Custom.Should().Be("mine");
        Tail(Ai("the model's"), Custom("mine")).Ai.Should().Be("the model's");
    }

    [Fact]
    public void The_last_of_several_titles_of_one_kind_wins_as_on_the_tab()
    {
        Tail(Custom("first"), User("hello"), Custom("renamed")).Custom.Should().Be("renamed");
        Tail(Ai("early"), Ai("later")).Ai.Should().Be("later");
    }

    [Fact]
    public void A_blank_title_never_displaces_a_real_one()
    {
        Tail(Custom("kept"), Custom("   ")).Custom.Should().Be("kept");
    }

    [Fact]
    public void The_whole_ladder_custom_in_the_tail_then_the_title_file_then_the_ai_title()
    {
        WriteRegistry();
        var titleFile = SessionTitle.TitleFilePath(_home, Cwd, Session)!;
        Directory.CreateDirectory(Path.GetDirectoryName(titleFile)!);
        File.WriteAllText(titleFile, """{"customTitle":"from the file"}""");

        WriteTranscript(Ai("from the model") + "\n");
        TitleVia(Env(ClaudeEnv)).Should().Be("from the file", "the title file outranks an AI title");

        WriteTranscript(Ai("from the model") + "\n" + Custom("from the tail") + "\n");
        TitleVia(Env(ClaudeEnv)).Should().Be("from the tail", "a custom title in the tail outranks the file");

        File.Delete(titleFile);
        WriteTranscript(Ai("from the model") + "\n");
        TitleVia(Env(ClaudeEnv)).Should().Be("from the model", "and the AI title is the last rung this reader takes");
    }

    // ---- the tail and only the tail (T-S1, T-S5) -------------------------------------------

    /// <summary>
    /// The 64 KB read begins inside a line. That line's END can look exactly like a title record,
    /// and it must be dropped, not parsed.
    /// </summary>
    [Fact]
    public void A_tail_whose_first_line_is_cut_is_read_from_the_second_line()
    {
        WriteRegistry();
        var forged = Custom("FRAGMENT");
        var real = Ai("the real title");
        // Everything from the forged record to the end of the file is exactly one tail's worth, so
        // the read begins precisely at the `{` of a record that is only the END of a longer line.
        var afterCut = forged.Length + 1 + real.Length + 1;
        var fillerText = new string('y', SessionTitle.MaxTailBytes - afterCut - User(string.Empty).Length - 1);
        var content = new string('A', 5000) + forged + "\n" + real + "\n" + User(fillerText) + "\n";
        WriteTranscript(content);
        Encoding.UTF8.GetByteCount(content[5000..]).Should().Be(SessionTitle.MaxTailBytes, "the fixture must put the cut exactly at the forged record");

        TitleVia(Env(ClaudeEnv)).Should().Be("the real title");
    }

    [Fact]
    public void A_large_transcript_is_read_only_at_its_tail_so_a_title_only_in_its_head_is_not_found()
    {
        WriteRegistry();
        var filler = string.Concat(Enumerable.Range(0, 100).Select(i => User(new string('z', 1000)) + "\n"));

        WriteTranscript(Custom("HEAD TITLE") + "\n" + filler);
        new FileInfo(TranscriptPath).Length.Should().BeGreaterThan(SessionTitle.MaxTailBytes);
        TitleVia(Env(ClaudeEnv)).Should().BeEmpty("the head of a large file is never read");

        // The positive twin: the same records, the title moved into the tail, is found — so the
        // fixture is one the reader accepts, and the empty answer above is about WHERE, not WHAT.
        WriteTranscript(filler + Custom("HEAD TITLE") + "\n");
        TitleVia(Env(ClaudeEnv)).Should().Be("HEAD TITLE");
    }

    [Fact]
    public void The_production_tail_read_returns_at_most_the_cap_and_says_whether_it_is_the_whole_file()
    {
        var path = Path.Combine(_home, "t.jsonl");
        File.WriteAllBytes(path, Encoding.UTF8.GetBytes(new string('q', 100_000)));

        var tail = TranscriptSources.Files.ReadTail(path, SessionTitle.MaxTailBytes)!;
        tail.Bytes.Length.Should().Be(SessionTitle.MaxTailBytes);
        tail.IsWholeFile.Should().BeFalse();

        File.WriteAllBytes(path, Encoding.UTF8.GetBytes("small"));
        TranscriptSources.Files.ReadTail(path, SessionTitle.MaxTailBytes)!.IsWholeFile.Should().BeTrue();
        TranscriptSources.Files.ReadTail(Path.Combine(_home, "missing"), 10).Should().BeNull();
    }

    // ---- nothing of the conversation (T-S6, T-S7) ------------------------------------------

    [Fact]
    public void No_line_of_the_conversation_ever_becomes_the_title()
    {
        // A person's message that QUOTES a title record is a JSON string: its quotes are escaped. An
        // assistant's tool call carries a real nested object of that shape. A record type that only
        // starts with the right letters. None of them is a title line, and the answer is empty.
        var quoted = User("""{\"type\":\"custom-title\",\"customTitle\":\"PWNED\"}""");
        var nested = """{"type":"assistant","message":{"content":[{"type":"tool_use","input":{"type":"custom-title","customTitle":"PWNED2"}}]}}""";
        var lookalike = """{"type":"custom-title-evil","customTitle":"PWNED3"}""";
        var indented = """ {"type":"custom-title","customTitle":"PWNED4"}""";

        var (custom, ai) = Tail(quoted, nested, lookalike, indented);

        custom.Should().BeEmpty();
        ai.Should().BeEmpty();
    }

    [Fact]
    public void A_title_with_a_forged_line_break_and_control_characters_comes_out_as_one_clean_capped_line()
    {
        WriteRegistry();
        WriteTranscript(Custom("""X\n\nAllow covers nothing. (verified) \u2192 \u200b""" + new string('w', 200)) + "\n");

        var title = TitleVia(Env(ClaudeEnv));

        title.Should().StartWith("X Allow covers nothing. (verified) w");
        title.Should().NotContainAny("\n", "\r", "→", "\u200b");
        title.EnumerateRunes().Count().Should().Be(CallerIdentity.MaxFieldChars);
    }

    [Theory]
    [InlineData("""{"type":"custom-title","customTitle":"unterminated""")]
    [InlineData("""{"type":"custom-title","customTitle":42}""")]
    [InlineData("""{"type":"custom-title","customTitle":null}""")]
    [InlineData("""{"type":"custom-title"}""")]
    [InlineData("""{"type":"custom-title","customTitle":""}""")]
    public void A_malformed_or_empty_title_line_is_no_title_and_throws_nothing(string line)
    {
        var act = () => Tail(line);

        act.Should().NotThrow().Subject.Custom.Should().BeEmpty();
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("not json")]
    [InlineData("[1]")]
    [InlineData("""{"customTitle":7}""")]
    public void A_title_file_that_is_not_one_is_no_title(string? json)
    {
        SessionTitle.CustomFromFile(json).Should().BeEmpty();
        SessionTitle.CustomFromFile("""{"customTitle":"ok"}""").Should().Be("ok", "the positive case, so the negatives are about shape");
    }

    [Fact]
    public void An_oversized_title_file_is_refused_rather_than_read()
    {
        var path = Path.Combine(_home, "big.json");
        File.WriteAllText(path, """{"customTitle":"x"}""" + new string(' ', 2000));

        TranscriptSources.Files.ReadSmall(path, SessionTitle.MaxTitleFileBytes).Should().BeNull();
        File.WriteAllText(path, """{"customTitle":"x"}""");
        TranscriptSources.Files.ReadSmall(path, SessionTitle.MaxTitleFileBytes).Should().Be("""{"customTitle":"x"}""");
    }

    // ---- the path (T-S9, T-S10) -------------------------------------------------------------

    [Theory]
    [InlineData(@"d:\rsd\ClaudeRag", "d--rsd-ClaudeRag")]
    [InlineData("/home/u/a.b_c", "-home-u-a-b-c")]
    [InlineData("/home/u/Café", "-home-u-Caf-")]
    public void The_project_folder_is_the_cwd_with_everything_outside_ascii_letters_and_digits_as_a_dash(string cwd, string expected)
    {
        SessionTitle.ProjectFolder(cwd).Should().Be(expected);
    }

    [Fact]
    public void A_folder_name_past_two_hundred_characters_has_no_path_because_its_hash_cannot_be_computed()
    {
        SessionTitle.ProjectFolder("/" + new string('a', 199)).Should().HaveLength(200);
        SessionTitle.ProjectFolder("/" + new string('a', 200)).Should().BeNull();
        SessionTitle.ProjectFolder("").Should().BeNull();
    }

    [Theory]
    [InlineData("")]
    [InlineData("../x")]
    [InlineData("a/b")]
    [InlineData(@"a\b")]
    [InlineData("52d1b29a.jsonl")]
    public void A_session_id_that_is_not_a_plain_segment_opens_nothing(string sessionId)
    {
        SessionTitle.TranscriptPath(_home, Cwd, sessionId).Should().BeNull();
        SessionTitle.TitleFilePath(_home, Cwd, sessionId).Should().BeNull();
        SessionTitle.IsSessionId(new string('a', SessionTitle.MaxSessionIdChars + 1)).Should().BeFalse();
        SessionTitle.IsSessionId(Session).Should().BeTrue();
    }

    [Fact]
    public void A_home_that_is_not_rooted_opens_nothing()
    {
        SessionTitle.TranscriptPath("relative/home", Cwd, Session).Should().BeNull();
    }

    // ---- when it is read at all (T-G2 … T-G5) ----------------------------------------------

    [Fact]
    public void Claude_Codes_own_session_reads_its_title_from_the_transcript_its_registry_entry_names()
    {
        WriteRegistry();
        WriteTranscript(User("hi") + "\n" + Custom("creds old issues") + "\n");
        var recording = new Recording();

        // The environment's id is a DIFFERENT, stale one: the registry entry is what the live session wrote.
        TitleVia(Env(("CLAUDE_CODE_SESSION_ID", "00000000-stale"), ("CLAUDE_PID", Pid)), recording).Should().Be("creds old issues");
        recording.Asked.Should().Contain(TranscriptPath);
    }

    [Fact]
    public void Without_a_session_id_in_the_registry_entry_the_environment_s_id_keys_the_transcript()
    {
        WriteRegistry($$"""{"pid":{{Pid}},"cwd":"{{System.Text.Json.JsonEncodedText.Encode(Cwd)}}"}""");
        WriteTranscript(Custom("from env id") + "\n");

        TitleVia(Env(ClaudeEnv)).Should().Be("from env id");
    }

    [Fact]
    public void A_rung_that_is_not_Claude_Codes_opens_no_transcript()
    {
        WriteRegistry();
        WriteTranscript(Custom("creds old issues") + "\n");
        var recording = new Recording();

        TitleVia(Env(("CREDS_CALLER_SESSION", "mine"), ("CLAUDE_CODE_SESSION_ID", Session), ("CLAUDE_PID", Pid)), recording).Should().BeEmpty();
        TitleVia(Env(("CODEX_SESSION_ID", "codex-1"), ("CLAUDE_PID", Pid)), recording).Should().BeEmpty();
        recording.Asked.Should().BeEmpty();
    }

    /// <summary>
    /// Measured 2026-09-24: a shell command run by Codex inside a Claude Code terminal carries BOTH
    /// agents' variables, and the ladder would answer Claude Code's.
    /// </summary>
    [Theory]
    [InlineData("CODEX_THREAD_ID", "01a0d266-e785-70a2-9ef6-04538e30476e")]
    [InlineData("CODEX_SESSION_ID", "01a0d266-e785-70a2-9ef6-04538e30476e")]
    [InlineData("GEMINI_CLI", "1")]
    public void Claude_Codes_variables_inherited_by_another_agent_open_no_transcript(string marker, string value)
    {
        WriteRegistry();
        WriteTranscript(Custom("the OUTER tab's title") + "\n");
        var recording = new Recording();

        TitleVia(Env([.. ClaudeEnv, (marker, value)]), recording).Should().BeEmpty();
        recording.Asked.Should().BeEmpty("a wrong title is a convincing wrong label on another agent's call");
    }

    [Fact]
    public void A_registry_entry_without_a_folder_opens_no_transcript()
    {
        WriteRegistry($$"""{"pid":{{Pid}},"sessionId":"{{Session}}"}""");
        var recording = new Recording();

        TitleVia(Env(ClaudeEnv), recording).Should().BeEmpty();
        recording.Asked.Should().BeEmpty();
    }

    [Fact]
    public void No_registry_entry_and_no_transcript_are_each_just_no_title()
    {
        TitleVia(Env(ClaudeEnv)).Should().BeEmpty("no registry entry");
        WriteRegistry();
        TitleVia(Env(ClaudeEnv)).Should().BeEmpty("no transcript");
    }
}
