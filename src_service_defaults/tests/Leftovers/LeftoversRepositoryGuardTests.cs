using FluentAssertions;
using Xunit;

namespace CredsForDevs.Tests.Leftovers;

/// <summary>The guard over THIS repository (S4 scenario 1): nothing under <c>tests/</c>, <c>src/</c>, the scripts or the workflows
/// makes a temp path, a worktree, a container or a shared-store write outside the helper, names a leftover without its owner, or
/// sweeps by the bare prefix. The failure message lists every finding as <c>file:line — class — text</c>.</summary>
public sealed class LeftoversRepositoryGuardTests
{
    [Fact]
    public void This_repository_passes_the_guard()
    {
        var report = LeftoversGuard.Scan(RepositoryRoot.Path, RepositoryRoot.Path);

        report.FilesScanned.Should().BeGreaterThan(0, report.Describe(RepositoryRoot.Path));
        report.Findings.Should().BeEmpty(Environment.NewLine + report.Describe(RepositoryRoot.Path));
    }
}
