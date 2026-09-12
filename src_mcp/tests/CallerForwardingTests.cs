using System.ComponentModel;
using CredsBroker;
using CredsMcp;
using FluentAssertions;
using ModelContextProtocol.Protocol;

namespace CredsMcp.Tests;

/// <summary>
/// The caller record's two journeys inside this binary: across the WSL bridge as an argument, and
/// from the client's handshake into the label.
/// </summary>
/// <remarks>
/// <para><b>The rule, stated for both halves:</b> the side that spoke to the environment names the
/// session; the side that spoke to the client names the client. Under the relay those are two
/// processes in two kernels, and each must fill only its own half.</para>
/// <para><b>The probe cannot break the server.</b> An old <c>creds-mcp.exe</c> handed <c>--caller</c>
/// exits with a usage error before the handshake — a dead bridge, not a degraded one — so the Linux
/// half asks the binary for its <c>--help</c> once and passes the flag only when the text names it.
/// Every way that probe can fail is read as "unsupported", and the server starts without the flag.
/// Driven here with a fake launcher; the real one is <c>WindowsBridge.CaptureAsync</c>.</para>
/// </remarks>
public sealed class CallerForwardingTests
{
    private static readonly CallerRecord Forwarded = new(string.Empty, "98bf9f23", "clauderag-d6", "ClaudeRag");

    private static readonly TimeSpan Quick = TimeSpan.FromMilliseconds(200);

    private static Task<string?> Help(string text) => Task.FromResult<string?>(text);

    // ---- T16: the probe --------------------------------------------------------------------

    [Fact]
    public async Task A_windows_half_whose_help_names_the_flag_is_handed_the_record_as_one_argument()
    {
        var warned = new List<string>();

        var args = await CallerForwarding.ArgumentsForAsync(Forwarded, () => Help("usage…\n  --caller <record>  who is asking\n"), Quick, warned.Add);

        args.Should().HaveCount(2);
        args[0].Should().Be(CallerForwarding.Flag);
        args[1].Should().MatchRegex("^[A-Za-z0-9_-]+$", "base64url: nothing a Windows command line can reinterpret");
        CallerIdentity.Decode(args[1]).Should().Be(Forwarded, "the record arrives whole");
        warned.Should().BeEmpty();
    }

    [Fact]
    public async Task A_windows_half_whose_help_does_not_name_the_flag_is_started_without_it_and_the_person_is_told()
    {
        var warned = new List<string>();

        var args = await CallerForwarding.ArgumentsForAsync(Forwarded, () => Help("creds-mcp — the MCP server. Tools: creds_list…"), Quick, warned.Add);

        args.Should().BeEmpty("an argument the old binary refuses would be a dead server, not a degraded one");
        warned.Should().ContainSingle().Which.Should().Contain("An agent");
    }

    [Fact]
    public async Task A_probe_that_answers_nothing_starts_the_server_without_the_flag()
    {
        var args = await CallerForwarding.ArgumentsForAsync(Forwarded, () => Task.FromResult<string?>(null), Quick, _ => { });

        args.Should().BeEmpty();
    }

    [Fact]
    public async Task A_probe_whose_launch_fails_starts_the_server_without_the_flag()
    {
        // The binary is missing or not executable: the relay itself will report that when IT
        // tries to start the session. The probe's job is only to say nothing and get out of the way.
        var args = await CallerForwarding.ArgumentsForAsync(
            Forwarded, () => throw new Win32Exception("The system cannot find the file specified"), Quick, _ => { });

        args.Should().BeEmpty();

        var alsoArgs = await CallerForwarding.ArgumentsForAsync(
            Forwarded, () => throw new InvalidOperationException("could not start creds-mcp.exe"), Quick, _ => { });

        alsoArgs.Should().BeEmpty();
    }

    [Fact]
    public async Task A_probe_that_hangs_is_abandoned_at_the_timeout_and_the_server_still_starts()
    {
        // Two orders of magnitude above the measured AOT start-up in production; here, short.
        var hanging = new TaskCompletionSource<string?>();
        var started = DateTime.UtcNow;

        var args = await CallerForwarding.ArgumentsForAsync(Forwarded, () => hanging.Task, Quick, _ => { });

        args.Should().BeEmpty();
        (DateTime.UtcNow - started).Should().BeLessThan(TimeSpan.FromSeconds(5), "the probe may delay the server, never stop it");
        CallerForwarding.ProbeTimeout.Should().Be(TimeSpan.FromSeconds(3));
    }

    [Fact]
    public async Task An_empty_record_forwards_nothing_and_does_not_even_probe()
    {
        var probed = false;

        var args = await CallerForwarding.ArgumentsForAsync(
            CallerRecord.Empty,
            () =>
            {
                probed = true;
                return Help("--caller");
            },
            Quick,
            _ => { });

        args.Should().BeEmpty();
        probed.Should().BeFalse("there is nothing to forward, so the extra process launch is not paid for");
    }

    // ---- T15: the Windows half names the client, and only the client --------------------------

    [Fact]
    public void The_side_that_spoke_to_the_client_fills_agent_and_leaves_the_forwarded_session_alone()
    {
        var source = new CallerSource(Forwarded);
        source.Bind(() => new Implementation { Name = "Claude Code", Version = "2.1.268" });

        var record = source.Current;

        record.Agent.Should().Be("Claude Code 2.1.268");
        record.Session.Should().Be("98bf9f23");
        record.SessionName.Should().Be("clauderag-d6");
        record.Cwd.Should().Be("ClaudeRag");
    }

    [Fact]
    public void A_forwarded_agent_that_is_not_empty_is_not_overwritten_by_the_client_name()
    {
        var source = new CallerSource(Forwarded with { Agent = "Codex 0.4" });
        source.Bind(() => new Implementation { Name = "Claude Code", Version = "2.1.268" });

        source.Current.Agent.Should().Be("Codex 0.4");
    }

    [Fact]
    public void Before_the_handshake_there_is_no_client_and_the_agent_stays_empty()
    {
        // ClientInfo is null until initialize has been answered, and the tools are built before
        // the server exists — which is why the record is read lazily on each call, not once.
        var unbound = new CallerSource(Forwarded);
        unbound.Current.Agent.Should().BeEmpty();

        var notYet = new CallerSource(Forwarded);
        notYet.Bind(() => null);
        notYet.Current.Agent.Should().BeEmpty();
        notYet.Current.Session.Should().Be("98bf9f23", "the session half never depended on the client");
    }

    [Fact]
    public void The_client_is_read_on_every_call_so_a_handshake_that_arrives_later_is_seen()
    {
        Implementation? client = null;
        var source = new CallerSource(Forwarded);
        source.Bind(() => client);

        source.Current.Agent.Should().BeEmpty();
        client = new Implementation { Name = "creds-itest", Version = "9.9" };
        source.Current.Agent.Should().Be("creds-itest 9.9");
    }

    [Theory]
    [InlineData("Claude Code", "2.1.268", "Claude Code 2.1.268")]
    [InlineData("Claude Code", "", "Claude Code")]
    [InlineData("", "2.1.268", "2.1.268")]
    [InlineData("  ", "  ", "")]
    [InlineData("X\n\n(verified)", "1", "X (verified) 1")]
    public void The_agent_label_is_name_and_version_with_a_blank_half_left_out_and_cleaned_like_every_field(
        string name, string version, string expected)
    {
        var source = new CallerSource(CallerRecord.Empty);
        source.Bind(() => new Implementation { Name = name, Version = version });

        source.Current.Agent.Should().Be(expected);
        CallerSource.AgentLabel(null).Should().BeEmpty();
    }
}
