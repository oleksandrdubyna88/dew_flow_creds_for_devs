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

        // Inside WSL the broker's loopback belongs to Windows, not to this VM, so the whole call
        // goes to the Windows binary and its streams come back. Before anything else, because
        // even argument errors should be reported by the side that will handle the request.
        // `relay` is the one verb that must stay on this side: it IS the Linux end of the
        // bridge, and handing it to Windows would start a listener in the wrong kernel.
        var staysHere = args.Length > 0 && args[0] == "relay";
        if (!staysHere && WslInterop.ShouldRelayHere())
        {
            try
            {
                return WslInterop.Relay(args);
            }
            catch (Exception e) when (e is System.ComponentModel.Win32Exception or InvalidOperationException)
            {
                Note(
                    $"this looks like WSL, but the Windows binary could not be started ({e.Message}). "
                        + $"Put creds.exe on the PATH, or set {WslInterop.BinaryOverrideVariable} to its full path.");
                return contract.Exit("toolMissing");
            }
        }

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

            case Request.Relay relay:
                return relay.Listen
                    ? await AgentRelay.RunAsync(contract)
                    : await RelayPipe.RunAsync(contract);

            default:
                return contract.Exit("brokerFailure");
        }
    }

    /// <summary>
    /// A token or an alias — whichever the second argument turns out to be.
    /// </summary>
    /// <remarks>
    /// The token format is strict and self-identifying (<c>&lt;digits&gt;.&lt;base64url&gt;</c>),
    /// and the alias grammar deliberately excludes a dot, so one string can never be both. That
    /// is what lets <c>creds ssh 4242.abc -- x</c> and <c>creds ssh prod-db -- x</c> be the same
    /// command rather than two.
    /// </remarks>
    private static async Task<int> RunAsync(Request.Use use, BrokerContract contract)
    {
        if (use.Verb == "ls")
        {
            return await ListAsync(contract);
        }

        var wireVerb = CommandLine.WireVerb(use.Verb);
        var route = contract.RouteFor(wireVerb);
        if (route is null)
        {
            Note($"this build has no route for \"{use.Verb}\".");
            return contract.Exit("usage");
        }

        var token = GrantToken.Parse(use.Token);
        return token is not null
            ? await CallWithTokenAsync(token, route, wireVerb, use.Payload, contract)
            : await CallWithAliasAsync(use.Token, wireVerb, use.Payload, contract);
    }

    private static async Task<int> CallWithTokenAsync(
        GrantToken token,
        string route,
        string wireVerb,
        string? payload,
        BrokerContract contract)
    {
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

        return await SendAsync(
            () => client.PostAsync(token, route, RequestBody(wireVerb, payload)),
            wireVerb,
            contract);
    }

    /// <summary>
    /// A call that names its entry. No token is sent, and none comes back.
    /// </summary>
    /// <remarks>
    /// Every live window is tried, because a name is enabled in the window that holds the entry
    /// and the person need not know which one that is. A window that does not have the name
    /// answers 404, which is also what it answers for a name it does have but has not enabled —
    /// deliberately, so this cannot be used to enumerate what exists.
    /// </remarks>
    private static async Task<int> CallWithAliasAsync(
        string alias,
        string wireVerb,
        string? payload,
        BrokerContract contract)
    {
        if (!AliasName.IsValid(alias))
        {
            Note($"\"{alias}\" is neither a grant token nor a valid alias. {AliasName.Rule}");
            return contract.Exit("usage");
        }

        // On a Remote-SSH host there are no endpoint files: they live on the laptop at the other
        // end of the bridge. The forwarded socket IS the endpoint, and there is exactly one, so
        // discovery is skipped rather than made to fail and then be worked around.
        var endpoints = BrokerClient.SocketPath() is not null
            ? [new Endpoint(0, 1, BrokerClient.SocketPath(), string.Empty)]
            : Endpoints.Read(Endpoints.DirectoryHere());

        if (endpoints.Count == 0)
        {
            Note(
                "no CredsForDevs window is running, or none has been used yet this session. Open "
                    + $"VS Code, or set {Endpoints.DirectoryOverrideVariable} if your install is not in the usual place. "
                    + $"On a remote host, {BrokerClient.SocketVariable} should name the forwarded socket.");
            return contract.Exit("brokerUnreachable");
        }

        using var client = BrokerClient.Create(contract);
        var aliasRoute = "/v1/alias/" + wireVerb;
        var body = AliasBody(alias, wireVerb, payload);

        foreach (var endpoint in endpoints)
        {
            if (!await client.IsOurBrokerAsync(endpoint.Port))
            {
                continue; // a note left by a window that has since closed
            }

            var reply = await client.PostAliasAsync(endpoint.Port, aliasRoute, body);
            if (reply.Status == 404)
            {
                continue; // this window does not serve that name; try the next
            }

            return reply.Status == 200
                ? Report(OutcomeReader.Interpret(wireVerb, reply.Body, contract))
                : ReportError(reply.Body, contract);
        }

        Note($"no running VS Code window has \"{alias}\" enabled for the CLI. Enable it on the entry with \"Enable CLI Access\".");
        return contract.Exit("entityGone");
    }

    private static async Task<int> SendAsync(
        Func<Task<BrokerReply>> send,
        string wireVerb,
        BrokerContract contract)
    {
        BrokerReply reply;
        try
        {
            reply = await send();
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

    private static string AliasBody(string alias, string wireVerb, string? payload) =>
        wireVerb switch
        {
            "exec" => JsonSerializer.Serialize(new AliasExecRequest(alias, payload ?? string.Empty), CredsJsonContext.Default.AliasExecRequest),
            "db" => JsonSerializer.Serialize(new AliasQueryRequest(alias, payload ?? string.Empty), CredsJsonContext.Default.AliasQueryRequest),
            _ => JsonSerializer.Serialize(new AliasRequest(alias), CredsJsonContext.Default.AliasRequest),
        };

    /// <summary>
    /// Print the names this window has enabled for the CLI.
    /// </summary>
    /// <remarks>
    /// <para>Every live window is asked, because a name is enabled in whichever window holds the
    /// entry and the person need not know which. Names are printed once even if two windows
    /// report the same one — the same entry open twice is not two entries.</para>
    /// <para>Nothing here is authenticated, and that is the owner's recorded decision: the CLI
    /// that most needs `ls` runs on a Remote-SSH host, where the registry lives on the other
    /// machine and cannot be read from disk. What it discloses is names and kinds, never an
    /// address or anything stored.</para>
    /// </remarks>
    private static async Task<int> ListAsync(BrokerContract contract)
    {
        var endpoints = BrokerClient.SocketPath() is not null
            ? [new Endpoint(0, 1, BrokerClient.SocketPath(), string.Empty)]
            : Endpoints.Read(Endpoints.DirectoryHere());

        using var client = BrokerClient.Create(contract);
        var seen = new SortedDictionary<string, string>(StringComparer.Ordinal);
        var reached = 0;

        foreach (var endpoint in endpoints)
        {
            if (!await client.IsOurBrokerAsync(endpoint.Port))
            {
                continue;
            }
            reached += 1;
            var reply = await client.GetAsync(endpoint.Port, "/v1/aliases");
            if (reply.Status != 200)
            {
                continue;
            }
            var list = JsonSerializer.Deserialize(reply.Body, CredsJsonContext.Default.AliasListResponse);
            foreach (var entry in list?.Aliases ?? [])
            {
                seen[entry.Name] = entry.Kind;
            }
        }

        if (reached == 0)
        {
            Note("no CredsForDevs window is running here.");
            return contract.Exit("brokerUnreachable");
        }
        if (seen.Count == 0)
        {
            Note("no entry is enabled for the CLI yet — use \"Enable CLI Access\" on one in VS Code.");
            return 0;
        }

        foreach (var (name, kind) in seen)
        {
            Console.Out.WriteLine($"{name}	{kind}");
        }
        return 0;
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
