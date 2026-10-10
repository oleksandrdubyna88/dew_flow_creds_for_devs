using CredsForDevs.ServiceDefaults;
using FluentAssertions;

namespace CredsForDevs.ServiceDefaults.Tests;

/// <summary>The ladder of §5.1: the override, then the folder each platform tells a person to look in.</summary>
public sealed class LogRootTests
{
    private static Func<string, string?> Env(string? dir = null, string? stateHome = null) =>
        name => name switch
        {
            CredsLogging.DirectoryVariable => dir,
            "XDG_STATE_HOME" => stateHome,
            _ => null,
        };

    private static readonly string Home = Path.Combine(Path.GetTempPath(), "home");
    private static readonly string Local = Path.Combine(Path.GetTempPath(), "local");

    [Theory]
    [InlineData(LogPlatform.Windows)]
    [InlineData(LogPlatform.MacOS)]
    [InlineData(LogPlatform.Linux)]
    public void The_override_wins_on_every_platform(LogPlatform platform)
    {
        LogRoot.For(platform, Env(dir: "/somewhere/logs"), Home, Local).Should().Be("/somewhere/logs");
    }

    [Fact]
    public void Windows_uses_local_app_data()
    {
        LogRoot.For(LogPlatform.Windows, Env(), Home, Local).Should().Be(Path.Combine(Local, "creds-for-devs", "logs"));
    }

    [Fact]
    public void MacOS_uses_the_library_logs_folder()
    {
        LogRoot.For(LogPlatform.MacOS, Env(), Home, Local).Should().Be(Path.Combine(Home, "Library", "Logs", "creds-for-devs"));
    }

    [Fact]
    public void Linux_uses_an_absolute_xdg_state_home_and_otherwise_the_default_under_home()
    {
        var state = Path.Combine(Path.GetTempPath(), "state");
        LogRoot.For(LogPlatform.Linux, Env(stateHome: state), Home, Local)
            .Should().Be(Path.Combine(state, "creds-for-devs", "logs"));
        LogRoot.For(LogPlatform.Linux, Env(), Home, Local)
            .Should().Be(Path.Combine(Home, ".local", "state", "creds-for-devs", "logs"));
    }

    [Fact]
    public void A_relative_xdg_state_home_is_ignored_as_the_spec_says()
    {
        LogRoot.For(LogPlatform.Linux, Env(stateHome: "relative/state"), Home, Local)
            .Should().Be(Path.Combine(Home, ".local", "state", "creds-for-devs", "logs"));
    }

    [Theory]
    [InlineData(LogPlatform.Windows)]
    [InlineData(LogPlatform.MacOS)]
    [InlineData(LogPlatform.Linux)]
    public void No_known_folder_means_no_root_rather_than_the_working_directory(LogPlatform platform)
    {
        LogRoot.For(platform, Env(), string.Empty, string.Empty).Should().BeEmpty();
    }
}
