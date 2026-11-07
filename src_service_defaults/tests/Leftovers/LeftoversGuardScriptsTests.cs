using System.Text.Json;
using FluentAssertions;
using Xunit;

namespace CredsForDevs.Tests.Leftovers;

/// <summary>What the guard makes of the classifier's ANSWER, with the answer handed in as text: no process is started, no generated
/// script is run. (A stand-in for <c>node</c> written to disk and executed would be a generated artefact run outside a bounded
/// sandbox; the answer's parsed form is the thing under test, and it needs no process.)</summary>
public sealed class LeftoversGuardScriptsTests : IDisposable
{
    private static readonly string P = "testsTo" + "Delete";

    private readonly OwnedScope _owned = new();

    public void Dispose() => _owned.Dispose();

    /// <summary>A script that is NOT on disk: only the copy of its lines exists, so any answer built from it was built from the copy.</summary>
    private ScriptFile Script(string relative, params string[] lines) =>
        new(new SourceFile(relative, Path.Combine(_owned.Dir("never-written"), relative), SourceKind.Script), lines);

    private static string Verdict(ScriptFile script, int line) => Verdict(script.Source.Absolute, line);

    private static string Verdict(string file, int line) => JsonSerializer.Serialize(new { file, line });

    private static Finding Blind(string file, int line, string text = "matches the prefix with no owner segment after it (the shipped classifier)") =>
        new(file, line, "owner-blind", text);

    [Fact]
    public void A_verdict_is_answered_from_the_copy_read_once_never_from_the_file_again()
    {
        var script = Script("a.sh", $"rm -rf /tmp/{P}-*");

        var findings = GuardScripts.Judge([script], Verdict(script, 1), "node");

        findings.Should().ContainSingle().Which.Should().BeEquivalentTo(Blind("a.sh", 1));
    }

    [Fact]
    public void A_verdict_on_a_comment_line_of_the_copy_is_no_finding()
    {
        var script = Script("a.sh", $"# rm -rf /tmp/{P}-*", "echo done");

        GuardScripts.Judge([script], Verdict(script, 1), "node").Should().BeEmpty();
    }

    [Fact]
    public void The_last_line_of_the_copy_is_a_valid_verdict()
    {
        var script = Script("a.sh", "echo one", $"rm -rf /tmp/{P}-*");

        GuardScripts.Judge([script], Verdict(script, 2), "node").Should().ContainSingle().Which.Should().BeEquivalentTo(Blind("a.sh", 2));
    }

    [Theory]
    [InlineData(-1)]
    [InlineData(0)]
    [InlineData(3)]
    [InlineData(int.MaxValue)]
    public void A_line_outside_the_script_makes_the_whole_answer_one_unjudged_finding(int line)
    {
        var good = Script("a.sh", $"rm -rf /tmp/{P}-*", "echo two");
        var other = Script("b.sh", "echo b");
        var answer = Verdict(good, 1) + "\n" + Verdict(good, line);

        var findings = GuardScripts.Judge([good, other], answer, "node");

        var finding = findings.Should().ContainSingle("a bad answer is one finding, never the good verdict beside it and never an index exception").Subject;
        finding.Class.Should().Be("owner-blind");
        finding.File.Should().Be("a.sh");
        finding.Line.Should().Be(1);
        finding.Text.Should().Contain("could not judge").And.Contain("not a verdict");
    }

    [Fact]
    public void A_file_that_is_not_one_of_the_scripts_sent_makes_the_whole_answer_one_unjudged_finding()
    {
        var script = Script("a.sh", $"rm -rf /tmp/{P}-*");
        var stranger = Path.Combine(_owned.Dir("stranger"), "x.sh");

        var findings = GuardScripts.Judge([script], Verdict(script, 1) + "\n" + Verdict(stranger, 1), "node");

        findings.Should().ContainSingle().Which.Text.Should().Contain("could not judge");
    }

    [Theory]
    [InlineData("not json")]
    [InlineData("[1,2]")]
    [InlineData("{\"file\":null,\"line\":1}")]
    [InlineData("{\"line\":1}")]
    [InlineData("{\"file\":\"x\",\"line\":\"one\"}")]
    [InlineData("{\"file\":\"x\",\"line\":1.5}")]
    public void An_answer_line_that_is_not_a_verdict_is_one_unjudged_finding(string raw)
    {
        var script = Script("a.sh", "echo one");

        GuardScripts.Judge([script], raw, "node").Should().ContainSingle().Which.Text.Should().Contain("could not judge");
    }
}
