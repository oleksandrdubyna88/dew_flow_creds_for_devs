import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EntityFlagTarget, EntityFlagsRefresher, entityFlagSource } from '../entityFlags';
import { fingerprintOf, waitingKeys } from '../rotationQuarantine';
import type { StorageManager } from '../storageManager';
import { EntityMetadata, TreeElement, TreeNode } from '../types';
import { loadEachWithVscode, loadWithVscode } from './vscodeStub';
import { ACCOUNT, Sinks, clickVscode, memoryStorage, seedEntry, sinks, stored } from './pinWorld';

/**
 * The person sees a rotated value that waits for its entry's PIN (`todo/PLAN_rotation_quarantine.md` §4.6,
 * Q6): the tree says so on the row and says how to store it, and a permanent deletion names what it would
 * lose. Over the REAL `StorageManager`.
 */

const CONN = 'mysql://app:old-password-9f2c@db-01.example.internal:3306/orders';
const HELD_CONN = 'mysql://app:HELD-rotated-77ab@db-01.example.internal:3306/orders';

const db = (id: string, name: string): EntityMetadata => ({ id, name, kind: 'db', isSshEnabled: false, dbType: 'mysql' }) as EntityMetadata;

/** A vault with `orders-db` holding a rotated connection string beside it, and `plain-db` holding none. */
async function vault(s: Sinks = sinks()): Promise<StorageManager> {
  const storage = memoryStorage(clickVscode([], s));
  await seedEntry(storage, db('db1', 'orders-db'), { 'database connection': CONN });
  await seedEntry(storage, db('db2', 'plain-db'), { 'database connection': CONN });
  await storage.heldRotations.list(ACCOUNT, 'db1');
  await storage.heldRotations.put(ACCOUNT, 'db1', { dbConnection: { value: stored(HELD_CONN), at: 1_000, was: fingerprintOf(CONN) } });
  return storage;
}

function target(): EntityFlagTarget {
  return { historyById: new Map(), passwordIds: new Set(), urlIds: new Set(), invalidConfigIds: new Set(), waitingIds: new Set(), refresh: () => undefined };
}

test('the flags walk names the entry with a value waiting, and drops index entries whose item or entry is gone', async () => {
  const storage = await vault();
  await storage.heldRotations.list(ACCOUNT, 'db2');
  await storage.heldRotations.list(ACCOUNT, 'gone');
  const flags = target();

  await new EntityFlagsRefresher(entityFlagSource(storage), flags, () => waitingKeys(storage)).refresh();

  assert.deepEqual([...flags.waitingIds], [`${ACCOUNT}:db1`], 'the tree does not say which entry has a rotated value waiting');
  assert.deepEqual(await storage.heldRotations.listed(), [{ accountId: ACCOUNT, entityId: 'db1' }], 'a stale index entry survived the walk');
});

// ---- the row ----

class FakeTreeItem {
  description?: string;
  tooltip?: { value: string };
  contextValue?: string;
  iconPath?: unknown;
  command?: unknown;
  constructor(readonly label: string) {}
}

interface Provider {
  readonly waitingIds: Set<string>;
  getTreeItem(element: TreeElement): FakeTreeItem | Promise<FakeTreeItem>;
}

function provider(nodes: TreeNode[]): Provider {
  const stub = {
    ...clickVscode([], sinks()),
    TreeItem: FakeTreeItem,
    MarkdownString: class {
      supportThemeIcons = false;
      value = '';
      appendText(text: string): void {
        this.value += text;
      }
    },
    Uri: { joinPath: (...parts: unknown[]): object => ({ parts }), from: (parts: unknown): object => ({ parts }) },
  };
  const { CredTreeDataProvider } = loadWithVscode<{ CredTreeDataProvider: new (storage: unknown, uri: unknown) => Provider }>('../treeDataProvider', stub);
  const storage = {
    getAccounts: () => [{ accountId: ACCOUNT, email: 'me@example.com', provider: 'google' }],
    getAccount: () => undefined,
    getNodes: () => nodes,
    getNode: (_a: string, id: string) => nodes.find((n) => n.id === id),
    getChildren: () => nodes,
  };
  return new CredTreeDataProvider(storage, { fsPath: '/ext' });
}

const described = (item: FakeTreeItem): string => item.description ?? '';
const tipOf = (item: FakeTreeItem): string => item.tooltip?.value ?? '';

const row = (id: string, name: string, details: EntityMetadata): TreeNode => ({ id, name, type: 'entity', parentId: null, details });

test('the row of an entry with a rotated value waiting says so, and its tooltip says how to store it', async () => {
  const orders = row('db1', 'orders-db', db('db1', 'orders-db'));
  const login = row('c1', 'portal', { id: 'c1', name: 'portal', kind: 'credential', isSshEnabled: false } as EntityMetadata);
  const tree = provider([orders, login]);
  tree.waitingIds.add(`${ACCOUNT}:db1`);
  tree.waitingIds.add(`${ACCOUNT}:c1`);

  const item = await tree.getTreeItem({ kind: 'node', accountId: ACCOUNT, node: orders });
  const other = await tree.getTreeItem({ kind: 'node', accountId: ACCOUNT, node: login });

  assert.match(described(item), /rotated connection string waiting/, 'the row does not say a rotated value is waiting');
  assert.match(tipOf(item), /open the entry and enter its PIN to store it/);
  assert.match(described(other), /rotated password waiting/);
});

test('a row with nothing waiting says nothing about it', async () => {
  const orders = row('db1', 'orders-db', db('db1', 'orders-db'));

  const item = await provider([orders]).getTreeItem({ kind: 'node', accountId: ACCOUNT, node: orders });

  assert.doesNotMatch(`${described(item)} ${tipOf(item)}`, /waiting/);
});

// ---- a permanent deletion names what it would lose (the owner's answer to the plan's open question 1) ----

type Handler = (...args: unknown[]) => unknown;

/** The REAL tree mutation commands over the real storage, every modal dismissed. */
function commands(storage: StorageManager, s: Sinks): Map<string, Handler> {
  const [{ registerTreeMutationCommands }] = loadEachWithVscode(['../commands/treeMutationCommands'], clickVscode([], s)) as [
    typeof import('../commands/treeMutationCommands'),
  ];
  const handlers = new Map<string, Handler>();
  registerTreeMutationCommands({
    announceArrival: () => Promise.resolve(),
    log: undefined as never,
    doorsFor: (() => undefined) as never,
    mutated: () => undefined,
    policyOf: () => undefined,
    register: (command, handler) => handlers.set(command, handler),
    storage,
    transports: undefined as never,
    vaultKeys: undefined as never,
  });
  return handlers;
}

const detailOf = (s: Sinks, index: number): string => s.modalDetails[index] ?? '(no modal)';

const LOST = '"orders-db" holds a rotated connection string that was never stored; deleting it permanently loses the only copy.';

test('Delete on an entry with a rotated value waiting names the copy a permanent deletion loses', async () => {
  const s = sinks();
  const storage = await vault(s);

  await commands(storage, s).get('credSshManager.deleteNode')?.({ kind: 'node', accountId: ACCOUNT, node: storage.getNode(ACCOUNT, 'db1') });

  assert.ok(detailOf(s, 0).includes(LOST), `the confirmation did not name the only copy: ${detailOf(s, 0)}`);
  assert.ok((await storage.heldRotations.read(ACCOUNT, 'db1')).dbConnection !== undefined, 'a dismissed confirmation deleted something');
});

test('Empty Trash with such an entry inside names it too; one with nothing waiting adds nothing', async () => {
  const s = sinks();
  const storage = await vault(s);
  const trash = await storage.ensureTrash(ACCOUNT);
  await storage.moveToTrash(ACCOUNT, 'db1');
  const handlers = commands(storage, s);

  await handlers.get('credSshManager.emptyTrash')?.({ kind: 'node', accountId: ACCOUNT, node: trash });
  await handlers.get('credSshManager.deleteNode')?.({ kind: 'node', accountId: ACCOUNT, node: storage.getNode(ACCOUNT, 'db2') });

  assert.ok(detailOf(s, 0).includes(LOST), `Empty Trash did not name the only copy: ${detailOf(s, 0)}`);
  assert.doesNotMatch(detailOf(s, 1), /rotated/, 'a deletion with nothing waiting talks about a rotated value');
});

// ---- security review, finding 7b: Burn Now is a permanent deletion too ----

/** `orders-db` with a lifetime — the one shape *Burn Now…* is offered on — and a rotated connection string waiting beside it. */
async function burnable(s: Sinks): Promise<StorageManager> {
  const storage = memoryStorage(clickVscode([], s));
  await seedEntry(storage, { ...db('db1', 'orders-db'), burnPolicy: 'ttl', expiresAt: Date.now() + 3600_000 }, { 'database connection': CONN });
  await storage.heldRotations.list(ACCOUNT, 'db1');
  await storage.heldRotations.put(ACCOUNT, 'db1', { dbConnection: { value: stored(HELD_CONN), at: 1_000, was: fingerprintOf(CONN) } });
  return storage;
}

const modalOf = (s: Sinks, index: number): string => s.modals[index] ?? '(no modal)';

test('Burn Now on an entry with a rotated value waiting names the only copy, in the words Delete uses', async () => {
  const s = sinks();
  const storage = await burnable(s);
  const { runBurnNow } = loadWithVscode<typeof import('../burnNowCommand')>('../burnNowCommand', clickVscode([], s));

  await runBurnNow({ kind: 'node', accountId: ACCOUNT, node: storage.getNode(ACCOUNT, 'db1') as TreeNode }, storage, () => undefined);

  assert.ok(modalOf(s, 0).includes(LOST), `Burn Now did not name the only copy: ${modalOf(s, 0)}`);
  assert.ok(storage.getNode(ACCOUNT, 'db1') !== undefined, 'a dismissed confirmation burned the entry');
});
