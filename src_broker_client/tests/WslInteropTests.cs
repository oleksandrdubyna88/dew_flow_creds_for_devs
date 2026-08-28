using CredsBroker;
using FluentAssertions;

namespace CredsBroker.Tests;

/// <summary>
/// The WSL decision, which has to be right in both directions: relaying when we should not
/// would break every ordinary Linux install, and failing to relay inside WSL leaves the CLI
/// dialling a loopback where nothing of ours listens.
/// </summary>
public class WslInteropTests
{
    private const string WslProcVersion =
        "Linux version 5.15.167.4-microsoft-standard-WSL2 (root@build) #1 SMP";

    private const string OrdinaryProcVersion =
        "Linux version 6.8.0-45-generic (buildd@lcy02) #45-Ubuntu SMP";

    [Fact]
    public void Inside_wsl_the_call_is_relayed_to_the_windows_binary()
    {
        WslInterop.ShouldRelay(isWindows: false, distro: "Ubuntu-24.04", procVersion: null, alreadyRelayed: false)
            .Should().BeTrue();
    }

    [Fact]
    public void Proc_version_alone_is_enough_when_the_variable_is_missing()
    {
        // WSL_DISTRO_NAME is absent in some service and container contexts inside WSL, so the
        // kernel string is the second, independent signal.
        WslInterop.ShouldRelay(isWindows: false, distro: null, procVersion: WslProcVersion, alreadyRelayed: false)
            .Should().BeTrue();
    }

    [Fact]
    public void The_variable_alone_is_enough_when_proc_version_cannot_be_read()
    {
        WslInterop.ShouldRelay(isWindows: false, distro: "Debian", procVersion: null, alreadyRelayed: false)
            .Should().BeTrue();
    }

    [Fact]
    public void An_ordinary_linux_machine_never_relays()
    {
        // The failure this prevents is total: every plain Linux install would try to launch a
        // Windows executable that does not exist.
        WslInterop.ShouldRelay(isWindows: false, distro: null, procVersion: OrdinaryProcVersion, alreadyRelayed: false)
            .Should().BeFalse();
    }

    [Fact]
    public void An_empty_distro_variable_is_not_a_signal()
    {
        WslInterop.ShouldRelay(isWindows: false, distro: "", procVersion: OrdinaryProcVersion, alreadyRelayed: false)
            .Should().BeFalse();
        WslInterop.ShouldRelay(isWindows: false, distro: "   ", procVersion: OrdinaryProcVersion, alreadyRelayed: false)
            .Should().BeFalse();
    }

    [Fact]
    public void The_windows_binary_never_relays_even_when_the_signals_are_present()
    {
        // A Windows shell can carry WSL variables through; without this the Windows binary
        // would launch itself.
        WslInterop.ShouldRelay(isWindows: true, distro: "Ubuntu-24.04", procVersion: WslProcVersion, alreadyRelayed: false)
            .Should().BeFalse();
    }

    [Fact]
    public void A_process_started_by_a_relay_never_relays_again()
    {
        // Not belt-and-braces: without this guard a layout where "creds.exe" resolves back to a
        // Linux binary forks processes until the machine gives up.
        WslInterop.ShouldRelay(isWindows: false, distro: "Ubuntu-24.04", procVersion: WslProcVersion, alreadyRelayed: true)
            .Should().BeFalse();
    }

    [Fact]
    public void Microsoft_is_matched_case_insensitively_because_kernel_strings_vary()
    {
        WslInterop.ShouldRelay(isWindows: false, distro: null, procVersion: "Linux version 5.15-Microsoft-standard", alreadyRelayed: false)
            .Should().BeTrue();
    }

    [Fact]
    public void The_binary_defaults_to_the_interop_path_and_honours_an_override()
    {
        var previous = Environment.GetEnvironmentVariable(WslInterop.BinaryOverrideVariable);
        try
        {
            Environment.SetEnvironmentVariable(WslInterop.BinaryOverrideVariable, null);
            WslInterop.Creds.WindowsBinary().Should().Be("creds.exe");

            Environment.SetEnvironmentVariable(WslInterop.BinaryOverrideVariable, "/mnt/c/tools/creds.exe");
            WslInterop.Creds.WindowsBinary().Should().Be("/mnt/c/tools/creds.exe");
        }
        finally
        {
            Environment.SetEnvironmentVariable(WslInterop.BinaryOverrideVariable, previous);
        }
    }

    [Fact]
    public void An_empty_override_falls_back_rather_than_trying_to_run_nothing()
    {
        var previous = Environment.GetEnvironmentVariable(WslInterop.BinaryOverrideVariable);
        try
        {
            Environment.SetEnvironmentVariable(WslInterop.BinaryOverrideVariable, "");
            WslInterop.Creds.WindowsBinary().Should().Be("creds.exe");
        }
        finally
        {
            Environment.SetEnvironmentVariable(WslInterop.BinaryOverrideVariable, previous);
        }
    }

    [Fact]
    public void The_mcp_server_crosses_as_itself_rather_than_as_the_cli()
    {
        // The failure this prevents is silent and total: a single shared "creds.exe" would send
        // an MCP client's JSON-RPC handshake to the CLI, which answers a usage error on stderr
        // and nothing at all on stdout — so the client simply waits.
        WslInterop.CredsMcp.DefaultBinary.Should().Be("creds-mcp.exe");
        WslInterop.Creds.DefaultBinary.Should().Be("creds.exe");
    }

    [Fact]
    public void Pointing_one_binary_at_a_custom_path_never_redirects_the_other()
    {
        // Two variables rather than one, which is the whole reason WindowsBridge is an instance.
        var cli = Environment.GetEnvironmentVariable(WslInterop.BinaryOverrideVariable);
        var mcp = Environment.GetEnvironmentVariable(WslInterop.McpBinaryOverrideVariable);
        try
        {
            Environment.SetEnvironmentVariable(WslInterop.BinaryOverrideVariable, "/mnt/c/tools/creds.exe");
            Environment.SetEnvironmentVariable(WslInterop.McpBinaryOverrideVariable, null);
            WslInterop.CredsMcp.WindowsBinary().Should().Be("creds-mcp.exe");

            Environment.SetEnvironmentVariable(WslInterop.McpBinaryOverrideVariable, "/mnt/c/tools/creds-mcp.exe");
            WslInterop.CredsMcp.WindowsBinary().Should().Be("/mnt/c/tools/creds-mcp.exe");
            WslInterop.Creds.WindowsBinary().Should().Be("/mnt/c/tools/creds.exe");
        }
        finally
        {
            Environment.SetEnvironmentVariable(WslInterop.BinaryOverrideVariable, cli);
            Environment.SetEnvironmentVariable(WslInterop.McpBinaryOverrideVariable, mcp);
        }
    }

    [Fact]
    public void The_two_override_variables_are_not_the_same_name()
    {
        WslInterop.McpBinaryOverrideVariable.Should().NotBe(WslInterop.BinaryOverrideVariable);
    }
}
