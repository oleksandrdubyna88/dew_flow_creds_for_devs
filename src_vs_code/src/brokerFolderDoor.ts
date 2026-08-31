import * as http from 'node:http';
import { BrokerDoor, ConsentOutcome, Grantish, ReadBody } from './brokerMcpDoor';
import { ErrorCode } from './brokerProtocol';
import { McpUseTarget, readNamedBody } from './brokerRequests';
import { FolderEdit, FolderView } from './mcpFolders';

/**
 * The folder door: three verbs over the second object on the agent surface.
 *
 * <p>Its own module rather than more of `brokerMcpDoor.ts` for the reason that file exists at all
 * — the one it split from sits at its 800-line ceiling — and because the seam is real: everything
 * here is about FOLDERS, and it repeats the entry door's order deliberately. Throttle, mint,
 * prompt, act, audit. A person approving one of these is approving the same kind of thing.</p>
 *
 * <p><b>Nothing here decides a permission</b>, and nothing here can change one. The vault resolves
 * the switch, the window asks the human, storage performs the move — and the shape this door
 * accepts (`name`, `parent`, `folderType`) has no field the switches could arrive in. That is the
 * property the whole feature rests on, and it is kept by the shape rather than by a check.</p>
 */

/** What the vault must answer for the folder routes. Narrow on purpose: a test can stub it. */
export interface McpFolderHooks {
  /** Every folder an agent may see, already resolved. */
  list(): FolderView[];
  /** Resolve one folder for one verb: where it is, or why it may not. */
  choose(action: string, body: Record<string, unknown>): FolderDecision;
  /** Make a folder inside the chosen parent. Answers its id and name. */
  create(decision: FolderAccepted, body: Record<string, unknown>): Promise<{ id: string; name: string }>;
  /** Apply a rename / move / retype. Answers whether anything actually changed. */
  edit(decision: FolderAccepted, edit: FolderEdit): Promise<boolean>;
  /** Move a folder to the Trash. Answers whether it was there to move. */
  remove(decision: FolderAccepted): Promise<boolean>;
}

export type FolderDecision =
  | FolderAccepted
  | { ok: false; code: ErrorCode; message: string };

export interface FolderAccepted {
  ok: true;
  target: McpUseTarget;
  /** One line for the prompt — every field being changed, named. */
  summary: string;
  /** The fields an agent asked for, already narrowed to the three this door accepts. */
  edit: FolderEdit;
}

/** An agent making a folder inside one somebody opened to it. */
export async function handleFolderCreate(
  door: BrokerDoor,
  readBody: ReadBody,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  hooks: McpFolderHooks | undefined,
): Promise<void> {
  await perform(door, readBody, req, res, hooks, {
    action: 'create',
    require: 'name',
    asks: 'a "name" for the new folder',
    verb: 'create a folder in',
    run: (h, decision, body) => h.create(decision, body).then((made) => ({ id: made.id, name: made.name })),
    answer: (made) => ({ created: true, ...made }),
  });
}

/** An agent renaming, moving or retyping a folder. Never touching its switches. */
export async function handleFolderEdit(
  door: BrokerDoor,
  readBody: ReadBody,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  hooks: McpFolderHooks | undefined,
): Promise<void> {
  await perform(door, readBody, req, res, hooks, {
    action: 'edit',
    require: 'folder',
    asks: 'the "folder" id to change',
    verb: 'change the folder',
    run: (h, decision) => h.edit(decision, decision.edit).then((changed) => ({ changed })),
    answer: (result) => ({ edited: result.changed === true }),
  });
}

/**
 * An agent sending a folder to the Trash — with everything in it.
 *
 * <p>The Trash is the whole permission here, as it is for an entry: a human deleting gets a
 * choice between the Trash and permanently, and an agent gets one destination. The prompt says
 * so, because "delete the folder" and "move it and its contents to the Trash" are different
 * promises and the person is approving the second.</p>
 */
export async function handleFolderDelete(
  door: BrokerDoor,
  readBody: ReadBody,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  hooks: McpFolderHooks | undefined,
): Promise<void> {
  await perform(door, readBody, req, res, hooks, {
    action: 'delete',
    require: 'folder',
    asks: 'the "folder" id to move to the Trash',
    verb: 'move to the Trash, with everything in it,',
    run: (h, decision) => h.remove(decision).then((moved) => ({ moved })),
    answer: (result) => ({ deleted: result.moved === true, restorable: true }),
  });
}

/** The one shape all three share: read, decide, throttle, mint, ask, act, record. */
interface FolderRoute {
  action: string;
  require: string;
  asks: string;
  verb: string;
  run(
    hooks: McpFolderHooks,
    decision: FolderAccepted,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
  answer(result: Record<string, unknown>): Record<string, unknown>;
}

async function perform(
  door: BrokerDoor,
  readBody: ReadBody,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  hooks: McpFolderHooks | undefined,
  route: FolderRoute,
): Promise<void> {
  const read = await readNamedBody(readBody, req, route.require, route.asks);
  if (!read.ok) {
    door.refuse(res, read.code, read.message);
    return;
  }
  const decision = decide(hooks, route.action, read.body);
  if (!decision.ok) {
    door.refuse(res, decision.code, decision.message);
    return;
  }
  if (!door.admit(res)) {
    return;
  }
  try {
    await confirmAndRun(door, res, decision, hooks as McpFolderHooks, read.body, route);
  } finally {
    door.release();
  }
}

/** A window with no vault behind it refuses in the same shape as a request that fits nowhere. */
function decide(
  hooks: McpFolderHooks | undefined,
  action: string,
  body: Record<string, unknown>,
): FolderDecision {
  return hooks === undefined
    ? { ok: false, code: 'not_supported', message: 'This window cannot change folders.' }
    : hooks.choose(action, body);
}

async function confirmAndRun(
  door: BrokerDoor,
  res: http.ServerResponse,
  decision: FolderAccepted,
  hooks: McpFolderHooks,
  body: Record<string, unknown>,
  route: FolderRoute,
): Promise<void> {
  const grant = minted(door, decision.target, `mcp-folder-${route.action}`);
  const consent = await door.consent(grant, route.action, route.verb, decision.summary);
  if (consent !== 'allowed') {
    refuseConsent(door, res, consent, grant, route.action, decision.summary);
    return;
  }
  const result = await route.run(hooks, decision, body);
  door.note({
    grant: door.describe(grant),
    entityName: decision.target.entityName,
    action: `folder-${route.action}`,
    outcome: 'done',
    detail: decision.summary,
  });
  door.respond(res, 200, { folder: decision.target.entityName, ...route.answer(result) });
}

function refuseConsent(
  door: BrokerDoor,
  res: http.ServerResponse,
  consent: ConsentOutcome,
  grant: Grantish,
  action: string,
  summary: string,
): void {
  const code: ErrorCode = consent === 'timeout' ? 'consent_timeout' : 'denied';
  door.refuse(res, code, 'The human did not allow this.', grant, `folder-${action}`, summary);
}

/** Mint, and write the line that says a call began. */
function minted(door: BrokerDoor, target: McpUseTarget, what: string): Grantish {
  const grant = door.mint(target);
  door.note({
    grant: door.describe(grant),
    entityName: target.entityName,
    action: what,
    outcome: 'minted',
    detail: target.entityName,
  });
  return grant;
}
