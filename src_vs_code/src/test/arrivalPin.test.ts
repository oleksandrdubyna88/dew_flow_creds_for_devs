import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { sealShare } from '../shareFormat';
import { isLockedSecret, readSecret, unlockSecret } from '../secretEnvelope';
import type { StorageManager } from '../storageManager';
import { StoredSecret, stored } from '../storedSecret';
import type { EntityMetadata, OwnedShare, SharePayload, StoredAccount, TreeNode } from '../types';
import type { ImportedEntity } from '../importFormats';
import type { ImportOutcome, NodeLocation } from '../importCommands';
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
  /** Run a registered import command on the named folder, its file picker answering `path` holding `text`. */
  importInto(command: string, folder: string, path: string, text: string): Promise<void>;
  /** The import's own entry point, with the question bound the way the command binds it. */
  importEntities(location: NodeLocation, entities: readonly ImportedEntity[]): Promise<ImportOutcome>;
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

/** The file an import command's picker answers, and what reading it returns. */
interface PickedFile {
  path: string;
  text: string;
}

/** The `vscode` the accept and import paths touch: `pinWorld`'s sinks, a server location, a picked file, and an event log. */
function arrivalVscode(inputs: (string | undefined)[], s: Sinks, events: string[], probe: () => Promise<void>, picked: PickedFile): Record<string, unknown> {
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
  window.showOpenDialog = (() => Promise.resolve([{ fsPath: picked.path }])) as never;
  // A server location: the sender is stamped by a verified sign-in, so the sender check passes silently.
  const workspace = stub.workspace as { fs: object };
  stub.workspace = {
    ...workspace,
    getConfiguration: () => ({ get: (key: string, fallback: unknown) => (key === 'nasBackupPath' ? 'https://vault.corp.com' : fallback) }),
    fs: { ...workspace.fs, readFile: () => Promise.resolve(Buffer.from(picked.text, 'utf8')) },
  };
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
  const picked: PickedFile = { path: '', text: '' };
  const stub = arrivalVscode(queue, s, events, async () => {
    probes.push(await probe());
  }, picked);
  const storage = memoryStorage(stub, written, undefined, setup.lockDir);
  second = secondWindow(stub, setup.lockDir);
  await seedFolders(storage, setup);
  const removed: OwnedShare[] = [];
  const [inboxModule, commands, imports, pinOnCreate] = loadEachWithVscode(['../shareInbox', '../commands/treeMutationCommands', '../importCommands', '../pinOnCreate'], stub) as [
    typeof import('../shareInbox'), typeof import('../commands/treeMutationCommands'), typeof import('../importCommands'), typeof import('../pinOnCreate'),
  ];
  const handlers = registered(commands, storage);
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
    importInto: async (command, folder, path, text) => {
      Object.assign(picked, { path, text });
      const node = storage.getNodes(ACCOUNT).find((n) => n.type === 'folder' && n.name === folder);
      await handlers.get(command)?.({ kind: 'node', accountId: ACCOUNT, node });
    },
    importEntities: (location, entities) => imports.importEntities(storage, location, entities, pinOnCreate.folderQuestion(storage)),
    entries: () => storage.getNodes(ACCOUNT).filter((n) => n.type === 'entity' && !n.id.startsWith(SIBLING)),
  };
}

type Handler = (...args: unknown[]) => unknown;

/** The tree-mutation commands, registered over `storage` as `addEntityPin.test.ts` registers them. */
function registered(commands: typeof import('../commands/treeMutationCommands'), storage: StorageManager): Map<string, Handler> {
  const handlers = new Map<string, Handler>();
  commands.registerTreeMutationCommands({
    announceArrival: () => Promise.resolve(),
    log: { write: (): void => undefined },
    doorsFor: () => ({}),
    mutated: () => undefined,
    policyOf: () => undefined,
    register: (command: string, handler: Handler) => handlers.set(command, handler),
    storage,
    transports: {},
    vaultKeys: { noteUserActivity: () => undefined },
  } as never);
  return handlers;
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

// ---------------------------------------------------------------------------------------------
// B4 — a batch asks once per folder, and never inside the lease.
// ---------------------------------------------------------------------------------------------

/** The modals that asked to agree to the count a typed PIN opens — Add's *Use this PIN*. */
function agreements(w: Arrivals): number {
  return w.events.filter((e) => e.startsWith('modal:This PIN opens')).length;
}

test('acceptMany over three shares into one protected folder asks its PIN once — one box, one Use this PIN — and seals all three', async () => {
  const w = await arrivals({ protectedIn: ['Production'] }, [TRANSIT, PIN]);
  w.s.modalAnswers.push('Use this PIN');

  await w.inbox.acceptMany(['alpha', 'beta', 'gamma'].map((name) => owned(folderShare(name, ['Production']))));

  assert.equal(boxes(w, FOLDER_BOX), 1, `the folder was asked once per share: ${w.events.join(' | ')}`);
  assert.equal(agreements(w), 1, 'one agreement for the whole batch');
  neverInTheClear(w);
  const entries = w.entries();
  assert.equal(entries.length, 3, infos(w));
  for (const entry of entries) {
    await sealedUnder(w, entry, PIN);
  }
  assert.ok(w.s.infos.includes('Accepted 3 item(s).'), infos(w));
});

test('two folders are two questions; the first declined leaves its shares pending and named, and the second is still asked', async () => {
  const w = await arrivals({ protectedIn: ['Production', 'Staging'] }, [TRANSIT, undefined, PIN]);
  w.s.modalAnswers.push('Use this PIN');

  await w.inbox.acceptMany([
    owned(folderShare('alpha', ['Production'])),
    owned(folderShare('beta', ['Production'])),
    owned(folderShare('gamma', ['Staging'])),
  ]);

  assert.equal(boxes(w, FOLDER_BOX), 2, `one question per folder: ${w.events.join(' | ')}`);
  assert.deepEqual(w.entries().map((n) => n.name), ['gamma'], 'only the share into the folder that was answered arrived');
  await sealedUnder(w, w.entries()[0], PIN);
  assert.deepEqual(w.removed.map((share) => share.item.entityName), ['gamma'], 'the declined folder’s shares stay in the inbox');
  const tally = w.s.infos.find((m) => m.startsWith('Accepted')) ?? '';
  assert.match(tally, /^Accepted 1 item\(s\), 2 still pending\./, infos(w));
  assert.match(tally, /"Production"/, `the tally does not name the declined folder: ${tally}`);
});

test('the answer spans the whole conversation: shares opened by two transit PINs into one folder are one question', async () => {
  const w = await arrivals({ protectedIn: ['Production'] }, [TRANSIT, PIN, 'transit-pin-2222']);
  w.s.modalAnswers.push('Use this PIN');

  await w.inbox.acceptMany([owned(folderShare('alpha', ['Production'])), owned(folderShare('beta', ['Production']), 'transit-pin-2222')]);

  assert.equal(boxes(w, FOLDER_BOX), 1, `asked again in the second PIN round: ${w.events.join(' | ')}`);
  assert.equal(w.entries().length, 2, infos(w));
  for (const entry of w.entries()) {
    await sealedUnder(w, entry, PIN);
  }
});

test('no lease is held across the folder’s PIN box — a second window’s runOrSkip from inside the box runs', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arrival-lease-'));
  try {
    const w = await arrivals({ protectedIn: ['Production'], lockDir: dir }, [TRANSIT, PIN]);
    w.s.modalAnswers.push('Use this PIN');
    // The control: the probe CAN see a held lease — from inside this window's own write, it is skipped.
    const control = await w.storage.writes.run(() => w.probe());
    assert.equal(control, 'skipped', 'the probe cannot see a held lease, so it proves nothing');

    await w.inbox.acceptMany([owned(folderShare('alpha', ['Production'])), owned(folderShare('beta', ['Production']))]);

    assert.ok(w.probes.length > 0, 'precondition: the folder’s PIN box was raised');
    assert.deepEqual(w.probes.filter((p) => p !== 'ran'), [], 'the folder’s PIN box was raised while this window held the lease');
    assert.equal(w.entries().length, 2, infos(w));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------------------------
// B5 — the sender's protection and the folder's ask are one question.
// ---------------------------------------------------------------------------------------------

/** The recipient's OWN PIN box for an entry its sender had protected (`shareRecipientPin` → `newPin`). */
const OWN_PIN_BOX = (name: string): RegExp => new RegExp(`A PIN for "${name}"$`);
const OWN_PIN = 'recipient-own-9753';

test('a share its sender protected, into a folder that asks, is asked ONE question — the folder’s — and sealed under the folder’s PIN', async () => {
  const w = await arrivals({ protectedIn: ['Production'] }, [TRANSIT, PIN, OWN_PIN, OWN_PIN]);
  w.s.modalAnswers.push('Use this PIN');

  await w.inbox.acceptOne(owned(folderShare('prod-db', ['Production'], { pinAskOnImport: true })));

  assert.equal(boxes(w, OWN_PIN_BOX('prod-db')), 0, `the recipient’s own PIN was asked as well as the folder’s: ${w.events.join(' | ')}`);
  assert.equal(boxes(w, FOLDER_BOX), 1, `the folder was not asked: ${w.events.join(' | ')}`);
  neverInTheClear(w);
  const [entry] = w.entries();
  assert.ok(entry !== undefined, infos(w));
  assert.equal(entry.details?.pinAskOnImport, undefined, 'the sender’s instruction is spent — the folder’s PIN acted on it');
  await sealedUnder(w, entry, PIN);
});

test('into a folder that asks nothing, the sender’s protection still asks the recipient’s own PIN, as before', async () => {
  const w = await arrivals({}, [TRANSIT, OWN_PIN, OWN_PIN]);

  await w.inbox.acceptOne(owned(folderShare('prod-db', [], { pinAskOnImport: true })));

  assert.equal(boxes(w, OWN_PIN_BOX('prod-db')), 2, 'typed twice');
  const [entry] = w.entries();
  assert.ok(entry !== undefined, infos(w));
  assert.equal(entry.details?.pinProtected, true);
  assert.equal(await opened(await w.storage.getPassword(ACCOUNT, entry.id), OWN_PIN), `${SECRET}-prod-db`);
});

test('an update candidate asks the recipient’s own PIN only AFTER Update it — and not at all when the question is dismissed', async () => {
  const w = await arrivals({}, [TRANSIT]);
  await w.inbox.acceptOne(owned(folderShare('prod-db', [], {}, 'same-sender-id')));
  w.events.length = 0;

  w.inputs.push(TRANSIT);
  w.s.modalAnswers.push(undefined);
  await w.inbox.acceptOne(owned(folderShare('prod-db', [], { pinAskOnImport: true }, 'same-sender-id')));
  assert.equal(boxes(w, OWN_PIN_BOX('prod-db')), 0, `a PIN was asked for a share the person then dismissed: ${w.events.join(' | ')}`);

  w.events.length = 0;
  w.inputs.push(TRANSIT, OWN_PIN, OWN_PIN);
  w.s.modalAnswers.push('Update it');
  await w.inbox.acceptOne(owned(folderShare('prod-db', [], { pinAskOnImport: true }, 'same-sender-id')));
  const question = w.events.findIndex((e) => e.startsWith('modal:') && e.includes('already came from'));
  const own = w.events.findIndex((e) => e.startsWith('box:') && OWN_PIN_BOX('prod-db').test(e));
  assert.ok(question >= 0 && own > question, `the own PIN must come after Update it: ${w.events.join(' | ')}`);
});

// ---------------------------------------------------------------------------------------------
// B6 — an import from another tool honours the folder.
// ---------------------------------------------------------------------------------------------

/** A CSV export as a password manager writes it — one row per entry, each filed under `folder`. */
function csvExport(names: readonly string[], folder = 'Team'): string {
  return ['name,password,notes,folder', ...names.map((name) => `${name},${SECRET}-${name},${NOTE}-${name},${folder}`)].join('\n');
}

test('an import from another tool into a folder that asks is sealed under its PIN before its first write — one question for the whole file', async () => {
  const w = await arrivals({ prefersIn: ['Production'] }, [FIRST_PIN, FIRST_PIN]);
  w.s.modalAnswers.push('Import');

  await w.importInto('credSshManager.importFrom', 'Production', '/exports/bitwarden.csv', csvExport(['alpha', 'beta']));

  neverInTheClear(w);
  assert.equal(w.events.filter((e) => e.startsWith('box:')).length, 2, `one first PIN, typed twice, for both entries: ${w.events.join(' | ')}`);
  const team = w.folderId('Team');
  assert.equal(w.storage.getNode(ACCOUNT, team ?? '')?.parentId, w.folderId('Production'), 'the file’s folder lands in the folder it was imported into');
  assert.deepEqual(w.entries().map((n) => n.name).sort(), ['alpha', 'beta']);
  for (const entry of w.entries()) {
    assert.equal(entry.parentId, team);
    await sealedUnder(w, entry, FIRST_PIN);
  }
});

test('declined, the import writes nothing of what that folder would have held — not even the folder made for it — and says which entries it skipped', async () => {
  const w = await arrivals({ prefersIn: ['Production'] }, [undefined]);
  w.s.modalAnswers.push('Import');

  await w.importInto('credSshManager.importFrom', 'Production', '/exports/bitwarden.csv', csvExport(['alpha', 'beta']));

  assert.deepEqual(w.written, [], 'the keychain was written although the folder’s PIN was declined');
  assert.deepEqual(w.entries(), []);
  assert.equal(w.folderId('Team'), undefined, 'a folder was made for entries a decline kept out');
  const said = infos(w);
  assert.match(said, /Imported 0 entr\(ies\)/, said);
  assert.match(said, /2 not imported: "alpha" — the folder "Production" asks for a PIN on every entry in it, and none was given; "beta"/, said);
});

test('importEntities: a declined destination skips only its own entries — the rest of the file is imported', async () => {
  const w = await arrivals({ protectedIn: ['Production'] }, [undefined]);
  const parentId = w.folderId('Production') ?? null;
  const entity = (name: string, folder?: string): ImportedEntity => ({
    name,
    ...(folder === undefined ? {} : { folder }),
    details: { name, isSshEnabled: false },
    secrets: { password: `${SECRET}-${name}` },
  });

  const outcome = await w.importEntities({ accountId: ACCOUNT, parentId }, [entity('direct'), entity('filed', 'Other')]);

  assert.equal(outcome.created, 1);
  assert.deepEqual(outcome.skipped, ['"direct" — the folder "Production" asks for a PIN on every entry in it, and none was given']);
  const [filed] = w.entries();
  assert.equal(filed?.name, 'filed', 'a folder that only HOLDS protected entries does not reach a folder the import makes (§9.1)');
  assert.equal(await w.storage.getPassword(ACCOUNT, filed.id), `${SECRET}-filed`);
});
