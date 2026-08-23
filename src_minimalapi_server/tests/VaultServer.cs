using Microsoft.AspNetCore.Mvc.Testing;

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

    public string DataDir { get; }

    public VaultServer(IDictionary<string, string?>? overrides = null)
    {
        DataDir = Path.Combine(
            Path.GetTempPath(), "cred-vault-tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(DataDir);

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
        if (!disposing)
        {
            return;
        }

        foreach (var (key, value) in _restore)
        {
            Environment.SetEnvironmentVariable(key, value);
        }

        try
        {
            Directory.Delete(DataDir, recursive: true);
        }
        catch (IOException)
        {
            // A handle the host has not released yet; the temp sweeper gets it.
        }
        catch (UnauthorizedAccessException)
        {
            // Same.
        }
    }
}
