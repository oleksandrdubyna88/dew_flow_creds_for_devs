import assert from 'node:assert/strict';
import Module from 'node:module';
import { test } from 'node:test';
import { TreeNode } from '../types';
import { isSealedMetadata } from '../metadataCipher';

/**
 * The node tree at rest is ciphertext.
 *
 * <p>`globalState` is a plain SQLite file in the VS Code profile; until 0.57.0 it held the
 * whole topology — hosts, users, CLI arguments, env-variable names — in the clear, keychain or
 * no keychain. These tests pin the migration and the failure modes: plaintext slots are sealed
 * on init, reads round-trip, a lost device key yields an empty tree plus one honest sentence —
 * and never a migration write over a slot it could not read.</p>
 */

interface Storage {
  init(): Promise<void>;
  metadataFault: string | undefined;
  getNodes(accountId: string): readonly TreeNode[];
  addNode(accountId: string, node: TreeNode): Promise<void>;
}

const StorageCtor = ((): new (memento: unknown, secrets: unknown) => Storage => {
  const loader = Module as unknown as { _load(request: string, ...rest: unknown[]): unknown };
  const original = loader._load;
  loader._load = function patched(request: string, ...rest: unknown[]): unknown {
    if (request === 'vscode') {
      return {
        EventEmitter: class {
          event = (): void => {};
          fire(): void {}
        },
        Uri: { file: (p: string): object => ({ fsPath: p }) },
        workspace: { getConfiguration: () => ({ get: (_k: string, d: unknown) => d }) },
      };
    }
    return original.call(this, request, ...rest);
  };
  try {
    return (require('../storageManager') as { StorageManager: never }).StorageManager as never;
  } finally {
    loader._load = original;
  }
})();

function memento(seed: Record<string, unknown> = {}): {
  get<T>(key: string, fallback?: T): T | undefined;
  update(key: string, value: unknown): Promise<void>;
  raw(key: string): unknown;
} {
  const map = new Map<string, unknown>(Object.entries(seed));
  return {
    get: <T>(key: string, fallback?: T): T | undefined =>
      map.has(key) ? (map.get(key) as T) : fallback,
    update: (key, value) => {
      map.set(key, value);
      return Promise.resolve();
    },
    raw: (key) => map.get(key),
  };
}

function secretsStore(): {
  get(k: string): Promise<string | undefined>;
  store(k: string, v: string): Promise<void>;
  delete(k: string): Promise<void>;
  onDidChange(): { dispose(): void };
} {
  const map = new Map<string, string>();
  return {
    get: (k) => Promise.resolve(map.get(k)),
    store: (k, v) => {
      map.set(k, v);
      return Promise.resolve();
    },
    delete: (k) => {
      map.delete(k);
      return Promise.resolve();
    },
    onDidChange: () => ({ dispose: () => {} }),
  };
}

const ACCOUNT = { accountId: 'a1', email: 'one@example.com', provider: 'microsoft' };
const NODES_SLOT = 'credSshManager.nodes.a1';
const LEGACY_TREE: TreeNode[] = [
  {
    id: 'e1',
    name: 'prod api',
    type: 'entity',
    details: { id: 'e1', name: 'prod api', isSshEnabled: true, host: 'api.example.com', user: 'deploy' },
  },
];

const seeded = () =>
  memento({ 'credSshManager.accounts': [ACCOUNT], [NODES_SLOT]: LEGACY_TREE });

test('init seals a legacy plaintext slot, and the tree still reads back', async () => {
  const state = seeded();
  const storage = new StorageCtor(state, secretsStore());
  await storage.init();

  const raw = state.raw(NODES_SLOT);
  assert.ok(isSealedMetadata(raw), 'the slot now holds ciphertext');
  assert.equal(JSON.stringify(raw).includes('api.example.com'), false, 'no host in the stored bytes');
  assert.equal(JSON.stringify(raw).includes('deploy'), false, 'no user either');
  assert.equal(storage.getNodes('a1')[0]?.name, 'prod api', 'and the tree is unchanged for the reader');
  assert.equal(storage.metadataFault, undefined);
});

test('a second instance over the same profile opens what the first one sealed', async () => {
  const state = seeded();
  const secrets = secretsStore();
  const first = new StorageCtor(state, secrets);
  await first.init();

  const second = new StorageCtor(state, secrets);
  await second.init();
  assert.equal(second.getNodes('a1')[0]?.name, 'prod api');
  assert.equal(second.metadataFault, undefined);
});

test('every write after init lands sealed', async () => {
  const state = memento({ 'credSshManager.accounts': [ACCOUNT] });
  const storage = new StorageCtor(state, secretsStore());
  await storage.init();
  await storage.addNode('a1', LEGACY_TREE[0]);

  assert.ok(isSealedMetadata(state.raw(NODES_SLOT)), 'addNode wrote ciphertext');
  assert.equal(storage.getNodes('a1').length, 1);
});

test('a lost device key is an empty tree and one honest sentence — never an overwrite', async () => {
  const state = seeded();
  const first = new StorageCtor(state, secretsStore());
  await first.init();
  const sealed = state.raw(NODES_SLOT);

  // A fresh keychain: the key is gone, a NEW one is minted. The sealed slot cannot open.
  const second = new StorageCtor(state, secretsStore());
  await second.init();

  assert.deepEqual(second.getNodes('a1'), [], 'unreadable cache reads as empty, not as a throw');
  assert.ok(second.metadataFault?.includes('device key'), second.metadataFault);
  assert.equal(state.raw(NODES_SLOT), sealed, 'migration never rewrote a slot it could not read');
});

test('without init the legacy plaintext path still round-trips (pure unit-test mode)', async () => {
  const state = memento({ 'credSshManager.accounts': [ACCOUNT] });
  const storage = new StorageCtor(state, secretsStore());
  await storage.addNode('a1', LEGACY_TREE[0]);

  assert.equal(Array.isArray(state.raw(NODES_SLOT)), true, 'no key loaded — plaintext, as before 0.57');
  assert.equal(storage.getNodes('a1')[0]?.name, 'prod api');
});
