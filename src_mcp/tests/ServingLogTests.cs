using System.Text.Json;
using System.Text.Json.Nodes;
using CredsBroker;
using CredsForDevs.ServiceDefaults;
using CredsForDevs.ServiceDefaults.Tests.Support;
using CredsMcp;
using FluentAssertions;
using ModelContextProtocol.Protocol;

namespace CredsMcp.Tests;

/// <summary>
/// What a serving run of <c>creds-mcp</c> writes about itself — and what it must never write
/// (PLAN_wsl_bridge_outlives_its_client.md, E1.S2, §5.1 and §9).
/// </summary>
/// <remarks>
/// <para>The process test drives the BUILT binary through a whole session with a marker in every place a
/// secret could ride in: its argv (the <c>--caller</c> record), its environment, the handshake and a tool
/// call's arguments. Then it greps the file. A grep that finds nothing proves nothing on its own — a file
/// that was never written, or a pattern that cannot match, reads the same — so the same test first asserts
/// the lines the file MUST hold: the start, the client, a method name, the exit.</para>
/// <para>The 2025-06-18 handshake on purpose: with it the server ends on end-of-stream today (measured in
/// research/RESULTS_wsl_bridge_orphans.md). The 2026-07-28 one with an open <c>subscriptions/listen</c>
/// does not, and that is defect A — epic E2's red test, not this one.</para>
/// </remarks>
public sealed class ServingLogTests : IDisposable
{
    private readonly string _root = HostProcess.TempDirectory("creds-mcp-log");
    private readonly string _marker = "MARKER" + Guid.NewGuid().ToString("N");

    public void Dispose() => HostProcess.Remove(_root);

    private string[] Session() =>
    [
        """{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"e1-probe","version":"1.0","title":"MARK"}}}""".Replace("MARK", _marker, StringComparison.Ordinal),
        """{"jsonrpc":"2.0","method":"notifications/initialized"}""",
        """{"jsonrpc":"2.0","id":2,"method":"tools/list"}""",
        """{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"creds_list","arguments":{"note":"MARK"}}}""".Replace("MARK", _marker, StringComparison.Ordinal),
    ];

    [Fact]
    public async Task A_serving_run_logs_its_start_its_client_and_its_end_and_never_a_secret()
    {
        var ct = TestContext.Current.CancellationToken;
        var record = CallerIdentity.Encode(new CallerRecord(string.Empty, _marker, _marker, _marker));
        var env = new Dictionary<string, string>
        {
            [CredsLogging.DirectoryVariable] = _root,
            [CredsLogging.LevelVariable] = "verbose",
            ["CREDS_ENDPOINT_DIR"] = Path.Combine(_root, "endpoints-" + _marker),
            ["CREDS_TEST_SECRET"] = _marker,
        };

        using var host = HostProcess.Start("creds-mcp", [CallerForwarding.Flag, record], env);
        var stderr = host.StandardError.ReadToEndAsync(ct);
        foreach (var line in Session())
        {
            await host.StandardInput.WriteLineAsync(line.AsMemory(), ct);
        }
        await host.StandardInput.FlushAsync(ct);

        // Every reply before stdin closes: closing early ends the session mid-flight.
        var stdout = new List<string>();
        while (stdout.Count(IsReply) < 3)
        {
            var read = await host.StandardOutput.ReadLineAsync(ct).AsTask().WaitAsync(TimeSpan.FromSeconds(30), ct);
            read.Should().NotBeNull("the server answers all three requests before anything closes");
            stdout.Add(read!);
        }
        host.StandardInput.Close();
        stdout.AddRange((await host.StandardOutput.ReadToEndAsync(ct)).Split('\n', StringSplitOptions.RemoveEmptyEntries));
        await host.WaitForExitAsync(ct).WaitAsync(TimeSpan.FromSeconds(30), ct);

        host.ExitCode.Should().Be(0);
        stdout.Should().OnlyContain(line => IsJsonRpc(line), "stdout carries the protocol and nothing else");

        var file = HostProcess.Read(HostProcess.LogFileOf(_root, Program.AppName, host.Id));
        // The positive controls first: the file was written, and holds what it must.
        file.Should().Contain("started: serve, caller forwarded by the Linux half");
        file.Should().Contain($"parent {Environment.ProcessId}", "this test started the host, so it IS the parent — the platform call is real");
        file.Should().Contain("client: e1-probe 1.0", "the client that shook hands is named once the handshake is answered");
        file.Should().Contain("received tools/call", "method names reach the file at Debug");
        file.Should().Contain("exited: code 0, reason clientClosed");
        // Then the grep that the controls make worth something.
        file.Should().NotContain(_marker, "no argv value, environment value, protocol body or tool argument is logged");
        file.Should().NotContain(record, "the caller record travels base64-encoded, so the plain marker alone would miss it");
        (await stderr).Should().NotContain(_marker, "nor on the console");
    }

    [Fact]
    public void The_mode_names_a_forwarded_caller_without_its_content()
    {
        Program.ModeOf(relayed: false, forwarded: null).Should().Be("serve");
        Program.ModeOf(relayed: false, forwarded: "eyJ4IjoxfQ").Should().NotContain("eyJ4IjoxfQ");
        Program.ModeOf(relayed: true, forwarded: null).Should().Be("wsl-pump");
    }

    [Fact]
    public void The_client_is_named_once_and_never_as_a_blank()
    {
        var sink = new CollectingSink();
        using var log = sink.Logger();
        var naming = new ClientNaming(log);

        naming.Name(null);
        naming.Name(new Implementation { Name = "Claude Code", Version = "2.1.295" });
        naming.Name(new Implementation { Name = "Claude Code", Version = "2.1.295" });

        sink.Messages.Should().ContainSingle().Which.Should().Contain("Claude Code 2.1.295");
    }

    [Fact]
    public void A_client_cannot_forge_a_log_line_through_its_name_or_a_method_name()
    {
        // Both are the CLIENT's strings (code round finding 3): a line break in either would let a
        // client write what reads as a separate event — an exit that never happened, say.
        var sink = new CollectingSink();
        using var log = sink.Logger();
        var naming = new ClientNaming(log);

        naming.Name(new Implementation { Name = "evil\n[19:00:00Z INF] creds-mcp: exited: code 0", Version = "1\r\n" });
        naming.Received("tools/list\r\n[19:00:00Z INF] creds-mcp: forged");

        sink.Messages.Should().HaveCount(2, "the positive control: both were logged")
            .And.OnlyContain(message => !message.Contains('\n') && !message.Contains('\r'), "one event is one line");
    }

    [Fact]
    public void Only_requests_and_notifications_have_a_method_to_log()
    {
        ClientNaming.MethodOf(new JsonRpcRequest { Method = "tools/call" }).Should().Be("tools/call");
        ClientNaming.MethodOf(new JsonRpcNotification { Method = "notifications/initialized" }).Should().Be("notifications/initialized");
        ClientNaming.MethodOf(new JsonRpcResponse { Id = new RequestId(1), Result = null }).Should().BeEmpty();
    }

    [Fact]
    public void The_pump_reports_which_side_ended_it_in_words()
    {
        WslPump.ReasonOf(WslPump.Ending.ClientClosed).Should().Be(ExitReason.ClientClosed);
        WslPump.ReasonOf(WslPump.Ending.WindowsHalfClosed).Should().Be(ExitReason.WindowsHalfClosed);
    }

    private static bool IsReply(string line) => IsJsonRpc(line) && JsonNode.Parse(line)!["id"] is not null;

    private static bool IsJsonRpc(string line)
    {
        try
        {
            return JsonNode.Parse(line)?["jsonrpc"]?.GetValue<string>() == "2.0";
        }
        catch (JsonException)
        {
            return false;
        }
    }
}
