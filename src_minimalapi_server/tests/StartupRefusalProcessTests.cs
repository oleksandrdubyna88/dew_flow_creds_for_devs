using System.Security.Cryptography;
using CredsForDevs.ServiceDefaults.Tests.Support;
using FluentAssertions;
using FluentAssertions.Execution;

namespace CredVaultServer.Tests;

/// <summary>
/// A server that refuses to start says why in its log file, and exits with a defined code — the BUILT
/// binary, its real <c>Main</c>, the file an operator reads after a deploy
/// (research/PLAN_server_startup_refusal_is_logged.md).
/// </summary>
/// <remarks>
/// <para>Measured before the fix on the published 0.11.0 image: a refusal was an unhandled exception, the
/// process ended with the runtime's crash code (139 under Native AOT, <c>0xE0434352</c> under JIT on
/// Windows), and the per-run file held only the <c>runtime:</c> line — or nothing at all when the refusal
/// came before it. In-process tests cannot see either: <c>WebApplicationFactory</c> has no exit code, so
/// these drive a process.</para>
/// <para>Joins the server collection: <see cref="VaultServer"/> sets process environment variables, and a
/// child started while another test holds them would inherit them.</para>
/// </remarks>
[Collection(ServerCollection.Name)]
public sealed class StartupRefusalProcessTests : IDisposable
{
    /// <summary>
    /// <c>EX_CONFIG</c> from <c>sysexits.h</c>. Pinned as a literal on purpose: it is a contract an
    /// operator's script may test, so a change to it must break a test, not follow a constant.
    /// </summary>
    private const int Refused = 78;

    private const string AppName = "cred-vault-server";

    private readonly string _root = HostProcess.TempDirectory("cred-vault-refusal");

    public void Dispose() => HostProcess.Remove(_root);

    /// <summary>A configuration that would start, with one refusal on top: a NEW dictionary each time.</summary>
    private Dictionary<string, string> StartableExcept(string key, string value) => new(Startable()) { [key] = value };

    private Dictionary<string, string> Startable() => new()
    {
        ["Vault__DataDir"] = Path.Combine(_root, "data"),
        ["Logging__Directory"] = Path.Combine(_root, "logs"),
        ["Vault__AllowedDomains"] = "example.com",
        ["Vault__AllowAnyDomain"] = "false",
        ["Vault__PublishInstanceFile"] = "false",
        ["Auth__Microsoft__Tenant"] = "",
        ["Auth__Google__Enabled"] = "false",
        // A throwaway key made at runtime — never written to a file, never printed.
        ["Auth__Local__SigningKey"] = Convert.ToBase64String(RandomNumberGenerator.GetBytes(48)),
        ["ASPNETCORE_URLS"] = "http://127.0.0.1:0",
        ["ASPNETCORE_ENVIRONMENT"] = "Production",
    };

    private async Task<(int ExitCode, string Log)> RunAsync(Dictionary<string, string> env)
    {
        var ct = TestContext.Current.CancellationToken;
        using var host = HostProcess.Start("CredVaultServer", [], env);
        using var reaper = HostProcess.KillOnDispose(host);
        var stdout = host.StandardOutput.ReadToEndAsync(ct);
        var stderr = host.StandardError.ReadToEndAsync(ct);

        var exited = await HostProcess.ExitsWithinAsync(host, TimeSpan.FromSeconds(60), ct);
        exited.Should().BeTrue("a refused configuration must end the process, not leave it serving");
        await Task.WhenAll(stdout, stderr);

        // A run that wrote no file at all is reported as an empty log, beside its exit code, rather than as a
        // lookup failure that would hide both.
        var logs = Path.Combine(_root, "logs");
        var files = Directory.Exists(logs)
            ? Directory.GetFiles(logs, $"{AppName}-*-{host.Id}.log", SearchOption.AllDirectories)
            : [];
        var file = files.Length == 1 ? HostProcess.Read(files[0]) : string.Empty;
        return (host.ExitCode, file);
    }

    [Fact]
    public async Task No_authentication_scheme_is_logged_at_fatal_and_exits_with_the_refusal_code()
    {
        var (exitCode, log) = await RunAsync(StartableExcept("Auth__Local__SigningKey", ""));

        // Both symptoms in one report: the code AND the file, so a RED run shows the whole defect.
        using var scope = new AssertionScope();
        exitCode.Should().Be(Refused, "a refusal is a decision with a defined code, not a crash");
        log.Should().Contain("FTL]", "the refusal is the most severe thing this run has to say")
            .And.Contain("No authentication scheme configured")
            .And.Contain("reason startupRefused");
    }

    [Fact]
    public async Task A_data_dir_on_a_network_share_is_logged_at_fatal_and_exits_with_the_refusal_code()
    {
        // A UNC path is refused by DataDirCheck before any disk is touched, on every platform — the
        // refusal that used to leave the run's file EMPTY, because it comes before the first log line.
        var (exitCode, log) = await RunAsync(StartableExcept("Vault__DataDir", "//nas.invalid/vault"));

        using var scope = new AssertionScope();
        exitCode.Should().Be(Refused);
        log.Should().Contain("FTL]")
            .And.Contain("is on a UNC network path")
            .And.Contain("reason startupRefused");
    }
}
