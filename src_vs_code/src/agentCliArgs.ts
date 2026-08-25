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
  | { kind: 'db'; token: string; query: string }
  /** The verbs that take nothing: what runs is exactly what a human saved. */
  | { kind: 'run'; token: string }
  | { kind: 'script'; token: string }
  | { kind: 'env'; token: string }
  | { kind: 'vpn-up'; token: string }
  | { kind: 'vpn-down'; token: string }
  | { kind: 'error'; message: string };

/** Verbs whose whole payload is the token — nothing after it is meaningful. */
const BARE_VERBS = ['terminal', 'run', 'script', 'env', 'vpn-up', 'vpn-down'] as const;

type BareVerb = (typeof BARE_VERBS)[number];

const USAGE = [
  'usage: agentCli.js ssh <token> -- <command>',
  '       agentCli.js db <token> -- <query>',
  '       agentCli.js terminal|run|script|env|vpn-up|vpn-down <token>',
].join(String.fromCharCode(10));

// eslint-disable-next-line complexity
export function parseAgentCliArgs(argv: readonly string[]): AgentCliRequest {
  const [verb, token, ...rest] = argv;
  if (verb === undefined || token === undefined) {
    return { kind: 'error', message: USAGE };
  }

  if ((BARE_VERBS as readonly string[]).includes(verb)) {
    if (rest.length > 0) {
      return {
        kind: 'error',
        message: verb + ' takes no arguments after the token.' + String.fromCharCode(10) + USAGE,
      };
    }
    return { kind: verb as BareVerb, token };
  }

  if (verb !== 'ssh' && verb !== 'db') {
    return { kind: 'error', message: `unknown command "${verb}".\n${USAGE}` };
  }

  // `--` is required: it is what makes "the rest is the remote command"
  // explicit, and what keeps a remote flag from being read as ours.
  const separator = rest.indexOf('--');
  if (separator !== 0) {
    return { kind: 'error', message: `the remote command must follow "--".\n${USAGE}` };
  }
  const payload = rest.slice(1).join(' ').trim();
  if (payload.length === 0) {
    const what = verb === 'db' ? 'query' : 'remote command';
    return { kind: 'error', message: 'no ' + what + ' given.' + String.fromCharCode(10) + USAGE };
  }
  return verb === 'db'
    ? { kind: 'db', token, query: payload }
    : { kind: 'exec', token, command: payload };
}
