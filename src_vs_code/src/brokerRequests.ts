import * as http from 'node:http';
import * as os from 'node:os';
import { auditGrantMark, type BridgeContext } from './bridgeContext';
import { ErrorCode, MAX_REQUEST_BODY_BYTES, UNANSWERED_FAILURE, parseBearer, parseJsonObject } from './brokerProtocol';
import { Grant, GrantLimits, GrantLookup } from './grantRegistry';
import { expiredMessage } from './grantWords';
import { MCP_SWITCHES } from './mcpSwitches';
import { McpRung } from './mcpAccess';

/**
 * What an unauthenticated request body must contain, and what a refusal says.
 *
 * <p>Two routes reach the same machinery without a token — `/v1/alias/<action>`, which names its
 * entry by a name a person enabled, and `/v1/mcp/use/<action>`, which names it by id and is
 * gated by that entry's own switch. Both read a JSON object, both require exactly one string
 * field in it, and both must refuse identically when the body is too large or malformed. The
 * second was written as a copy of the first; this is the copy removed before it could drift.</p>
 *
 * <p>Out of `credsAgentServer.ts` because that file lives at its 800-line ceiling and none of
 * this needs anything on it.</p>
 */

/** The code and the sentence of a refusal, before a door decides how to write it. */
export type Refusal = { readonly code: ErrorCode; readonly message: string };

/** What an agent is told about a token that is not live and is not its business: unknown, missing, or out of scope. */
export const UNKNOWN_TOKEN = 'Unknown or missing grant token.';

/** What an agent is told when the person answered Deny, on this call or earlier on this token. */
export const GRANT_NOT_ALLOWED = 'The human did not allow this grant.';

/** A failed validation as a refusal: the action's own code, or the plain `invalid_request`. */
export function validationRefusal(failed: { readonly code?: ErrorCode; readonly message: string }): Refusal {
  return { code: failed.code ?? 'invalid_request', message: failed.message };
}

/** A parsed body, or the refusal to send instead. */
export type BodyOutcome =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; code: ErrorCode; message: string };

/**
 * Read a JSON object body that must carry one non-empty string field.
 *
 * <p>Returns the refusal rather than sending it, so the one place that writes responses stays
 * the one place that writes responses.</p>
 */
export async function readNamedBody(
  read: (req: http.IncomingMessage) => Promise<string>,
  req: http.IncomingMessage,
  field: string,
  what: string,
): Promise<BodyOutcome> {
  let raw: string;
  try {
    raw = await read(req);
  } catch {
    return { ok: false, code: 'payload_too_large', message: 'Request body too large.' };
  }
  const body = parseJsonObject(raw);
  return names(body, field)
    ? { ok: true, body }
    : { ok: false, code: 'invalid_request', message: `Body must be a JSON object with ${what}.` };
}

/** An empty string names nothing, which is a different thing from having sent no field at all. */
function names(body: Record<string, unknown> | undefined, field: string): body is Record<string, unknown> {
  return body !== undefined && typeof body[field] === 'string' && body[field] !== '';
}

/**
 * What an entry id resolves to for an agent: usable, present but closed, or nothing.
 *
 * <p>Three outcomes rather than an optional target, because the middle one is the interesting
 * one. "That entry exists and you may not use it" is what lets an agent tell a person which
 * switch to turn on; collapsing it into "not found" would make the product look broken at
 * exactly the moment it is working as designed.</p>
 */
export type McpUseLookup =
  | { kind: 'usable'; target: McpUseTarget; preConsented?: boolean; rungs?: string }
  | { kind: 'closed'; entityName: string; needed: NeededSwitch }
  | undefined;

/**
 * Which switch would have to be on.
 *
 * <p>Named in the refusal, because "not open to agents" is not actionable and "turn on Agents
 * may replace the secret" is. Not every action sits on the same rung: rotating replaces a stored
 * secret and asks for <b>edit</b>, while running a command asks for <b>use</b> — so a rotation
 * cannot ride in on a permission somebody granted for a read-only query.</p>
 *
 * <p>The same eight words as the ladder itself, and now the same TYPE: it was written out twice,
 * and the second copy would have gone stale the first time an eleventh rung was added — the open
 * proposal in `todo/PLAN_tails_2.md` is exactly that. `McpRung` is named where the ladder lives.</p>
 */
export type NeededSwitch = McpRung;

export interface McpUseTarget {
  accountId: string;
  entityId: string;
  entityName: string;
  kind: string;
}

/**
 * The whole front half of an MCP use call: the body, the entry, and whether it may be used.
 *
 * <p>One step rather than three, because the three have one answer and separating them is how a
 * route ends up reading the body, resolving the entry, and forgetting to ask the permission
 * question. Everything after this point is identical to an alias call — throttle, mint, consent,
 * perform, mask, audit — which is the property worth protecting.</p>
 */
export async function readMcpUse(
  read: (req: http.IncomingMessage) => Promise<string>,
  req: http.IncomingMessage,
  resolve: ((entryId: string, action: string) => McpUseLookup) | undefined,
  action: string,
): Promise<UseRead> {
  const parsed = await readNamedBody(read, req, 'entry', 'an "entry" id');
  return parsed.ok ? usable(parsed.body, resolve, action) : parsed;
}

/**
 * What a use route knows before it does anything.
 *
 * <p>`preConsented` rides BESIDE the target rather than on it, and that placement is the whole of
 * how "deleting always asks" survives a refactor. `McpUseTarget` flows through the shared `minted`
 * helper into the delete and create routes; a pre-consent field on it would be one move away from a
 * silent deletion. Here, only a handler that reads this result can see it — and the delete handler,
 * which calls the same `readMcpUse`, simply never does.</p>
 */
export type UseRead =
  | { ok: true; body: Record<string, unknown>; target: McpUseTarget; preConsented: boolean; rungs: string }
  | { ok: false; code: ErrorCode; message: string };

function usable(
  body: Record<string, unknown>,
  resolve: ((entryId: string, action: string) => McpUseLookup) | undefined,
  action: string,
): UseRead {
  const found = resolve?.(body.entry as string, action);
  return found?.kind === 'usable' ? usableRead(body, found) : { ok: false, ...refusalFor(found) };
}

/**
 * The usable answer, in the shape a route reads.
 *
 * <p>`=== true` rather than a coalesce: a lookup that does not know about this field at all — one of
 * the five `.cjs` harnesses, or a build older than it — reads as "ask", never as "already answered".
 * An absent fingerprint reads as the empty string for the same reason: it matches no resolved
 * ladder, so a write guarded by it refuses rather than guesses.</p>
 */
function usableRead(
  body: Record<string, unknown>,
  found: { target: McpUseTarget; preConsented?: boolean; rungs?: string },
): UseRead {
  return {
    ok: true,
    body,
    target: found.target,
    preConsented: found.preConsented === true,
    rungs: found.rungs ?? '',
  };
}

/**
 * The entry an alias names, or the refusal to send instead.
 *
 * <p>A window with no alias registry and a name that is not enabled get the <b>same</b> answer,
 * deliberately: whether a given name exists is not something an unauthenticated caller should be
 * able to enumerate one guess at a time. That is exactly the distinction `refusalFor` makes the
 * other way for an entry id, and the difference is guessability — a person chooses an alias, and
 * nobody chooses a uuid.</p>
 */
export function aliasTarget(
  resolve: ((name: string) => McpUseTarget | undefined) | undefined,
  name: string,
): { ok: true; target: McpUseTarget } | { ok: false; code: ErrorCode; message: string } {
  const target = resolve?.(name);
  return target === undefined
    ? { ok: false, code: 'not_found', message: `No entry is enabled for the CLI under "${name}".` }
    : { ok: true, target };
}

/**
 * The refusal one lookup deserves — the code, and the sentence that names what to do about it.
 *
 * <p>Naming the switch is safe here and would not be on the alias route: an alias is a name a
 * person chose, guessable one try at a time, while an entry id is a uuid nobody enumerates. So
 * the alias route answers "no such entry" to both questions on purpose, and this one does not.</p>
 */
export function refusalFor(found: McpUseLookup): Refusal {
  if (found?.kind === 'closed') {
    return {
      code: 'denied',
      message: `"${found.entityName}" is not open to agents for that. Turn on "${labelFor(found.needed)}" in its Agent access section.`,
    };
  }
  return { code: 'not_found', message: 'No such entry, or this window does not serve it.' };
}

/**
 * The switch's label, taken from the form rather than written down again.
 *
 * <p>A refusal that named a switch by a word the form does not print would send a person hunting
 * for a control that is not there. The catalog in `mcpSwitches.ts` is what the form renders, so
 * it is what this reads; a copy here would agree until somebody edited one of them.</p>
 *
 * <p>`delete` maps to the own-only switch because it is the lower of the two red ones: told to
 * turn on the narrower permission, a person can always choose the wider, and the reverse advice
 * would be a credential manager recommending the bigger grant.</p>
 */
function labelFor(needed: NeededSwitch): string {
  return MCP_SWITCHES.find((s) => s.id === switchIdFor(needed))?.label ?? needed;
}

/**
 * Where a scope has two controls, name the NARROWER one.
 *
 * <p>Told to turn on the smaller permission a person can always choose the wider; the reverse
 * advice would be a credential manager recommending the bigger grant.</p>
 */
const NARROWER_CONTROL: Readonly<Record<string, string>> = {
  delete: 'mcpDeleteOwn',
  folderDelete: 'mcpFolderDeleteOwn',
};

function switchIdFor(needed: NeededSwitch): string {
  return (
    NARROWER_CONTROL[needed] ?? `mcp${needed.charAt(0).toUpperCase()}${needed.slice(1)}`
  );
}

/**
 * The grant a bearer token names, or the sentence to refuse it with.
 *
 * <p>Out of `credsAgentServer.ts` because that file lives at its 800-line ceiling and this needs
 * nothing on it — a header, a registry and the limits. An EXPIRED token says so, which is the point:
 * "unknown" would send an agent hunting for a typo in a token that was correct an hour ago, and the
 * two answers are already distinguished all the way out to the CLI's exit codes (91 and 92).</p>
 */
export function grantForToken(
  authorization: string | undefined,
  grants: { lookup(secret: string, now: number, limits: GrantLimits): GrantLookup },
  limits: GrantLimits,
): { ok: true; grant: Grant } | { ok: false; message: string } {
  const secret = parseBearer(authorization);
  const found: GrantLookup = secret === undefined ? { kind: 'unknown' } : grants.lookup(secret, Date.now(), limits);
  if (found.kind === 'live') {
    return { ok: true, grant: found.grant };
  }
  return {
    ok: false,
    message: found.kind === 'expired' ? expiredMessage(found.reason, limits) : UNKNOWN_TOKEN,
  };
}

/**
 * What an agent is told when a reservation does not hold.
 *
 * <p>An EXPIRED token says which expiry it was: "it reached its limit of N calls" is a different
 * problem from "it went unused for N minutes", and an agent that cannot tell them apart asks for a
 * fresh token in one case and should stop in the other.</p>
 */
export function reservationRefused(refused: GrantLookup, limits: GrantLimits): string {
  return refused.kind === 'expired'
    ? expiredMessage(refused.reason, limits)
    : UNKNOWN_TOKEN;
}

/** The path no route matches, which a request target `new URL` cannot parse (`//`, `///`, `http://[`, `/\`) is read as. A bare host such as `example.com` parses, as a path. */
const UNPARSEABLE_TARGET = '/unparseable-request-target';

/**
 * The URL of a request, or one that no route matches when its target does not parse: `new URL('//', base)` throws, and a
 * throw before any route or throttle would write one journal line per request with no ceiling (Amendment 6 review).
 */
export function requestUrl(target: string | undefined): URL {
  const base = 'http://127.0.0.1';
  try {
    return new URL(target ?? '/', base);
  } catch {
    return new URL(UNPARSEABLE_TARGET, base);
  }
}

export function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_REQUEST_BODY_BYTES) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** The built-in error classes a journal line may name; any other class (one of our own, a thrown string) reads `Error`. */
const BUILT_IN_CLASSES: ReadonlySet<string> = new Set(['Error', 'TypeError', 'RangeError', 'SyntaxError', 'URIError', 'ReferenceError', 'EvalError', 'AggregateError']);

function errorClassOf(error: unknown): string {
  const name = error instanceof Error ? error.constructor.name : '';
  return BUILT_IN_CLASSES.has(name) ? name : 'Error';
}

/**
 * A `code` is named only when it is a system errno name of this platform (`ENOENT`, `ECONNRESET`: the table the runtime itself exposes).
 * Nothing else: an `ERR_` word is a shape a request can fill with its own text, and a journal line never carries a word a request chose.
 */
const SYSTEM_ERRNO_NAMES: ReadonlySet<string> = new Set(Object.keys(os.constants.errno));

const isNodeCode = (code: unknown): code is string => typeof code === 'string' && SYSTEM_ERRNO_NAMES.has(code);

/** The code an `Error` carries, if it is a system errno; a thrown plain object or string has none to read. */
function errorCodeOf(error: unknown): string {
  const code: unknown = error instanceof Error ? (error as { code?: unknown }).code : undefined;
  return isNodeCode(code) ? ` ${code}` : '';
}

/**
 * A handler threw: answer 500 with its own sentence if nothing has been sent, THEN write one journal line in a `try`, so a journal that
 * throws on every line still answers (Amendment 6, D.8 and its review).
 *
 * <p>The line is a classification and never the error: the built-in class name, a system errno name or none, the route (the
 * name of the table's route or `other`, handed in: `brokerRequests` cannot import the table, which imports it back) and whether the
 * headers had already gone out, read BEFORE the answer is written. Never `message`, never a stack, a path, a header or a body: a Node
 * `JSON.parse` message quotes its input (parent §4.1).</p>
 *
 * <p>The line has no grant, so its grant field is `auditGrantMark(bridge)`: the context the door handed `handle`, the same one that
 * keys the throttle's window, beside the classification and not inside it (E1.4).</p>
 */
export function unanswered(
  res: http.ServerResponse,
  error: unknown,
  route: string,
  bridge: BridgeContext | undefined,
  respondError: (code: ErrorCode, message: string) => void,
  log: (line: { grant: string; entityName: string; action: string; outcome: string; detail: string }) => void,
): void {
  const sent = res.headersSent;
  if (!sent) {
    respondError('internal', UNANSWERED_FAILURE);
  }
  try {
    log({ grant: auditGrantMark(bridge), entityName: '', action: 'request', outcome: 'failed', detail: `a handler failed: ${errorClassOf(error)}${errorCodeOf(error)} on ${route}; headers ${sent ? 'sent' : 'not sent'}` });
  } catch {
    /* a journal that will not take the line has already cost the caller nothing: the answer went first */
  }
}
