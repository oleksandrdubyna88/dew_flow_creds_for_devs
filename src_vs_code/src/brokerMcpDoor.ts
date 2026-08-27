import * as http from 'node:http';
import { ErrorCode } from './brokerProtocol';
import { McpUseLookup, McpUseTarget, readMcpUse, readNamedBody } from './brokerRequests';

/**
 * The MCP door: what happens between an agent's request and the machinery behind it.
 *
 * <p>Out of `credsAgentServer.ts` because that file sits at its 800-line ceiling and this is a
 * real seam rather than an arbitrary one — everything here is <i>the door</i>, and everything it
 * calls is <i>the broker</i>. Both handlers below read the same body shape, ask the same gate,
 * take the same throttle slot, mint the same kind of grant and write the same audit line; the
 * only difference is what happens once consent is in hand.</p>
 *
 * <p><b>Nothing here decides a permission.</b> The switch is resolved by the vault, the consent
 * is asked by the window, and the deletion is performed by whatever owns storage. This is the
 * order those things happen in, which is the part that must not be got wrong twice.</p>
 */

/** What the broker gives this door. Narrow on purpose: it can be stubbed in a test. */
export interface BrokerDoor {
  /** Answer a refusal, and record it against the grant when there is one. */
  refuse(
    res: http.ServerResponse,
    code: ErrorCode,
    message: string,
    grant?: Grantish,
    action?: string,
    detail?: string,
  ): void;
  /** Whether this unauthenticated call may make the window ask a human. Answers its own refusal. */
  admit(res: http.ServerResponse): boolean;
  /** Give the slot back — in a `finally`, so a failed prompt does not close the route. */
  release(): void;
  mint(target: McpUseTarget): Grantish;
  describe(grant: Grantish): string;
  note(entry: { grant: string; entityName: string; action: string; outcome: string; detail?: string }): void;
  perform(
    res: http.ServerResponse,
    grant: Grantish,
    action: string,
    body: Record<string, unknown>,
  ): Promise<void>;
  consent(grant: Grantish, action: string, verb: string, summary: string): Promise<ConsentOutcome>;
  respond(res: http.ServerResponse, status: number, body: unknown): void;
}

/** Whatever the broker calls a grant. This module only ever passes it back. */
export type Grantish = object;

/**
 * The door, typed.
 *
 * <p>It does nothing at run time, and that is the point: the broker builds this object out of
 * its own bound methods, and naming the type at the point of construction is what makes a
 * missing piece a compile error there rather than an `undefined is not a function` here.</p>
 */
export function mcpDoor(parts: BrokerDoor): BrokerDoor {
  return parts;
}

export type ConsentOutcome = 'allowed' | 'denied' | 'timeout';

/** Read the body of the request, in the shape both MCP routes share. */
export type ReadBody = (req: http.IncomingMessage) => Promise<string>;

/** Resolve an entry id for one action, and say whether it may. */
export type ResolveUse = (entryId: string, action: string) => McpUseLookup;

/**
 * An agent using an entry it can see.
 *
 * <p>The same shape as an alias call and deliberately so — throttle, mint, consent, perform,
 * mask, audit, burn — with one gate in front of it: that entry's own switch for THIS action.
 * The switch says "you may ask"; the modal is still what says yes.</p>
 */
export async function handleMcpUse(
  door: BrokerDoor,
  readBody: ReadBody,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  action: string,
  resolve: ResolveUse | undefined,
): Promise<void> {
  const read = await readMcpUse(readBody, req, resolve, action);
  if (!read.ok) {
    door.refuse(res, read.code, read.message);
    return;
  }
  // The same throttle as the alias route, and for the same reason: everything below this line
  // can make the window ask a human, and the rate of prompts is what stops a local process
  // turning that into an attack on the person's patience.
  if (!door.admit(res)) {
    return;
  }
  const grant = minted(door, read.target, 'mcp');
  try {
    await door.perform(res, grant, action, read.body);
  } finally {
    door.release();
  }
}

/**
 * An agent deleting an entry — to the Trash, always, with no way to say otherwise.
 *
 * <p>Its own route rather than another verb under `/v1/mcp/use/`, because it is not a use of a
 * credential: nothing is connected to, nothing is run, and no secret is touched. What it needs
 * is the same gate and the same prompt, which is why it lives beside the other one.</p>
 *
 * <p><b>The Trash is not an option here, it is the whole permission.</b> A human deleting gets a
 * choice between the Trash and permanently; an agent gets one destination. That is what made
 * "agents may delete" grantable at all — the objection was that deletion has no undo, and it
 * travels by sync to every machine carrying the version history with it.</p>
 */
export async function handleMcpDelete(
  door: BrokerDoor,
  readBody: ReadBody,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  resolve: ResolveUse | undefined,
  remove: ((accountId: string, entityId: string) => Promise<boolean>) | undefined,
): Promise<void> {
  const read = await readMcpUse(readBody, req, resolve, 'delete');
  if (!read.ok) {
    door.refuse(res, read.code, read.message);
    return;
  }
  if (remove === undefined) {
    door.refuse(res, 'not_supported', 'This window cannot move entries to the Trash.');
    return;
  }
  if (!door.admit(res)) {
    return;
  }
  try {
    await confirmAndDelete(door, res, read.target, remove);
  } finally {
    door.release();
  }
}

/**
 * Ask, then move.
 *
 * <p>The prompt names the entry and says where it goes, because "delete" and "move to the Trash"
 * are different promises and the person is approving the second one.</p>
 */
async function confirmAndDelete(
  door: BrokerDoor,
  res: http.ServerResponse,
  target: McpUseTarget,
  remove: (accountId: string, entityId: string) => Promise<boolean>,
): Promise<void> {
  const grant = minted(door, target, 'mcp-delete');
  const consent = await door.consent(grant, 'delete', 'move to the Trash', target.entityName);
  if (consent !== 'allowed') {
    const code: ErrorCode = consent === 'timeout' ? 'consent_timeout' : 'denied';
    door.refuse(res, code, 'The human did not allow this deletion.', grant, 'delete', target.entityName);
    return;
  }
  const moved = await remove(target.accountId, target.entityId);
  door.note({
    grant: door.describe(grant),
    entityName: target.entityName,
    action: 'delete',
    outcome: moved ? 'moved to Trash' : 'gone already',
    detail: target.entityName,
  });
  door.respond(res, 200, { deleted: moved, entity: target.entityName, restorable: true });
}

/** Mint, and write the line that says a call began. */
function minted(door: BrokerDoor, target: McpUseTarget, what: string): Grantish {
  const grant = door.mint(target);
  door.note({
    grant: door.describe(grant),
    entityName: target.entityName,
    action: what,
    outcome: 'minted',
    detail: `${target.entityName} · ${target.kind}`,
  });
  return grant;
}

/**
 * An agent creating an entry.
 *
 * <p>The only MCP call with no entry id in it, so the gate is a different one: the folders a
 * person opened to creation. Everything else is the shape the other two keep — throttle, mint,
 * prompt, act, audit — because a person approving this is approving the same kind of thing.</p>
 *
 * <p><b>The grant is minted against the FOLDER.</b> There is no entity to name yet, and the grant
 * exists here only to key the consent bookkeeping and label the audit line; it is used once and
 * handed to nobody.</p>
 */
export async function handleMcpCreate(
  door: BrokerDoor,
  readBody: ReadBody,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  create: McpCreateHooks | undefined,
): Promise<void> {
  const read = await readNamedBody(readBody, req, 'name', 'a "name" for the new entry');
  if (!read.ok) {
    door.refuse(res, read.code, read.message);
    return;
  }
  const chosen = decide(create, read.body);
  if (!chosen.ok) {
    door.refuse(res, chosen.code, chosen.message);
    return;
  }
  if (!door.admit(res)) {
    return;
  }
  try {
    await confirmAndCreate(door, res, chosen, create as McpCreateHooks, read.body);
  } finally {
    door.release();
  }
}

/** A window with no vault behind it refuses in the same shape as a request that fits nowhere. */
function decide(create: McpCreateHooks | undefined, body: Record<string, unknown>): CreateDecision {
  return create === undefined
    ? { ok: false, code: 'not_supported', message: 'This window cannot create entries.' }
    : create.choose(body);
}

/** What the vault must answer for a create call: where it goes, and how to put it there. */
export interface McpCreateHooks {
  /** Which open folder this request lands in, or why none does. */
  choose(body: Record<string, unknown>): CreateDecision;
  /** Make it. Answers the new entry's id and name. */
  make(
    decision: CreateAccepted,
    body: Record<string, unknown>,
  ): Promise<{ id: string; name: string }>;
}

export type CreateDecision = CreateAccepted | { ok: false; code: ErrorCode; message: string };

export interface CreateAccepted {
  ok: true;
  target: McpUseTarget;
  /** One line for the prompt: the entry, its kind, and the folder it is going into. */
  summary: string;
  /** Whether the request carried a secret — the journal counts these. */
  withSecret: boolean;
}

async function confirmAndCreate(
  door: BrokerDoor,
  res: http.ServerResponse,
  decision: CreateAccepted,
  create: McpCreateHooks,
  body: Record<string, unknown>,
): Promise<void> {
  const grant = minted(door, decision.target, 'mcp-create');
  const consent = await door.consent(grant, 'create', 'create an entry in', decision.summary);
  if (consent !== 'allowed') {
    const code: ErrorCode = consent === 'timeout' ? 'consent_timeout' : 'denied';
    door.refuse(res, code, 'The human did not allow this.', grant, 'create', decision.summary);
    return;
  }
  const made = await create.make(decision, body);
  door.note({
    grant: door.describe(grant),
    entityName: made.name,
    action: 'create',
    // The journal's second filter reads this word. A secret that arrived from an agent passed
    // through its context, and counting those is the price of this level said out loud.
    outcome: decision.withSecret ? 'created with agent secret' : 'created',
    detail: decision.summary,
  });
  door.respond(res, 200, { created: true, id: made.id, name: made.name });
}
