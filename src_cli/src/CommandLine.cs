using CredsBroker;

namespace CredsCli;

/// <summary>What the user asked for, or why the arguments could not be read.</summary>
internal abstract record Request
{
    internal sealed record Use(string Verb, string Token, string? Payload) : Request;

    internal sealed record Failed(string Message) : Request;

    internal sealed record Help(string Text) : Request;

    /// <summary>
    /// The SSH agent relay, which is not a broker call at all.
    /// </summary>
    /// <remarks>
    /// It posts nothing, carries no grant, and holds a connection open instead of exchanging one
    /// request for one response — so it is its own shape rather than a <see cref="Use"/> with
    /// empty fields. <c>Listen</c> is the WSL side, <c>Pipe</c> the Windows side it spawns.
    /// </remarks>
    internal sealed record Relay(bool Listen) : Request;

    /// <summary>
    /// Read one config file, with a config KEY rather than a grant token — and the key is never
    /// in the arguments: it comes from <see cref="ConfigKeySource"/>.
    /// </summary>
    /// <remarks>
    /// <para>Its own shape because a grant token carries the window's port in its text and this does
    /// not: a config key outlives the window that minted it, so the window has to be found the
    /// way <c>ls</c> finds it. Making it a <see cref="Use"/> would have hidden that difference
    /// behind a field that happens to be parsed differently.</para>
    /// <para>It carries WHERE the key is, not the key: parsing stays pure and never reads stdin.</para>
    /// </remarks>
    internal sealed record ReadConfig(ConfigKeySource Source) : Request;
}

/// <summary>Where <c>creds config</c> takes its key from. Never the command line.</summary>
internal enum ConfigKeySource
{
    /// <summary><c>creds config</c> — the <c>CREDSFORDEVS_KEY</c> variable.</summary>
    Environment,

    /// <summary><c>creds config -</c> — one line of stdin, and nothing else even if the variable is set.</summary>
    Stdin,
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
        if (verb is "relay" or "relay-pipe")
        {
            return argv.Count > 1
                ? new Request.Failed($"`creds {verb}` takes no arguments.")
                : new Request.Relay(verb == "relay");
        }

        if (verb == "config")
        {
            return ParseConfig(argv);
        }

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

    /// <summary>
    /// <c>creds config</c> and <c>creds config -</c>; anything else is refused with a CONSTANT.
    /// </summary>
    /// <remarks>
    /// Refused at once rather than deprecated (owner, 2026-10-09): a key on a command line is
    /// readable by every user inside WSL and by every process of the same user on Windows, for as
    /// long as the process lives. The refusal never quotes what it was given — stderr lands in
    /// service logs and crash reports, and echoing the argument would copy the key there too.
    /// </remarks>
    private static Request ParseConfig(IReadOnlyList<string> argv) =>
        argv.Count switch
        {
            1 => new Request.ReadConfig(ConfigKeySource.Environment),
            2 when argv[1] == "-" => new Request.ReadConfig(ConfigKeySource.Stdin),
            _ => new Request.Failed(ConfigArgumentRefused),
        };

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

    /// <summary>The one sentence every refused <c>creds config &lt;…&gt;</c> gets. Never built from the input.</summary>
    internal const string ConfigArgumentRefused =
        "a config key is never taken as an argument — any process on this machine can read a command line. "
            + "Pipe it in with `creds config -`, or set CREDSFORDEVS_KEY and run `creds config` with nothing after it.";

    /// <summary>
    /// The word in <c>--help</c> that says this binary reads a config key from stdin.
    /// </summary>
    /// <remarks>
    /// Probed for by the WSL relay before it hands the Windows <c>creds.exe</c> a key on stdin, and by
    /// <c>coai</c>'s vault reader before it does the same. Its VALUE is a contract with those callers:
    /// change it and every one of them reads this binary as too old.
    /// </remarks>
    internal const string ConfigStdinMarker = "config-key-stdin";

    internal const string HelpText = """
        creds — use a credential from CredsForDevs without ever receiving it.

          creds ls                           the names enabled for the CLI here
          creds ssh <token|name> -- <cmd>     run a command on the remote host
          creds terminal <token>             open an interactive terminal in VS Code
          creds run <token>                  run the saved command
          creds script <token>               run the saved script
          creds db <token> -- "select 1"     run a query
          creds env <token>                  export the secret into new VS Code terminals
          creds config -                     print one config file; the key is read from stdin
          creds config                       the same, with the key from CREDSFORDEVS_KEY
          creds vpn-up <token>               bring the tunnel up
          creds vpn-down <token>             bring it down
          creds relay                        (WSL) serve the SSH agent on a unix socket

        The token comes from "Share with Claude Code…" in VS Code. It reaches exactly one
        vault entry, stops working when that window closes, and the first call asks the
        human to allow it. You never receive the credential itself.

        A config key is never accepted as an argument (config-key-stdin): a command line is
        readable by other processes. An app writes the key and a newline to the stdin of
        `creds config -`, or sets CREDSFORDEVS_KEY and runs `creds config`.

        In WSL, `creds relay` gives ssh and git an agent socket inside the distribution.
        The key stays in the VS Code window on Windows and every use asks there. It prints
        the export line to set; leave it running.

        Quoting: put double quotes around the whole command and single quotes inside.
        Inner double quotes are dropped by Windows PowerShell, which silently changes what
        runs rather than failing.
        """;
}
