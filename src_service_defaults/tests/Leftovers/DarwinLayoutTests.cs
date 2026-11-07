using FluentAssertions;
using Xunit;

namespace CredsForDevs.Tests.Leftovers;

/// <summary>The macOS <c>lstat</c> layout, measured on the runner (see <see cref="DarwinLayout"/>). Every sweep and audit test calls
/// <see cref="DarwinLayout.Require"/> first, so a layout that does not hold fails them all, loudly, with the checks that failed.</summary>
public sealed class DarwinLayoutTests
{
    [Fact]
    public void The_stat_layout_holds_on_this_runner_and_its_values_are_printed()
    {
        if (!OperatingSystem.IsMacOS()) Assert.Skip("Darwin's struct stat — macOS only");

        var report = DarwinLayout.Shared();

        foreach (var line in report.Values) TestContext.Current.AddWarning("darwin layout: " + line);
        report.Problems.Should().BeEmpty("every field the helper reads is checked against something known; the values are in the test warnings above");
    }

    [Fact]
    public void The_ci_runner_is_arm64_the_only_measured_architecture()
    {
        if (!OperatingSystem.IsMacOS()) Assert.Skip("the macOS runner's architecture — macOS only");

        var arch = System.Runtime.InteropServices.RuntimeInformation.ProcessArchitecture;

        TestContext.Current.AddWarning($"darwin layout: arch={arch}; only Arm64 (lstat) is measured, X64 (lstat$INODE64) never ran anywhere");
        if (Environment.GetEnvironmentVariable("GITHUB_ACTIONS") != "true") return; // a person's own Mac may be Intel: said above, not failed
        arch.Should().Be(System.Runtime.InteropServices.Architecture.Arm64, "the CI runner (macos-latest) is Arm64: the x86-64 entry points are UNMEASURED, so a run on any other CPU proves nothing about them");
    }
}
