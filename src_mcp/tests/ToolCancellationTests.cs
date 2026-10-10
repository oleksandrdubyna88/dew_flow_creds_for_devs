using System.Diagnostics;
using System.Text.Json.Nodes;
using CredsBroker;
using CredsForDevs.ServiceDefaults;
using CredsForDevs.ServiceDefaults.Tests.Support;
using CredsMcp;
using CredsMcp.Tests.Support;
using FluentAssertions;

namespace CredsMcp.Tests;

/// <summary>
/// A session that ends lets go of the broker call it was waiting on (E2.S3, plan §5.3).
/// </summary>
/// <remarks>
/// <para>Before E2 no <see cref="CancellationToken"/> crossed from a tool to the broker: every call made its own
/// ten-minute source. Cancelling the server's run token then cancelled the SDK's handler but not the HTTP call
/// inside it, so the shutdown hung until the deadline killed the process — the connection to the window closed
/// only because the process died. The window (E4) learns that its requester is gone from exactly that close,
/// so it must come from the cancellation, promptly, with the process still in charge of its own exit.</para>
/// <para>The process test asserts both halves of that: the stub sees the connection close within
/// <c>drain + deadline</c>, AND the run's log has no "did not stop within" line — a forced exit would close the
/// socket in time too, and is exactly the behaviour this replaces.</para>
/// </remarks>
public sealed class ToolCancellationTests : IDisposable
{
    private static readonly TimeSpan DrainPlusDeadline = LifetimeTimings.Default.Drain + LifetimeTimings.Default.Deadline;

    private readonly string _root = HostProcess.TempDirectory("creds-mcp-e2s3");

    public void Dispose() => HostProcess.Remove(_root);

    [Fact]
    public async Task A_tool_call_in_flight_at_end_of_stream_closes_its_broker_connection_without_a_forced_exit()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var broker = new StubBroker();
        var endpoints = Path.Combine(_root, "endpoints");
        broker.Announce(endpoints);
        var env = new Dictionary<string, string>
        {
            [CredsLogging.DirectoryVariable] = _root,
            [Endpoints.DirectoryOverrideVariable] = endpoints,
        };

        using var host = HostProcess.Start("creds-mcp", [], env);
        using var reaper = HostProcess.KillOnDispose(host);
        await McpScript.SpeakAsync(host, McpScript.ClaudeCodeHandshake(), McpScript.ClaudeCodeReplyIds, ct);
        var call = McpScript.ToolCall("call-1", "creds_exec", new JsonObject { ["entry"] = "e1", ["command"] = "true" });
        await host.StandardInput.WriteLineAsync(call.AsMemory(), ct);
        await host.StandardInput.FlushAsync(ct);
        await broker.PostArrived.WaitAsync(TimeSpan.FromSeconds(30), ct);

        var closedAt = Stopwatch.StartNew();
        host.StandardInput.Close();
        await broker.PostClosed.WaitAsync(DrainPlusDeadline + TimeSpan.FromSeconds(4), ct);
        closedAt.Elapsed.Should().BeLessThan(DrainPlusDeadline, "the cancelled call closes its connection, it does not wait for the process to die");

        (await McpScript.ExitsWithinAsync(host, TimeSpan.FromSeconds(10), ct)).Should().BeTrue();
        var log = HostProcess.Read(HostProcess.LogFileOf(_root, Program.AppName, host.Id));
        log.Should().Contain("exited: code 0, reason clientClosed", "the positive control: the file is this run's");
        log.Should().NotContain("did not stop within", "the shutdown finished because the call was cancelled, not because a deadline killed it");
    }

    [Fact]
    public async Task A_cancelled_post_closes_the_connection_in_process()
    {
        // The in-process twin, for the coverage tool: the same stub, the broker call made directly.
        var ct = TestContext.Current.CancellationToken;
        await using var broker = new StubBroker();
        using var client = BrokerClient.Create(BrokerContract.Current, socketPath: null);
        using var cancel = CancellationTokenSource.CreateLinkedTokenSource(ct);

        var posting = Windows.PostToAsync(client, [broker.Endpoint], "/v1/mcp/use/exec", "{}", cancel.Token);
        await broker.PostArrived.WaitAsync(TimeSpan.FromSeconds(30), ct);
        await cancel.CancelAsync();

        await posting.Invoking(p => p.WaitAsync(TimeSpan.FromSeconds(10), ct)).Should().ThrowAsync<OperationCanceledException>();
        await broker.PostClosed.WaitAsync(TimeSpan.FromSeconds(10), ct);
    }

    [Theory]
    [InlineData("grant")]
    [InlineData("bearer")]
    public async Task Every_authenticated_post_lets_go_of_its_connection_when_cancelled(string shape)
    {
        // The CLI's two posts (a grant token, a config key) take the same linked source as the MCP alias post.
        var ct = TestContext.Current.CancellationToken;
        await using var broker = new StubBroker();
        using var client = BrokerClient.Create(BrokerContract.Current, socketPath: null);
        using var cancel = CancellationTokenSource.CreateLinkedTokenSource(ct);

        var posting = shape == "grant"
            ? client.PostAsync(new GrantToken(broker.Port, "not-a-real-grant"), "/v1/use/exec", "{}", cancel.Token)
            : client.PostBearerAsync(broker.Port, "/v1/config/read", "not-a-real-key", cancel.Token);
        await broker.PostArrived.WaitAsync(TimeSpan.FromSeconds(30), ct);
        await cancel.CancelAsync();

        await posting.Invoking(p => p.WaitAsync(TimeSpan.FromSeconds(10), ct)).Should().ThrowAsync<OperationCanceledException>();
        await broker.PostClosed.WaitAsync(TimeSpan.FromSeconds(10), ct);
    }

    [Fact]
    public async Task The_read_walk_answers_from_a_live_window_in_process()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var broker = new StubBroker();
        using var client = BrokerClient.Create(BrokerContract.Current, socketPath: null);

        var read = await Windows.ReadFromAsync(client, [broker.Endpoint], "/v1/mcp/entries", ct);

        read.Bodies.Should().ContainSingle("the stub answers every GET with 200").Which.Should().Contain(BrokerContract.Current.Service);
        read.RouteRefused.Should().Be(0);
    }

    [Fact]
    public async Task A_cancelled_health_probe_is_a_cancellation_not_a_window_that_is_not_ours()
    {
        // Before: IsOurBrokerAsync swallowed every TaskCanceledException as "false", so a cancelled session
        // walked on to the next window instead of stopping.
        using var client = BrokerClient.Create(BrokerContract.Current, socketPath: null);
        using var cancelled = new CancellationTokenSource();
        await cancelled.CancelAsync();

        await client.Invoking(c => c.IsOurBrokerAsync(1, cancelled.Token)).Should().ThrowAsync<OperationCanceledException>();
    }

    [Fact]
    public void No_tool_schema_shows_the_cancellation_token_to_a_model()
    {
        var source = new CallerSource(new CallerRecord(string.Empty, string.Empty, string.Empty, string.Empty));
        var schemas = Program.ToolsFor(BrokerContract.Current, source)
            .ToDictionary(tool => tool.ProtocolTool.Name, tool => tool.ProtocolTool.InputSchema.GetRawText());

        // Positive control: the schemas are the real ones, with the parameters a model fills in.
        schemas.Should().HaveCount(18);
        schemas["creds_exec"].Should().Contain("\"entry\"").And.Contain("\"command\"");
        schemas.Values.Should().OnlyContain(
            schema => !schema.Contains("cancellation", StringComparison.OrdinalIgnoreCase),
            "the SDK binds the token to the request; a model never sees or fills it");
    }
}
