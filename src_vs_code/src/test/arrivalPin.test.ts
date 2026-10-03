import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sealShare } from '../shareFormat';
import { isLockedSecret, readSecret, unlockSecret } from '../secretEnvelope';
import type { StorageManager } from '../storageManager';
import { StoredSecret, stored } from '../storedSecret';
import type { EntityMetadata, OwnedShare, SharePayload, StoredAccount, TreeNode } from '../types';
import { loadEachWithVscode } from './vscodeStub';
import { ACCOUNT, PIN, Sinks, clickVscode, locked, memoryStorage, sinks } from './pinWorld';

/**
 * A folder that asks for a PIN asks it too when a share or an import lands in it
 * (`PLAN_pin_folder_asks_on_accept_and_import.md`).
 *
 * <p>The person's Add and an agent's create into a folder whose entries are protected ask the folder's PIN
 * and seal every value before its first write (rule R3). An accepted share and an import wrote their new
 * ids through the plain writer — no question, no mark — so the folder kept reading as protected while it
 * held entries in the clear. These tests drive the REAL `ShareInbox` (and the registered import commands)
 * over the real `StorageManager` with every keychain write logged (`pinWorld.ts`, the `addEntityPin.test.ts`
 * pattern): R3 is about the moment between two writes, which a final state cannot show.</p>
 */

const TRANSIT = 'transit-pin-1111';
const SECRET = 'pw-arriving-in-the-clear';
const NOTE = 'a note arriving with it';
const FIRST_PIN = '2468';
const SENDER: StoredAccount = { accountId: 'acc-bob', email: 'bob@corp.com', provider: 'google' };
const KEY_ID = 'my-share-key-id';
/** The title of the box that asks a folder's PIN against its protected entries (`pinOnCreate.askAndCheck`). */
const FOLDER_BOX = /entries are protected/;

type Inbox = { acceptOne(share: OwnedShare): Promise<void>; acceptMany(items: OwnedShare[]): Promise<void> };

interface Arrivals {
  readonly storage: StorageManager;
  readonly s: Sinks;
  /** Every value the keychain was handed after the setup, in order. */
  readonly written: string[];
  /** The answers of the boxes still to come; a test pushes more between two accepts. */
  readonly inputs: (string | undefined)[];
  readonly inbox: Inbox;
  /** The shares consumed from the inbox — a share left pending is not here. */
  readonly removed: OwnedShare[];
  /** Boxes and modals, in the order they were raised: `box:<title>`, `modal:<message>`. */
  readonly events: string[];
  /** What a second window's `runOrSkip` answered from inside each folder-PIN box. */
  readonly probes: string[];
  /** A second window's `runOrSkip` now: `ran`, `skipped` while this window holds the lease. */
  probe(): Promise<string>;
  folderId(name: string): string | undefined;
  /** The entries the arrivals made — the protected siblings of the setup excluded. */
  entries(): TreeNode[];
}

interface Setup {
  /** Folders at the root holding one entry protected under `PIN` — a folder that asks and checks. */
  readonly protectedIn?: readonly string[];
  /** Folders at the root carrying the preference `folderAsksForPin` — a folder that asks, empty. */
  readonly prefersIn?: readonly string[];
  /** A lock directory: the storage takes the real cross-window lease, and the folder box probes it. */
  readonly lockDir?: string;
}

const SIBLING = 'protected-sibling';

async function folderWithSibling(storage: StorageManager, name: string, prefers: boolean): Promise<void> {
  const id = `folder-${name}`;
  await storage.addNode(ACCOUNT, { id, name, type: 'folder', parentId: null, folderType: 'any', ...(prefers ? { folderAsksForPin: true } : {}) });
  if (prefers) {
    return;
  }
  const sibling = `${SIBLING}-${name}`;
  await storage.addNode(ACCOUNT, { id: sibling, name: sibling, type: 'entity', parentId: id, details: { id: sibling, name: sibling, isSshEnabled: false, pinProtected: true } as EntityMetadata });
  await storage.setPassword(ACCOUNT, sibling, stored(await locked('the sibling’s password')));
}

/** The `vscode` the accept paths touch: `pinWorld`'s sinks, a server location, and an event log. */
function arrivalVscode(inputs: (string | undefined)[], s: Sinks, events: string[], probe: () => Promise<void>): Record<string, unknown> {
  const stub = clickVscode(inputs, s);
  const window = stub.window as Record<string, (...args: never[]) => unknown>;
  const box = window.showInputBox as unknown as (options: { title?: string }, token?: unknown) => Promise<string | undefined>;
  const warn = window.showWarningMessage as unknown as (message: string, options?: { modal?: boolean }, ...buttons: string[]) => Promise<string | undefined>;
  window.showInputBox = (async (options: { title?: string }, token?: unknown) => {
    events.push(`box:${options.title ?? ''}`);
    if (FOLDER_BOX.test(options.title ?? '')) {
      await probe();
    }
    return box(options, token);
  }) as never;
  window.showWarningMessage = ((message: string, options?: { modal?: boolean }, ...buttons: string[]) => {
    if (options?.modal === true) {
      events.push(`modal:${message}`);
    }
    return warn(message, options, ...buttons);
  }) as never;
  // A server location: the sender is stamped by a verified sign-in, so the sender check passes silently.
  stub.workspace = { ...(stub.workspace as object), getConfiguration: () => ({ get: (key: string, fallback: unknown) => (key === 'nasBackupPath' ? 'https://vault.corp.com' : fallback) }) };
  return stub;
}

async function arrivals(setup: Setup, inputs: (string | undefined)[]): Promise<Arrivals> {
  const s = sinks();
  const queue = [...inputs];
  const events: string[] = [];
  const probes: string[] = [];
  const written: string[] = [];
  let second: StorageManager | undefined;
  const probe = (): Promise<string> => second?.writes.runOrSkip(() => Promise.resolve('ran'), () => 'skipped') ?? Promise.resolve('no second window');
  const stub = arrivalVscode(queue, s, events, async () => {
    probes.push(await probe());
  });
  const storage = memoryStorage(stub, written, undefined, setup.lockDir);
  second = secondWindow(stub, setup.lockDir);
  await seedFolders(storage, setup);
  const removed: OwnedShare[] = [];
  const [inboxModule] = loadEachWithVscode(['../shareInbox'], stub) as [typeof import('../shareInbox')];
  const inbox = new inboxModule.ShareInbox({
    storage,
    sharing: {
      removeOwnShare: (share: OwnedShare) => (removed.push(share), Promise.resolve()),
      reload: () => Promise.resolve(),
      serverStamped: () => false,
    } as never,
    log: { info: () => undefined, warn: () => undefined, error: () => undefined } as never,
    state: memento() as never,
    onMutated: () => undefined,
  });
  written.length = 0;
  return {
    storage,
    s,
    written,
    inputs: queue,
    inbox,
    removed,
    events,
    probes,
    probe,
    folderId: (name) => storage.getNodes(ACCOUNT).find((n) => n.type === 'folder' && n.name === name)?.id,
    entries: () => storage.getNodes(ACCOUNT).filter((n) => n.type === 'entity' && !n.id.startsWith(SIBLING)),
  };
}

/** Another window of the same profile — a storage over the same lock directory — or none without one. */
function secondWindow(stub: Record<string, unknown>, lockDir: string | undefined): StorageManager | undefined {
  return lockDir === undefined ? undefined : memoryStorage(stub, [], undefined, lockDir);
}

async function seedFolders(storage: StorageManager, setup: Setup): Promise<void> {
  await storage.upsertAccount({ accountId: ACCOUNT, email: 'me@example.com', provider: 'google' });
  const folders = [...(setup.protectedIn ?? []).map((name) => [name, false] as const), ...(setup.prefersIn ?? []).map((name) => [name, true] as const)];
  for (const [name, prefers] of folders) {
    await folderWithSibling(storage, name, prefers);
  }
}

function memento(): { get<T>(key: string, fallback?: T): T | undefined; update(key: string, value: unknown): Promise<void> } {
  const map = new Map<string, unknown>();
  return {
    get: <T>(key: string, fallback?: T): T | undefined => (map.has(key) ? (map.get(key) as T) : fallback),
    update: (key: string, value: unknown) => (map.set(key, value === undefined ? undefined : (JSON.parse(JSON.stringify(value)) as unknown)), Promise.resolve()),
  };
}

/** One entry shared out of a folder: `chain` is the sender's folder chain, as a folder share carries it. */
function folderShare(name: string, chain: readonly string[], over: Partial<EntityMetadata> = {}, senderId = `sender-${name}`): SharePayload {
  return {
    node: { id: senderId, name, type: 'entity', parentId: null, details: { id: senderId, name, isSshEnabled: false, ...over } as EntityMetadata },
    secrets: { password: `${SECRET}-${name}`, notes: `${NOTE}-${name}` },
    ...(chain.length > 0 ? { folderPath: chain.map((folder) => ({ name: folder, folderType: 'any' as const })) } : {}),
  };
}

function owned(payload: SharePayload, transit: string = TRANSIT): OwnedShare {
  return { accountId: ACCOUNT, shareKeyId: KEY_ID, item: sealShare(payload, KEY_ID, SENDER, transit, 1_756_000_000_000, { toEmail: 'me@example.com' }) };
}

/** Rule R3: every value the keychain saw is an envelope, and none carries an arriving plaintext. */
function neverInTheClear(w: Arrivals): void {
  assert.ok(w.written.length > 0, 'precondition: something was written');
  for (const value of w.written) {
    assert.ok(!value.includes(SECRET) && !value.includes(NOTE), `the keychain was handed the arriving password in the clear: ${value}`);
    assert.ok(isLockedSecret(stored(value)), `a value written unsealed: ${value}`);
  }
}

/** A slot that must be SEALED — opened with `pin`, or the assertion names what is stored. */
async function opened(value: StoredSecret | undefined, pin: string): Promise<string> {
  const read = readSecret(value);
  assert.equal(read.kind, 'locked', `stored in the clear: ${String(value)}`);
  return read.kind === 'locked' ? unlockSecret(read.envelope, ACCOUNT, pin) : '';
}

async function sealedUnder(w: Arrivals, entry: TreeNode, pin: string): Promise<void> {
  assert.equal(entry.details?.pinProtected, true, `"${entry.name}" carries no mark`);
  assert.equal(entry.pinEpoch, 1, `"${entry.name}" carries no first protection decision`);
  assert.equal(await opened(await w.storage.getPassword(ACCOUNT, entry.id), pin), `${SECRET}-${entry.name}`, 'the PIN opens what was sealed');
  assert.equal(await opened(await w.storage.getNotes(ACCOUNT, entry.id), pin), `${NOTE}-${entry.name}`);
}

function boxes(w: Arrivals, title: RegExp): number {
  return w.events.filter((e) => e.startsWith('box:') && title.test(e)).length;
}

function infos(w: Arrivals): string {
  return w.s.infos.join(' | ');
}

// ---------------------------------------------------------------------------------------------
// B3 — one accepted share into a folder that asks is sealed under its PIN.
// ---------------------------------------------------------------------------------------------

test('an accepted folder share into a folder whose entries are protected is sealed under the folder’s PIN before its first write', async () => {
  const w = await arrivals({ protectedIn: ['Production'] }, [TRANSIT, PIN]);
  w.s.modalAnswers.push('Use this PIN');

  await w.inbox.acceptOne(owned(folderShare('prod-db', ['Production'])));

  neverInTheClear(w);
  const [entry] = w.entries();
  assert.ok(entry !== undefined, `nothing arrived: ${infos(w)}`);
  assert.equal(entry.parentId, w.folderId('Production'), 'it landed in the folder its chain names');
  await sealedUnder(w, entry, PIN);
  assert.equal(boxes(w, FOLDER_BOX), 1, 'the question Add asks in that folder, once');
  assert.equal(w.removed.length, 1, 'the share was consumed');
  assert.ok(w.s.infos.includes('Accepted "prod-db".'), infos(w));
});

test('declining the folder’s PIN writes nothing — no value, no node — and the share stays pending, with the reason said', async () => {
  const w = await arrivals({ protectedIn: ['Production'] }, [TRANSIT, undefined]);

  await w.inbox.acceptOne(owned(folderShare('prod-db', ['Production'])));

  assert.deepEqual(w.written, [], 'the keychain was written although the folder’s PIN was declined');
  assert.deepEqual(w.entries(), [], 'a node arrived although the folder’s PIN was declined');
  assert.deepEqual(w.removed, [], 'the share was consumed — the only copy of it');
  assert.ok(w.s.infos.some((m) => m.includes('"Production" asks for a PIN on every entry in it')), infos(w));
  assert.deepEqual(w.s.infos.filter((m) => m.startsWith('Accepted')), [], infos(w));
});

test('a folder that asks by its preference: the subfolder the share creates is asked once, sealed, and created only then', async () => {
  const w = await arrivals({ prefersIn: ['Production'] }, [TRANSIT, FIRST_PIN, FIRST_PIN]);

  await w.inbox.acceptOne(owned(folderShare('prod-db', ['Production', 'db'])));

  neverInTheClear(w);
  const db = w.folderId('db');
  assert.ok(db !== undefined, 'the subfolder the chain names was not created');
  const [entry] = w.entries();
  assert.equal(entry?.parentId, db);
  await sealedUnder(w, entry, FIRST_PIN);
});

test('declined there, not even the subfolder the share would have created is written', async () => {
  const w = await arrivals({ prefersIn: ['Production'] }, [TRANSIT, undefined]);

  await w.inbox.acceptOne(owned(folderShare('prod-db', ['Production', 'db'])));

  assert.equal(w.folderId('db'), undefined, 'a folder shell was written for a declined arrival');
  assert.deepEqual(w.entries(), []);
  assert.deepEqual(w.written, []);
  assert.deepEqual(w.removed, []);
});

test('a share whose chain names no existing folder, and a single-entry share, ask nothing and land as before', async () => {
  const w = await arrivals({ protectedIn: ['Production'] }, [TRANSIT, TRANSIT]);

  await w.inbox.acceptOne(owned(folderShare('elsewhere-db', ['Elsewhere'])));
  await w.inbox.acceptOne(owned(folderShare('root-db', [])));

  assert.equal(boxes(w, FOLDER_BOX), 0, 'a folder PIN was asked where no folder asks');
  const names = w.entries().map((n) => n.name).sort();
  assert.deepEqual(names, ['elsewhere-db', 'root-db']);
  for (const entry of w.entries()) {
    assert.equal(await w.storage.getPassword(ACCOUNT, entry.id), `${SECRET}-${entry.name}`, 'written as before, under the vault alone');
    assert.equal(entry.details?.pinProtected, undefined);
  }
});

test('a folder that only HOLDS protected entries does not reach a subfolder the share creates (§9.1)', async () => {
  const w = await arrivals({ protectedIn: ['Production'] }, [TRANSIT]);

  await w.inbox.acceptOne(owned(folderShare('prod-db', ['Production', 'db'])));

  assert.equal(boxes(w, FOLDER_BOX), 0, 'Add into an empty subfolder of it asks nothing, and neither does an arrival');
  const [entry] = w.entries();
  assert.equal(entry?.parentId, w.folderId('db'));
  assert.equal(await w.storage.getPassword(ACCOUNT, entry.id), `${SECRET}-prod-db`);
});

