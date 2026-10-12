using System.Text.Json;
using CredsBroker;
using CredsForDevs.ServiceDefaults.Tests.Support;
using FluentAssertions;

namespace CredsBroker.Tests;

/// <summary>
/// Finding a window by its announcement, and the alias grammar that decides whether the second
/// argument is a name or a token.
/// </summary>
public class EndpointsTests
{
    private static string Temp()
    {
        var dir = Path.Combine(Path.GetTempPath(), "creds-endpoints-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        return dir;
    }

    private static void Write(string dir, int pid, int port, string startedAt, string? socket = null)
    {
        var json = JsonSerializer.Serialize(
            new Endpoint(pid, port, socket, startedAt),
            BrokerJsonContext.Default.Endpoint);
        File.WriteAllText(Path.Combine(dir, $"window-{pid}.json"), json);
    }

    [Fact]
    public void An_announcement_is_read_back()
    {
        var dir = Temp();
        Write(dir, pid: 42, port: 51234, startedAt: "2026-08-26T10:00:00.000Z");

        var found = Endpoints.Read(dir);

        found.Should().HaveCount(1);
        found[0].Port.Should().Be(51234);
        found[0].Pid.Should().Be(42);
    }

    [Fact]
    public void The_newest_window_is_tried_first()
    {
        // The window a person just opened is the one they mean.
        var dir = Temp();
        Write(dir, pid: 1, port: 1000, startedAt: "2026-08-26T09:00:00.000Z");
        Write(dir, pid: 2, port: 2000, startedAt: "2026-08-26T11:00:00.000Z");

        Endpoints.Read(dir).Select(e => e.Pid).Should().ContainInOrder(2, 1);
    }

    [Fact]
    public void A_half_written_or_foreign_file_is_skipped_rather_than_thrown_over()
    {
        // A window killed mid-announce leaves exactly this, and it must not hide the others.
        var dir = Temp();
        Write(dir, pid: 1, port: 1000, startedAt: "2026-08-26T09:00:00.000Z");
        File.WriteAllText(Path.Combine(dir, "window-99.json"), "{\"pid\": 99, \"por");
        File.WriteAllText(Path.Combine(dir, "window-98.json"), "{\"unrelated\": true}");
        File.WriteAllText(Path.Combine(dir, "notes.txt"), "not an announcement");

        Endpoints.Read(dir).Select(e => e.Pid).Should().Equal(1);
    }

    [Fact]
    public void An_impossible_port_or_pid_is_refused()
    {
        var dir = Temp();
        Write(dir, pid: 1, port: 0, startedAt: "2026-08-26T09:00:00.000Z");
        Write(dir, pid: 2, port: 70000, startedAt: "2026-08-26T09:00:00.000Z");
        Write(dir, pid: 3, port: 1234, startedAt: "2026-08-26T09:00:00.000Z");

        Endpoints.Read(dir).Select(e => e.Pid).Should().Equal(3);
    }

    [Fact]
    public void A_missing_directory_is_an_empty_list_rather_than_a_crash()
    {
        Endpoints.Read(Path.Combine(Path.GetTempPath(), "does-not-exist-" + Guid.NewGuid())).Should().BeEmpty();
        Endpoints.Read(null).Should().BeEmpty();
    }

    [Fact]
    public void The_override_wins_over_the_platform_default()
    {
        Endpoints.DirectoryFor("/custom/place", appData: "C:/AppData", home: "/home/dev", isWindows: true)
            .Should().Be("/custom/place");
    }

    [Fact]
    public void The_default_follows_the_platform()
    {
        Endpoints.DirectoryFor(null, appData: "C:/AppData", home: null, isWindows: true)
            .Should().Contain("AppData").And.Contain("globalStorage");

        Endpoints.DirectoryFor(null, appData: null, home: "/home/dev", isWindows: false)
            .Should().Contain("/home/dev").And.Contain(".config");
    }

    [Fact]
    public void With_nothing_to_go_on_there_is_no_directory_rather_than_a_wrong_one()
    {
        // Better to say "I do not know where to look" than to invent a path and report that
        // nothing is running.
        Endpoints.DirectoryFor(null, appData: null, home: null, isWindows: true).Should().BeNull();
        Endpoints.DirectoryFor(null, appData: null, home: null, isWindows: false).Should().BeNull();
        Endpoints.DirectoryFor("   ", appData: null, home: null, isWindows: false).Should().BeNull();
    }

    // --- a window that is provably gone costs no probe (PLAN_stale_endpoint_files_slow_every_refusal.md §4.3) -----

    [Fact]
    public void A_window_whose_process_has_exited_is_not_handed_to_a_walk()
    {
        // The measured case: 33 of 35 announcements named a pid that no longer existed, and each cost a probe.
        var dir = Temp();
        var dead = StaleWindows.ExitedPids(3);
        foreach (var pid in dead)
        {
            Write(dir, pid, port: 50000 + (pid % 10000), startedAt: "2026-10-11T10:00:00.000Z");
        }
        Write(dir, Environment.ProcessId, port: 1234, startedAt: "2026-10-11T09:00:00.000Z");

        Endpoints.ReadLive(dir).Select(e => e.Pid).Should().Equal(
            [Environment.ProcessId],
            "an announcement whose pid is gone ({0}) cannot be a live window, so a walk must not dial it",
            string.Join(", ", dead));
    }

    [Fact]
    public void Reading_the_live_windows_never_changes_the_folder()
    {
        // The files are the extension's. A client that proved a window dead says nothing about it on disk.
        var dir = Temp();
        foreach (var pid in StaleWindows.ExitedPids(2))
        {
            Write(dir, pid, port: 40000 + (pid % 10000), startedAt: "2026-10-11T10:00:00.000Z");
        }
        var before = StaleWindows.Snapshot(dir);

        _ = Endpoints.ReadLive(dir);

        StaleWindows.Snapshot(dir).Should().Equal(before);
    }

    [Fact]
    public void Only_a_pid_that_is_gone_counts_as_gone()
    {
        Endpoints.PidIsGone(Environment.ProcessId).Should().BeFalse("this process is running");
        Endpoints.PidIsGone(StaleWindows.ExitedPids(1)[0]).Should().BeTrue("that process was started and has exited");

        // A process this user may not open is still a process: on Windows the System process, elsewhere init. The
        // probe decides about it, as it always did — a pid check that read "cannot open" as "gone" would skip a live
        // window of another session.
        Endpoints.PidIsGone(OperatingSystem.IsWindows() ? 4 : 1).Should().BeFalse();
    }

    [Fact]
    public void The_plain_read_still_returns_every_announcement()
    {
        // RelayPipe reads agent addresses through Read, and the MCP's diagnostic counts what was announced — neither
        // is a probe walk, and neither may lose a file to the pid check.
        var dir = Temp();
        var dead = StaleWindows.ExitedPids(1)[0];
        Write(dir, dead, port: 4242, startedAt: "2026-10-11T10:00:00.000Z");

        Endpoints.Read(dir).Select(e => e.Pid).Should().Equal(dead);
    }
}
