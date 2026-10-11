using CredsBroker;
using CredsForDevs.ServiceDefaults.Tests.Support;
using CredsMcp;
using CredsMcp.Tests.Support;
using FluentAssertions;

namespace CredsMcp.Tests;

/// <summary>
/// A window that is provably gone costs the MCP server's walks nothing — not a probe, not a connect
/// (todo/PLAN_stale_endpoint_files_slow_every_refusal.md §4.3).
/// </summary>
/// <remarks>
/// <para>Measured on the reporting machine: 33 of 35 announcements named a pid that no longer existed, every walk dialled
/// each of them, and on Windows each dial cost about 2 s. The dead announcements here name a port that COUNTS
/// connections, so "skipped" is an observation rather than a timing: zero connections means zero probes.</para>
/// <para>The folder is the test's own, and it is left exactly as it was found — a client never deletes a window's file.</para>
/// </remarks>
public sealed class StaleWindowsTests : IDisposable
{
    private const int DeadWindows = 6;

    private readonly string _root = HostProcess.TempDirectory("creds-mcp-stale");

    public void Dispose() => HostProcess.Remove(_root);

    [Fact]
    public async Task The_read_walk_reaches_the_live_window_without_dialling_a_dead_one()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var broker = new StubBroker();
        await using var counting = new CountingListener();
        var dir = Path.Combine(_root, "endpoints");
        broker.Announce(dir);
        AnnounceDead(dir, counting.Port);
        var before = StaleWindows.Snapshot(dir);

        var read = await Windows.ReadAllInAsync(BrokerContract.Current, dir, "/v1/mcp/entries", ct);

        read.Bodies.Should().ContainSingle("the live stub still answers").Which.Should().Contain(BrokerContract.Current.Service);
        counting.Connections.Should().Be(0, "{0} announcements of exited processes must cost no probe", DeadWindows);
        StaleWindows.Snapshot(dir).Should().Equal(before, "a walk never changes the extension's folder");
    }

    [Fact]
    public async Task The_post_walk_over_only_dead_windows_dials_nothing_and_finds_nobody()
    {
        var ct = TestContext.Current.CancellationToken;
        await using var counting = new CountingListener();
        var dir = Path.Combine(_root, "endpoints");
        AnnounceDead(dir, counting.Port);

        var reply = await Windows.PostInAsync(BrokerContract.Current, dir, "/v1/mcp/use/exec", "{}", ct);

        reply.Should().BeNull("no live window serves the entry");
        counting.Connections.Should().Be(0, "{0} announcements of exited processes must cost no probe", DeadWindows);
    }

    [Fact]
    public async Task A_live_pid_on_a_port_that_is_not_ours_is_still_probed()
    {
        // The positive control: the pid check skips only what cannot be live. A live pid whose port answers something
        // else — a reused port — is exactly what the health probe exists for, and it is still asked.
        var ct = TestContext.Current.CancellationToken;
        await using var counting = new CountingListener();
        var dir = Path.Combine(_root, "endpoints");
        StaleWindows.Announce(dir, "live", Environment.ProcessId, counting.Port, "2026-10-11T12:00:00.000Z");

        var read = await Windows.ReadAllInAsync(BrokerContract.Current, dir, "/v1/mcp/entries", ct);

        read.Bodies.Should().BeEmpty();
        counting.Connections.Should().Be(1);
    }

    /// <summary>Dead windows announced NEWER than the stub, so a newest-first walk meets them first.</summary>
    private static void AnnounceDead(string dir, int port)
    {
        var pids = StaleWindows.ExitedPids(DeadWindows);
        for (var i = 0; i < pids.Count; i++)
        {
            StaleWindows.Announce(dir, $"dead-{i}", pids[i], port, $"2026-10-11T11:{i:00}:00.000Z");
        }
    }
}
