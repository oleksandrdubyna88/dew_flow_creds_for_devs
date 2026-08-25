import assert from 'node:assert/strict';
import Module from 'node:module';
import { test } from 'node:test';
import { TreeNode } from '../types';

/**
 * `StorageManager.exportSecretsFor` (audit 2026-08-25, A1): the one walk the external
 * export uses instead of a hand-rolled seven-kind loop beside `exportBundle`'s. What is
 * asserted: every kind an entity has is present, every kind it lacks is ABSENT (not
 * undefined — the exported JSON must not carry noise keys), and ids without secrets still
 * appear so the bundle's shape mirrors the picked entities.
 */

interface Storage {
  addNode(accountId: string, node: TreeNode): Promise<void>;
  setPassword(accountId: string, id: string, value: string): Promise<void>;
  setNotes(accountId: string, id: string, value: string): Promise<void>;
  setPrivateKey(accountId: string, id: string, value: string): Promise<void>;
  exportSecretsFor(accountId: string, ids: readonly string[]): Promise<Record<string, Record<string, string>>>;
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

function memento(): object {
  const map = new Map<string, unknown>();
  return {
    get: <T>(key: string, fallback?: T): T | undefined => (map.has(key) ? (map.get(key) as T) : fallback),
    update: (key: string, value: unknown): Promise<void> => {
      map.set(key, value !== null && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value);
      return Promise.resolve();
    },
  };
}

function secrets(): object {
  const map = new Map<string, string>();
  return {
    get: (k: string) => Promise.resolve(map.get(k)),
    store: (k: string, v: string) => {
      map.set(k, v);
      return Promise.resolve();
    },
    delete: (k: string) => {
      map.delete(k);
      return Promise.resolve();
    },
    onDidChange: () => ({ dispose(): void {} }),
  };
}

test('present kinds are exported, absent kinds are ABSENT, empty entities still appear', async () => {
  const storage = new StorageCtor(memento(), secrets());
  const entity = (id: string): TreeNode => ({
    id,
    name: id,
    type: 'entity',
    parentId: null,
    details: { id, name: id, isSshEnabled: false },
  });
  await storage.addNode('acc', entity('rich'));
  await storage.addNode('acc', entity('bare'));
  await storage.setPassword('acc', 'rich', 'pw');
  await storage.setPrivateKey('acc', 'rich', 'key-material');
  await storage.setNotes('acc', 'rich', 'a note');

  const out = await storage.exportSecretsFor('acc', ['rich', 'bare']);

  assert.deepEqual(out.rich, { password: 'pw', privateKey: 'key-material', notes: 'a note' });
  assert.deepEqual(Object.keys(out.rich).includes('vpnConfig'), false, 'no undefined-valued keys');
  assert.deepEqual(out.bare, {}, 'an entity without secrets still has its slot');
  assert.deepEqual(Object.keys(out).sort(), ['bare', 'rich']);
});
