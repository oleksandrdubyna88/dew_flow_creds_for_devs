using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace CredsMcp.Tests.Support;

/// <summary>
/// What an MCP client says to a <c>creds-mcp</c> process, and the reading of its answers — shared by every
/// process test that drives the built binary through a session.
/// </summary>
/// <remarks>
/// <para><b>The 2026-07-28 handshake is captured, not composed</b> (plan §7.3). The fixture is the four lines a
/// real Claude Code 2.1.289 wrote to a <c>creds-mcp</c> on Windows on 2026-10-10, recorded by a transparent
/// shim between the two (research/RESULTS_wsl_bridge_orphans.md, *The fixture*): <c>server/discover</c>,
/// <c>subscriptions/listen</c> with <c>toolsListChanged</c>, a second <c>server/discover</c>, <c>tools/list</c>
/// — the sequence the 2026-10-09 shim recorded from 2.1.295 inside WSL, plus the version probe 2.1.289 sends
/// first. Its <c>_meta</c> is the client's own, byte for byte.</para>
/// <para>The 2025-06-18 handshake is the positive control: a server that refused the fixture outright would
/// also "exit on EOF", so every test that proves the listen case also proves the old one still ends the same
/// way it always did.</para>
/// </remarks>
internal static class McpScript
{
    /// <summary>The captured Claude Code 2.1.289 session start, one JSON-RPC message per line.</summary>
    internal static IReadOnlyList<string> ClaudeCodeHandshake() =>
        File.ReadAllLines(Path.Combine(AppContext.BaseDirectory, "fixtures", "claude-code-2.1.289-handshake-2026-07-28.jsonl"));

    /// <summary>The request ids in the captured session that the server answers (the listen is held, not answered).</summary>
    internal static readonly string[] ClaudeCodeReplyIds = ["server-discover-probe-1", "0", "1"];

    /// <summary>The per-request metadata the captured client sends — reused for a request appended to its session.</summary>
    internal static JsonNode ClaudeCodeMeta() =>
        JsonNode.Parse(ClaudeCodeHandshake()[^1])!["params"]!["_meta"]!.DeepClone();

    /// <summary>The 2025-06-18 handshake, which ends on end-of-stream today.</summary>
    internal static IReadOnlyList<string> LegacyHandshake() =>
    [
        """{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"e2-probe","version":"1.0"}}}""",
        """{"jsonrpc":"2.0","method":"notifications/initialized"}""",
        """{"jsonrpc":"2.0","id":2,"method":"tools/list"}""",
    ];

    /// <summary>The request ids of <see cref="LegacyHandshake"/>.</summary>
    internal static readonly string[] LegacyReplyIds = ["1", "2"];

    /// <summary>A 2026-07-28 <c>tools/call</c>, carrying the captured client's metadata.</summary>
    internal static string ToolCall(string id, string tool, JsonObject arguments) =>
        new JsonObject
        {
            ["jsonrpc"] = "2.0",
            ["id"] = id,
            ["method"] = "tools/call",
            ["params"] = new JsonObject { ["_meta"] = ClaudeCodeMeta(), ["name"] = tool, ["arguments"] = arguments },
        }.ToJsonString();

    /// <summary>Write every line, then read stdout until each of <paramref name="replyIds"/> has been answered.</summary>
    internal static async Task SpeakAsync(Process host, IEnumerable<string> lines, IReadOnlyCollection<string> replyIds, CancellationToken ct)
    {
        foreach (var line in lines)
        {
            await host.StandardInput.WriteLineAsync(line.AsMemory(), ct);
        }
        await host.StandardInput.FlushAsync(ct);

        var waiting = new HashSet<string>(replyIds, StringComparer.Ordinal);
        while (waiting.Count > 0)
        {
            var read = await host.StandardOutput.ReadLineAsync(ct).AsTask().WaitAsync(TimeSpan.FromSeconds(30), ct)
                ?? throw new InvalidOperationException($"stdout ended with {string.Join(", ", waiting)} unanswered");
            waiting.Remove(IdOf(read));
        }
    }

    /// <summary>The id of a reply, as text; empty for a notification or a line that is not JSON-RPC.</summary>
    internal static string IdOf(string line)
    {
        try
        {
            return JsonNode.Parse(line)?["id"]?.ToJsonString().Trim('"') ?? string.Empty;
        }
        catch (JsonException)
        {
            return string.Empty;
        }
    }

    /// <summary>Wait for the host to exit, at most <paramref name="bound"/>; true when it did.</summary>
    internal static async Task<bool> ExitsWithinAsync(Process host, TimeSpan bound, CancellationToken ct)
    {
        try
        {
            await host.WaitForExitAsync(ct).WaitAsync(bound, ct);
            return true;
        }
        catch (TimeoutException)
        {
            return false;
        }
    }
}
