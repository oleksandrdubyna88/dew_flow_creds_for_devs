using FluentAssertions;

namespace CredsForDevs.Tests.Leftovers;

/// <summary>
/// Every one of the five test executables sweeps the temp root at its start (E2.3 sc. 1), and the socket root where it is another root (S2.8). The copied
/// <see cref="LeftoversSweepFixture"/> and creds' <see cref="LeftoversSocketRootSweepFixture"/> are assembly fixtures: xUnit builds each before the first
/// test, and a test class that asks for them in its constructor gets the SAME instances. This file is linked into all five projects (the wildcard brings
/// the test with the helper), so a project that lost a fixture's <c>AssemblyFixture</c> line fails to run here, by name, at once - xUnit says the class
/// "did not have matching fixture data".
/// </summary>
/// <remarks>This proves that the fixtures ran and what each swept. It does not prove what they collected: the sweep's own tests do that on prepared folders.</remarks>
public sealed class SweepRanTests(LeftoversSweepFixture sweep, LeftoversSocketRootSweepFixture sockets)
{
    [Fact]
    public void TheStartOfRunSweep_RanBeforeTheFirstTest()
    {
        sweep.LastRun.Should().NotBeNull("the assembly fixture built before this test, and the sweep ran in its constructor");
    }

    [Fact]
    public void TheShortSocketRoot_WasSweptExactlyOnce_ByTheMainFixtureWhereTheRootsAreOne_AndByTheSocketRootFixtureWhereTheyDiffer()
    {
        var temp = OwnedCreds.Canonical(Owned.TempRoot());
        var socket = OwnedCreds.Canonical(OwnedCreds.ShortSocketRoot);
        var swept = new List<string> { temp }; // the main fixture's sweep is over the temp root (its LastRun is asserted above)
        if (sockets.OwnsASweep) swept.Add(OwnedCreds.Canonical(sockets.SweptRoot!));
        TestContext.Current.AddWarning($"socket roots: temp root {temp}, short socket root {socket}; swept by the two fixtures: {string.Join(", ", swept)}");

        sockets.OwnsASweep.Should().Be(OwnedCreds.RootsDiffer(Owned.TempRoot(), OwnedCreds.ShortSocketRoot), "the second fixture sweeps exactly where the canonical roots differ");
        swept.Should().OnlyHaveUniqueItems("no root is swept twice");
        swept.Count(root => root == socket).Should().Be(1, "the short socket root was swept exactly once");
        if (sockets.OwnsASweep) sockets.LastRun.Should().NotBeNull("the second fixture's run over the short root is recorded");
        else sockets.LastRun.Should().BeNull("where the roots are one the second fixture runs no sweep");
    }
}
