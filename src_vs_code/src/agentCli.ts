import { parseAgentCliArgs } from './agentCliArgs';
import { parseToken } from './grantToken';
import {
  ErrorBody,
  ExecResponseBody,
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
 * <p>Imports nothing that imports `vscode` — it runs under plain `node`, and
 * `npm run compile` puts it at `out/agentCli.js`.</p>
 *
 * <p>Exit codes: a remote command's own code passes through untouched, so
 * `&&`, `||` and `$?` behave exactly as they would around a real `ssh`.
 * Failures of the mechanism itself use a reserved band and always print a
 * `[creds-for-devs]` line to stderr, so a collision with a remote code is
 * still legible.</p>
 */

const EXIT = {
  usage: 96,
  brokerUnreachable: 90,
  unknownToken: 91,
  denied: 92,
  entityGone: 93,
  busy: 94,
  brokerFailure: 95,
  consentTimeout: 97,
  remoteTimeout: 98,
  toolMissing: 99,
} as const;

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
      `lost the connection to VS Code (${error instanceof Error ? error.message : String(error)}) — ` +
        'the action may or may not have run.',
    );
    return EXIT.brokerFailure;
  }


  if (response.status !== 200) {
    return reportError(response.body);
  }

  if (parsed.kind === 'terminal') {
    process.stdout.write('An SSH terminal is now open in the human\'s VS Code window.\n');
    return 0;
  }

  // The broker's own response shape, so a field renamed there fails to compile
  // here rather than silently going missing at runtime.
  const body = response.body as unknown as Partial<ExecResponseBody>;
  if (typeof body.stdout === 'string') {
    process.stdout.write(body.stdout);
  }
  if (typeof body.stderr === 'string') {
    process.stderr.write(body.stderr);
  }
  if (body.stdoutTruncated === true || body.stderrTruncated === true) {
    note('output was truncated at the size ceiling and the command was stopped.');
  }
  if (body.timedOut === true) {
    note('the remote command hit the time ceiling and was terminated.');
    return EXIT.remoteTimeout;
  }
  return typeof body.exitCode === 'number' ? body.exitCode : EXIT.brokerFailure;
}

void main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    note(error instanceof Error ? error.message : String(error));
    process.exitCode = EXIT.brokerFailure;
  },
);
