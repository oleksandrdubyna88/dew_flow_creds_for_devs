import { describeError } from './describeError';
import { parseAgentCliArgs } from './agentCliArgs';
import { parseToken } from './grantToken';
import { EXIT, interpretSuccess } from './agentCliOutcome';
import {
  ErrorBody,
  HealthBody,
  SERVICE_NAME,
} from './brokerProtocol';

/**
 * The command an AI coding agent runs. It holds no credential and can obtain
 * none: all it has is a grant token, which names a loopback port in the VS
 * Code window that minted it and authorizes exactly one entity there. The
 * window runs `ssh`; this process only relays the request and prints what
 * comes back.
 *
 * <p>Imports nothing that imports `vscode` — it runs under plain `node`. `npm run compile`
 * puts it at `out/agentCli.js`, and `npm run bundle` (which `vsce package` runs) bundles that
 * into `dist/agentCli.js`, which is the copy an installed extension ships. The snippet handed
 * to an agent resolves the path from `__dirname`, so it names whichever of the two is running.</p>
 *
 * <p>Exit codes: a remote command's own code passes through untouched, so
 * `&&`, `||` and `$?` behave exactly as they would around a real `ssh`.
 * Failures of the mechanism itself use a reserved band and always print a
 * `[creds-for-devs]` line to stderr, so a collision with a remote code is
 * still legible.</p>
 */

// One table, in `agentCliOutcome.ts`, because these codes are the contract: a second
// implementation of this CLI in another language has to reproduce them exactly, and two
// copies here would be the first place they drifted.

const HEALTH_TIMEOUT_MS = 2_000;
// Comfortably past the broker's own hard ceiling, so its clean `timedOut`
// answer always arrives instead of this side giving up first.
const CALL_TIMEOUT_MS = 10 * 60_000;

interface BrokerResponse {
  status: number;
  body: Record<string, unknown>;
}

function note(message: string): void {
  process.stderr.write(`[creds-for-devs] ${message}\n`);
}

/** `fetch` with a deadline, the way `serverTransport.ts` already talks HTTP. */
// eslint-disable-next-line complexity
async function request(
  port: number,
  options: { method: string; path: string; token?: string; body?: unknown; timeoutMs: number },
): Promise<BrokerResponse> {
  const payload = options.body === undefined ? undefined : JSON.stringify(options.body);
  const response = await fetch(`http://127.0.0.1:${port}${options.path}`, {
    method: options.method,
    headers: {
      ...(options.token === undefined ? {} : { Authorization: `Bearer ${options.token}` }),
      ...(payload === undefined ? {} : { 'Content-Type': 'application/json; charset=utf-8' }),
    },
    body: payload,
    signal: AbortSignal.timeout(options.timeoutMs),
  });
  const text = await response.text();
  try {
    const parsed: unknown = text.length === 0 ? {} : JSON.parse(text);
    return {
      status: response.status,
      body: typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {},
    };
  } catch {
    throw new Error(`the broker returned unreadable JSON (HTTP ${response.status})`);
  }
}

/**
 * Confirm the port still belongs to a CredsForDevs broker BEFORE the token is
 * sent. A closed window frees its port, and the OS hands ports out again — so
 * without this check the bearer token could be posted to whatever unrelated
 * process inherited the number.
 */
async function isOurBroker(port: number): Promise<boolean> {
  try {
    const health = await request(port, {
      method: 'GET',
      path: '/v1/health',
      timeoutMs: HEALTH_TIMEOUT_MS,
    });
    return health.status === 200 && (health.body as unknown as HealthBody).service === SERVICE_NAME;
  } catch {
    return false;
  }
}

// eslint-disable-next-line complexity
function exitForError(code: unknown): number {
  switch (code) {
    case 'unauthorized':
      return EXIT.unknownToken;
    case 'denied':
      return EXIT.denied;
    case 'consent_timeout':
      return EXIT.consentTimeout;
    case 'not_found':
    case 'no_credential':
    case 'not_supported':
      return EXIT.entityGone;
    case 'too_many_requests':
      return EXIT.busy;
    case 'tool_missing':
      return EXIT.toolMissing;
    default:
      return EXIT.brokerFailure;
  }
}

function reportError(body: Record<string, unknown>): number {
  const error = (body as Partial<ErrorBody>).error;
  note(String(error?.message ?? 'the broker refused the call'));
  return exitForError(error?.code);
}

// eslint-disable-next-line complexity, max-lines-per-function
async function main(): Promise<number> {
  const parsed = parseAgentCliArgs(process.argv.slice(2));
  if (parsed.kind === 'error') {
    note(parsed.message);
    return EXIT.usage;
  }

  const token = parseToken(parsed.token);
  if (token === undefined) {
    note('that is not a CredsForDevs grant token — copy the whole token from the shared snippet.');
    return EXIT.usage;
  }

  if (!(await isOurBroker(token.port))) {
    note(
      'no CredsForDevs window is listening for this token — the VS Code window that shared it ' +
        'has closed or reloaded. Ask the human to share the credential again.',
    );
    return EXIT.brokerUnreachable;
  }

  // One table instead of a chain of ternaries: a new verb is a row, and the compiler
  // still checks the request shape each one sends.
  const ROUTES: Record<string, { path: string; body: () => Record<string, unknown> }> = {
    exec: { path: '/v1/use/exec', body: () => ({ command: (parsed as { command: string }).command }) },
    terminal: { path: '/v1/use/terminal', body: () => ({}) },
    db: { path: '/v1/use/query', body: () => ({ query: (parsed as { query: string }).query }) },
    run: { path: '/v1/use/run', body: () => ({}) },
    script: { path: '/v1/use/run', body: () => ({}) },
    env: { path: '/v1/use/exportEnv', body: () => ({}) },
    'vpn-up': { path: '/v1/use/up', body: () => ({}) },
    'vpn-down': { path: '/v1/use/down', body: () => ({}) },
  };
  const route = ROUTES[parsed.kind];
  if (route === undefined) {
    note(`unknown verb "${parsed.kind}".`);
    return EXIT.usage;
  }

  let response: BrokerResponse;
  try {
    response = await request(token.port, {
      method: 'POST',
      path: route.path,
      token: token.secret,
      body: route.body(),
      timeoutMs: CALL_TIMEOUT_MS,
    });
  } catch (error) {
    note(
      `lost the connection to VS Code (${describeError(error)}) — ` +
        'the action may or may not have run.',
    );
    return EXIT.brokerFailure;
  }


  if (response.status !== 200) {
    return reportError(response.body);
  }

  // One table keyed by verb, in a pure module, rather than a chain that fell through to
  // failure for anything it had not been taught about — which is how a successful `env`,
  // `vpn-up` and `vpn-down` came to report themselves as broker failure 95 and print nothing.
  const outcome = interpretSuccess(parsed.kind, response.body as Record<string, unknown>);
  if (outcome.stdout.length > 0) {
    process.stdout.write(outcome.stdout);
  }
  if (outcome.stderr.length > 0) {
    process.stderr.write(outcome.stderr);
  }
  for (const line of outcome.notes) {
    note(line);
  }
  return outcome.exitCode;
}

void main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    note(describeError(error));
    process.exitCode = EXIT.brokerFailure;
  },
);
