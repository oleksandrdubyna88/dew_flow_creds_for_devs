using CredsForDevs.ServiceDefaults;
using CredsForDevs.ServiceDefaults.Tests.Support;
using CredsMcp.Tests.Support;
using FluentAssertions;

namespace CredsMcp.Tests;

/// <summary>
/// Defect A of PLAN_wsl_bridge_outlives_its_client.md, at the process boundary: the BUILT <c>creds-mcp</c>
/// must end when its client closes stdin — also after the client opened a <c>subscriptions/listen</c>, which
/// every Claude Code session does (E2.S1).
/// </summary>
/// <remarks>
/// <para>Before E2, ModelContextProtocol 2.2.0 waited after end-of-stream for every in-flight handler without
/// cancelling one, and the listen handler ends only on cancellation — so this process lived until its WSL
/// session or its machine did. Measured natively on Windows (research/RESULTS_wsl_bridge_orphans.md).</para>
/// <para>The bound is 10 s against a design of 1 s drain + at most 5 s deadline: a slow CI runner must not
/// turn a pass into a flake, and a server that never exits fails it by any margin.</para>
/// </remarks>
public sealed class ServerEndsWithClientTests : IDisposable
{
    private static readonly TimeSpan Bound = TimeSpan.FromSeconds(10);

    private readonly string _root = HostProcess.TempDirectory("creds-mcp-e2");

    public void Dispose() => HostProcess.Remove(_root);

    private Dictionary<string, string> Env() => new()
    {
        [CredsLogging.DirectoryVariable] = _root,
        ["CREDS_ENDPOINT_DIR"] = Path.Combine(_root, "no-windows"),
    };

    [Fact]
    public async Task A_client_that_opened_a_listen_and_closed_stdin_ends_the_server()
    {
        var ct = TestContext.Current.CancellationToken;
        using var host = HostProcess.Start("creds-mcp", [], Env());
        using var reaper = HostProcess.KillOnDispose(host);

        await McpScript.SpeakAsync(host, McpScript.ClaudeCodeHandshake(), McpScript.ClaudeCodeReplyIds, ct);
        host.StandardInput.Close();

        var exited = await McpScript.ExitsWithinAsync(host, Bound, ct);
        exited.Should().BeTrue("creds-mcp must exit within 10 s of stdin EOF with a subscriptions/listen open, but it is still running");
        host.ExitCode.Should().Be(0, "end-of-stream is the transport's own shutdown signal, not a failure");
        HostProcess.Read(HostProcess.LogFileOf(_root, Program.AppName, host.Id))
            .Should().Contain("exited: code 0, reason clientClosed");
    }

    [Fact]
    public async Task The_2025_06_18_handshake_still_ends_on_end_of_stream()
    {
        // The positive control: a fixture the server refused outright would "exit" too. This one is the
        // behaviour that already worked, and it must keep working the same way.
        var ct = TestContext.Current.CancellationToken;
        using var host = HostProcess.Start("creds-mcp", [], Env());
        using var reaper = HostProcess.KillOnDispose(host);

        await McpScript.SpeakAsync(host, McpScript.LegacyHandshake(), McpScript.LegacyReplyIds, ct);
        host.StandardInput.Close();

        (await McpScript.ExitsWithinAsync(host, Bound, ct)).Should().BeTrue("the old handshake has always ended on EOF");
        host.ExitCode.Should().Be(0);
    }
}
