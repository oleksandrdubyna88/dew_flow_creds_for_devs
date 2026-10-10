using System.ComponentModel;
using System.Diagnostics;
using CredsForDevs.ServiceDefaults.Tests.Support;
using FluentAssertions;

namespace CredsForDevs.ServiceDefaults.Tests;

/// <summary>
/// Every branch of <see cref="ParentWatch"/>: the Windows handle with its pid-reuse check, the Linux/macOS
/// <c>getppid()</c> poll, and the cases where there is nothing to watch.
/// </summary>
public sealed class ParentWatchTests
{
    private static readonly TimeSpan Bound = TimeSpan.FromSeconds(10);
    private static readonly DateTime Self = new(2026, 10, 10, 12, 0, 0, DateTimeKind.Local);

    private readonly CollectingSink _sink = new();

    private sealed class FakeParent(DateTime start) : IWatchedParent
    {
        internal readonly TaskCompletionSource Exited = new(TaskCreationOptions.RunContinuationsAsynchronously);

        public DateTime StartTime => start;

        public Task WaitForExitAsync(CancellationToken ct) => Exited.Task.WaitAsync(ct);

        public void Dispose()
        {
            // Nothing held.
        }
    }

    [Fact]
    public async Task A_pid_that_now_belongs_to_a_younger_process_means_the_parent_is_already_gone()
    {
        using var log = _sink.Logger();
        using var watch = ParentWatch.ForWindows(4242, Self, _ => new FakeParent(Self.AddSeconds(3)), log);

        await watch.Gone.WaitAsync(Bound, TestContext.Current.CancellationToken);
        _sink.Messages.Should().Contain(m => m.Contains("started after this one"));
    }

    [Fact]
    public async Task A_parent_that_exits_is_reported_once_it_exits_and_not_before()
    {
        var parent = new FakeParent(Self.AddMinutes(-1));
        using var log = _sink.Logger();
        using var watch = ParentWatch.ForWindows(4242, Self, _ => parent, log);

        watch.Watching.Should().BeTrue();
        await Task.Delay(50, TestContext.Current.CancellationToken);
        watch.Gone.IsCompleted.Should().BeFalse("the parent is alive");

        parent.Exited.SetResult();
        await watch.Gone.WaitAsync(Bound, TestContext.Current.CancellationToken);
    }

    [Fact]
    public async Task A_parent_that_cannot_be_found_is_gone_already()
    {
        using var log = _sink.Logger();
        using var watch = ParentWatch.ForWindows(4242, Self, _ => throw new ArgumentException("not running"), log);

        await watch.Gone.WaitAsync(Bound, TestContext.Current.CancellationToken);
    }

    [Fact]
    public async Task A_parent_this_account_may_not_open_is_not_watched_and_never_reported_gone()
    {
        using var log = _sink.Logger();
        using var watch = ParentWatch.ForWindows(4242, Self, _ => throw new Win32Exception(5, "Access is denied"), log);

        watch.Watching.Should().BeFalse();
        await Task.Delay(50, TestContext.Current.CancellationToken);
        watch.Gone.IsCompleted.Should().BeFalse("end-of-stream stays the signal; an unwatchable parent is not a dead one");
        _sink.Messages.Should().Contain(m => m.Contains("running without the watch"));
    }

    [Fact]
    public void An_unknown_parent_pid_is_not_watched()
    {
        using var log = _sink.Logger();
        using var watch = ParentWatch.ForWindows(0, Self, _ => throw new InvalidOperationException("never opened"), log);

        watch.Watching.Should().BeFalse();
        _sink.Messages.Should().Contain("parent watch off: the parent's pid is unknown");
    }

    [Fact]
    public async Task On_unix_a_changed_ppid_means_the_process_was_re_parented()
    {
        var ppid = 700;
        using var log = _sink.Logger();
        using var watch = ParentWatch.ForUnix(700, () => ppid, TimeSpan.FromMilliseconds(20), TimeProvider.System, log);

        await Task.Delay(100, TestContext.Current.CancellationToken);
        watch.Gone.IsCompleted.Should().BeFalse("the ppid has not changed");

        ppid = 1;
        await watch.Gone.WaitAsync(Bound, TestContext.Current.CancellationToken);
        _sink.Messages.Should().Contain(m => m.Contains("re-parented"));
    }

    [Theory]
    [InlineData(1)]
    [InlineData(0)]
    public void On_unix_a_process_started_by_init_has_no_parent_to_lose(int startPpid)
    {
        using var log = _sink.Logger();
        using var watch = ParentWatch.ForUnix(startPpid, () => 99, TimeSpan.FromMilliseconds(20), TimeProvider.System, log);

        watch.Watching.Should().BeFalse();
        watch.Gone.IsCompleted.Should().BeFalse();
    }

    [Fact]
    public void Off_says_why_and_never_completes()
    {
        using var log = _sink.Logger();
        using var watch = ParentWatch.Off("a test", log);

        watch.Gone.IsCompleted.Should().BeFalse();
        _sink.Messages.Should().Contain("parent watch off: a test");
    }

    [Fact]
    public async Task The_real_watch_on_this_test_process_sees_a_living_parent()
    {
        // The platform path end to end: this runner's parent is alive for the whole test.
        using var log = _sink.Logger();
        using var watch = ParentWatch.Start(log);

        watch.Watching.Should().BeTrue("the runner has a real parent that this account may watch");
        await Task.Delay(100, TestContext.Current.CancellationToken);
        watch.Gone.IsCompleted.Should().BeFalse();
    }

    [Fact]
    public async Task The_real_windows_opener_sees_a_process_exit()
    {
        Assert.SkipUnless(OperatingSystem.IsWindows(), "the handle path is Windows'");
        // A child of this test stands in for a parent: same opener, same handle, same wait.
        using var child = Process.Start(new ProcessStartInfo("cmd.exe", "/c exit 0") { CreateNoWindow = true, UseShellExecute = false })!;
        using var log = _sink.Logger();
        using var watch = ParentWatch.ForWindows(child.Id, DateTime.MaxValue, ParentWatchOpener(), log);

        await watch.Gone.WaitAsync(Bound, TestContext.Current.CancellationToken);
    }

    /// <summary>The production opener, reached through <see cref="ParentWatch.Start"/>'s Windows branch.</summary>
    private static Func<int, IWatchedParent> ParentWatchOpener() => ParentWatch.OpenProcess;
}
