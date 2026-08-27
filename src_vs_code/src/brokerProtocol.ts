/**
 * The broker's wire contract, as a pure module: route parsing, body limits,
 * the error-code → HTTP-status table, and the response envelope. Shared by the
 * server (`credsAgentServer.ts`) and the client (`agentCli.ts`), so the two
 * halves cannot disagree about what a 403 means.
 *
 * <p>One structural guarantee lives here rather than in a comment: there is no
 * response type in this file with a field for a password, a key, or any other
 * secret. An agent cannot receive plaintext by asking cleverly, because no
 * shape it could arrive in exists.</p>
 */

export const SERVICE_NAME = 'creds-for-devs-agent';

/** Anything larger is refused while reading, never buffered. */
export const MAX_REQUEST_BODY_BYTES = 64 * 1024;

/** Ceilings the broker enforces regardless of what a client asks for. */
export const DEFAULT_EXEC_TIMEOUT_MS = 30_000;
export const MAX_EXEC_TIMEOUT_MS = 120_000;
export const MIN_EXEC_TIMEOUT_MS = 1_000;
export const MAX_STREAM_BYTES = 256 * 1024;
export const MAX_CONCURRENT_EXECS = 8;

export type ErrorCode =
  | 'invalid_request'
  | 'unauthorized'
  | 'denied'
  | 'not_found'
  | 'not_supported'
  | 'no_credential'
  | 'payload_too_large'
  | 'too_many_requests'
  | 'consent_timeout'
  /** The entity and the request are both fine; a binary this machine needs is absent. */
  | 'tool_missing'
  | 'internal';

const STATUS_BY_CODE: Readonly<Record<ErrorCode, number>> = {
  invalid_request: 400,
  unauthorized: 401,
  denied: 403,
  not_found: 404,
  not_supported: 404,
  no_credential: 409,
  payload_too_large: 413,
  too_many_requests: 429,
  consent_timeout: 504,
  tool_missing: 412,
  internal: 500,
};

export function statusForErrorCode(code: ErrorCode): number {
  return STATUS_BY_CODE[code];
}

export interface ErrorBody {
  error: { code: ErrorCode; message: string };
}

export function errorBody(code: ErrorCode, message: string): ErrorBody {
  return { error: { code, message } };
}

export interface HealthBody {
  ok: true;
  service: typeof SERVICE_NAME;
}

export interface ExecResponseBody {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  timedOut: boolean;
  durationMs: number;
}

export interface TerminalResponseBody {
  opened: boolean;
}

/** `POST /v1/use/<action>` → the action name; anything else → undefined. */
/**
 * The grammar for an action segment.
 *
 * <p>Must start lowercase, so `/v1/use/Exec` can never become a second spelling of `exec`.
 * May carry uppercase after that, because `exportEnv` is a real registered action — and a
 * lowercase-only grammar made `/v1/use/exportEnv` answer 404, so the `env` verb had never
 * worked from any client. Whatever the registry registers, this has to be able to route.</p>
 */
const ACTION_NAME = /^[a-z][A-Za-z0-9_-]{0,31}$/;

export function parseUseRoute(pathname: string): string | undefined {
  const prefix = '/v1/use/';
  if (!pathname.startsWith(prefix)) {
    return undefined;
  }
  const action = pathname.slice(prefix.length);
  return ACTION_NAME.test(action) ? action : undefined;
}

/** `Authorization: Bearer <secret>` → the secret; anything else → undefined. */
export function parseBearer(header: string | undefined): string | undefined {
  if (header === undefined) {
    return undefined;
  }
  const match = /^Bearer ([A-Za-z0-9_-]+)$/.exec(header.trim());
  return match?.[1];
}

/** Parse a JSON object body. A non-object (array, string, null) is invalid. */
// eslint-disable-next-line complexity
export function parseJsonObject(text: string): Record<string, unknown> | undefined {
  if (text.trim().length === 0) {
    return {};
  }
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return undefined;
    }
    return value as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/**
 * Clamp a caller-requested exec timeout into the broker's own band. A client
 * asking for a week gets two minutes; a buggy one asking for zero gets one
 * second. Never trusts the number as given.
 */
export function clampExecTimeout(requested: unknown): number {
  if (typeof requested !== 'number' || !Number.isFinite(requested)) {
    return DEFAULT_EXEC_TIMEOUT_MS;
  }
  return Math.min(MAX_EXEC_TIMEOUT_MS, Math.max(MIN_EXEC_TIMEOUT_MS, Math.round(requested)));
}

/**
 * What `(credential, exportEnv)` answers with: the variable NAMES that were written into
 * this window's terminal environment. Never a value — the same structural rule the rest
 * of this file keeps.
 */
export interface EnvExportResponseBody {
  written: string[];
}

/**
 * `/v1/alias/<action>` → the action, for a call that names its entry by alias.
 *
 * <p>A separate prefix rather than a flag on the use routes, so the two authorization stories
 * cannot be confused at a glance: everything under `/v1/use/` requires a bearer token the human
 * copied, and everything under `/v1/alias/` requires only a name and therefore leans entirely
 * on the consent modal. Same action vocabulary, deliberately, so a verb never means one thing
 * on one route and something else on the other.</p>
 */
export function parseAliasRoute(pathname: string): string | undefined {
  const prefix = '/v1/alias/';
  if (!pathname.startsWith(prefix)) {
    return undefined;
  }
  const action = pathname.slice(prefix.length);
  return ACTION_NAME.test(action) ? action : undefined;
}

/**
 * `GET /v1/aliases` — the names this window has enabled for the CLI.
 *
 * <p>A separate path from `/v1/alias/<action>`, and a GET, so the two can never be confused:
 * one performs something and raises a consent modal, the other only answers a question and
 * raises nothing.</p>
 *
 * <p><b>What it deliberately discloses.</b> Like the action route it carries no token, so any
 * local process can read it. It returns the NAMES a person chose and each entry's kind —
 * never a host, a token, or anything stored. The reasoning, which is the owner's decision
 * rather than an implementation detail: knowing a name lets a caller ask about a real entry
 * instead of guessing, but it does not let it lie — the consent modal shows the true entry and
 * the true command, so a targeted prompt is no more persuasive than an untargeted one. What is
 * given up is inventory: a local process learns which names exist. That was judged comparable
 * to reading `~/.ssh/config`, and it buys a `creds ls` that works on a Remote-SSH host, where
 * reading the registry from disk is impossible because the registry is on the other machine.</p>
 */
export function isAliasListRoute(pathname: string): boolean {
  return pathname === '/v1/aliases';
}

/** One enabled name, as the wire carries it. */
export interface AliasListEntry {
  name: string;
  kind: string;
}

export interface AliasListBody {
  aliases: AliasListEntry[];
}

/**
 * `GET /v1/mcp/entries` — the non-secret half of every entry a person opened to agents.
 *
 * <p>A GET beside health and the alias list, for the same reason both of those are: it performs
 * nothing and raises nothing. What it answers is built by `mcpEntries.ts`, which names every
 * field it discloses one at a time; there is no shape here a password could travel in.</p>
 *
 * <p><b>Why it carries no token.</b> The other read route on this server is unauthenticated
 * because a name discloses little. This one discloses considerably more — a host, a user, a
 * port, a connection string with the password removed — so the same argument would not stretch
 * to cover it, and it is not what carries it. What carries it is that <b>nothing appears here
 * at all unless somebody turned a switch on for that entry</b>. Every entry is invisible by
 * default, including every entry that existed before the feature; the disclosure is not
 * "what this vault holds" but "what its owner chose to show an agent", which is a set a person
 * assembled deliberately and can empty in one gesture.</p>
 *
 * <p>A token would not add much against the threat this leaves open — a hostile process already
 * on this machine, running as this user — and it would have to be minted, stored somewhere the
 * MCP client can read it, and rotated when a window restarts. The switch is the authorization,
 * and it is the one a person can see.</p>
 */
export function isMcpEntriesRoute(pathname: string): boolean {
  return pathname === '/v1/mcp/entries';
}

/**
 * `POST /v1/mcp/use/<action>` — an agent asking to USE an entry it can see.
 *
 * <p>A third prefix, and by now the pattern is the point: `/v1/use/` carries a bearer token a
 * human copied, `/v1/alias/` carries a name and leans entirely on the consent modal, and this
 * one carries an entry id and is gated by that entry's own <b>Usable by agents</b> switch. A
 * reader of either side can tell at a glance which authorization story a call belongs to,
 * which a single prefix with a flag in the body could never offer.</p>
 *
 * <p><b>The switch is a precondition, not a replacement for consent.</b> Everything through here
 * still raises the modal, still passes through the same throttle, still masks the entry's own
 * secrets out of the output, and still writes an audit line. Turning the switch on says "you may
 * ask"; the modal is still what says yes.</p>
 *
 * <p>Same action vocabulary as the other two, deliberately, so a verb never means one thing on
 * one route and something else on another.</p>
 */
export function parseMcpUseRoute(pathname: string): string | undefined {
  const prefix = '/v1/mcp/use/';
  if (!pathname.startsWith(prefix)) {
    return undefined;
  }
  const action = pathname.slice(prefix.length);
  return ACTION_NAME.test(action) ? action : undefined;
}
