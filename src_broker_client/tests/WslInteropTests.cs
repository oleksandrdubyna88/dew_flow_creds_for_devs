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
    public void A_relay_with_input_redirects_stdin_and_nothing_else()
    {
        // stdout and stderr stay inherited, exactly as Relay leaves them: the config document is
        // parsed by a program, and a pump in between is how a bridge quietly re-encodes it.
        var start = new WindowsBridge("some-binary", "CREDS_TEST_UNSET_VARIABLE").StartInfoWithInput(["config", "-"]);

        start.RedirectStandardInput.Should().BeTrue();
        start.RedirectStandardOutput.Should().BeFalse("stdout passes through byte for byte");
        start.RedirectStandardError.Should().BeFalse("a diagnostic from the Windows side reaches the terminal");
        start.ArgumentList.Should().Equal("config", "-");
        start.Environment[WslInterop.RelayedVariable].Should().Be("1");
        start.Environment[WslInterop.WslEnvVariable].Should().Contain(
            WslInterop.RelayedVariable,
            "the variable crosses the bridge only when WSLENV names it (E3: the Windows half watched the wrong parent without it)");
    }

    [Fact]
    public void A_relay_with_input_delivers_the_text_and_closes_stdin()
    {
        // A real child that reads stdin to EOF and says by its exit code whether the text arrived.
        // One left with stdin open would hang here instead of exiting.
        var (binary, args) = OperatingSystem.IsWindows()
            ? ("findstr", new[] { "/c:needle-7f3a" })
            : ("grep", new[] { "-q", "needle-7f3a" });
        var bridge = new WindowsBridge(binary, "CREDS_TEST_UNSET_VARIABLE");

        bridge.RelayWithInput(args, "needle-7f3a\n").Should().Be(0);
        bridge.RelayWithInput(args, "haystack\n").Should().NotBe(0);
    }

    [Fact]
    public void The_two_override_variables_are_not_the_same_name()
    {
        WslInterop.McpBinaryOverrideVariable.Should().NotBe(WslInterop.BinaryOverrideVariable);
    }

    [Theory]
    [InlineData(null, "CREDS_RELAYED_FROM_WSL")]
    [InlineData("", "CREDS_RELAYED_FROM_WSL")]
    [InlineData("CREDS_ENDPOINT_DIR/p", "CREDS_ENDPOINT_DIR/p:CREDS_RELAYED_FROM_WSL")]
    [InlineData("CREDS_RELAYED_FROM_WSL", "CREDS_RELAYED_FROM_WSL")]
    [InlineData("A:CREDS_RELAYED_FROM_WSL/u:B", "A:B:CREDS_RELAYED_FROM_WSL")]
    [InlineData("CREDS_RELAYED_FROM_WSL/w", "CREDS_RELAYED_FROM_WSL")]
    public void The_relayed_variable_is_appended_to_the_persons_WSLENV_once(string? existing, string expected)
    {
        // A person's own list (the itests name CREDS_ENDPOINT_DIR/p there) is kept; ours is added once, as the bare
        // name — an entry somebody gave a /u flag (Windows-to-WSL only) would otherwise keep the marker on this side
        // (checkpoint round, finding 2).
        WslInterop.WslEnvFor(existing).Should().Be(expected);
    }

    [Fact]
    public void A_piped_launch_is_wrapped_in_setpriv_pdeathsig_when_setpriv_is_present()
    {
        // Defect D: the interop proxy must carry PR_SET_PDEATHSIG(SIGKILL) so the kernel ends it — even when it has
        // been SIGSTOPped — the instant this wrapper dies. `setpriv --pdeathsig KILL --` arms it, and the binary and
        // its own arguments follow the `--`.
        var (fileName, arguments) =
            WindowsBridge.WithParentDeath("/usr/bin/setpriv", "creds-mcp.exe", ["--caller", "abc"]);

        fileName.Should().Be("/usr/bin/setpriv");
        arguments.Should().Equal("--pdeathsig", "KILL", "--", "creds-mcp.exe", "--caller", "abc");
    }

    [Fact]
    public void Without_setpriv_the_launch_is_the_binary_unchanged()
    {
        // The graceful fallback: a distro without setpriv launches the Windows half directly, exactly as before the
        // fix — no worse, never a crash. The guard is simply off there.
        var (fileName, arguments) = WindowsBridge.WithParentDeath(null, "creds-mcp.exe", ["--caller", "abc"]);

        fileName.Should().Be("creds-mcp.exe");
        arguments.Should().Equal("--caller", "abc");
    }

    [Fact]
    public void A_piped_launch_with_no_arguments_wraps_only_the_binary()
    {
        var (fileName, arguments) = WindowsBridge.WithParentDeath("/bin/setpriv", "creds.exe", []);

        fileName.Should().Be("/bin/setpriv");
        arguments.Should().Equal("--pdeathsig", "KILL", "--", "creds.exe");
    }

    [Theory]
    [InlineData(false, null, false)]   // not Linux: never armed
    [InlineData(true, "1", false)]     // the operator's kill switch
    [InlineData(true, null, true)]     // Linux, switch off, setpriv present in a trusted dir
    public void The_setpriv_resolver_honours_the_platform_and_the_kill_switch(bool isLinux, string? killSwitch, bool expectResolved)
    {
        // The pure resolver, so the kill switch and the trusted-dir order are tested rather than asserted: every
        // trusted directory "has" setpriv here, so a resolve succeeds unless the platform or the switch forbids it.
        var resolved = WslInterop.ResolveSetpriv(isLinux, killSwitch, _ => true);

        (resolved is not null).Should().Be(expectResolved);
        if (expectResolved)
        {
            resolved.Should().Be(Path.Combine("/usr/bin", "setpriv"), "the first trusted directory wins");
        }
    }

    [Fact]
    public void The_kill_switch_variable_is_product_neutral_because_the_guard_is_shared()
    {
        // It gates StartPiped, which serves both the MCP pump and the relay's relay-pipe children (code round, finding 3).
        WslInterop.NoParentDeathGuardVariable.Should().Be("CREDS_NO_PDEATH_GUARD");
    }

    [Theory]
    [InlineData(WslInterop.ParentDeathGuard.NotApplicable, false, null)]
    [InlineData(WslInterop.ParentDeathGuard.SwitchedOff, true, "1")]
    [InlineData(WslInterop.ParentDeathGuard.NoSetpriv, true, null)]
    public void The_guard_status_names_the_real_reason(WslInterop.ParentDeathGuard expected, bool isLinux, string? killSwitch)
    {
        // A configured off-switch and a missing tool are different facts (code round, findings 1/5). `resolved` is
        // null in every row here; the status still tells them apart.
        WslInterop.GuardStatus(isLinux, killSwitch, resolved: null).Should().Be(expected);
    }

    [Fact]
    public void The_guard_status_is_available_when_setpriv_resolved()
    {
        WslInterop.GuardStatus(isLinux: true, killSwitch: null, resolved: "/usr/bin/setpriv")
            .Should().Be(WslInterop.ParentDeathGuard.Available);
    }

    [Fact]
    public void Classify_names_setpriv_present_but_lacking_pdeathsig_distinctly_from_missing()
    {
        // A setpriv that exists but fails the --pdeathsig probe (util-linux < 2.33, busybox) must NOT be reported as
        // "not found" (code round 3): it is its own reason, and it disarms the guard (no path) so the launch falls back.
        var lacking = WslInterop.Classify(WslInterop.ParentDeathGuard.Available, "/usr/bin/setpriv", probeSupported: false);
        lacking.Status.Should().Be(WslInterop.ParentDeathGuard.SetprivLacksPdeathsig);
        lacking.Setpriv.Should().BeNull("a setpriv that cannot arm the guard is not handed to the launch");

        var ok = WslInterop.Classify(WslInterop.ParentDeathGuard.Available, "/usr/bin/setpriv", probeSupported: true);
        ok.Status.Should().Be(WslInterop.ParentDeathGuard.Available);
        ok.Setpriv.Should().Be("/usr/bin/setpriv");

        // A base status that was never Available (missing, switched off, not Linux) passes straight through, probe or not.
        WslInterop.Classify(WslInterop.ParentDeathGuard.NoSetpriv, candidate: null, probeSupported: true)
            .Status.Should().Be(WslInterop.ParentDeathGuard.NoSetpriv);
    }

    [Theory]
    [InlineData("/mnt/c/creds/creds-mcp.exe", true)]     // an existing override path → resolves, guard arms
    [InlineData(@"C:\nowhere\creds-mcp.exe", false)]     // a path that does not exist → does not resolve, the direct launch keeps the diagnosis
    public void A_binary_given_as_a_path_resolves_only_when_the_file_exists(string binary, bool exists)
    {
        WindowsBridge.BinaryResolves(binary, pathVar: null, _ => exists).Should().Be(exists);
    }

    [Fact]
    public void A_bare_binary_name_resolves_against_the_interop_augmented_path()
    {
        // The owner's creds-mcp.exe is found via the PATH WSL augments with the translated Windows directories; the
        // first directory that holds it resolves.
        var path = string.Join(Path.PathSeparator, "/usr/bin", "/mnt/c/Windows/System32", "/mnt/c/creds");
        WindowsBridge.BinaryResolves("creds-mcp.exe", path, candidate => candidate == Path.Combine("/mnt/c/creds", "creds-mcp.exe"))
            .Should().BeTrue();
        WindowsBridge.BinaryResolves("creds-mcp.exe", path, _ => false)
            .Should().BeFalse("a bare name nowhere on PATH does not resolve, so the direct launch throws the diagnosis");
    }
}
