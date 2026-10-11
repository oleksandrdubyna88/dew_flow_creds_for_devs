using CredsBroker;
using CredsForDevs.ServiceDefaults.Tests.Support;
using FluentAssertions;

namespace CredsCli.Tests;

/// <summary>
/// The BUILT <c>creds</c>, walking a folder of windows that crashed: it says no without dialling any of them
/// (todo/PLAN_stale_endpoint_files_slow_every_refusal.md).
/// </summary>
/// <remarks>
/// <para>The symptom this exists for, measured on the reporting machine: 35 announcements, 34 of them of closed windows,
/// and <c>creds config -</c> with a key no window holds took 68 s to refuse — on Windows and through WSL alike. The dead
/// announcements here name a port that COUNTS connections, so the test observes the cause (a probe per dead file)
/// rather than a timing a busy machine could blur.</para>
/// <para>All three walks of the CLI are covered: the config read, an alias call and <c>creds ls</c>. The folder is the
/// test's own and is left exactly as found. The key is a fake one, sent on stdin as the product requires.</para>
/// </remarks>
public sealed class StaleWindowsProcessTests : IDisposable
{
    private const int DeadWindows = 6;
    private const string FakeKey = "cfgk_FAKEFAKEFAKEFAKEFAKEFAKEFAKE";

    private static readonly TimeSpan Bound = TimeSpan.FromSeconds(60);

    private readonly string _root = HostProcess.TempDirectory("creds-cli-stale");

    public void Dispose() => HostProcess.Remove(_root);

    [Theory]
    [InlineData("config", "denied", "no running VS Code window holds that config key")]
    [InlineData("alias", "entityGone", "no running VS Code window has \"prod-db\" enabled")]
    [InlineData("ls", "brokerUnreachable", "no CredsForDevs window is running here")]
    public async Task A_walk_over_crashed_windows_dials_none_of_them_and_keeps_its_sentence(string walk, string exit, string sentence)
    {
        var ct = TestContext.Current.CancellationToken;
        await using var counting = new CountingListener();
        var dir = Path.Combine(_root, "endpoints");
        var pids = StaleWindows.ExitedPids(DeadWindows);
        for (var i = 0; i < pids.Count; i++)
        {
            StaleWindows.Announce(dir, $"dead-{i}", pids[i], counting.Port, $"2026-10-11T11:{i:00}:00.000Z");
        }
        var before = StaleWindows.Snapshot(dir);
        var env = new Dictionary<string, string>
        {
            [Endpoints.DirectoryOverrideVariable] = dir,
            ["CREDS_LOG_DIR"] = _root,
        };

        using var creds = HostProcess.Start("creds", Arguments(walk), env);
        using var reaper = HostProcess.KillOnDispose(creds);
        await creds.StandardInput.WriteAsync((walk == "config" ? FakeKey + "\n" : string.Empty).AsMemory(), ct);
        creds.StandardInput.Close();
        var stderr = creds.StandardError.ReadToEndAsync(ct);
        (await HostProcess.ExitsWithinAsync(creds, Bound, ct)).Should().BeTrue();

        creds.ExitCode.Should().Be(BrokerContract.Current.Exit(exit));
        (await stderr).Should().Contain(sentence, "the refusal is the one it always was");
        counting.Connections.Should().Be(0, "{0} announcements of exited processes must cost no probe", DeadWindows);
        StaleWindows.Snapshot(dir).Should().Equal(before, "a client never changes the extension's folder");
    }

    private static string[] Arguments(string walk) => walk switch
    {
        "config" => ["config", "-"],
        "alias" => ["run", "prod-db"],
        _ => ["ls"],
    };
}
