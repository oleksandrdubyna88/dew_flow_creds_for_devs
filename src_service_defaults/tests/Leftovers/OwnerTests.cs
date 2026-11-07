using System.Diagnostics;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using FluentAssertions;
using FluentAssertions.Execution;
using Xunit;

namespace CredsForDevs.Tests.Leftovers;

/// <summary>The owner token (rule §1) and the owner record (rule §3): who a name and a claim belong to, in one
/// grammar every implementation of the contract reads — the conventions' Node helper and shell janitor included,
/// which is what the mounted vectors prove.</summary>
public sealed partial class OwnerTests
{
    private const string OwnerVariable = "TESTSTODELETE_OWNER";
    private const string RunVariable = "TESTSTODELETE_RUN";

    private static string Other => OwnerFixtures.Other;

    private static Func<string, string?> Env(string name, string? value) => key => key == name ? value : null;

    [Fact]
    public void A_posix_owner_is_u_and_the_real_uid_and_a_windows_owner_is_w_and_a_hash_of_the_account()
    {
        OwnerToken.Compute(windows: false, uid: 1000, accountName: null, _ => null).Should().Be("u1000");
        OwnerToken.Compute(windows: true, uid: null, accountName: "Alice", _ => null).Should().Be("w735577801");
    }

    [Fact]
    public void Every_windows_account_in_the_mounted_vectors_gets_the_token_the_vectors_say()
    {
        using var scope = new AssertionScope();
        foreach (var v in OwnerVectors.Table("windows-owner"))
        {
            OwnerToken.Windows(v.Text("username")).Should().Be(v.Text("token"), $"{v.Text("id")} {v.Text("username")}");
        }
    }

    [Fact]
    public void Lower_casing_touches_the_ascii_letters_only()
    {
        OwnerToken.AsciiLower("SØREN").Should().Be("sØren", "the letters A-Z only: ToLowerInvariant would fold the O with stroke too (vectors w06 and w07 differ)");
        OwnerToken.AsciiLower("ÜNAL-1.A").Should().Be("Ünal-1.a");
    }

    [Fact]
    public void An_override_in_the_grammar_wins_and_an_empty_one_is_no_override()
    {
        OwnerToken.Compute(false, 1000, null, Env(OwnerVariable, "u42")).Should().Be("u42");
        OwnerToken.Compute(false, 1000, null, Env(OwnerVariable, "")).Should().Be("u1000");
        OwnerToken.Compute(true, null, "Alice", Env(OwnerVariable, "w7")).Should().Be("w7");
    }

    [Theory]
    [InlineData("root")]
    [InlineData("u")]
    [InlineData("u12345678901")]
    [InlineData("U1")]
    [InlineData("u1\n")]
    [InlineData(" u1")]
    public void An_override_outside_the_grammar_refuses_and_never_falls_back(string value)
    {
        var act = () => OwnerToken.Compute(false, 1000, null, Env(OwnerVariable, value));

        act.Should().Throw<InvalidOperationException>().Which.Message.Should().Contain("is not an owner token");
    }

    [Fact]
    public void This_process_has_a_token_of_the_grammar_and_off_windows_it_is_the_real_uid()
    {
        Owned.OwnerGrammar.IsMatch(OwnerToken.This).Should().BeTrue();
        if (OperatingSystem.IsWindows() || Environment.GetEnvironmentVariable(OwnerVariable) is { Length: > 0 }) return;

        OwnerToken.This.Should().Be("u" + Native.GetUid());
    }

    [Fact]
    public void The_record_round_trips_through_its_text_with_either_line_end()
    {
        var mine = Owner.RunRecord();

        Owner.Parse(mine.Format() + "\r\n").Should().Be(mine);
        Owner.Parse(mine.Format() + "\n").Should().Be(mine);
        Owner.Parse(mine.Format()).Should().Be(mine);
    }

    [Fact]
    public void The_host_is_the_dns_name_with_the_os_and_under_wsl_the_distribution()
    {
        var host = Owner.This.Host;

        host.Should().MatchRegex(@"^[^@:\s]+@(linux|macos|windows)\z");
        host.Should().StartWith(Owner.HostName(Dns.GetHostName()));
        if (Environment.GetEnvironmentVariable("WSL_DISTRO_NAME") is { Length: > 0 } distro)
        {
            host.Should().Contain("~" + Owner.HostName(distro));
        }
    }

    [Fact]
    public void Every_host_name_in_the_mounted_vectors_is_written_as_the_vectors_say()
    {
        using var scope = new AssertionScope();
        foreach (var v in OwnerVectors.Table("hostnames"))
        {
            var written = v.TextOrNull("distro") is { } distro ? Owner.HostId(v.Text("raw"), distro) : Owner.HostName(v.Text("raw"));
            written.Should().Be(v.Text("host"), $"{v.Text("id")} {v.Text("raw")}");
        }
    }

    [Fact]
    public void Every_record_in_the_mounted_vectors_is_read_exactly_when_the_vectors_say_it_is_valid()
    {
        using var scope = new AssertionScope();
        foreach (var v in OwnerVectors.Table("record"))
        {
            (Owner.Parse(v.Text("text")) is not null).Should().Be(v.GetProperty("valid").GetBoolean(), $"{v.Text("id")} {v.Text("text")}");
        }
    }

    [Fact]
    public void The_old_grammar_without_an_owner_is_never_read_by_the_merged_reader()
    {
        using var scope = new AssertionScope();
        foreach (var v in OwnerVectors.Table("grammar"))
        {
            Owner.Parse(v.Text("text")).Should().BeNull($"{v.Text("id")} {v.Text("text")}: the merged reader never reads the old form");
        }

        Owner.Parse("devbox@linux:4711:1792053744").Should().BeNull();
    }

    [Theory]
    [InlineData("hands off")]
    [InlineData("u1000:devbox@beos:1")]
    [InlineData("u1000:devbox@linux:1:2:3:4")]
    [InlineData("U1000:h@linux:1")]
    [InlineData("u1000:h@linux:1\nu1000:h@linux:2")]
    [InlineData("u1000:h@linux:1\r")]
    [InlineData("")]
    public void Anything_but_the_one_line_grammar_is_unreadable(string text)
    {
        Owner.Parse(text).Should().BeNull();
    }

    [Fact]
    public void A_claim_of_512_bytes_is_read_and_one_of_513_is_not()
    {
        string RecordOf(int bytes)
        {
            var head = OwnerToken.This + ":";
            var tail = "@linux:1\n";
            return head + new string('a', bytes - head.Length - tail.Length) + tail;
        }

        Owner.Parse(RecordOf(512)).Should().NotBeNull();
        Encoding.UTF8.GetByteCount(RecordOf(513)).Should().Be(513);
        Owner.Parse(RecordOf(513)).Should().BeNull();
    }

    [Fact]
    public void A_field_with_a_leading_zero_is_read_but_marked_not_canonical_and_a_huge_one_is_clamped()
    {
        var zero = Owner.Parse("u1000:h@linux:007:1792053744:4026531836")!;
        var huge = Owner.Parse("u1000:h@linux:1234567890123456789012345")!;

        zero.NonCanonical.Should().BeTrue();
        zero.Pid.Should().Be(7);
        Owner.Parse("u1000:h@linux:7:1792053744:4026531836")!.NonCanonical.Should().BeFalse();
        huge.Pid.Should().Be(long.MaxValue, "past 2^53 is no process: State refuses it");
    }

    [Fact]
    public void On_linux_the_record_carries_the_start_and_the_namespace_and_they_match_the_os()
    {
        if (!OperatingSystem.IsLinux()) Assert.Skip("a start and a pid namespace — Linux only");

        var me = Owner.This;

        me.Start.Should().NotBeNull();
        me.Ns.Should().NotBeNull();
        me.Ns.Should().Be(long.Parse(NamespaceInode().Match(new FileInfo("/proc/self/ns/pid").LinkTarget!).Groups[1].Value));
        var dotnet = new DateTimeOffset(Process.GetCurrentProcess().StartTime.ToUniversalTime()).ToUnixTimeSeconds();
        var delta = me.Start!.Value - dotnet;
        TestContext.Current.AddWarning($"start measured: record Start = {me.Start}, Process.StartTime = {dotnet}, delta = {delta} s");
        Math.Abs(delta).Should().BeLessThanOrEqualTo(Owned.StartToleranceSeconds);
        me.Format().Split(':').Should().HaveCount(5);
    }

    [Fact]
    public void On_macos_the_record_is_macos_with_no_start_and_no_namespace_and_three_fields()
    {
        if (!OperatingSystem.IsMacOS()) Assert.Skip("macOS gives no start without a child process — macOS only");

        var me = Owner.This;

        me.Host.Should().EndWith("@macos");
        me.Start.Should().BeNull("the start of a process on macOS needs a child per test process, which the rule forbids");
        me.Ns.Should().BeNull();
        me.Format().Split(':').Should().HaveCount(3);
        Owner.Parse(me.Format()).Should().Be(me);
    }

    [Fact]
    public void On_windows_the_record_has_no_start_and_no_namespace_and_three_fields()
    {
        if (!OperatingSystem.IsWindows()) Assert.Skip("no start where the OS gives none without a child — Windows only");

        Owner.This.Start.Should().BeNull();
        Owner.This.Ns.Should().BeNull();
        Owner.This.Format().Split(':').Should().HaveCount(3);
    }

    [Fact]
    public void Without_a_run_record_in_the_environment_the_process_record_is_used()
    {
        var warnings = new List<string>();

        Owner.RunRecord(_ => null, warnings.Add).Should().Be(Owner.This);

        warnings.Should().BeEmpty();
    }

    [Fact]
    public void A_run_record_naming_a_live_run_of_the_caller_is_used()
    {
        var warnings = new List<string>();

        var used = Owner.RunRecord(Env(RunVariable, Owner.This.Format()), warnings.Add);

        used.Should().Be(Owner.This);
        warnings.Should().BeEmpty();
    }

    [Fact]
    public void A_run_record_of_a_dead_run_another_owner_or_nonsense_is_ignored_with_one_warning_each()
    {
        var me = Owner.This;
        var dead = new Owner(me.Token, me.Host, UnmatchablePid.Next(), me.Start, me.Ns).Format();
        var other = (me with { Token = Other }).Format();

        foreach (var given in new[] { dead, other, "hands off" })
        {
            var warnings = new List<string>();

            Owner.RunRecord(Env(RunVariable, given), warnings.Add).Should().Be(me, given);

            warnings.Should().ContainSingle(given).Which.Should().Contain("TESTSTODELETE_RUN is not the record of a live run of this user");
        }
    }

    [GeneratedRegex(@"^pid:\[([0-9]+)\]\z")]
    private static partial Regex NamespaceInode();
}
