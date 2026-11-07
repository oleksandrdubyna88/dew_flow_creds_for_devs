using System.Diagnostics;
using System.Security.Cryptography;
using FluentAssertions;
using Xunit;

namespace CredsForDevs.Tests.Leftovers;

/// <summary>The live cross-check of the contract's TWO implementations (S4 cross-check): the shipped janitor, started the way a
/// person starts it, reads THIS helper's claim. A dead owner's folder is a <c>would run:</c> line; another owner's is a
/// <c>foreign:</c> line and never a <c>would run:</c>; neither is <c>skipped:</c>. If the first is not listed the two records
/// disagree: stop and report to the conventions owner — never adjust the C# format to pass.
///
/// <para>Linux only. On Windows the <c>bash</c> on the path may be WSL's, which sees neither the Windows temp root nor Windows pids
/// and reads every Windows claim as foreign; the Windows half is run by hand with Git for Windows' bash (S4 scenario 9).</para></summary>
public sealed class LeftoversJanitorTests : IDisposable
{
    private const string Janitor = ".claude/rules/shared/tools/janitor.sh";

    private readonly OwnedScope _owned = new();

    public void Dispose() => _owned.Dispose();

    [Fact]
    public void The_janitor_lists_a_dead_owners_folder_for_removal_and_another_owners_as_foreign()
    {
        if (!OperatingSystem.IsLinux())
        {
            Assert.Skip("Linux only: on Windows the bash on the path may be WSL's, which reads every Windows claim as foreign (janitor companion rule) — the Windows half is run by hand with Git for Windows' bash, S4 scenario 9; on macOS the janitor (bash 3.2, BSD find) was never measured here");
        }

        var root = RepositoryRoot.Path;
        File.Exists(Path.Combine(root, Janitor)).Should().BeTrue($"{Janitor} is mounted (git submodule update --init .claude/rules/shared)");
        // The janitor reads TMPDIR exactly as Path.GetTempPath does, so the plants live in a PRIVATE temp root and its listing
        // cannot race the other tests of this run creating and removing folders in the real one (measured: a `find` on a folder
        // that vanished mid-listing makes the janitor exit 1, "a listing failed").
        var tmp = _owned.Dir("janitor-root");
        var me = Owner.This;
        me.Ns.Should().NotBeNull("the janitor judges a claim only with this reader's pid namespace");
        var dead = UnmatchablePid.Next();
        UnmatchablePid.AssertNoSuchProcess(dead);
        var ours = Path.Combine(tmp, Owned.NameBase + "janitor-" + Id());
        var theirs = Path.Combine(tmp, Owned.NameBase.Replace(OwnerToken.This, OwnerFixtures.Other) + "janitor-" + Id());
        try
        {
            Plant(ours, new Owner(OwnerToken.This, me.Host, dead, me.Start, me.Ns).Format() + "\n");
            Plant(theirs, new Owner(OwnerFixtures.Other, me.Host, dead, me.Start, me.Ns).Format() + "\n");

            // Narrowed to this owner and token: the dead owner's folder is a `would run:` line, and another owner's name is outside
            // the inventory altogether (the janitor's --token narrows the listing, janitor.sh:157), so it is named nowhere.
            var (exit, stdout, stderr) = RunJanitor(root, tmp, narrow: true);

            exit.Should().Be(0, $"stderr: {stderr}");
            Lines(stdout).Should().Contain(l => l.StartsWith("would run:", StringComparison.Ordinal) && l.Contains(ours, StringComparison.Ordinal), $"stdout: {stdout}");
            (stdout + stderr).Should().NotContain(Path.GetFileName(theirs));
            TestContext.Current.AddWarning("janitor cross-check, narrowed: " + string.Join(" | ", Lines(stdout).Where(l => l.Contains(Path.GetFileName(ours), StringComparison.Ordinal))));
            Lines(stderr).Should().NotContain(l => l.StartsWith("skipped:", StringComparison.Ordinal) && l.Contains(Path.GetFileName(ours), StringComparison.Ordinal));

            // Not narrowed (the host-wide inventory of every owner): another owner's folder is a `foreign:` line, never a `would run:`
            // or a `skipped:`. The exit code is the whole temp root's business here and is not asserted.
            var (_, wideOut, wideErr) = RunJanitor(root, tmp, narrow: false);

            Lines(wideErr).Should().Contain(l => l.StartsWith("foreign:", StringComparison.Ordinal) && l.Contains(Path.GetFileName(theirs), StringComparison.Ordinal), $"stderr: {wideErr}");
            TestContext.Current.AddWarning("janitor cross-check, host-wide: " + string.Join(" | ", Lines(wideErr).Where(l => l.Contains(Path.GetFileName(theirs), StringComparison.Ordinal))));
            Lines(wideOut).Should().NotContain(l => l.StartsWith("would run:", StringComparison.Ordinal) && l.Contains(theirs, StringComparison.Ordinal));
            Lines(wideErr).Should().NotContain(l => l.StartsWith("skipped:", StringComparison.Ordinal) && (l.Contains(Path.GetFileName(ours), StringComparison.Ordinal) || l.Contains(Path.GetFileName(theirs), StringComparison.Ordinal)));
        }
        finally
        {
            Removal.Quietly(ours, Owned.DefaultWarn);
            Removal.Quietly(theirs, Owned.DefaultWarn);
        }
    }

    private static string Id() => RandomNumberGenerator.GetString("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", Owned.IdLength);

    /// <summary>A folder and its sibling claim, both aged 11 minutes (the janitor's window here is 10).</summary>
    private static void Plant(string dir, string claim)
    {
        Directory.CreateDirectory(dir);
        File.WriteAllText(dir + ".owner", claim);
        var old = DateTime.UtcNow - TimeSpan.FromMinutes(11);
        Directory.SetLastWriteTimeUtc(dir, old);
        File.SetLastWriteTimeUtc(dir + ".owner", old);
    }

    private static IEnumerable<string> Lines(string text) => text.Split('\n').Select(l => l.TrimEnd('\r'));

    private static (int Exit, string Stdout, string Stderr) RunJanitor(string root, string tmp, bool narrow)
    {
        var start = new ProcessStartInfo("bash") { WorkingDirectory = root, RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false };
        foreach (var argument in narrow ? new[] { Janitor, "--token", OwnedToken.RepoToken, "--dry-run" } : [Janitor, "--dry-run"]) start.ArgumentList.Add(argument);
        start.Environment["JANITOR_MIN_AGE_MINUTES"] = "10";
        start.Environment["TMPDIR"] = tmp;
        using var process = Process.Start(start) ?? throw new InvalidOperationException("bash did not start");
        var stdout = process.StandardOutput.ReadToEndAsync();
        var stderr = process.StandardError.ReadToEndAsync();
        if (!process.WaitForExit(TimeSpan.FromMinutes(2)))
        {
            process.Kill(entireProcessTree: true);
            throw new TimeoutException("the janitor did not finish in two minutes");
        }

        process.WaitForExit();
        return (process.ExitCode, stdout.GetAwaiter().GetResult(), stderr.GetAwaiter().GetResult());
    }
}
