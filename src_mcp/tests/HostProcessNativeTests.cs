using CredsBroker;
using CredsForDevs.ServiceDefaults.Tests.Support;
using FluentAssertions;

namespace CredsMcp.Tests;

/// <summary>
/// The process tests' starter makes its child take the native path on any machine (E5,
/// PLAN_wsl_bridge_outlives_its_client.md): inside a WSL distribution the built binaries would otherwise take the
/// pump path and hand the session to a Windows binary.
/// </summary>
/// <remarks>
/// Here, in a project that references <see cref="WslInterop"/>, so the starter's two names and its reading of
/// <c>/proc/version</c> are pinned against the product's own — a renamed marker would make the starter set a variable
/// nothing reads, and the five tests it exists for would fail inside WSL again with nothing on CI to notice.
/// </remarks>
public sealed class HostProcessNativeTests
{
    private const string WslProcVersion = "Linux version 6.18.33.2-microsoft-standard-WSL2 (root@build) #1 SMP";

    [Fact]
    public void The_marker_it_sets_is_the_one_the_product_reads_as_native()
    {
        HostProcess.RelayedVariable.Should().Be(WslInterop.RelayedVariable);
        WslInterop.ShouldRelay(isWindows: false, distro: "Ubuntu", procVersion: WslProcVersion, alreadyRelayed: true)
            .Should().BeFalse("the marker alone turns the pump off, whatever else the machine says");
    }

    [Fact]
    public void It_reads_proc_version_as_the_product_does()
    {
        HostProcess.InsideWsl(WslProcVersion).Should().BeTrue();
        WslInterop.ShouldRelay(isWindows: false, distro: null, procVersion: WslProcVersion, alreadyRelayed: false)
            .Should().BeTrue("the product reads the same text as WSL, which is why the variable alone is not enough");
        HostProcess.InsideWsl("Linux version 6.8.0-1015-azure (buildd@lcy02) #17-Ubuntu SMP").Should().BeFalse();
        HostProcess.InsideWsl(null).Should().BeFalse();
    }

    [Fact]
    public void Inside_wsl_the_child_loses_the_distro_name_and_gets_the_marker()
    {
        var child = new Dictionary<string, string?> { [HostProcess.DistroVariable] = "Ubuntu", ["KEEP"] = "1" };

        HostProcess.Native(child, new Dictionary<string, string>(), insideWsl: true);

        child.Should().NotContainKey(HostProcess.DistroVariable);
        child[HostProcess.RelayedVariable].Should().Be("1");
        child["KEEP"].Should().Be("1", "nothing else of the inherited environment is touched");
    }

    [Fact]
    public void Outside_wsl_only_the_distro_name_goes()
    {
        var child = new Dictionary<string, string?> { [HostProcess.DistroVariable] = "stray" };

        HostProcess.Native(child, new Dictionary<string, string>(), insideWsl: false);

        child.Should().NotContainKey(HostProcess.DistroVariable);
        child.Should().NotContainKey(HostProcess.RelayedVariable, "plain Linux, macOS and Windows keep the environment they always had — the parent watch included");
    }

    [Theory]
    [InlineData("WSL_DISTRO_NAME")]
    [InlineData("CREDS_RELAYED_FROM_WSL")]
    public void A_test_that_names_either_variable_gets_exactly_what_it_asked_for(string named)
    {
        var child = new Dictionary<string, string?> { [named] = "asked" };

        HostProcess.Native(child, new Dictionary<string, string> { [named] = "asked" }, insideWsl: true);

        child.Should().Equal(new Dictionary<string, string?> { [named] = "asked" }, "the pump tests set WSL_DISTRO_NAME on purpose");
    }
}
