import { bashInstall } from './installCommand';
import { mcpServerBlock } from './mcpClientConfig';

/**
 * Putting the MCP server where an agent that lives in WSL can actually start it.
 *
 * <p><b>The gap this closes.</b> `Install the MCP Server…` installs for the machine the extension
 * host runs on, which — because the extension is `extensionKind: ["ui"]` — is always Windows,
 * even in a Remote-WSL window. The config block it hands you names that `.exe`, and an MCP client
 * running inside a distribution cannot start a Windows executable by that path. So a person could
 * follow the menu exactly and end up with a server their agent cannot launch.</p>
 *
 * <p><b>Both halves are needed, and that is not a workaround.</b> The Linux binary does not talk
 * to the vault: it re-executes the Windows one through interop and carries its stdio. So the WSL
 * route installs the Linux half INTO the distribution and points it at the Windows half already
 * on this machine.</p>
 *
 * <p><b>The Windows path is translated by `wslpath`, never composed here.</b> `/mnt/c/...` is the
 * default automount root, not a rule — it is configurable in `/etc/wsl.conf`, and a path we made
 * up would be a path that exists nowhere on a machine that changed it. The distribution can
 * answer the question, so it is asked. Pure decisions live here; the process that asks is
 * `mcpInstallTarget.ts`.</p>
 */

/** The variable the Linux binary reads to find the Windows one. Its own, never the CLI's. */
export const WINDOWS_BINARY_VARIABLE = 'CREDS_MCP_WINDOWS_BINARY';

/**
 * The argv that asks a distribution to translate a Windows path.
 *
 * <p>`-e wslpath`, not `bash -lc`: the path goes across as an ARGUMENT rather than as text inside
 * a shell line, so a space or a quote in somebody's user name is not a quoting problem. `-a`
 * makes it absolute, which it already is — cheap, and it fails loudly on a relative path rather
 * than answering something plausible.</p>
 */
export function wslPathArgv(distro: string, windowsPath: string): string[] {
  return [...distroArgv(distro), '-e', 'wslpath', '-a', windowsPath];
}

/** The argv that runs the published install one-liner inside a distribution. */
export function installArgv(distro: string): string[] {
  return [...distroArgv(distro), '-e', 'bash', '-lc', bashInstall('creds-mcp')];
}

/**
 * `-d <name>` only when there is a name.
 *
 * <p>An empty name means "whatever WSL calls default", which is a real choice and not a missing
 * one — the same convention `relayArgv` uses.</p>
 */
function distroArgv(distro: string): string[] {
  return distro.length > 0 ? ['-d', distro] : [];
}

/**
 * Where the script says it put the binary.
 *
 * <p><b>Read, never re-derived.</b> `bashInstall` ends with `echo "installed: $HOME/.local/bin/…"`
 * and expanding `$HOME` here would be a second implementation of a path rule that already has
 * one — the same reasoning that made the SSH relay parse its own `export SSH_AUTH_SOCK=` line
 * instead of computing the socket path twice.</p>
 *
 * <p>The LAST match, because a login shell is free to print its own greeting first, and empty
 * when the script did not get that far — which is what the caller reports as a failure.</p>
 */
export function installedPathFrom(output: string): string {
  const matches = [...output.matchAll(/^installed:[ \t]*(\S.*?)[ \t]*$/gm)];
  return matches.length === 0 ? '' : matches[matches.length - 1][1];
}

/**
 * The block for a client running inside a distribution.
 *
 * <p>The command is the LINUX binary, and the Windows one is named in `env` rather than left to
 * the interop PATH — the extension installs it into its own storage, which is deliberately on
 * nobody's PATH, so a block without this would be a block that cannot start. The same reasoning,
 * and the same shape, as the `env CREDS_WINDOWS_BINARY=` the SSH relay passes.</p>
 */
export function wslServerBlock(linuxBinary: string, windowsBinaryInWsl: string): string {
  return mcpServerBlock(linuxBinary, { [WINDOWS_BINARY_VARIABLE]: windowsBinaryInWsl });
}

/** What the person is told once both halves are in place. */
export function wslInstalledMessage(distro: string, linuxBinary: string): string {
  const where = distro.length > 0 ? distro : 'your WSL distribution';
  return (
    `The MCP server is installed in ${where} at ${linuxBinary}, pointed at the Windows binary it ` +
    'relays through. Its configuration is on your clipboard — paste it into the MCP client ' +
    'running INSIDE that distribution and restart it. Nothing in your vault is visible to an ' +
    'agent until you turn on Agent access for an entry.'
  );
}

/** What went wrong, in a sentence naming the thing to fix. */
export function installFailure(distro: string, output: string): string {
  const where = distro.length > 0 ? `in ${distro}` : 'in your WSL distribution';
  const said = output.trim().split(/\r?\n/).filter((line) => line.trim().length > 0).slice(-2).join(' ');
  return (
    `Could not install the MCP server ${where}. The distribution needs curl, tar and sha256sum, ` +
    `and a network path to GitHub.${said.length > 0 ? ` It said: ${said}` : ''}`
  );
}
