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

    private static async Task<int> Main(string[] args)
    {
        var contract = BrokerContract.Current;

        // `--help` before anything else, and on stdout: a person running this by hand to see
        // whether it works is not speaking the protocol, and the release smoke check is exactly
        // that person. Nothing after this line writes to stdout except the transport.
        if (args.Length > 0 && (args[0] == "--help" || args[0] == "-h" || args[0] == "help"))
        {
            Console.Out.WriteLine(HelpText);
            return 0;
        }
        if (args.Length > 0)
        {
            Note($"unknown argument '{args[0]}' — this binary takes none; an MCP client speaks to it over stdin.");
            return contract.Exit("usage");
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
    /// What the client is told about this server before any tool is called.
    /// </summary>
    /// <remarks>
    /// Short on purpose. Two facts change how a model behaves — that an empty list is a
    /// permission state rather than an empty vault, and that secrets are not obtainable here at
    /// all — and everything else it can learn by calling the tool.
    /// </remarks>
    private const string Instructions =
        """
        CredsForDevs holds this person's credentials. You can see the ones they explicitly opened
        to you, and you can never read a secret: passwords, private keys, VPN configs and
        one-time-code seeds are not obtainable through this server by any request.

        An empty list means nothing has been opened to you yet — not that they have no
        credentials. Tell them they can open one in VS Code: right-click the entry, Edit, and the
        Agent access section.
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

        Tools: creds_list — the entries opened to agents, with what may be done with each.
        """;
}
