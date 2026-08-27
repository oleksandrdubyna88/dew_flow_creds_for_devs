using System.Text.Json;
using CredsBroker;
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

}
