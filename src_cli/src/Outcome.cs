using System.Text.Json;

namespace CredsCli;

/// <summary>What this process prints, and what it exits with, once the broker answered 200.</summary>
/// <param name="Stdout">Data the caller may parse. Never anything we invented.</param>
/// <param name="Stderr">The remote's own error stream, passed through.</param>
/// <param name="Notes">Context, prefixed and sent to stderr — never data to parse.</param>
internal sealed record Outcome(string Stdout, string Stderr, IReadOnlyList<string> Notes, int ExitCode);

/// <summary>
/// The C# half of the CLI contract, mirroring <c>agentCliOutcome.ts</c> verb for verb.
/// </summary>
/// <remarks>
/// <para>An agent reads the exit code and decides what to do next, so "this succeeded" meaning
/// <c>0</c> in the Node client and something else here is not a cosmetic difference between two
/// implementations — it is one of them lying to a caller that cannot check.</para>
/// <para>The defect this shape exists to prevent already happened once on the Node side: a chain
/// that special-cased one verb and let everything else fall through to
/// <c>brokerFailure</c> reported a successful <c>env</c>, <c>vpn-up</c> and <c>vpn-down</c> as
/// failure 95 while printing nothing. A table keyed by verb makes an unhandled verb a visible
/// gap instead.</para>
/// </remarks>
internal static class OutcomeReader
{
    private static readonly string[] ExecVerbs = ["exec", "db", "run", "script"];

    internal static Outcome Interpret(string verb, string json, BrokerContract contract)
    {
        if (ExecVerbs.Contains(verb))
        {
            return FromExec(json, contract);
        }

        return verb switch
        {
            "terminal" => FromTerminal(),
            "env" => FromEnv(json),
            "vpn-up" or "vpn-down" => FromVpn(verb, json, contract),
            _ => new Outcome(
                string.Empty,
                string.Empty,
                [$"this build does not know how to report the result of \"{verb}\"."],
                contract.Exit("brokerFailure")),
        };
    }

    private static Outcome FromExec(string json, BrokerContract contract)
    {
        var body = JsonSerializer.Deserialize(json, CredsJsonContext.Default.ExecResponse);
        if (body is null)
        {
            return new Outcome(string.Empty, string.Empty, ["the broker sent an unreadable answer."], contract.Exit("brokerFailure"));
        }

        var notes = new List<string>();
        if (body.StdoutTruncated || body.StderrTruncated)
        {
            notes.Add("output was truncated at the size ceiling and the command was stopped.");
        }
        if (body.TimedOut)
        {
            notes.Add("the remote command hit the time ceiling and was terminated.");
        }

        // No code on a command-shaped answer really is a broker that did not do its job — the one
        // verb family for which falling through to brokerFailure is correct.
        var exit = body.TimedOut
            ? contract.Exit("remoteTimeout")
            : body.ExitCode ?? contract.Exit("brokerFailure");

        return new Outcome(body.Stdout ?? string.Empty, body.Stderr ?? string.Empty, notes, exit);
    }

    private static Outcome FromTerminal() =>
        new("An SSH terminal is now open in the human's VS Code window." + Environment.NewLine, string.Empty, [], 0);

    private static Outcome FromEnv(string json)
    {
        var written = JsonSerializer.Deserialize(json, CredsJsonContext.Default.EnvExportResponse)?.Written ?? [];
        if (written.Length == 0)
        {
            return new Outcome(string.Empty, string.Empty, ["no variables were exported — the entry has nothing bound to a name."], 0);
        }

        return new Outcome(
            string.Join(Environment.NewLine, written) + Environment.NewLine,
            string.Empty,
            [$"{written.Length} variable(s) are set in integrated terminals opened after this, in that VS Code window only. You receive the names, never the values."],
            0);
    }

    /// <summary>
    /// A tunnel action. <c>opened: false</c> is a 200 — the call worked and the person said no.
    /// </summary>
    /// <remarks>
    /// Exiting 0 there would tell the agent the tunnel is up when it is not, and it would act on
    /// that. A refusal gets its own code so it cannot be read as either success or a mechanism
    /// failure.
    /// </remarks>
    private static Outcome FromVpn(string verb, string json, BrokerContract contract)
    {
        var opened = JsonSerializer.Deserialize(json, CredsJsonContext.Default.OpenedResponse)?.Opened ?? false;
        var what = verb == "vpn-down" ? "brought down" : "brought up";

        return opened
            ? new Outcome($"The VPN tunnel was {what}." + Environment.NewLine, string.Empty, [], 0)
            : new Outcome(
                string.Empty,
                $"The VPN tunnel was not {what}: the human refused it, or the client could not start." + Environment.NewLine,
                [],
                contract.Exit("refused"));
    }
}
