using System.Diagnostics;
using CredsForDevs.ServiceDefaults.Tests.Support;
using FluentAssertions;

namespace CredsMcp.Tests;

/// <summary>
/// What <see cref="ParentWatchProcessTests"/> does at its end when the host it started has not ended (the coai code gate, G0): it ends the host first and removes the folders
/// after, and it removes nothing when the end cannot be confirmed. The host here is a fixture child (<c>sleep</c>), so the pin runs where the real host cannot (this
/// machine's WSL path), and it names the order the real test relies on.
/// </summary>
public sealed class ParentWatchDisposeTests
{
    private static Process Sleeper()
    {
        Assert.SkipWhen(OperatingSystem.IsWindows(), "the fixture child is a POSIX program");
        return Process.Start(new ProcessStartInfo("sleep", "60") { UseShellExecute = false })!;
    }

    [Fact]
    public void A_host_still_running_at_the_end_is_ended_first_and_its_folders_are_removed_after()
    {
        using var host = Sleeper();
        using var cleanup = new Cleanup(host);
        var running = new List<bool>();

        ParentWatchProcessTests.EndHostThenRemove(host.Id, () => running.Add(!host.HasExited));

        running.Should().Equal([false], "the folders are removed only after the host has ended");
        host.HasExited.Should().BeTrue();
    }

    [Fact]
    public void A_host_whose_end_cannot_be_confirmed_keeps_its_folders_and_the_test_fails()
    {
        using var host = Sleeper();
        using var cleanup = new Cleanup(host);
        var removed = false;
        var end = () => ParentWatchProcessTests.EndHostThenRemove(host.Id, () => removed = true, (_, _) => false);

        end.Should().Throw<InvalidOperationException>().WithMessage($"*{host.Id}*not confirmed*");
        removed.Should().BeFalse("a host that may still be running keeps its folders, so the audit names them");
    }

    [Fact]
    public void A_host_that_has_already_ended_is_not_touched_and_its_folders_are_removed()
    {
        using var host = Sleeper();
        using var cleanup = new Cleanup(host);
        host.Kill();
        host.WaitForExit();
        var removed = false;

        ParentWatchProcessTests.EndHostThenRemove(host.Id, () => removed = true);

        removed.Should().BeTrue();
    }

    /// <summary>Whatever a test leaves of its fixture child, ended by the test itself.</summary>
    private sealed class Cleanup(Process host) : IDisposable
    {
        public void Dispose()
        {
            if (host.HasExited) return;
            host.Kill(entireProcessTree: true);
            host.WaitForExit();
        }
    }
}
