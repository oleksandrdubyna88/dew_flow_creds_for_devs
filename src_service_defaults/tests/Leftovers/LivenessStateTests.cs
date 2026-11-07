using FluentAssertions;
using FluentAssertions.Execution;
using Xunit;

namespace CredsForDevs.Tests.Leftovers;

/// <summary>Rule §3's liveness procedure, in its order: scope evidence, host, namespace, a pid a process can have,
/// then the one question — is there a process? — and only "no process" is <c>Gone</c>. Everything else keeps the
/// resource: a refused query, a process list that may hide others, two starts that disagree. Asked with an injected
/// probe and explicit facts, then with the conventions' own vectors, which the Node helper and the janitor answer
/// identically.</summary>
public sealed class LivenessStateTests
{
    private const long LiveStart = 1_700_000_000;

    private static Owner Me => Owner.This;

    private static Facts Quiet => new(CallerOwner: OwnerToken.This, Hidepid: false);

    private static Probe Live(long? start = null) => new(ProbeState.Live, start);

    private static readonly Probe Dead = new(ProbeState.Dead, null);

    private static Func<long, Probe> Always(Probe answer) => _ => answer;

    private static Owner Record(long pid = 4242, long? start = null) => new(OwnerToken.This, Me.Host, pid, start, Me.Ns);

    private static string Tag => OperatingSystem.IsLinux() ? "linux" : OperatingSystem.IsWindows() ? "windows" : "macos";

    private static string HostName => Me.Host.Split('@')[0];

    [Fact]
    public void An_unreadable_non_canonical_or_foreign_record_is_unknown_and_the_process_is_never_asked()
    {
        var asked = new List<long>();
        Probe Ask(long pid)
        {
            asked.Add(pid);
            return Dead;
        }

        Liveness.State(null, Ask, Quiet).Should().Be(OwnerState.Unknown);
        Liveness.State(Record() with { NonCanonical = true }, Ask, Quiet).Should().Be(OwnerState.Unknown);
        Liveness.State(Record() with { Token = OwnerFixtures.Other }, Ask, Quiet).Should().Be(OwnerState.Unknown, "the record's owner is not the caller's");
        Liveness.State(Record(), Ask, Quiet with { NameOwner = OwnerFixtures.Other }).Should().Be(OwnerState.Unknown, "the name's owner is not the record's");
        Liveness.State(Record(), Ask, Quiet with { KernelMine = false }).Should().Be(OwnerState.Unknown, "a stranger's file is no evidence");
        Liveness.State(Record() with { Host = "other@" + Tag }, Ask, Quiet).Should().Be(OwnerState.Unknown, "another machine");
        Liveness.State(Record() with { Host = HostName + "@" + (OperatingSystem.IsLinux() ? "windows" : "linux") }, Ask, Quiet).Should().Be(OwnerState.Unknown, "a Windows machine and its Linux subsystem have two pid spaces");
        asked.Should().BeEmpty();
    }

    [Fact]
    public void A_host_is_compared_case_insensitively()
    {
        Liveness.State(Record() with { Host = Me.Host.ToUpperInvariant() }, Always(Dead), Quiet).Should().Be(OwnerState.Gone);
    }

    [Fact]
    public void A_linux_reader_needs_the_records_namespace_to_be_its_own()
    {
        if (!OperatingSystem.IsLinux()) Assert.Skip("pid namespaces — Linux only");

        Liveness.State(Record() with { Ns = null }, Always(Dead), Quiet).Should().Be(OwnerState.Unknown);
        Liveness.State(Record() with { Ns = Me.Ns + 1 }, Always(Dead), Quiet).Should().Be(OwnerState.Unknown);
        Liveness.State(Record(), Always(Dead), Quiet).Should().Be(OwnerState.Gone);
    }

    [Fact]
    public void A_pid_no_process_can_have_is_unknown_with_the_probe_never_called()
    {
        var asked = 0;
        Probe Ask(long pid)
        {
            asked++;
            return Dead;
        }

        Liveness.State(Record(pid: 0), Ask, Quiet).Should().Be(OwnerState.Unknown);
        Liveness.State(Record(pid: long.MaxValue), Ask, Quiet).Should().Be(OwnerState.Unknown);
        Liveness.State(Record(pid: -5), Ask, Quiet).Should().Be(OwnerState.Unknown);
        Liveness.State(Record(pid: 1) with { Host = HostName + "@windows" }, Ask, Quiet).Should().Be(OwnerState.Unknown, "Windows has no pid 1");
        asked.Should().Be(0);
    }

    [Fact]
    public void No_process_is_gone_unless_the_process_list_may_hide_others()
    {
        Liveness.State(Record(), Always(Dead), Quiet).Should().Be(OwnerState.Gone, "the only gone there is");
        Liveness.State(Record(), Always(Dead), Quiet with { Hidepid = true }).Should().Be(OwnerState.Unknown);
    }

    [Fact]
    public void A_refused_query_or_a_probe_that_throws_is_unknown()
    {
        Liveness.State(Record(), Always(new Probe(ProbeState.Unknown, null)), Quiet).Should().Be(OwnerState.Unknown);
        Liveness.State(Record(), _ => throw new InvalidOperationException("boom"), Quiet).Should().Be(OwnerState.Unknown);
    }

    [Fact]
    public void A_live_process_is_live_when_a_start_is_missing_or_the_starts_are_within_two_seconds_and_unknown_otherwise()
    {
        Liveness.State(Record(), Always(Live(LiveStart)), Quiet).Should().Be(OwnerState.Live, "the owner carries no start");
        Liveness.State(Record(start: LiveStart), Always(Live()), Quiet).Should().Be(OwnerState.Live, "the reader cannot read the live start");
        foreach (var delta in new[] { 0, 2, -2 })
        {
            Liveness.State(Record(start: LiveStart + delta), Always(Live(LiveStart)), Quiet).Should().Be(OwnerState.Live, $"{delta} s apart");
        }

        foreach (var delta in new[] { 3, -3, 1_000_000, -1_000_000 })
        {
            Liveness.State(Record(start: LiveStart + delta), Always(Live(LiveStart)), Quiet).Should().Be(OwnerState.Unknown, $"{delta} s apart: a reused pid or a stepped clock, never gone");
        }
    }

    [Fact]
    public void Every_scope_vector_of_the_conventions_gets_its_verdict()
    {
        var linux = OperatingSystem.IsLinux();
        using var scope = new AssertionScope();
        foreach (var v in OwnerVectors.Table("scope"))
        {
            var ns = v.Text("ns");
            if (!linux && ns is "absent" or "other" or "leading-zero") continue; // only a Linux reader requires a namespace
            var mine = Me.Ns ?? 7;
            var record = ns == "leading-zero"
                ? Owner.Parse($"{v.Text("recordOwner")}:{Me.Host}:4242:1:0{mine}")
                : new Owner(v.Text("recordOwner"), Me.Host, 4242, null, ns == "absent" ? null : ns == "same" ? mine : mine + 1);
            var probe = v.Text("pid") switch
            {
                "absent" => Dead,
                "present" => Live(),
                _ => new Probe(ProbeState.Unknown, null),
            };
            var facts = new Facts(v.Text("callerOwner"), v.Text("nameOwner"), v.GetProperty("kernelMine").GetBoolean(), v.GetProperty("hidepid").GetBoolean());

            Liveness.State(record, Always(probe), facts).ToString().ToLowerInvariant().Should().Be(v.Text("expected"), $"{v.Text("id")}: {v.Text("why")}");
        }
    }

    [Fact]
    public void Every_verdict_vector_of_the_conventions_gets_its_verdict_the_node_only_ones_included()
    {
        using var scope = new AssertionScope();
        var i = 0;
        foreach (var v in OwnerVectors.Table("verdicts"))
        {
            var pid = v.TextOrNull("pidText") ?? UnmatchablePid.Next(i++).ToString();
            var asked = 0;
            var probe = v.Text("pid") switch
            {
                "absent" => Dead,
                "refused" => new Probe(ProbeState.Unknown, null),
                _ => Live(v.GetProperty("liveStart").GetBoolean() ? LiveStart : null),
            };

            var verdict = Liveness.State(RecordOf(v, pid), p =>
            {
                asked++;
                return probe;
            }, new Facts(Hidepid: false));

            verdict.ToString().ToLowerInvariant().Should().Be(v.Text("expected"), $"{v.Text("id")}: {v.Text("why")}");
            var refusedBeforeAnyQuery = v.TextOrNull("ownerText") is not null || v.TextOrNull("pidText") is not null || v.Text("host").StartsWith("foreign", StringComparison.Ordinal);
            if (refusedBeforeAnyQuery) asked.Should().Be(0, $"{v.Text("id")} asked the OS about a pid that is not this machine's");
        }
    }

    [Fact]
    public void This_process_reads_as_live_through_the_real_probe_and_the_start_comparison()
    {
        Liveness.State(Owner.This, Liveness.ProbeProcess, new Facts(Hidepid: false)).Should().Be(OwnerState.Live);
    }

    [Fact]
    public void A_pid_no_process_can_have_reads_as_gone_through_the_real_probe_with_the_premise_held_before_and_after()
    {
        if (Liveness.HidepidActive()) Assert.Skip("the process list hides others, so no pid can be proven gone here");
        var pid = UnmatchablePid.Next();
        UnmatchablePid.AssertNoSuchProcess(pid);

        var state = Liveness.State(Record(pid, Me.Start), Liveness.ProbeProcess, Quiet);

        state.Should().Be(OwnerState.Gone);
        UnmatchablePid.AssertNoSuchProcess(pid);
    }

    /// <summary>The record a verdict vector describes, written behind the caller's token as the merged record. The
    /// vectors state the part after the owner field; the Node helper reads it with the old grammar and then gives it
    /// the reader's own namespace, which this does too: a Linux reader needs one, and the table is about the verdict,
    /// not about the namespace.</summary>
    private static Owner? RecordOf(System.Text.Json.JsonElement v, string pid)
    {
        var hostName = HostName;
        var text = v.TextOrNull("ownerText")?.Replace("{HOST}", $"{hostName}@{Tag}").Replace("{NAME}", hostName);
        if (text is null)
        {
            var host = v.Text("host") switch
            {
                "same" => $"{hostName}@{Tag}",
                "same-case" => $"{SwapCase(hostName)}@{Tag}",
                "foreign-name" => $"other-box.example.invalid@{Tag}",
                _ => $"{hostName}@{(Tag == "linux" ? "windows" : "linux")}",
            };
            var delta = v.GetProperty("startDelta");
            var start = delta.ValueKind == System.Text.Json.JsonValueKind.Null ? "" : $":{LiveStart + delta.GetInt64()}";
            text = $"{host}:{pid}{start}";
        }

        var parsed = Owner.Parse(OwnerToken.This + ":" + text);
        return parsed is null || Me.Ns is null ? parsed : parsed with { Ns = Me.Ns };
    }

    private static string SwapCase(string name) => name == name.ToUpperInvariant() ? name.ToLowerInvariant() : name.ToUpperInvariant();
}
