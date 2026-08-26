using System.Text.Json;

namespace CredsCli;

/// <summary>
/// <c>creds</c> — the terminal half of CredsForDevs.
/// </summary>
/// <remarks>
/// <para>It holds no credential and can obtain none. All it has is a grant token naming a
/// loopback port in the VS Code window that minted it and authorizing exactly one entity there.
/// The window performs the action; this process relays the request and prints what comes back.
/// There is no response shape in the protocol with a field a secret could travel in.</para>
/// <para>A remote command's own exit code passes through untouched, so <c>&amp;&amp;</c>,
/// <c>||</c> and <c>$?</c> behave around <c>creds</c> exactly as they would around a real
/// <c>ssh</c>. Failures of the mechanism itself use a reserved high band and always print a
/// <c>[creds-for-devs]</c> line to stderr, so a collision with a remote code stays legible.</para>
/// </remarks>
internal static class Program
{
    private static void Note(string message) =>
        Console.Error.WriteLine($"[creds-for-devs] {message}");

    private static async Task<int> Main(string[] args)
    {
        var contract = BrokerContract.Current;

        switch (CommandLine.Parse(args))
        {
            case Request.Help help:
                Console.Out.WriteLine(help.Text);
                return 0;

            case Request.Failed failed:
                Note(failed.Message);
                return contract.Exit("usage");

            case Request.Use use:
                return await RunAsync(use, contract);

            default:
                return contract.Exit("brokerFailure");
        }
    }

    private static async Task<int> RunAsync(Request.Use use, BrokerContract contract)
    {
        var token = GrantToken.Parse(use.Token);
        if (token is null)
        {
            Note("that is not a CredsForDevs grant token — copy the whole token from the shared snippet.");
            return contract.Exit("usage");
        }

        var wireVerb = CommandLine.WireVerb(use.Verb);
        var route = contract.RouteFor(wireVerb);
        if (route is null)
        {
            Note($"this build has no route for \"{use.Verb}\".");
            return contract.Exit("usage");
        }

        using var client = BrokerClient.Create(contract);

        // Before the token leaves this process: a closed window frees its port, and the OS
        // reissues port numbers.
        if (!await client.IsOurBrokerAsync(token.Port))
        {
            Note(
                "no CredsForDevs window is listening for this token — the VS Code window that "
                    + "shared it has closed or reloaded. Ask the human to share the credential again.");
            return contract.Exit("brokerUnreachable");
        }

        BrokerReply reply;
        try
        {
            reply = await client.PostAsync(token, route, RequestBody(wireVerb, use.Payload));
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException)
        {
            Note($"lost the connection to VS Code ({e.Message}) — the action may or may not have run.");
            return contract.Exit("brokerFailure");
        }

        return reply.Status == 200
            ? Report(OutcomeReader.Interpret(wireVerb, reply.Body, contract))
            : ReportError(reply.Body, contract);
    }

    private static string RequestBody(string wireVerb, string? payload) =>
        wireVerb switch
        {
            "exec" => JsonSerializer.Serialize(new ExecRequest(payload ?? string.Empty), CredsJsonContext.Default.ExecRequest),
            "db" => JsonSerializer.Serialize(new QueryRequest(payload ?? string.Empty), CredsJsonContext.Default.QueryRequest),
            _ => "{}",
        };

    private static int Report(Outcome outcome)
    {
        if (outcome.Stdout.Length > 0)
        {
            Console.Out.Write(outcome.Stdout);
        }
        if (outcome.Stderr.Length > 0)
        {
            Console.Error.Write(outcome.Stderr);
        }
        foreach (var note in outcome.Notes)
        {
            Note(note);
        }
        return outcome.ExitCode;
    }

    /// <summary>Turn the broker's refusal into the reserved code that names it.</summary>
    private static int ReportError(string body, BrokerContract contract)
    {
        ErrorDetail? error = null;
        try
        {
            error = JsonSerializer.Deserialize(body, CredsJsonContext.Default.ErrorEnvelope)?.Error;
        }
        catch (JsonException)
        {
            // An unreadable refusal is still a refusal; the generic code below says so.
        }

        Note(error?.Message ?? "the broker refused the call");
        return ExitForError(error?.Code, contract);
    }

    private static int ExitForError(string? code, BrokerContract contract) =>
        code switch
        {
            "unauthorized" => contract.Exit("unknownToken"),
            "denied" => contract.Exit("denied"),
            "consent_timeout" => contract.Exit("consentTimeout"),
            "not_found" or "no_credential" or "not_supported" => contract.Exit("entityGone"),
            "too_many_requests" => contract.Exit("busy"),
            "tool_missing" => contract.Exit("toolMissing"),
            _ => contract.Exit("brokerFailure"),
        };
}
