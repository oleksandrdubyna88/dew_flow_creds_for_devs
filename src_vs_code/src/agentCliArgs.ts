/**
 * Parsing the agent CLI's own argv — the local half of the code-execution
 * boundary. Pure and `vscode`-free (it is also the only logic the CLI shares
 * with the extension, and the CLI must run under plain `node`).
 *
 * Two forms, matching the clipboard snippet exactly:
 *   ssh <token> -- <command…>      run a command remotely
 *   terminal <token>               open the interactive terminal in VS Code
 *
 * Everything after `--` is joined with single spaces and handed to ssh as one
 * operand — the remote shell parses it, never a local one. Callers that need
 * exact spacing quote the command themselves, as they would for real ssh.
 */

export type AgentCliRequest =
  | { kind: 'exec'; token: string; command: string }
  | { kind: 'terminal'; token: string }
  | { kind: 'error'; message: string };

const USAGE =
  'usage: agentCli.js ssh <token> -- <command>\n' +
  '       agentCli.js terminal <token>';

export function parseAgentCliArgs(argv: readonly string[]): AgentCliRequest {
  const [verb, token, ...rest] = argv;
  if (verb === undefined || token === undefined) {
    return { kind: 'error', message: USAGE };
  }

  if (verb === 'terminal') {
    if (rest.length > 0) {
      return { kind: 'error', message: `terminal takes no arguments after the token.\n${USAGE}` };
    }
    return { kind: 'terminal', token };
  }

  if (verb !== 'ssh') {
    return { kind: 'error', message: `unknown command "${verb}".\n${USAGE}` };
  }

  // `--` is required: it is what makes "the rest is the remote command"
  // explicit, and what keeps a remote flag from being read as ours.
  const separator = rest.indexOf('--');
  if (separator !== 0) {
    return { kind: 'error', message: `the remote command must follow "--".\n${USAGE}` };
  }
  const command = rest.slice(1).join(' ').trim();
  if (command.length === 0) {
    return { kind: 'error', message: `no remote command given.\n${USAGE}` };
  }
  return { kind: 'exec', token, command };
}
