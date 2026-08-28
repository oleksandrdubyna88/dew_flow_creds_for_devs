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
    /// Pure, and separate from <see cref="Main"/>, because one of its consequences is not obvious:
    /// help and a usage error are answered on THIS side even inside WSL. Both are the same
    /// sentence from either half, and launching a Windows process to print a line a person asked
    /// for by hand — which is exactly what the release smoke check does — buys nothing.
    /// </remarks>
    internal static Startup Classify(string[] args) =>
        args.Length == 0
            ? Startup.Serve
            : args[0] is "--help" or "-h" or "help" ? Startup.Help : Startup.Usage;

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
                Note($"unknown argument '{args[0]}' — this binary takes none; an MCP client speaks to it over stdin.");
                return contract.Exit("usage");

            default:
                return await ServeAsync(contract);
        }
    }

    /// <summary>
    /// Answer the protocol — from here, or from the Windows binary when we are inside WSL.
    /// </summary>
    /// <remarks>
    /// The decision is the CLI's, unchanged and shared: two independent signals for "this is
    /// WSL", plus a guard against a Windows binary that is secretly a Linux one. What differs is
    /// what follows it — a session to carry rather than a call to relay.
    /// </remarks>
    private static async Task<int> ServeAsync(BrokerContract contract)
    {
        if (WslInterop.ShouldRelayHere())
        {
            return await RelayAsync(contract);
        }

        try
        {
            await RunAsync(contract);
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
    private static async Task<int> RelayAsync(BrokerContract contract)
    {
        try
        {
            return await WslPump.RunAsync();
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

    private static async Task RunAsync(BrokerContract contract)
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
        options.ToolCollection ??= [];
        options.ToolCollection.Add(ListTool(contract));
        options.ToolCollection.Add(ConfigSnippetTool(contract));
        options.ToolCollection.Add(FolderListTool(contract));
        foreach (var tool in FolderTool(contract))
        {
            options.ToolCollection.Add(tool);
        }
        foreach (var tool in UseTools.All)
        {
            options.ToolCollection.Add(UseTool(contract, tool));
        }

        await using var transport = new StdioServerTransport(ServerName);
        await using var server = McpServer.Create(transport, options);
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
            () => Tools.ListAsync(contract),
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
            (string entry, string? language, string? variant) =>
                Tools.ConfigSnippetAsync(contract, entry, language, variant),
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
            () => FolderTools.ListAsync(contract),
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
    private static IEnumerable<McpServerTool> FolderTool(BrokerContract contract) =>
    [
        McpServerTool.Create(
            (string name, string parent, string? folderType = null) =>
                FolderTools.InvokeAsync(contract, "create", [("name", name), ("parent", parent), ("folderType", folderType)]),
            FolderOptions(FolderTools.CreateName, "Create a folder", FolderTools.CreateDescription)),
        McpServerTool.Create(
            (string folder, string? name = null, string? parent = null, string? folderType = null) =>
                FolderTools.InvokeAsync(contract, "edit", [("folder", folder), ("name", name), ("parent", parent), ("folderType", folderType)]),
            FolderOptions(FolderTools.EditName, "Rename, move or retype a folder", FolderTools.EditDescription)),
        McpServerTool.Create(
            (string folder) => FolderTools.InvokeAsync(contract, "delete", [("folder", folder)]),
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

    private static McpServerTool UseTool(BrokerContract contract, UseTools.UseTool tool) =>
        McpServerTool.Create(
            ArgumentsFor(contract, tool),
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
    /// in, so they are the broker's own words rather than anything invented here.
    /// </remarks>
    private static Delegate ArgumentsFor(BrokerContract contract, UseTools.UseTool tool) =>
        tool.Action switch
        {
            "exec" => (string entry, string command) =>
                UseTools.InvokeAsync(contract, tool, entry, "command", command),
            "query" => (string entry, string query) =>
                UseTools.InvokeAsync(contract, tool, entry, "query", query),
            // `delete` takes only the entry: there is no second argument, because there is no
            // second destination. That is the permission, not a default.
            "rotate" => (string entry, string statement, string? secretKind = null) =>
                UseTools.RotateAsync(contract, tool, entry, statement, secretKind),
            // The one shape with no entry id: there is no entry yet. The parameter names are
            // what a model fills in, so they are the words the broker's body uses.
            // Defaults, not just nullable types: a parameter with no default is REQUIRED in the
            // generated schema, so a call that left `folder` out — the ordinary case, when only
            // one folder is open — failed to bind and reached the model as "an error occurred".
            "create" => (
                    string name,
                    string kind,
                    string? secretKind = null,
                    string? secret = null,
                    string? folder = null,
                    string? host = null,
                    string? user = null) =>
                UseTools.CreateAsync(contract, tool, name, kind, secretKind, secret, folder, host, user),
            _ => (string entry) => UseTools.InvokeAsync(contract, tool, entry, null, null),
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

        A `config` entry is a whole config file the vault keeps out of git — the app reads it at
        startup through a key only the person can mint. creds_config_snippet gives you the exact
        code to paste, per language, and the file it goes into; `codeAccessEnabled` on the list
        says whether the key exists yet. You wire the code; the person mints the key.
        """;

    private const string HelpText =
        """
        creds-mcp — the MCP server for CredsForDevs.

        It takes no arguments and is not run by hand: an MCP client starts it and speaks JSON-RPC
        to it over stdin and stdout. Everything it answers comes from a running VS Code window
        with the CredsForDevs extension, over the loopback, and only for entries whose Agent
        access switches are on.

        Configure it in your MCP client:

          { "mcpServers": { "creds": { "command": "creds-mcp" } } }

        Or use "CredsForDevs: Install the MCP Server" from the extension's menu, which puts the
        binary somewhere on PATH and writes that block for you.

        Inside WSL it needs no configuration either: the window is on Windows, so this binary
        hands the whole session to creds-mcp.exe through WSL interop and carries its stdio. Set
        CREDS_MCP_WINDOWS_BINARY to the full path when that executable is not on the interop PATH
        — which is the ordinary case, since the extension installs it into its own storage.

        Tools: creds_list and creds_folders, then creds_exec / creds_query / creds_run /
        creds_open_terminal / creds_vpn_up / creds_vpn_down / creds_export_env, and the folder
        verbs creds_create_folder / creds_edit_folder / creds_delete_folder — each gated by that
        entry or folder's own switch and by the person's approval, every call.
        """;
}
