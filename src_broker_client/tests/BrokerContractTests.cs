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

    [Fact]
    public void The_read_routes_are_in_the_contract_rather_than_in_each_client()
    {
        // Two binaries speak this protocol now, and the second one has no other way to learn
        // where to GET. The alias listing was spelled out by hand in the CLI while it was the
        // only one of its kind; both live in the contract now, which is where anything both
        // sides must agree on belongs.
        var contract = BrokerContract.Current;

        contract.Reads.Should().NotBeNull("this build's embedded contract carries the read routes");
        contract.ReadRoute("aliases", "unused").Should().Be("/v1/aliases");
        contract.ReadRoute("mcpEntries", "unused").Should().Be("/v1/mcp/entries");
        contract.McpUseRoute("exec").Should().Be("/v1/mcp/use/exec");
        // Not the same set as `Routes`: the CLI has no `rotate`, because rotation is a thing an
        // agent asks for with a placeholder and not a shape a terminal command has.
        contract.McpActions.Should().Contain("rotate");
        contract.McpActions.Should().Contain("exec");
        contract.DeleteRoute().Should().Be("/v1/mcp/delete");
        contract.CreateRoute().Should().Be("/v1/mcp/create");
        // Not an action under the use prefix: deleting is not a use of a credential.
        contract.McpActions.Should().NotContain("delete");
    }

    [Fact]
    public void The_config_read_route_is_authenticated_and_is_not_filed_with_the_reads()
    {
        // The distinction this side must not get wrong. Everything under `Reads` answers without
        // a credential; this one checks a key against a stored hash and returns a config file
        // entire. A bare path in that dictionary would have told this binary it needs no bearer.
        var contract = BrokerContract.Current;

        contract.ConfigRead.Should().NotBeNull("this build's embedded contract carries the route");
        contract.ConfigReadRoutePath().Should().Be("/v1/config/read");
        contract.ConfigRead!.Authenticated.Should().BeTrue();
        // A POST for something that reads: a GET is the shape caches, proxies and shell histories
        // treat as safe to record, and the key would be in it.
        contract.ConfigRead.Method.Should().Be("POST");
        contract.Reads!.Values.Should().NotContain("/v1/config/read");
    }

    [Fact]
    public void A_contract_without_the_reads_section_degrades_to_the_path_this_build_knows()
    {
        // A copy written before that section existed is a real thing to meet. Falling back to
        // the value that used to be hard-coded keeps an old file working; throwing on a missing
        // key would turn an additive change into a breaking one.
        var older = new BrokerContract(1, "creds-for-devs-agent", BrokerContract.Current.Health,
            [], [], null, null, null, null, null, null, null, null, [], []);

        older.ReadRoute("aliases", "/v1/aliases").Should().Be("/v1/aliases");
        older.ConfigReadRoutePath().Should().Be("/v1/config/read");
        older.DeleteRoute().Should().Be("/v1/mcp/delete");
        older.CreateRoute().Should().Be("/v1/mcp/create");
        older.McpUseRoute("exec").Should().Be("/v1/mcp/use/exec");
        // The newest section degrades the same way, which is the point of the test rather than a
        // detail of it: every route this side reads has a fallback, so a contract file older than
        // the feature keeps working instead of turning an additive change into a breaking one.
        older.FolderRoute("create").Should().Be("/v1/mcp/folder/create");
    }
}
