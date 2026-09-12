using CredsBroker;
using ModelContextProtocol.Server;

namespace CredsMcp;

/// <summary>
/// <c>creds-mcp</c> — the MCP half of CredsForDevs.
/// </summary>
/// <remarks>
/// <para>An MCP client (Claude Code, and others) starts this as its own child process and speaks
/// JSON-RPC to it over stdio. That process lifetime is why this is a separate binary rather than
/// a verb of the extension: the extension lives inside VS Code, and it has zero runtime
/// dependencies — a deliberate constraint that already cost this product the KDBX format, and
/// one an MCP SDK would have been the first exception to.</para>
/// <para><b>It holds no credential and can obtain none.</b> Everything it knows it asked a
/// running VS Code window for, over the loopback, through a route that answers only what a
/// person turned a switch on for. There is no response shape in this program with a field a
/// secret could travel in.</para>
/// <para><b>stdout carries the protocol.</b> One stray line on it corrupts the JSON-RPC stream,
/// and the failure looks like a protocol bug rather than a logging one — so every diagnostic
/// goes to stderr, and nothing here ever calls <c>Console.WriteLine</c>. This is not a
/// precaution taken on principle: the SDK's own hosted default logs to stdout, which was
/// measured on 2026-08-27, and is exactly why this program builds the server by hand instead of
/// taking the generic host.</para>
/// </remarks>
internal static class Program
{
    private const string ServerName = "creds-for-devs";

    private static void Note(string message) => Console.Error.WriteLine($"[creds-for-devs] {message}");

    /// <summary>What this process was started to do, before any of it happens.</summary>
    internal enum Startup
    {
        /// <summary>Print the help and leave.</summary>
        Help,

        /// <summary>An argument this binary does not take.</summary>
        Usage,

        /// <summary>Speak the protocol — here, or through the Windows half.</summary>
        Serve,
    }

    /// <summary>
    /// Which of the three this invocation is.
    /// </summary>
    /// <remarks>
    /// <para>Pure, and separate from <see cref="Main"/>, because one of its consequences is not
    /// obvious: help and a usage error are answered on THIS side even inside WSL. Both are the same
    /// sentence from either half, and launching a Windows process to print a line a person asked
    /// for by hand — which is exactly what the release smoke check does — buys nothing.</para>
    /// <para><c>--caller &lt;record&gt;</c> is the one argument that IS a session: the Linux half of
    /// the WSL bridge forwards the caller record it computed, and this half serves with it rather
    /// than recomputing one from an environment that belongs to <c>wsl.exe</c>. Exactly one value,
    /// and everything else stays a usage error — an argument this build does not know must not
    /// become a relayed session that fails on the other side with a different message.</para>
    /// </remarks>
    internal static Startup Classify(string[] args) =>
        args switch
        {
            [] => Startup.Serve,
            ["--help" or "-h" or "help", ..] => Startup.Help,
            [CallerForwarding.Flag, _] => Startup.Serve,
            _ => Startup.Usage,
        };

    /// <summary>The record the Linux half forwarded, still encoded — or <c>null</c> for a plain start.</summary>
    internal static string? ForwardedCaller(string[] args) =>
        args is [CallerForwarding.Flag, var encoded] ? encoded : null;

    private static async Task<int> Main(string[] args)
    {
        var contract = BrokerContract.Current;

        // `--help` on stdout: a person running this by hand to see whether it works is not
        // speaking the protocol. Nothing after this line writes to stdout except the transport.
        switch (Classify(args))
        {
            case Startup.Help:
                Console.Out.WriteLine(HelpText);
                return 0;

            case Startup.Usage:
                Note($"unknown argument '{args[0]}' — this binary takes none by hand; an MCP client speaks to it over stdin.");
                return contract.Exit("usage");

            default:
                return await ServeAsync(contract, ForwardedCaller(args));
        }
    }

    /// <summary>
    /// Answer the protocol — from here, or from the Windows binary when we are inside WSL.
    /// </summary>
    /// <remarks>
    /// <para>The decision is the CLI's, unchanged and shared: two independent signals for "this is
    /// WSL", plus a guard against a Windows binary that is secretly a Linux one. What differs is
    /// what follows it — a session to carry rather than a call to relay.</para>
    /// <para><b>The caller record is computed BEFORE the branch</b>, so under the relay it is the
    /// LINUX half's environment that names the session — the half Claude Code actually spawned.
    /// A record forwarded to us is taken as it came and never recomputed: this half's environment
    /// belongs to <c>wsl.exe</c>, and a pid found in it would name somebody else's session. The
    /// one field this half does fill is the agent, from the client that shakes hands with it
    /// (<see cref="CallerSource"/>).</para>
    /// </remarks>
    private static async Task<int> ServeAsync(BrokerContract contract, string? forwarded)
    {
        var caller = forwarded is null ? CallerIdentity.Current(agent: string.Empty) : CallerIdentity.Decode(forwarded);
        if (WslInterop.ShouldRelayHere())
        {
            return await RelayAsync(contract, caller);
        }

        try
        {
            await RunAsync(contract, caller);
            return 0;
        }
        catch (Exception e) when (e is IOException or ObjectDisposedException)
        {
            // The client went away mid-stream. Not a failure of ours, and not worth a stack
            // trace in somebody's editor log.
            Note("the MCP client closed the connection.");
            return 0;
        }
    }

    /// <summary>
    /// Inside WSL: become the stdio of the Windows binary, which can reach the window.
    /// </summary>
    /// <remarks>
    /// The one failure worth a sentence is a missing Windows binary, because it is the one a
    /// person can fix — and the message has to name the variable, since <c>creds-mcp.exe</c> is
    /// installed into the extension's own storage and deliberately not put on the PATH.
    /// </remarks>
    private static async Task<int> RelayAsync(BrokerContract contract, CallerRecord caller)
    {
        try
        {
            // Once per session, never per call: ask the Windows half whether it knows `--caller`,
            // and hand it the record only if it does. An old half handed the flag would die with a
            // usage error before the handshake — a dead server, not a degraded one.
            var args = await CallerForwarding.ArgumentsForAsync(
                caller,
                () => WslInterop.CredsMcp.CaptureAsync(["--help"], CallerForwarding.ProbeTimeout),
                CallerForwarding.ProbeTimeout,
                Note);
            return await WslPump.RunAsync(args);
        }
        catch (Exception e) when (e is System.ComponentModel.Win32Exception or InvalidOperationException)
        {
            Note(
                $"this looks like WSL, but creds-mcp.exe could not be started ({e.Message}). Set "
                    + $"{WslInterop.McpBinaryOverrideVariable} to its full path — \"Install the MCP Server…\" "
                    + "puts it in the extension's storage rather than on the PATH.");
            return contract.Exit("toolMissing");
        }
        catch (Exception e) when (e is IOException or ObjectDisposedException)
        {
            Note("the MCP client closed the connection.");
            return 0;
        }
    }

    private static async Task RunAsync(BrokerContract contract, CallerRecord caller)
    {
        var options = new McpServerOptions
        {
            ServerInfo = new ModelContextProtocol.Protocol.Implementation
            {
                Name = ServerName,
                Version = typeof(Program).Assembly.GetName().Version?.ToString(3) ?? "0.0.0",
            },
            ServerInstructions = Instructions,
        };
        // The tools capture the holder, not a value: ClientInfo is null until the handshake this
        // process is about to answer, so the client's name is read per call — see CallerSource.
        var source = new CallerSource(caller);
        options.ToolCollection ??= [];
        options.ToolCollection.Add(ListTool(contract));
        options.ToolCollection.Add(ConfigSnippetTool(contract));
        options.ToolCollection.Add(FolderListTool(contract));
        foreach (var tool in FolderTool(contract, source))
        {
            options.ToolCollection.Add(tool);
        }
        foreach (var tool in UseTools.All)
        {
            options.ToolCollection.Add(UseTool(contract, tool, source));
        }

        await using var transport = new StdioServerTransport(ServerName);
        await using var server = McpServer.Create(transport, options);
        // The side that spoke to the client names the client.
        source.Bind(server);
        await server.RunAsync();
    }

    /// <summary>
    /// The one tool, with the hints an MCP client uses to decide how carefully to treat it.
    /// </summary>
    /// <remarks>
    /// <c>ReadOnly</c> and <c>Idempotent</c> are true and <c>Destructive</c> is false, all three
    /// honestly: this reads a list and changes nothing. They are the hints a client may use to
    /// skip a confirmation, which is exactly why they must never be optimistic — the verbs that
    /// DO change something will declare the opposite.
    /// </remarks>
    private static McpServerTool ListTool(BrokerContract contract) =>
        McpServerTool.Create(
            async () => Answer.From(await Tools.ListAsync(contract)),
            new McpServerToolCreateOptions
            {
                Name = Tools.ListName,
                Title = "List credentials opened to agents",
                Description = Tools.ListDescription,
                ReadOnly = true,
                Idempotent = true,
                Destructive = false,
                OpenWorld = false,
            });

    /// <summary>
    /// One action tool, with the hints that decide how carefully a client treats it.
    /// </summary>
    /// <remarks>
    /// <para><b>None of these is read-only and none is idempotent</b>, and saying so is the
    /// point: every one of them runs something on a real machine with a real credential.
    /// `Destructive` is true for the same reason — a client may use these hints to skip a
    /// confirmation of its own, and this is not the place to be optimistic. The window's consent
    /// modal is unaffected either way; it asks regardless.</para>
    /// <para>Two parameters at most, and each named for what the broker calls it. A tool taking
    /// a whole JSON body would be a tool letting a model choose which fields this program
    /// sends.</para>
    /// </remarks>
    /// <summary>
    /// The config-snippet tool (tails T10). Read-only and idempotent honestly: it returns
    /// public text assembled from an entry's file name and format, raises no modal, and cannot
    /// reach a secret — the response has no field one could travel in.
    /// </summary>
    private static McpServerTool ConfigSnippetTool(BrokerContract contract) =>
        McpServerTool.Create(
            async (string entry, string? language, string? variant) =>
                Answer.From(await Tools.ConfigSnippetAsync(contract, entry, language, variant)),
            new McpServerToolCreateOptions
            {
                Name = Tools.ConfigSnippetName,
                Title = "How code reads one config entry",
                Description = Tools.ConfigSnippetDescription,
                ReadOnly = true,
                Idempotent = true,
                Destructive = false,
                OpenWorld = false,
            });

    /// <summary>
    /// The folder listing: read-only and idempotent, honestly.
    /// </summary>
    /// <remarks>
    /// It reads a list, raises no modal and changes nothing. Folders hold no secret, so unlike
    /// every other read here there is no half to leave out — what limits the answer is only what
    /// somebody opened.
    /// </remarks>
    private static McpServerTool FolderListTool(BrokerContract contract) =>
        McpServerTool.Create(
            async () => Answer.From(await FolderTools.ListAsync(contract)),
            new McpServerToolCreateOptions
            {
                Name = FolderTools.ListName,
                Title = "List folders opened to agents",
                Description = FolderTools.ListDescription,
                ReadOnly = true,
                Idempotent = true,
                Destructive = false,
                OpenWorld = false,
            });

    /// <summary>
    /// The three folder verbs.
    /// </summary>
    /// <remarks>
    /// <para>None is read-only and none is idempotent, and the hints say so: each changes the
    /// person's tree. `Destructive` is true for all three because a client may use these to skip
    /// a confirmation of its own, and a rename that reappears somewhere unexpected is not a thing
    /// to be optimistic about — a move carries a folder's agent-access answers to its whole
    /// contents.</para>
    /// <para>The parameter names are the broker's own, and the SET of them is the whole
    /// no-escalation rule on this side: there is no parameter a model could put the switches in,
    /// because the delegates below declare every field that travels.</para>
    /// </remarks>
    private static IEnumerable<McpServerTool> FolderTool(BrokerContract contract, CallerSource caller) =>
    [
        McpServerTool.Create(
            async (string name, string parent, string? folderType = null) =>
                Answer.From(await FolderTools.InvokeAsync(contract, "create", caller.Current, [("name", name), ("parent", parent), ("folderType", folderType)])),
            FolderOptions(FolderTools.CreateName, "Create a folder", FolderTools.CreateDescription)),
        McpServerTool.Create(
            async (string folder, string? name = null, string? parent = null, string? folderType = null) =>
                Answer.From(await FolderTools.InvokeAsync(contract, "edit", caller.Current, [("folder", folder), ("name", name), ("parent", parent), ("folderType", folderType)])),
            FolderOptions(FolderTools.EditName, "Rename, move or retype a folder", FolderTools.EditDescription)),
        McpServerTool.Create(
            async (string folder) => Answer.From(await FolderTools.InvokeAsync(contract, "delete", caller.Current, [("folder", folder)])),
            FolderOptions(FolderTools.DeleteName, "Move a folder to the Trash", FolderTools.DeleteDescription)),
    ];

    private static McpServerToolCreateOptions FolderOptions(string name, string title, string description) =>
        new()
        {
            Name = name,
            Title = title,
            Description = description,
            ReadOnly = false,
            Idempotent = false,
            Destructive = true,
            OpenWorld = true,
        };

    /// <summary>
    /// The generation options, as the fields the broker reads.
    /// </summary>
    /// <remarks>
    /// <para>Built here, one named parameter at a time, rather than taken as an object: a tool
    /// that accepted a settings blob would be a tool letting a model decide which fields this
    /// program sends, which is the thing every body on this surface is built to avoid.</para>
    /// <para>An option left null is left OUT, never sent as a default. Absent means "as you
    /// normally would" on the far side, and sending a default would turn every call into an
    /// explicit instruction — including the one that asked for nothing.</para>
    /// </remarks>
    private static IReadOnlyList<(string, string?)> Draw(
        int? length,
        bool? lower,
        bool? upper,
        bool? digits,
        bool? symbols,
        bool? avoidAmbiguous,
        int? words,
        string? separator) =>
    [
        ("length", length?.ToString()),
        ("lower", Word(lower)),
        ("upper", Word(upper)),
        ("digits", Word(digits)),
        ("symbols", Word(symbols)),
        ("avoidAmbiguous", Word(avoidAmbiguous)),
        ("words", words?.ToString()),
        // A separator may legitimately be the EMPTY string ("join the words"), which every other
        // field here treats as absent — so it is passed through as it came and the far side
        // decides, rather than being silently turned into a dash.
        ("separator", separator),
    ];

    /// <summary>`true`/`false` as the words the broker's reader accepts, or nothing.</summary>
    private static string? Word(bool? flag) => flag is null ? null : (flag.Value ? "true" : "false");

    private static McpServerTool UseTool(BrokerContract contract, UseTools.UseTool tool, CallerSource caller) =>
        McpServerTool.Create(
            ArgumentsFor(contract, tool, caller),
            new McpServerToolCreateOptions
            {
                Name = tool.Name,
                Title = tool.Title,
                Description = tool.Description,
                ReadOnly = false,
                Idempotent = false,
                Destructive = true,
                OpenWorld = true,
            });

    /// <summary>
    /// The delegate whose parameters become the tool's schema.
    /// </summary>
    /// <remarks>
    /// Three shapes, because three is how many the seven actions need: an entry alone, an entry
    /// and a command, an entry and a query. The parameter NAMES are what a model sees and fills
    /// in, so they are the broker's own words rather than anything invented here. The caller is
    /// NOT a parameter — it is read from the holder on each call — so no schema here moved when
    /// the label arrived.
    /// </remarks>
    private static Delegate ArgumentsFor(BrokerContract contract, UseTools.UseTool tool, CallerSource caller) =>
        tool.Action switch
        {
            "exec" => async (string entry, string command) =>
                Answer.From(await UseTools.InvokeAsync(contract, tool, caller.Current, entry, "command", command)),
            "query" => async (string entry, string query) =>
                Answer.From(await UseTools.InvokeAsync(contract, tool, caller.Current, entry, "query", query)),
            // `delete` takes only the entry: there is no second argument, because there is no
            // second destination. That is the permission, not a default.
            // The generation options ride along, named one by one. A model cannot add a field to
            // a body it does not compose, which is the same rule the window keeps on its side.
            "rotate" => async (
                    string entry,
                    string statement,
                    string? secretKind = null,
                    int? length = null,
                    bool? lower = null,
                    bool? upper = null,
                    bool? digits = null,
                    bool? symbols = null,
                    bool? avoidAmbiguous = null,
                    int? words = null,
                    string? separator = null) =>
                Answer.From(await UseTools.RotateAsync(
                    contract,
                    tool,
                    caller.Current,
                    entry,
                    statement,
                    secretKind,
                    Draw(length, lower, upper, digits, symbols, avoidAmbiguous, words, separator))),
            // The one shape with no entry id: there is no entry yet. The parameter names are
            // what a model fills in, so they are the words the broker's body uses.
            // Defaults, not just nullable types: a parameter with no default is REQUIRED in the
            // generated schema, so a call that left `folder` out — the ordinary case, when only
            // one folder is open — failed to bind and reached the model as "an error occurred".
            "create" => async (
                    string name,
                    string kind,
                    string? secretKind = null,
                    string? secret = null,
                    string? folder = null,
                    string? host = null,
                    string? user = null,
                    int? port = null,
                    int? length = null,
                    bool? lower = null,
                    bool? upper = null,
                    bool? digits = null,
                    bool? symbols = null,
                    bool? avoidAmbiguous = null,
                    int? words = null,
                    string? separator = null) =>
                Answer.From(await UseTools.CreateAsync(
                    contract,
                    tool,
                    caller.Current,
                    name,
                    kind,
                    secretKind,
                    secret,
                    folder,
                    host,
                    user,
                    port,
                    Draw(length, lower, upper, digits, symbols, avoidAmbiguous, words, separator))),
            _ => async (string entry) => Answer.From(await UseTools.InvokeAsync(contract, tool, caller.Current, entry, null, null)),
        };

    /// <summary>
    /// What the client is told about this server before any tool is called.
    /// </summary>
    /// <remarks>
    /// Short on purpose. Two facts change how a model behaves — that an empty list is a
    /// permission state rather than an empty vault, and that secrets are not obtainable here at
    /// all — and everything else it can learn by calling the tool.
    /// </remarks>
    private const string Instructions =
        """
        CredsForDevs holds this person's credentials. Start with creds_list: it shows the entries
        they explicitly opened to you, and each one's `can` says what you may do with it.

        You can never read a secret. Passwords, private keys, VPN configs and one-time-code seeds
        are not obtainable through this server by any request — the window holds them, uses them
        on your behalf, and answers with the result.

        Every action asks the person first, in their editor, showing them the real entry and the
        real command. Plan for that: make one call, not twenty, and expect a few seconds.

        An empty list means nothing has been opened to you yet — not that they have no
        credentials. Tell them they can open one in VS Code: right-click the entry, Edit, and the
        Agent access section.

        Folders are the second thing you may be given, and they have their own switches: creds_folders
        lists the ones opened to you, and creds_create_folder / creds_edit_folder / creds_delete_folder
        act on them. Use them when you are provisioning and want what you store to land somewhere
        sensible. You can never change a switch — no request here has a field for one — and a folder
        can only be moved somewhere the same grant already reaches, because a folder passes its answers
        down to everything inside it.

        Every answer here is JSON, as text. **Read it before believing a call worked**: a refusal
        arrives as an ordinary successful result whose body is {"error": "...", "hint": "..."} —
        the person declining, a switch being off, a stale id and a prompt nobody answered all look
        like that, and none of them raises a protocol error. `error` says what happened, `hint`
        says what to do about it, and both are meant to be passed on to the person rather than
        summarised away.

        A `config` entry is a whole config file the vault keeps out of git — the app reads it at
        startup through a key only the person can mint. creds_config_snippet gives you the exact
        code to paste, per language, and the file it goes into; `codeAccessEnabled` on the list
        says whether the key exists yet. You wire the code; the person mints the key.
        """;

    /// <summary>
    /// What <c>--help</c> prints. Internal because the Linux half of the WSL bridge probes the
    /// Windows half's help for the word <c>--caller</c> before passing it — the text is both the
    /// documentation and that probe's signal, and a test pins the two together.
    /// </summary>
    internal const string HelpText =
        """
        creds-mcp — the MCP server for CredsForDevs.

        It takes no arguments by hand and is not run by hand: an MCP client starts it and speaks
        JSON-RPC to it over stdin and stdout. Everything it answers comes from a running VS Code
        window with the CredsForDevs extension, over the loopback, and only for entries whose
        Agent access switches are on.

        Configure it in your MCP client:

          { "mcpServers": { "creds": { "command": "creds-mcp" } } }

        Or use "CredsForDevs: Install the MCP Server" from the extension's menu, which puts the
        binary somewhere on PATH and writes that block for you.

        Inside WSL it needs no configuration either: the window is on Windows, so this binary
        hands the whole session to creds-mcp.exe through WSL interop and carries its stdio. Set
        CREDS_MCP_WINDOWS_BINARY to the full path when that executable is not on the interop PATH
        — which is the ordinary case, since the extension installs it into its own storage.

        The consent modal in the window names who is asking — the agent (from the MCP client's
        own name and version), its session id and name, and the folder it works in, as reported by
        this process's environment. Under WSL the Linux half computes that record and passes it to
        creds-mcp.exe as `--caller <base64url json>`; the Windows half never recomputes it. It is a
        label the person sees, never a permission — the modal says so.

        Tools: creds_list and creds_folders, then creds_exec / creds_query / creds_run /
        creds_open_terminal / creds_vpn_up / creds_vpn_down / creds_export_env, and the folder
        verbs creds_create_folder / creds_edit_folder / creds_delete_folder — each gated by that
        entry or folder's own switch and by the person's approval, every call.
        """;
}
