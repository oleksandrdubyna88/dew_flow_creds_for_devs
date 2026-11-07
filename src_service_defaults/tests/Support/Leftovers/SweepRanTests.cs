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
        // What each fixture did is read from its OWN record, not from this test's idea of the roots: the second fixture keeps the two roots it was given and the root it swept.
        sweep.LastRun.Should().NotBeNull("the main fixture swept (the copy sweeps Owned.TempRoot(), byte for byte)");
        sockets.TempRootSeen.Should().Be(OwnedCreds.Canonical(Owned.TempRoot()), "the second fixture was told the root the main fixture sweeps");
        var swept = new List<string> { sockets.TempRootSeen };
        if (sockets.OwnsASweep)
        {
            sockets.LastRun.Should().NotBeNull("the second fixture's run over the short root is recorded");
            swept.Add(OwnedCreds.Canonical(sockets.SweptRoot!));
        }
        else
        {
            sockets.LastRun.Should().BeNull("where the roots are one the second fixture runs no sweep");
        }

        TestContext.Current.AddWarning($"socket roots: temp root {sockets.TempRootSeen}, short socket root {sockets.SocketRootSeen}; swept by the two fixtures: {string.Join(", ", swept)}");

        sockets.OwnsASweep.Should().Be(sockets.SocketRootSeen != sockets.TempRootSeen, "the second fixture sweeps exactly where the canonical roots it recorded differ");
        swept.Should().OnlyHaveUniqueItems("no root is swept twice");
        swept.Count(root => root == sockets.SocketRootSeen).Should().Be(1, "the short socket root was swept exactly once, by the fixture whose record says so");
        sockets.SocketRootSeen.Should().Be(OwnedCreds.Canonical(OwnedCreds.ShortSocketRoot));
    }
}
