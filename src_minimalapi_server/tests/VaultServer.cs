using CredsForDevs.Tests.Leftovers;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

namespace CredVaultServer.Tests;

/// <summary>
/// Hosts the real API in-process on a throwaway data directory.
///
/// Configuration goes through PROCESS ENVIRONMENT VARIABLES rather than
/// <c>WithWebHostBuilder</c>, and that is not a stylistic choice: Program.cs reads
/// <c>builder.Configuration</c> at line 22 — before <c>Build()</c> — so anything a
/// WebApplicationFactory adds during <c>ConfigureWebHost</c> lands too late to be seen.
/// Environment variables are already in the builder's configuration by then.
///
/// The consequence is that the variables are process-global, which is why every test class
/// joins the one non-parallel collection in <c>ServerCollection.cs</c>, and why every test
/// owns its own server instance for the duration of that test.
/// </summary>
internal sealed class VaultServer : WebApplicationFactory<Program>
{
    /// <summary>32+ bytes: HMAC-SHA256 refuses a shorter key.</summary>
    public const string LocalSigningKey = "cred-vault-test-signing-key-32bytes!";

    public const string Domain = "example.com";

    private readonly Dictionary<string, string?> _restore = [];

    private readonly Action<IServiceCollection>? _services;

    private bool _ended;

    /// <summary>The data folder: owned (claimed first, named for what it holds, in the temp root itself), removed by <see cref="Dispose(bool)"/> AFTER the host has ended.</summary>
    private readonly OwnedDir _folder = OwnedDir.Create("vault");

    public string DataDir { get; }

    /// <param name="overrides">Configuration, as environment variables — see the type's remarks.</param>
    /// <param name="services">
    /// Registrations applied AFTER <c>Program.cs</c>'s own, so a test can stand a stub in for a
    /// collaborator that would otherwise reach the network — the cloud transport behind
    /// <see cref="BackupTargets"/>. The last registration of a type wins, which is what makes this a
    /// replacement rather than a second instance nothing resolves.
    /// </param>
    public VaultServer(IDictionary<string, string?>? overrides = null, Action<IServiceCollection>? services = null)
    {
        _services = services;
        DataDir = _folder.Path;

        var settings = new Dictionary<string, string?>
        {
            ["Vault__DataDir"] = DataDir,
            ["Vault__AllowedDomains"] = Domain,
            ["Vault__AllowAnyDomain"] = "false",
            ["Vault__RequireForwardedHttps"] = "false",
            ["Auth__Local__SigningKey"] = LocalSigningKey,
            ["Auth__Microsoft__Tenant"] = "",
            ["Auth__Microsoft__Audiences"] = "",
            ["Auth__Google__Enabled"] = "false",
        };

        if (overrides is not null)
        {
            foreach (var (key, value) in overrides)
            {
                settings[key] = value;
            }
        }

        foreach (var (key, value) in settings)
        {
            _restore[key] = Environment.GetEnvironmentVariable(key);
            Environment.SetEnvironmentVariable(key, value);
        }
    }

    /// <summary>
    /// Service replacements only. Configuration does NOT go through here — see the type's remarks for
    /// why it is read before this runs — but services are resolved after <c>Build()</c>, so a test's
    /// registration made here does land.
    /// </summary>
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        if (_services is not null)
        {
            builder.ConfigureTestServices(_services);
        }
    }

    /// <summary>An <see cref="HttpClient"/> that presents <paramref name="email"/>'s token on every call.</summary>
    public HttpClient ClientFor(string email, string? name = null)
    {
        var client = CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue(
                "Bearer", Tokens.For(email, LocalSigningKey, name));
        return client;
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        // WebApplicationFactory.Dispose(true) reaches DisposeAsync, which reaches Dispose(true) again: the rest runs ONCE, so a removal that gives up is one warning.
        if (!disposing || _ended)
        {
            return;
        }

        _ended = true;

        foreach (var (key, value) in _restore)
        {
            Environment.SetEnvironmentVariable(key, value);
        }

        // Last, after the host and its container have ended: a folder removed under a running host fails in ways that look like the
        // product's own faults. A handle the host has not released is warned about, the folder stays claimed, and the audit names it.
        _folder.Dispose();
    }
}
