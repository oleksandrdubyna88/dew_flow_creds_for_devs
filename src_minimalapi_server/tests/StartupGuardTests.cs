using FluentAssertions;

namespace CredVaultServer.Tests;

/// <summary>
/// The server refuses to start rather than run in a state that looks like a network
/// fault. Each guard here exists because the alternative is a server that comes up,
/// reports healthy, and answers every request with a status nobody can explain.
/// </summary>
/// <remarks>
/// <para>Since 2026-10-12 a refusal is no longer an exception escaping <c>Program</c>: it is logged at
/// Fatal, the file is flushed, and the entry point RETURNS the refusal code
/// (research/PLAN_server_startup_refusal_is_logged.md). <c>WebApplicationFactory</c> has no exit code to
/// show, so these read what an operator reads — the run's log file — and the exit code itself is
/// <see cref="StartupRefusalProcessTests"/>' job.</para>
/// <para><c>Log.Logger</c> is static and a refusal closes it; the next test's host builds a new one.
/// Safe because every server test runs in the one non-parallel <see cref="ServerCollection"/>.</para>
/// </remarks>
[Collection(ServerCollection.Name)]
public sealed class StartupGuardTests
{
    /// <summary>
    /// The Fatal lines this start wrote to its own log file, or null when it wrote none — and then the host
    /// really started: a start that failed WITHOUT a Fatal line rethrows, so an accepted case cannot pass on a
    /// host that broke for some other reason.
    /// </summary>
    private static string? StartupFailure(IReadOnlyDictionary<string, string?> overrides)
    {
        var logs = Path.Combine(Path.GetTempPath(), "cred-vault-tests", "logs-" + Guid.NewGuid().ToString("N"));
        try
        {
            InvalidOperationException? notStarted = null;
            using (var server = new VaultServer(new Dictionary<string, string?>(overrides) { ["Logging__Directory"] = logs }))
            {
                try
                {
                    // The host is built lazily; this is what actually runs Program.cs.
                    using var client = server.CreateClient();
                }
                catch (InvalidOperationException e)
                {
                    // A refused start returns before Build(), which the factory reports as "the entry point
                    // exited without ever building an IHost". The reason is in the file, read below.
                    notStarted = e;
                }
            }
            var fatal = FatalLines(logs);
            if (fatal is null && notStarted is not null)
            {
                throw new InvalidOperationException("the host did not start, and its log says nothing at Fatal", notStarted);
            }
            return fatal;
        }
        finally
        {
            DeleteQuietly(logs);
        }
    }

    private static string? FatalLines(string logs)
    {
        if (!Directory.Exists(logs))
        {
            return null;
        }
        var fatal = Directory.GetFiles(logs, "*.log", SearchOption.AllDirectories)
            .SelectMany(file => Read(file).Split('\n'))
            .Where(line => line.Contains("FTL]", StringComparison.Ordinal))
            .ToList();
        return fatal.Count == 0 ? null : string.Join('\n', fatal);
    }

    /// <summary>Read a log file even while a writer may still hold it.</summary>
    private static string Read(string path)
    {
        using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }

    private static void DeleteQuietly(string path)
    {
        try
        {
            Directory.Delete(path, recursive: true);
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            // Left for the temp sweep; a test must not fail on its own cleanup.
        }
    }

    [Fact]
    public void ASigningKeyTooShortForHmacSha256IsRefused()
    {
        // HS256 needs a 256-bit key. A shorter one does not fail loudly: the scheme
        // registers, the server starts, health reports OK — and every single request
        // is rejected with 401, with nothing in the log to say why.
        var failure = StartupFailure(new Dictionary<string, string?>
        {
            ["Auth__Local__SigningKey"] = "far-too-short",
        });

        failure.Should().NotBeNull("a key that makes every request 401 must stop the server, not be accepted");
        failure.Should().Contain("HMAC-SHA256 requires at least 32", "the message has to say what the requirement is");
    }

    [Fact]
    public void AKeyOfExactlyThirtyTwoBytesIsAccepted()
    {
        var failure = StartupFailure(new Dictionary<string, string?>
        {
            ["Auth__Local__SigningKey"] = new string('k', 32),
        });

        failure.Should().BeNull("32 bytes is the documented minimum, so it must work");
    }

    [Fact]
    public void NoAuthenticationSchemeAtAllIsRefused()
    {
        var failure = StartupFailure(new Dictionary<string, string?>
        {
            ["Auth__Local__SigningKey"] = "",
            ["Auth__Microsoft__Tenant"] = "",
            ["Auth__Google__Enabled"] = "false",
        });

        failure.Should().NotBeNull();
        failure.Should().Contain("No authentication scheme configured");
    }

    [Fact]
    public void AnEmptyDomainAllowListWithoutTheExplicitOptOutIsRefused()
    {
        var failure = StartupFailure(new Dictionary<string, string?>
        {
            ["Vault__AllowedDomains"] = "",
            ["Vault__AllowAnyDomain"] = "false",
        });

        failure.Should().NotBeNull();
        failure.Should().Contain("Vault:AllowedDomains is empty");
    }

    [Fact]
    public void ADataDirOnANetworkShareIsRefused()
    {
        // Moved from DataDirCheckTests (OpsTests.cs): the refusal that comes before the first log line, so the
        // one whose file used to be empty.
        var failure = StartupFailure(new Dictionary<string, string?>
        {
            ["Vault__DataDir"] = @"\\nas\vault\data",
        });

        failure.Should().NotBeNull();
        failure.Should().Contain("atomic rename");
    }

    [Fact]
    public void AnUnwritableDataDirIsRefused()
    {
        // A FILE where the data directory should be: the writable probe fails on every platform, and the
        // refusal carries its cause into the same Fatal line.
        var blocker = Path.Combine(Path.GetTempPath(), "cred-vault-tests", "not-a-directory-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(Path.GetDirectoryName(blocker)!);
        File.WriteAllText(blocker, "x");
        try
        {
            var failure = StartupFailure(new Dictionary<string, string?>
            {
                ["Vault__DataDir"] = blocker,
            });

            failure.Should().NotBeNull();
            failure.Should().Contain($"DataDir '{blocker}' is not writable");
        }
        finally
        {
            File.Delete(blocker);
        }
    }

    [Fact]
    public void AnEmptyDomainAllowListIsFineWhenItIsAskedForExplicitly()
    {
        var failure = StartupFailure(new Dictionary<string, string?>
        {
            ["Vault__AllowedDomains"] = "",
            ["Vault__AllowAnyDomain"] = "true",
        });

        failure.Should().BeNull("running without a domain boundary is allowed — but only on purpose");
    }
}
