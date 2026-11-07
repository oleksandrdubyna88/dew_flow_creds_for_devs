using System.ComponentModel;
using System.Diagnostics;
using System.Text.Json;

namespace CredsForDevs.Tests.Leftovers;

/// <summary>A script or workflow with its lines, read ONCE: the classifier names a line number, and the guard answers from this copy
/// whether that line is a comment — no file is read again per finding.</summary>
internal sealed record ScriptFile(SourceFile Source, string[] Lines);

/// <summary>The <c>owner-blind</c> class for scripts and workflows: the mounted conventions' own <c>classifyLines</c> (the one
/// implementation the machine scan and the rule checks share), run through <c>node</c> once over every such file. A
/// <c>broad</c> verdict on a line that is not a comment is a finding. <c>node</c> missing, the classifier missing, a non-zero exit
/// or an unreadable answer is ONE finding that names the cause — the script half is never silently skipped.
///
/// <para>Nothing is interpolated into the program node runs: the classifier's module URL and every script path travel in
/// <c>process.argv</c>, so a path with a quote, a backtick or a newline in it is data, never code.</para></summary>
internal static class GuardScripts
{
    private const string ClassifierPath = ".claude/rules/shared/tools/lib/sweeper-scan.mjs";

    private const string Program = """
        import { readFileSync } from "node:fs";
        const [module, ...files] = process.argv.slice(1);
        const { classifyLines } = await import(module);
        for (const file of files) {
          classifyLines(readFileSync(file, "utf8")).forEach((verdict, index) => {
            if (verdict === "broad") console.log(JSON.stringify({ file, line: index + 1 }));
          });
        }
        """;

    private sealed record NodeRun(string? Failure, string Output);

    private sealed record Verdict(string File, int Line);

    private sealed record Answer(string Raw, Verdict? Verdict);

    internal static List<Finding> Classify(IReadOnlyList<ScriptFile> scripts, string mountRoot, string node)
    {
        var run = Run(scripts, mountRoot, node);
        return run.Failure is { } cause ? [Unjudged(scripts, cause)] : Judge(scripts, run.Output, node);
    }

    private static NodeRun Run(IReadOnlyList<ScriptFile> scripts, string mountRoot, string node)
    {
        try
        {
            return Execute(StartInfo(scripts, mountRoot, node), node);
        }
        catch (Exception ex) when (ex is Win32Exception or InvalidOperationException or IOException)
        {
            return new NodeRun($"{node} could not be started: {ex.Message}", "");
        }
    }

    /// <summary>The module URL and the script paths are arguments after <c>--</c>, never part of the program text.</summary>
    private static ProcessStartInfo StartInfo(IReadOnlyList<ScriptFile> scripts, string mountRoot, string node)
    {
        var module = new Uri(Path.GetFullPath(Path.Combine(mountRoot, ClassifierPath))).AbsoluteUri;
        var start = new ProcessStartInfo(node) { RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false, CreateNoWindow = true };
        foreach (var argument in new[] { "--input-type=module", "-e", Program, "--", module }.Concat(scripts.Select(s => s.Source.Absolute))) start.ArgumentList.Add(argument);
        return start;
    }

    private static NodeRun Execute(ProcessStartInfo start, string node)
    {
        using var process = Process.Start(start) ?? throw new InvalidOperationException("the process did not start");
        var output = process.StandardOutput.ReadToEndAsync();
        var errors = process.StandardError.ReadToEndAsync();
        if (!process.WaitForExit(TimeSpan.FromMinutes(2)))
        {
            process.Kill(entireProcessTree: true);
            return new NodeRun($"{node} did not finish in two minutes", "");
        }

        process.WaitForExit();
        return process.ExitCode == 0 ? new NodeRun(null, output.GetAwaiter().GetResult()) : new NodeRun($"{node} exited {process.ExitCode}: {GuardText.FirstLine(errors.GetAwaiter().GetResult())}", "");
    }

    /// <summary>One finding per <c>broad</c> line that is not a comment. A line of the answer that is not a verdict for one of the
    /// scripts — a file not among those sent, or a line below 1 or past that script's line count — turns the whole answer into the one
    /// "could not judge" finding (fail closed: never an index exception, never a finding at a line that does not exist). Internal so a test can hand it an answer as TEXT and
    /// read the findings, without starting any process.</summary>
    internal static List<Finding> Judge(IReadOnlyList<ScriptFile> scripts, string output, string node)
    {
        var byPath = scripts.ToDictionary(s => s.Source.Absolute, StringComparer.Ordinal);
        var answers = output.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Select(raw => new Answer(raw, Parse(raw, byPath))).ToList();
        if (answers.FirstOrDefault(a => a.Verdict is null) is { } bad) return [Unjudged(scripts, $"{node} printed a line that is not a verdict: {bad.Raw}")];
        return [.. answers.Select(a => FindingFor(byPath[a.Verdict!.File], a.Verdict.Line)).OfType<Finding>()];
    }

    private static Verdict? Parse(string raw, Dictionary<string, ScriptFile> byPath)
    {
        try
        {
            using var json = JsonDocument.Parse(raw);
            var file = json.RootElement.GetProperty("file").GetString();
            var line = json.RootElement.GetProperty("line").GetInt32();
            return file is not null && byPath.TryGetValue(file, out var script) && IsLineOf(script, line) ? new Verdict(file, line) : null;
        }
        catch (Exception ex) when (ex is JsonException or KeyNotFoundException or InvalidOperationException or FormatException)
        {
            return null;
        }
    }

    /// <summary>A verdict names a line the script has: 1 to its line count. Anything else is not an answer about that script.</summary>
    private static bool IsLineOf(ScriptFile script, int line) => line >= 1 && line <= script.Lines.Length;

    private static Finding? FindingFor(ScriptFile script, int line) =>
        GuardText.IsComment(script.Lines[line - 1])
            ? null
            : new Finding(script.Source.Relative, line, "owner-blind", "matches the prefix with no owner segment after it (the shipped classifier)");

    private static Finding Unjudged(IReadOnlyList<ScriptFile> scripts, string cause) =>
        new(scripts[0].Source.Relative, 1, "owner-blind", $"the shipped classifier could not judge the scripts — {cause}");
}
