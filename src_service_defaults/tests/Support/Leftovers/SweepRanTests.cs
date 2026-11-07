using FluentAssertions;

namespace CredsForDevs.Tests.Leftovers;

/// <summary>
/// Every one of the five test executables sweeps the temp root at its start (E2.3 sc. 1). The copied <see cref="LeftoversSweepFixture"/> is an
/// assembly fixture: xUnit builds it before the first test, and a test class that asks for it in its constructor gets the SAME instance. This file is
/// linked into all five projects, so a project that lost the fixture's link (or its <c>AssemblyFixture</c> line) fails to run here, by name, at
/// once - xUnit says the class "did not have matching fixture data".
/// </summary>
/// <remarks>This proves that the fixture ran. It does not prove what it collected: the sweep's own tests do that on prepared folders.</remarks>
public sealed class SweepRanTests(LeftoversSweepFixture sweep)
{
    [Fact]
    public void TheStartOfRunSweep_RanBeforeTheFirstTest()
    {
        sweep.LastRun.Should().NotBeNull("the assembly fixture built before this test, and the sweep ran in its constructor");
    }
}
