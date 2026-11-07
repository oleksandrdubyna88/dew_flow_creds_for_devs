using Xunit;

[assembly: AssemblyFixture(typeof(CredsForDevs.Tests.Leftovers.LeftoversSocketRootSweepFixture))]

namespace CredsForDevs.Tests.Leftovers;

/// <summary>RED stub (E2.3.S2): the fixture that does not exist yet.</summary>
public sealed class LeftoversSocketRootSweepFixture : IAsyncDisposable
{
    public LeftoversSocketRootSweepFixture()
    {
    }

    internal LeftoversSocketRootSweepFixture(
        string socketRoot, string tempRoot, Action requireLayout, Func<string, SweepResult> sweepOf, Action<string> report, Action<string>? auditOf = null)
    {
    }

    public bool OwnsASweep => false;

    public string? SweptRoot => null;

    public SweepResult? LastRun => null;

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;
}
