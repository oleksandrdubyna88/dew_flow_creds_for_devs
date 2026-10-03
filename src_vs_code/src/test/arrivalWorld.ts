import assert from 'node:assert/strict';
import { sealShare } from '../shareFormat';
import { isLockedSecret, readSecret, unlockSecret } from '../secretEnvelope';
import type { StorageManager } from '../storageManager';
import { StoredSecret, stored } from '../storedSecret';
import type { EntityMetadata, OwnedShare, SharePayload, StoredAccount, TreeNode } from '../types';
import type { ImportedEntity } from '../importFormats';
import type { ImportOutcome, NodeLocation } from '../importCommands';
import { loadEachWithVscode } from './vscodeStub';
import { ACCOUNT, Sinks, clickVscode, locked, memoryStorage, sinks } from './pinWorld';

/**
 * The arrival world — the real `ShareInbox` and the registered import commands over the real
 * `StorageManager` with every keychain write logged — shared by `arrivalPin.test.ts` and
 * `arrivalPinReview.test.ts` (`PLAN_pin_folder_asks_on_accept_and_import.md`). Moved out of the first
 * file verbatim when the security review's tests needed a second one; not named `*.test.ts`, so the runner
 * never treats it as a suite.
 */

export const TRANSIT = 'transit-pin-1111';
export const SECRET = 'pw-arriving-in-the-clear';
export const NOTE = 'a note arriving with it';
export const FIRST_PIN = '2468';
const SENDER: StoredAccount = { accountId: 'acc-bob', email: 'bob@corp.com', provider: 'google' };
const KEY_ID = 'my-share-key-id';
/** The title of the box that asks a folder's PIN against its protected entries (`pinOnCreate.askAndCheck`). */
export const FOLDER_BOX = /entries are protected/;

type Inbox = { acceptOne(share: OwnedShare): Promise<void>; acceptMany(items: OwnedShare[]): Promise<void> };

export interface Arrivals {
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
  /**
   * Answer every box whose title matches `title` with `answer` instead of the queue — an `Error` makes the
   * box REJECT. For a conversation whose order is the thing under test, where a queue would answer the
   * wrong box.
   */
  boxRule(title: RegExp, answer: string | undefined | Error): void;
  folderId(name: string): string | undefined;
  /** Run a registered import command on the named folder, its file picker answering `path` holding `text`. */
  importInto(command: string, folder: string, path: string, text: string): Promise<void>;
  /** The import's own entry point, with the question bound the way the command binds it. */
  importEntities(location: NodeLocation, entities: readonly ImportedEntity[]): Promise<ImportOutcome>;
  /** The entries the arrivals made — the protected siblings of the setup excluded. */
  entries(): TreeNode[];
}

export interface Setup {
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

/** A box answered by its title rather than from the queue (`Arrivals.boxRule`). */
type BoxRule = readonly [RegExp, string | undefined | Error];

/** The answer a rule gives this box, or nothing when no rule matches it. */
function ruledAnswer(rules: readonly BoxRule[], title: string): { readonly answer: Promise<string | undefined> } | undefined {
  const rule = rules.find(([match]) => match.test(title));
  if (rule === undefined) {
    return undefined;
  }
  return { answer: rule[1] instanceof Error ? Promise.reject(rule[1]) : Promise.resolve(rule[1]) };
}

/** From inside the folder's PIN box, the second window's probe runs — "no lease across a box". */
async function probedIfFolderBox(title: string, probe: () => Promise<void>): Promise<void> {
  if (FOLDER_BOX.test(title)) {
    await probe();
  }
}

/** The file an import command's picker answers, and what reading it returns. */
interface PickedFile {
  path: string;
  text: string;
}

/** The `vscode` the accept and import paths touch: `pinWorld`'s sinks, a server location, a picked file, and an event log. */
function arrivalVscode(inputs: (string | undefined)[], s: Sinks, events: string[], probe: () => Promise<void>, picked: PickedFile, rules: readonly BoxRule[] = []): Record<string, unknown> {
  const stub = clickVscode(inputs, s);
  const window = stub.window as Record<string, (...args: never[]) => unknown>;
  const box = window.showInputBox as unknown as (options: { title?: string }, token?: unknown) => Promise<string | undefined>;
  const warn = window.showWarningMessage as unknown as (message: string, options?: { modal?: boolean }, ...buttons: string[]) => Promise<string | undefined>;
  window.showInputBox = (async (options: { title?: string }, token?: unknown) => {
    const title = options.title ?? '';
    events.push(`box:${title}`);
    await probedIfFolderBox(title, probe);
    return (ruledAnswer(rules, title) ?? { answer: box(options, token) }).answer;
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

export async function arrivals(setup: Setup, inputs: (string | undefined)[]): Promise<Arrivals> {
  const s = sinks();
  const queue = [...inputs];
  const events: string[] = [];
  const probes: string[] = [];
  const written: string[] = [];
  let second: StorageManager | undefined;
  const probe = (): Promise<string> => second?.writes.runOrSkip(() => Promise.resolve('ran'), () => 'skipped') ?? Promise.resolve('no second window');
  const picked: PickedFile = { path: '', text: '' };
  const rules: BoxRule[] = [];
  const stub = arrivalVscode(queue, s, events, async () => {
    probes.push(await probe());
  }, picked, rules);
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
    boxRule: (title, answer) => void rules.unshift([title, answer]),
    folderId: (name) => storage.getNodes(ACCOUNT).find((n) => n.type === 'folder' && n.name === name)?.id,
    importInto: async (command, folder, path, text) => {
      Object.assign(picked, { path, text });
      // No folder name: the command runs on the account itself, so the import lands at the root.
      const node = storage.getNodes(ACCOUNT).find((n) => n.type === 'folder' && n.name === folder);
      await handlers.get(command)?.(folder === '' ? { kind: 'account', account: storage.getAccount(ACCOUNT) } : { kind: 'node', accountId: ACCOUNT, node });
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
export function folderShare(name: string, chain: readonly string[], over: Partial<EntityMetadata> = {}, senderId = `sender-${name}`): SharePayload {
  return {
    node: { id: senderId, name, type: 'entity', parentId: null, details: { id: senderId, name, isSshEnabled: false, ...over } as EntityMetadata },
    secrets: { password: `${SECRET}-${name}`, notes: `${NOTE}-${name}` },
    ...(chain.length > 0 ? { folderPath: chain.map((folder) => ({ name: folder, folderType: 'any' as const })) } : {}),
  };
}

export function owned(payload: SharePayload, transit: string = TRANSIT): OwnedShare {
  return { accountId: ACCOUNT, shareKeyId: KEY_ID, item: sealShare(payload, KEY_ID, SENDER, transit, 1_756_000_000_000, { toEmail: 'me@example.com' }) };
}

/** Rule R3: every value the keychain saw is an envelope, and none carries an arriving plaintext. */
export function neverInTheClear(w: Arrivals): void {
  assert.ok(w.written.length > 0, 'precondition: something was written');
  for (const value of w.written) {
    assert.ok(!value.includes(SECRET) && !value.includes(NOTE), `the keychain was handed the arriving password in the clear: ${value}`);
    assert.ok(isLockedSecret(stored(value)), `a value written unsealed: ${value}`);
  }
}

/** A slot that must be SEALED — opened with `pin`, or the assertion names what is stored. */
export async function opened(value: StoredSecret | undefined, pin: string): Promise<string> {
  const read = readSecret(value);
  assert.equal(read.kind, 'locked', `stored in the clear: ${String(value)}`);
  return read.kind === 'locked' ? unlockSecret(read.envelope, ACCOUNT, pin) : '';
}

export async function sealedUnder(w: Arrivals, entry: TreeNode, pin: string): Promise<void> {
  assert.equal(entry.details?.pinProtected, true, `"${entry.name}" carries no mark`);
  assert.equal(entry.pinEpoch, 1, `"${entry.name}" carries no first protection decision`);
  assert.equal(await opened(await w.storage.getPassword(ACCOUNT, entry.id), pin), `${SECRET}-${entry.name}`, 'the PIN opens what was sealed');
  assert.equal(await opened(await w.storage.getNotes(ACCOUNT, entry.id), pin), `${NOTE}-${entry.name}`);
}

export function boxes(w: Arrivals, title: RegExp): number {
  return w.events.filter((e) => e.startsWith('box:') && title.test(e)).length;
}

export function infos(w: Arrivals): string {
  return w.s.infos.join(' | ');
}
