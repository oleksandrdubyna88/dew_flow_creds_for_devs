namespace CredsCli;

/// <summary>What the user asked for, or why the arguments could not be read.</summary>
internal abstract record Request
{
    internal sealed record Use(string Verb, string Token, string? Payload) : Request;

    internal sealed record Failed(string Message) : Request;

    internal sealed record Help(string Text) : Request;
}

/// <summary>
/// Argument parsing, kept pure so the shapes are a unit test rather than something you discover
/// by running the binary with the wrong words.
/// </summary>
/// <remarks>
/// <para>The <c>--</c> convention is load-bearing and was measured on the Node side rather than
/// assumed: git-bash, Windows PowerShell 5.1 and cmd.exe all deliver
/// <c>-- "docker ps --format '{{.Names}}'"</c> as ONE argument with the inner single quotes
/// intact. Everything after <c>--</c> is therefore taken verbatim and joined with single spaces,
/// never re-quoted by us.</para>
/// </remarks>
internal static class CommandLine
{
    /// <summary>Verbs that take a command or query after <c>--</c>.</summary>
    private static readonly Dictionary<string, bool> PayloadRequired = new()
    {
        ["ssh"] = true,
        ["db"] = true,
        ["terminal"] = false,
        ["run"] = false,
        ["script"] = false,
        ["env"] = false,
        ["vpn-up"] = false,
        ["vpn-down"] = false,
    };

    /// <summary>Verbs that name no entry at all — they ask the window a question about itself.</summary>
    private static readonly string[] Tokenless = ["ls"];

    /// <summary>The wire verb for a user-facing one — <c>ssh</c> posts to the exec route.</summary>
    internal static string WireVerb(string spoken) => spoken == "ssh" ? "exec" : spoken;

    internal static Request Parse(IReadOnlyList<string> argv)
    {
        if (argv.Count == 0 || argv[0] is "-h" or "--help" or "help")
        {
            return new Request.Help(HelpText);
        }

        var verb = argv[0];
        if (Tokenless.Contains(verb))
        {
            return argv.Count > 1
                ? new Request.Failed($"`creds {verb}` takes no arguments.")
                : new Request.Use(verb, string.Empty, null);
        }

        if (!PayloadRequired.TryGetValue(verb, out var needsPayload))
        {
            return new Request.Failed($"unknown verb \"{verb}\". Run `creds --help` to see what exists.");
        }

        if (argv.Count < 2)
        {
            return new Request.Failed($"`creds {verb}` needs a grant token. Ask the human for a fresh Share with Claude Code.");
        }

        var token = argv[1];
        var separator = IndexOfSeparator(argv);
        var payload = separator < 0 ? null : string.Join(' ', argv.Skip(separator + 1));

        if (needsPayload && string.IsNullOrWhiteSpace(payload))
        {
            return new Request.Failed(
                verb == "db"
                    ? "`creds db <token> -- \"select 1\"` — the query goes after `--`."
                    : "`creds ssh <token> -- <command>` — the command goes after `--`.");
        }

        // A payload handed to a verb that takes none is refused rather than dropped: silently
        // ignoring it would run something other than what was typed.
        if (!needsPayload && payload is not null)
        {
            return new Request.Failed($"`creds {verb}` takes no command — it runs exactly what was saved in the vault.");
        }

        return new Request.Use(verb, token, payload);
    }

    private static int IndexOfSeparator(IReadOnlyList<string> argv)
    {
        for (var i = 0; i < argv.Count; i++)
        {
            if (argv[i] == "--")
            {
                return i;
            }
        }
        return -1;
    }

    internal const string HelpText = """
        creds — use a credential from CredsForDevs without ever receiving it.

          creds ls                           the names enabled for the CLI here
          creds ssh <token|name> -- <cmd>     run a command on the remote host
          creds terminal <token>             open an interactive terminal in VS Code
          creds run <token>                  run the saved command
          creds script <token>               run the saved script
          creds db <token> -- "select 1"     run a query
          creds env <token>                  export the secret into new VS Code terminals
          creds vpn-up <token>               bring the tunnel up
          creds vpn-down <token>             bring it down

        The token comes from "Share with Claude Code…" in VS Code. It reaches exactly one
        vault entry, stops working when that window closes, and the first call asks the
        human to allow it. You never receive the credential itself.

        Quoting: put double quotes around the whole command and single quotes inside.
        Inner double quotes are dropped by Windows PowerShell, which silently changes what
        runs rather than failing.
        """;
}
