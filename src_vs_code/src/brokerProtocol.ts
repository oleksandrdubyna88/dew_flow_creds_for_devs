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

/**
 * What an agent is told when something under an action fails.
 *
 * <p>Fixed text, deliberately. The error it replaces was the caught exception's own message, which
 * named a path, a driver frame or a query fragment on every occasion it fired — and an agent is a
 * party that gets the RESULT and never the machinery. (CodeQL js/stack-trace-exposure, medium; it
 * was right about the shape even though the reader here is a local process.)</p>
 *
 * <p>The diagnosis is not lost, it moves: the agent journal is local, it is what a person reads when
 * an agent reports a failure, and it carries the reason beside what was asked for.</p>
 *
 * <p>Here rather than in the server, because this module is where the wire's vocabulary lives —
 * beside `ErrorCode` and `errorBody`, which decide the rest of what a caller is told.</p>
 */
export const INTERNAL_FAILURE = 'The action failed inside this window. See the agent journal for the reason.';

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
 * `GET /v1/mcp/config-snippet?id=…&language=…&variant=…` — how an application reads one config,
 * told to an agent (tails T10).
 *
 * <p>Unauthenticated for the entries route's own reason, and it reveals strictly LESS: it
 * answers only for entries the switch already shows there, and what it adds — a code sample
 * assembled from the file name and format, and the language catalog — is public text. It never
 * returns the config body, and the key the sample names is minted only by the person, in their
 * own window. The full argument is `mcpSnippetRoute.ts`.</p>
 */
export function isMcpConfigSnippetRoute(pathname: string): boolean {
  return pathname === '/v1/mcp/config-snippet';
}

/**
 * `POST /v1/config/read` — one config file, to the application that holds its key.
 *
 * <p><b>The one authenticated route on this server that is not a use.</b> The other two GETs
 * disclose without a token because what they disclose is small or switch-gated; this one returns
 * a config file, which is a secret in full. The key IS the authorization, and it is checked
 * against a stored SHA-256 — see `configKey.ts`.</p>
 *
 * <p><b>A POST, deliberately, for something that reads.</b> A GET is the shape caches, proxies,
 * server logs and shell histories all treat as safe to record, and the key would be in it. The
 * verb is wrong on paper and right in practice, which is worth one paragraph rather than a
 * recurring surprise.</p>
 *
 * <p><b>No consent modal, and that is the trade.</b> Every other door here ends in a human
 * answering a dialog. An application reading its configuration at startup cannot answer one, and
 * a dialog appearing on every `dotnet run` would be clicked through blind inside a day. What
 * stands in its place: the switch is off by default and opt-in per entry, the key is revocable
 * and rotatable, it names exactly one entry, and every use is written to the audit log.</p>
 */
export function isConfigReadRoute(pathname: string): boolean {
  return pathname === '/v1/config/read';
}

/** What the route answers with — the document and what it claims to be. */
export interface ConfigReadBody {
  format: string;
  body: string;
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
/**
 * `POST /v1/mcp/delete` — an agent moving an entry to the Trash.
 *
 * <p>Its own route rather than another verb under `/v1/mcp/use/`, because it is not a use of a
 * credential: nothing is connected to, nothing is run, no secret is touched. It carries the same
 * body — an `entry` id — and is gated by the same ladder, one rung higher.</p>
 *
 * <p><b>The Trash is the whole permission, not an option within it.</b> A person deleting gets a
 * choice between the Trash and permanently; an agent gets one destination and no way to say
 * otherwise. That is what made "agents may delete" grantable at all: the objection was that
 * deletion has no undo and travels by sync to every machine, carrying the version history with
 * it, and a destination that is a folder answers all of it.</p>
 */
export function isMcpDeleteRoute(pathname: string): boolean {
  return pathname === '/v1/mcp/delete';
}

/**
 * `POST /v1/mcp/create` — an agent storing a credential it just made.
 *
 * <p>The only MCP route whose body does NOT name an entry, because there is not one yet. What it
 * names instead is a folder, and only a folder somebody opened to creation: the set of places an
 * agent may put something is the person's decision, not the agent's.</p>
 *
 * <p><b>It is also the one route where a secret travels TOWARD the vault.</b> Every other level
 * is built so that no secret passes through an agent's context; this one cannot be, because the
 * agent provisioned the thing and is the only party holding the value. The product records that
 * rather than pretending otherwise — the entry is marked agent-created, and the journal counts
 * it.</p>
 */
export function isMcpCreateRoute(pathname: string): boolean {
  return pathname === '/v1/mcp/create';
}

/**
 * `GET /v1/mcp/folders`, `POST /v1/mcp/folder/<verb>` — the second object on the agent surface.
 *
 * <p>A prefix plus the verb, like the use routes, rather than a route written out per verb: the
 * vocabulary lives in one place and repeating it here would be a second list to keep in step.</p>
 */
export function isMcpFoldersRoute(pathname: string): boolean {
  return pathname === '/v1/mcp/folders';
}

export function parseMcpFolderRoute(pathname: string): string | undefined {
  const prefix = '/v1/mcp/folder/';
  if (!pathname.startsWith(prefix)) {
    return undefined;
  }
  const action = pathname.slice(prefix.length);
  return FOLDER_ACTIONS.has(action) ? action : undefined;
}

/** Written out, so a verb this build does not serve is not routed to a door that cannot answer. */
const FOLDER_ACTIONS: ReadonlySet<string> = new Set(['create', 'edit', 'delete']);

export function parseMcpUseRoute(pathname: string): string | undefined {
  const prefix = '/v1/mcp/use/';
  if (!pathname.startsWith(prefix)) {
    return undefined;
  }
  const action = pathname.slice(prefix.length);
  return ACTION_NAME.test(action) ? action : undefined;
}
