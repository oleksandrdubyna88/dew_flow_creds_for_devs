using Xunit;

[assembly: AssemblyFixture(typeof(CredsForDevs.Tests.Leftovers.LeftoversSweepFixture))]

namespace CredsForDevs.Tests.Leftovers;

/// <summary>The start-of-run sweep, as an assembly fixture: xUnit v3 builds it before any test of the assembly runs, so a
/// killed run's leftovers are collected before this run makes its own. It sweeps the REAL temp root, keeps what it did in
/// <see cref="LastRun"/>, and says something only when there is something to say. It never fails the run: the constructor
/// does not throw (rule §4) — a sweep error is a reported line, and the exit code is the tests'. Its disposal is the end-of-run
/// audit, which DOES throw.</summary>
public sealed class LeftoversSweepFixture : IAsyncDisposable
{
    /// <summary>How many preserved entries the start-of-run report names, path and reason each; past it one line says how many were left out
    /// (the sweep's result itself, <see cref="LastRun"/>, is never trimmed).</summary>
    public const int MaxPreservedLines = 20;

    private readonly Action _audit;

    public LeftoversSweepFixture()
        : this(RealSweep, Console.Error.WriteLine, () => RealAudit(Owned.TempRoot(), OwnedDir.Unreclaimed()))
    {
    }

    /// <summary>The seam: the sweep to run and where its report goes (no test is running yet when the real one builds).</summary>
    internal LeftoversSweepFixture(Func<SweepResult> sweep, Action<string> report, Action? audit = null)
    {
        _audit = audit ?? (() => { });
        SweepResult run;
        try
        {
            run = sweep();
        }
        catch (Exception ex)
        {
            Say(report, $"{Header} — error: sweep failed: {ex.Message.Split('\n')[0].TrimEnd('\r')}");
            LastRun = SweepResult.Empty;
            return;
        }

        LastRun = run;
        if (run.Count == 0) return;
        foreach (var line in ReportLines(run)) Say(report, line);
    }

    /// <summary>The lines said about a sweep that did something: the summary, the listed entries, the preserved entries (path and
    /// reason, at most <see cref="MaxPreservedLines"/> of them, then one line for the rest) and the errors.</summary>
    private static IEnumerable<string> ReportLines(SweepResult run) =>
        new[] { $"{Header} — removed {run.Removed.Count}, preserved {run.Preserved.Count}, listed {run.Listed.Count}" }
            .Concat(run.Listed.Select(line => "  " + line))
            .Concat(run.Preserved.Take(MaxPreservedLines).Select(kept => $"  preserved: {kept.Path} — {kept.Reason}"))
            .Concat(NotShown(run.Preserved.Count))
            .Concat(run.Errors.Select(error => "  error: " + error));

    private static IEnumerable<string> NotShown(int preserved) =>
        preserved <= MaxPreservedLines ? [] : [$"  … {preserved - MaxPreservedLines} more preserved entries are not shown (preserved {preserved} in all; the first {MaxPreservedLines} are named above)"];

    /// <summary>What the sweep of this run did; empty when it threw.</summary>
    public SweepResult LastRun { get; }

    private static string Header => $"{OwnedToken.RepoToken} tests: leftovers";

    /// <summary>After the last test of the assembly: a run that leaves a folder it claimed fails (<see cref="LeftoversAudit"/>). The
    /// throw is the point — a warning would let the leak merge.</summary>
    public ValueTask DisposeAsync()
    {
        _audit();
        return ValueTask.CompletedTask;
    }

    /// <summary>The audit of the real run, with the seams a test needs: the temp root, the registry, the kernel-owner question and
    /// the environment. It looks for THIS process's own record, never the run's (<c>TESTSTODELETE_RUN</c>): under rule §3 every child
    /// of a run writes the run's record, so the run's record would name a sibling's folders too.</summary>
    internal static void RealAudit(string tmp, IReadOnlyList<OwnedDir> registry, Func<string, bool>? mine = null, Func<string, string?>? env = null) =>
        GuardedAudit(DarwinLayout.Require, () => LeftoversAudit.Run(tmp, Owner.This, registry, mine, env));

    private static SweepResult RealSweep() =>
        GuardedSweep(DarwinLayout.Require, () => LeftoversSweep.Run(new SweepOptions(Owned.TempRoot(), DateTimeOffset.UtcNow, LeftoversSweep.MinAge, Liveness.ProbeProcess, Scope.IsMine)));

    /// <summary>The sweep behind the layout requirement: it removes by identity, so on macOS it runs only after the layout holds. A requirement
    /// that throws means NO sweep runs and the one exception is what the constructor reports.</summary>
    internal static SweepResult GuardedSweep(Action requireLayout, Func<SweepResult> sweep)
    {
        requireLayout();
        return sweep();
    }

    /// <summary>The same for the end-of-run audit, which removes folders by identity too: the requirement's exception ends the run's audit, and
    /// nothing is removed.</summary>
    internal static void GuardedAudit(Action requireLayout, Action audit)
    {
        requireLayout();
        audit();
    }

    private static void Say(Action<string> report, string line)
    {
        try
        {
            report(line);
        }
        catch (Exception)
        {
            // A report that cannot be written is not a reason to fail the run.
        }
    }
}
