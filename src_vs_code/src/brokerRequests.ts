import * as http from 'node:http';
import { ErrorCode, parseJsonObject } from './brokerProtocol';

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
  | { kind: 'usable'; target: McpUseTarget }
  | { kind: 'closed'; entityName: string }
  | undefined;

export interface McpUseTarget {
  accountId: string;
  entityId: string;
  entityName: string;
  kind: string;
}

/**
 * The refusal one lookup deserves — the code, and the sentence that names what to do about it.
 *
 * <p>Naming the switch is safe here and would not be on the alias route: an alias is a name a
 * person chose, guessable one try at a time, while an entry id is a uuid nobody enumerates. So
 * the alias route answers "no such entry" to both questions on purpose, and this one does not.</p>
 */
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
  resolve: ((entryId: string) => McpUseLookup) | undefined,
): Promise<
  { ok: true; body: Record<string, unknown>; target: McpUseTarget } | { ok: false; code: ErrorCode; message: string }
> {
  const parsed = await readNamedBody(read, req, 'entry', 'an "entry" id');
  return parsed.ok ? usable(parsed.body, resolve) : parsed;
}

function usable(
  body: Record<string, unknown>,
  resolve: ((entryId: string) => McpUseLookup) | undefined,
): { ok: true; body: Record<string, unknown>; target: McpUseTarget } | { ok: false; code: ErrorCode; message: string } {
  const found = resolve?.(body.entry as string);
  return found?.kind === 'usable'
    ? { ok: true, body, target: found.target }
    : { ok: false, ...refusalFor(found) };
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

export function refusalFor(found: McpUseLookup): { code: ErrorCode; message: string } {
  if (found?.kind === 'closed') {
    return {
      code: 'denied',
      message: `"${found.entityName}" is not open to agents for use. Turn on "Usable by agents" in its Agent access section.`,
    };
  }
  return { code: 'not_found', message: 'No such entry, or this window does not serve it.' };
}
