using CredsBroker;
using CredsForDevs.ServiceDefaults;
using CredsForDevs.ServiceDefaults.Tests.Support;
using CredsMcp;
using FluentAssertions;

namespace CredsMcp.Tests;

/// <summary>
/// <c>creds-mcp --version</c> (plan §5.2.5): which build this is, and inside WSL which build the Windows half
/// is — the line the extension's stale-install check reads (§5.8).
/// </summary>
public sealed class VersionTests : IDisposable
{
    private readonly string _root = HostProcess.TempDirectory("creds-mcp-version");

    public void Dispose() => HostProcess.Remove(_root);

    [Fact]
    public void Version_is_its_own_startup_and_only_alone()
    {
        Program.Classify(["--version"]).Should().Be(Program.Startup.Version);
        Program.Classify(["--version", "extra"]).Should().Be(Program.Startup.Usage);
        Program.Classify(["-v"]).Should().Be(Program.Startup.Usage, "one spelling, the one the check sends");
    }

    [Fact]
    public async Task Natively_it_is_one_line_from_the_same_source_as_the_protocols_server_info()
    {
        var text = await Program.VersionTextAsync(insideWsl: false, WslInterop.CredsMcp);

        text.Should().Be($"creds-mcp {Program.Version}");
    }

    [Fact]
    public async Task Inside_wsl_the_second_line_is_the_windows_halfs_own_answer_and_its_path()
    {
        // The built binary stands in for the Windows half: the same probe, a real process, a real answer.
        var half = new WindowsBridge(HostProcess.Binary("creds-mcp"), "CREDS_TEST_UNSET_" + Guid.NewGuid().ToString("N"));

        var text = await Program.VersionTextAsync(insideWsl: true, half);

        text.Split('\n').Should().Equal(
            $"creds-mcp {Program.Version}",
            $"windows half: creds-mcp {Program.Version} ({HostProcess.Binary("creds-mcp")})");
    }

    [Fact]
    public async Task A_windows_half_that_cannot_be_started_is_said_so()
    {
        var half = new WindowsBridge(Path.Combine(_root, "no-such-binary.exe"), "CREDS_TEST_UNSET_" + Guid.NewGuid().ToString("N"));

        var text = await Program.VersionTextAsync(insideWsl: true, half);

        text.Should().EndWith($"windows half: not started ({half.WindowsBinary()})");
    }

    [Theory]
    [InlineData(null, "older than --version")]
    [InlineData("", "older than --version")]
    [InlineData("creds-mcp 0.45.0\r\n", "creds-mcp 0.45.0")]
    [InlineData("\n  creds-mcp 0.45.0  \nsecond", "creds-mcp 0.45.0")]
    public void An_old_windows_half_answers_with_a_usage_error_which_reads_as_older(string? stdout, string answer) =>
        Program.WindowsHalfAnswer(stdout).Should().Be(answer);

    [Fact]
    public async Task The_built_binary_prints_its_version_and_writes_no_log_file()
    {
        var ct = TestContext.Current.CancellationToken;
        using var host = HostProcess.Start("creds-mcp", ["--version"], new Dictionary<string, string> { [CredsLogging.DirectoryVariable] = _root });
        using var reaper = HostProcess.KillOnDispose(host);

        var stdout = await host.StandardOutput.ReadToEndAsync(ct);
        await host.WaitForExitAsync(ct).WaitAsync(TimeSpan.FromSeconds(30), ct);

        host.ExitCode.Should().Be(0);
        stdout.Trim().Should().Be($"creds-mcp {Program.Version}");
        Directory.GetFiles(_root, "*.log", SearchOption.AllDirectories).Should().BeEmpty("a one-shot answer writes no file (plan §5.1)");
    }

    [Theory]
    [InlineData(null, null, "")]
    [InlineData(null, "0", "")]
    [InlineData(null, "1", "CREDS_MCP_NO_PARENT_WATCH=1")]
    [InlineData("1", null, "started by the Linux half of the WSL bridge, whose parent says nothing about the client")]
    [InlineData("", "1", "CREDS_MCP_NO_PARENT_WATCH=1")]
    public void The_parent_is_watched_unless_relayed_from_wsl_or_switched_off(string? relayed, string? killSwitch, string off) =>
        Program.ParentWatchOff(relayed, killSwitch).Should().Be(off);

    [Fact]
    public void The_kill_switch_turns_the_watch_off_and_says_so()
    {
        var sink = new CollectingSink();
        using var log = sink.Logger();

        using var watch = Program.WatchParent(log, name => name == Program.NoParentWatchVariable ? "1" : null);

        watch.Watching.Should().BeFalse();
        sink.Messages.Should().Contain($"parent watch off: {Program.NoParentWatchVariable}=1");
    }

    [Fact]
    public void With_nothing_set_the_parent_is_watched_the_platforms_way()
    {
        Assert.SkipWhen(CredsForDevs.ServiceDefaults.ParentProcess.Id() <= 1, "this runner was started by init; there is no parent to watch");
        var sink = new CollectingSink();
        using var log = sink.Logger();

        using var watch = Program.WatchParent(log, _ => null);

        watch.Watching.Should().BeTrue();
        watch.Gone.IsCompleted.Should().BeFalse("this test's own parent is alive");
    }

    [Fact]
    public void The_help_names_the_version_flag_and_the_kill_switch()
    {
        Program.HelpText.Should().Contain("--version").And.Contain(Program.NoParentWatchVariable);
    }
}
