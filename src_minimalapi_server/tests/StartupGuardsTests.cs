using FluentAssertions;

namespace CredVaultServer.Tests;

/// <summary>
/// The five startup refusals as one unit: each one's message, exactly — what an operator reads — and the
/// order they are judged in (research/PLAN_server_startup_refusal_is_logged.md).
/// </summary>
public sealed class StartupGuardsTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "cred-vault-guards-" + Guid.NewGuid().ToString("N"));

    public void Dispose()
    {
        try
        {
            Directory.Delete(_root, recursive: true);
        }
        catch (DirectoryNotFoundException)
        {
            // Nothing was created — the point of several tests here.
        }
    }

    private StartupSettings Startable() => new(
        DataDir: Path.Combine(_root, "data"),
        AllowNetworkDataDir: false,
        MicrosoftTenant: "",
        GoogleEnabled: false,
        LocalSigningKey: new string('k', 32),
        HasAllowedDomains: true,
        AllowAnyDomain: false);

    private static Func<string?> NoMounts => () => null;

    private static string RefusalOf(StartupSettings settings) =>
        FluentActions.Invoking(() => StartupGuards.Check(settings, NoMounts))
            .Should().Throw<InvalidOperationException>().Which.Message;

    [Fact]
    public void A_startable_configuration_passes_and_leaves_no_probe_behind()
    {
        var settings = Startable();

        FluentActions.Invoking(() => StartupGuards.Check(settings, NoMounts)).Should().NotThrow();

        Directory.Exists(settings.DataDir).Should().BeTrue("the probe creates the data directory, as it always did");
        Directory.GetFiles(settings.DataDir).Should().BeEmpty("the probe file is deleted again");
    }

    [Fact]
    public void No_authentication_scheme_is_refused_with_its_message()
    {
        RefusalOf(Startable() with { LocalSigningKey = "" }).Should().Be(
            "No authentication scheme configured — set Auth:Microsoft:Tenant, Auth:Google:Enabled, "
            + "or Auth:Local:SigningKey. Refusing to start a server that would 401 every request.");
    }

    [Fact]
    public void Each_scheme_alone_is_enough()
    {
        var none = Startable() with { LocalSigningKey = "" };

        FluentActions.Invoking(() => StartupGuards.Check(none with { MicrosoftTenant = "contoso.example" }, NoMounts)).Should().NotThrow();
        FluentActions.Invoking(() => StartupGuards.Check(none with { GoogleEnabled = true }, NoMounts)).Should().NotThrow();
    }

    [Fact]
    public void An_empty_domain_list_without_the_opt_out_is_refused_with_its_message()
    {
        RefusalOf(Startable() with { HasAllowedDomains = false }).Should().Be(
            "Vault:AllowedDomains is empty. Set it to your company domain(s), or set "
            + "Vault:AllowAnyDomain=true to explicitly run without a domain boundary.");

        FluentActions.Invoking(() => StartupGuards.Check(Startable() with { HasAllowedDomains = false, AllowAnyDomain = true }, NoMounts))
            .Should().NotThrow("the opt-out is the explicit way to run without a boundary");
    }

    [Fact]
    public void A_signing_key_shorter_than_32_bytes_is_refused_with_its_message()
    {
        RefusalOf(Startable() with { LocalSigningKey = "far-too-short" }).Should().Be(
            "Auth:Local:SigningKey is 13 bytes; HMAC-SHA256 requires at least 32. "
            + "A shorter key would start a server that answers 401 to everything. "
            + "Generate one with: openssl rand -base64 48");
    }

    [Fact]
    public void A_data_dir_on_a_network_share_is_refused_with_its_message()
    {
        RefusalOf(Startable() with { DataDir = "//nas.invalid/vault" }).Should().Be(
            "DataDir '//nas.invalid/vault' is on a UNC network path. The vault store relies on atomic rename, which network "
            + "filesystems do not promise; use a local disk, or set Vault:AllowNetworkDataDir=true to run anyway and own the risk.");
    }

    [Fact]
    public void An_unwritable_data_dir_is_refused_with_its_message_and_keeps_the_cause()
    {
        // A FILE where the directory should be: CreateDirectory fails with an IOException on every platform.
        Directory.CreateDirectory(_root);
        var blocker = Path.Combine(_root, "not-a-directory");
        File.WriteAllText(blocker, "x");

        var refusal = FluentActions.Invoking(() => StartupGuards.Check(Startable() with { DataDir = blocker }, NoMounts))
            .Should().Throw<InvalidOperationException>().Which;

        refusal.Message.Should().StartWith($"DataDir '{blocker}' is not writable by uid {Environment.UserName}: ")
            .And.EndWith(". In Docker this is almost always a host directory owned by root: run "
                + "`chown -R 10001:10001 <host path>`, or let the stack's `init` service do it.");
        refusal.InnerException.Should().BeAssignableTo<IOException>("the cause travels with the refusal into the Fatal line");
    }

    [Fact]
    public void Configuration_is_judged_before_the_disk_and_a_refused_configuration_touches_nothing()
    {
        var settings = Startable() with { LocalSigningKey = "", DataDir = Path.Combine(_root, "never") };

        RefusalOf(settings).Should().StartWith("No authentication scheme configured");
        RefusalOf(settings with { DataDir = "//nas.invalid/vault" })
            .Should().StartWith("No authentication scheme configured", "the pure checks run first, so their message wins");
        Directory.Exists(_root).Should().BeFalse("the writable probe — the only check that writes — never ran");
    }
}
