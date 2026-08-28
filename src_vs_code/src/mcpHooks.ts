/* eslint-disable complexity -- moved verbatim out of extension.ts (roadmap A1, 2026-08-28):
   the ceilings are a boundary for NEW code here; each function meets them when it is next touched for a reason of its own. */
import { StorageManager } from './storageManager';
import { McpCreateHooks } from './brokerMcpDoor';
import type { EntityKind } from './types';
import { detailsFor } from './mcpCreate';
import { CreateDecision } from './brokerMcpDoor';
import { creatableFolders } from './mcpCreate';
import { chooseTarget } from './mcpCreate';
import { summarizeCreate } from './mcpCreate';
import { McpUseLookup } from './brokerRequests';
import { findUsableEntry } from './mcpEntries';
import { resolveKind } from './entityKind';
import { CreateRequest } from './mcpCreate';
import { readSecretOptions } from './mcpSecretOptions';
import { DEFAULT_DRAW, generateSecret } from './secretKinds';
import * as vscode from 'vscode';
/**
 * What the broker asks the vault when an agent wants to create an entry.
 *
 * <p>Two questions, deliberately split by the consent prompt between them: <b>where does this
 * go</b> is answered before anybody is asked, so a request that fits nowhere is refused without
 * raising a modal; <b>make it</b> happens only after the answer is yes.</p>
 */
export function mcpCreateHooks(storage: StorageManager, onMade: () => void): McpCreateHooks {
  return {
    choose: (body) => chooseCreateTarget(storage, body),
    make: async (decision, body) => {
      const request = readCreateRequest(body);
      const id = StorageManager.newId();
      const kind = decision.target.kind as EntityKind;
      await storage.addNode(decision.target.accountId, {
        id,
        name: request.name,
        type: 'entity',
        parentId: decision.target.entityId,
        details: detailsFor(id, kind, request),
      });
      const secret = request.secret ?? generatedFor(request);
      if (secret !== undefined && secret.length > 0) {
        await storage.setPassword(decision.target.accountId, id, secret);
      }
      onMade();
      return { id, name: request.name };
    },
  };
}

/**
 * Where a create request lands.
 *
 * <p>The `target` it answers with is shaped like a use target because that is what the door mints
 * a grant against — and here the "entity" it names is the FOLDER, because there is no entity yet.
 * That is the one place in this product where those two words point at the same field, and it is
 * worth saying out loud rather than leaving to be discovered.</p>
 */
export function chooseCreateTarget(storage: StorageManager, body: Record<string, unknown>): CreateDecision {
  const request = readCreateRequest(body);
  const targets = creatableFolders(
    storage.getAccounts(),
    (accountId) => storage.getNodes(accountId),
    (accountId, id) => storage.getNode(accountId, id),
  );
  const chosen = chooseTarget(targets, request);
  if (!chosen.ok) {
    return { ok: false, code: 'denied', message: chosen.message };
  }
  // Asked for a kind we do not make: refused here, before anybody is prompted, and recorded as
  // the one outcome the journal's "could not generate" filter counts.
  const drawable = checkGeneratable(request);
  if (drawable !== undefined) {
    return { ok: false, code: 'not_supported', message: drawable, noGenerator: true };
  }
  return {
    ok: true,
    target: {
      accountId: chosen.target.accountId,
      entityId: chosen.target.folderId,
      entityName: chosen.target.folderName,
      kind: chosen.kind,
    },
    summary: summarizeCreate(request, chosen.target, chosen.kind),
    withSecret: typeof body.secret === 'string' && body.secret.length > 0,
  };
}

/**
 * What an entry id means to the broker's MCP use route.
 *
 * <p>The vault's answer, in the broker's vocabulary. Here rather than in `mcpEntries.ts` because
 * the shapes belong to two different sides of the wall: that module knows about switches and
 * folders, the broker knows about grants, and this line is where one becomes the other.</p>
 */
export function mcpUseLookup(storage: StorageManager, entryId: string, action: string): McpUseLookup {
  const found = findUsableEntry(storage, entryId, action);
  if (found === undefined) {
    return undefined;
  }
  if (found.kind === 'closed') {
    return { kind: 'closed', entityName: found.node.name, needed: found.needed };
  }
  return {
    kind: 'usable',
    target: {
      accountId: found.accountId,
      entityId: found.node.id,
      entityName: found.node.name,
      kind: resolveKind(found.node.details),
    },
  };
}

/** Everything from a webview or a broker body is untrusted, and this one crosses two processes. */
export function readCreateRequest(body: Record<string, unknown>): CreateRequest {
  const text = (key: string): string | undefined =>
    typeof body[key] === 'string' && (body[key] as string).length > 0 ? (body[key] as string) : undefined;
  return {
    name: text('name') ?? '',
    kind: text('kind') ?? 'credential',
    secret: text('secret'),
    host: text('host'),
    user: text('user'),
    port: typeof body.port === 'number' && Number.isInteger(body.port) ? body.port : undefined,
    folder: text('folder'),
    secretKind: text('secretKind'),
    ...drawFrom(body),
  };
}

/**
 * The generation options, or the reason they were refused.
 *
 * <p>Carried on the request rather than thrown, because a refusal here is an answer an agent can
 * act on — "that length is out of range" is a thing it can retry, and a thrown error is not.</p>
 */
function drawFrom(body: Record<string, unknown>): Pick<CreateRequest, 'draw' | 'optionsRefusal'> {
  const read = readSecretOptions(body);
  return read.ok ? { draw: { password: read.password, passphrase: read.passphrase } } : { optionsRefusal: read.message };
}

/**
 * The secret for a new entry when the agent supplied none.
 *
 * <p>The better half of this level: an agent that does not already hold a value asks for one to
 * be made, and it is made HERE. The value never enters its context, and the entry is usable
 * immediately. A kind we cannot make was already refused at `choose`, so by this point the draw
 * cannot fail.</p>
 */
export function generatedFor(request: CreateRequest): string | undefined {
  if (request.secretKind === undefined) {
    return undefined;
  }
  const drawn = generateSecret(request.secretKind, request.draw ?? DEFAULT_DRAW);
  return drawn.ok ? drawn.value : undefined;
}

/** The id an agent quoted, asked for as text — it is a uuid nobody types from memory. */
export function askForEntryId(): Thenable<string | undefined> {
  return vscode.window.showInputBox({
    title: 'Show entry by id',
    prompt: 'Paste the id an agent gave you',
    placeHolder: '8f3a…',
    ignoreFocusOut: true,
    validateInput: (value) => (value.trim().length === 0 ? 'Paste an id.' : undefined),
  });
}

/**
 * An agent's deletion: to the Trash, and nothing else.
 *
 * <p>Answers whether there was still something to move. An entry deleted between the consent
 * prompt and this call is not an error — the prompt can sit for five minutes — and reporting it
 * as one would have an agent tell somebody a deletion failed when the entry is exactly as gone
 * as they wanted.</p>
 */
export async function moveEntryToTrash(
  storage: StorageManager,
  accountId: string,
  entityId: string,
): Promise<boolean> {
  if (storage.getNode(accountId, entityId) === undefined) {
    return false;
  }
  await storage.moveToTrash(accountId, entityId);
  return true;
}

/** Whether this request asks for a secret we cannot make — the message, or nothing. */
export function checkGeneratable(request: CreateRequest): string | undefined {
  if (request.optionsRefusal !== undefined) {
    return request.optionsRefusal;
  }
  if (request.secret !== undefined || request.secretKind === undefined) {
    return undefined;
  }
  const drawn = generateSecret(request.secretKind, request.draw ?? DEFAULT_DRAW);
  return drawn.ok ? undefined : drawn.message;
}
