using Xunit;

[assembly: AssemblyFixture(typeof(CredsForDevs.Tests.Leftovers.LeftoversSocketRootSweepFixture))]

namespace CredsForDevs.Tests.Leftovers;

/// <summary>
/// The sweep and the audit of the SECOND root (E2.3.S2, D9 #9). A socket folder is made under <see cref="OwnedCreds.ShortSocketRoot"/>, which is not the
/// temp root on macOS (always) and on Linux (when <c>TMPDIR</c> is set). Where the two roots differ - decided on CANONICAL paths - this fixture runs the
/// copied <see cref="LeftoversSweep"/> over the short root at the start of the run and the copied audit over it at the end, through the same layout gate as
/// the main fixture. Where they are one, the main fixture's sweep IS the sweep of that root: this fixture runs none, and <see cref="OwnsASweep"/> says so.
/// </summary>
/// <remarks>
/// It reuses <see cref="LeftoversSweepFixture"/>'s own seam constructor for the run and the report, so the two fixtures say the same things in the same words;
/// every line of this one starts with the root it swept. Like the main fixture it never fails the run at its start (rule §4), and its disposal is the audit,
/// which does.
/// </remarks>
public sealed class LeftoversSocketRootSweepFixture : IAsyncDisposable
{
    private readonly LeftoversSweepFixture? _run;

    public LeftoversSocketRootSweepFixture()
        : this(OwnedCreds.ShortSocketRoot, Owned.TempRoot(), DarwinLayout.Require, RealSweep, Console.Error.WriteLine)
    {
    }

    /// <summary>The seam: the two roots, the layout requirement, the sweep of one root, where the report goes, and the audit of one root (default: the real
    /// audit over the helper's own registry).</summary>
    internal LeftoversSocketRootSweepFixture(
        string socketRoot, string tempRoot, Action requireLayout, Func<string, SweepResult> sweepOf, Action<string> report, Action<string>? auditOf = null)
    {
        TempRootSeen = OwnedCreds.Canonical(tempRoot);
        SocketRootSeen = OwnedCreds.Canonical(socketRoot);
        if (!OwnedCreds.RootsDiffer(socketRoot, tempRoot)) return;
        SweptRoot = socketRoot;
        auditOf ??= root => LeftoversSweepFixture.RealAudit(root, OwnedDir.Unreclaimed());
        _run = new LeftoversSweepFixture(
            () => LeftoversSweepFixture.GuardedSweep(requireLayout, () => sweepOf(socketRoot)),
            line => report($"[socket root {socketRoot}] {line}"),
            () => LeftoversSweepFixture.GuardedAudit(requireLayout, () => auditOf(socketRoot)));
    }

    /// <summary>The roots differ, so this fixture's run IS the sweep of the short root. False: the main fixture swept it.</summary>
    public bool OwnsASweep => _run is not null;

    /// <summary>The temp root this fixture was told the main fixture sweeps, as a canonical path (the roots it compared, kept as a record of its decision).</summary>
    public string TempRootSeen { get; }

    /// <summary>The short socket root this fixture was given, as a canonical path.</summary>
    public string SocketRootSeen { get; }

    /// <summary>The root this fixture swept; null where it swept none.</summary>
    public string? SweptRoot { get; }

    /// <summary>What the sweep of the short root did (empty when it threw); null where this fixture ran none.</summary>
    public SweepResult? LastRun => _run?.LastRun;

    /// <summary>The end-of-run audit of the short root; nothing where the main fixture's audit covers it.</summary>
    public ValueTask DisposeAsync() => _run?.DisposeAsync() ?? ValueTask.CompletedTask;

    private static SweepResult RealSweep(string root) =>
        LeftoversSweep.Run(new SweepOptions(root, DateTimeOffset.UtcNow, LeftoversSweep.MinAge, Liveness.ProbeProcess, Scope.IsMine));
}
