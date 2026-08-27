using System.Text.Json;
using CredsBroker;
using FluentAssertions;

namespace CredsBroker.Tests;

/// <summary>
/// The C# side of the two-sided contract check.
/// </summary>
/// <remarks>
/// <para>The TypeScript side asserts that <c>contract/broker-v1.json</c> matches the code it was
/// generated from. This asserts that the copy embedded in this binary is the same file, and that
/// this implementation's own tables agree with it.</para>
/// <para>Together they are the whole anti-drift mechanism. What they prevent is specific: a
/// client sending <c>vpn-up</c> to a route the broker renamed, or reporting exit 95 where the
/// other client reports 0. Neither shows up as an error — it shows up as an agent drawing a
/// wrong conclusion in somebody's terminal, with nothing in any log to explain it.</para>
/// </remarks>
public class BrokerContractTests
{
    private static string RepositoryContractPath()
    {
        // Walk up from the test binary until the repository root announces itself. Hard-coding
        // a depth breaks the moment the output path gains a RID folder, which `dotnet publish`
        // adds and CI uses.
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "contract", "broker-v1.json")))
        {
            dir = dir.Parent;
        }

        dir.Should().NotBeNull("the repository's contract/broker-v1.json must be findable from the test binary");
        return Path.Combine(dir!.FullName, "contract", "broker-v1.json");
    }

    [Fact]
    public void The_embedded_contract_is_byte_for_byte_the_file_in_the_repository()
    {
        // If these can differ, the anti-drift check is decoration: this binary would be
        // validating itself against its own stale copy.
        using var embedded =
            typeof(BrokerContract).Assembly.GetManifestResourceStream("broker-v1.json")!;
        using var reader = new StreamReader(embedded);

        var fromBinary = reader.ReadToEnd().ReplaceLineEndings("\n");
        var fromRepository = File.ReadAllText(RepositoryContractPath()).ReplaceLineEndings("\n");

        fromBinary.Should().Be(fromRepository);
    }

    [Fact]
    public void The_service_name_is_what_the_health_probe_compares()
    {
        // Checked before a token leaves the process, because a closed window frees its port and
        // the OS reissues port numbers. A mismatch here would send a bearer secret to whatever
        // unrelated program inherited the number.
        BrokerContract.Current.Service.Should().Be("creds-for-devs-agent");
    }

    [Fact]
    public void Health_is_unauthenticated_because_the_probe_happens_before_the_token_is_sent()
    {
        var health = BrokerContract.Current.Health;

        health.Authenticated.Should().BeFalse();
        health.Path.Should().Be("/v1/health");
        health.Method.Should().Be("GET");
    }

    [Fact]
    public void The_reserved_band_stays_clear_of_ordinary_remote_exit_codes()
    {
        // A remote command's own code passes through untouched, so ours must not look like one
        // a program would plausibly return.
        foreach (var (name, code) in BrokerContract.Current.ExitCodes)
        {
            code.Should().BeInRange(80, 125, $"{name} must stay in the reserved band");
        }
    }
}
