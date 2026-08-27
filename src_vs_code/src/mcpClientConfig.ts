/**
 * The block a person pastes into their MCP client, and where it goes.
 *
 * <p>Pure, so the shape is a test rather than something discovered by an agent that fails to
 * start. The path is interpolated into JSON through `JSON.stringify`, which is what makes a
 * Windows path survive: `C:\Users\…` in a hand-built string is an invalid escape, and the client
 * reports a malformed config rather than a bad path.</p>
 *
 * <p><b>It is offered, not written.</b> The plan had this command edit the client's config file
 * directly. It does not: that file belongs to another program, a person may have several clients
 * configured, and a credential manager silently editing a config that grants an agent access to
 * itself is the wrong instinct in the wrong place. The block goes to the clipboard with the file
 * it belongs in named beside it — one paste, and the person can see what they granted.</p>
 */

/** The known clients, and where each keeps its servers. Named so a person can be told. */
export interface McpClientTarget {
  label: string;
  /** Where the file lives, in the form a person would type it. */
  path: string;
}

export const MCP_CLIENT_TARGETS: readonly McpClientTarget[] = [
  { label: 'Claude Code (this machine)', path: '~/.claude.json' },
  { label: 'Claude Code (one project)', path: '<project>/.mcp.json' },
  { label: 'VS Code', path: '.vscode/mcp.json' },
];

/**
 * The `mcpServers` block naming this binary.
 *
 * <p>The full path rather than the bare name: the binary is installed into the extension's own
 * storage and is deliberately NOT put on the `PATH`, so a client told `"command": "creds-mcp"`
 * would report that it cannot find it.</p>
 */
export function mcpServerBlock(binaryPath: string): string {
  const config = {
    mcpServers: {
      creds: { command: binaryPath },
    },
  };
  return JSON.stringify(config, null, 2);
}

/** What the person is told once it is installed: the path, the block, and where it goes. */
export function installedMessage(binaryPath: string): string {
  return (
    `The MCP server is installed at ${binaryPath}. ` +
    'Its configuration is on your clipboard — paste it into your MCP client and restart it. ' +
    'Nothing in your vault is visible to an agent until you turn on Agent access for an entry.'
  );
}
