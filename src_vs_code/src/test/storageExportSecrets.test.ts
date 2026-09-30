import assert from 'node:assert/strict';
import Module from 'node:module';
import { test } from 'node:test';
import { TreeNode } from '../types';
import * as world from './pinWorld';

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

// ---------------------------------------------------------------------------------------------
// Entry-PIN plan, D8: a protected entry's values go into the export OPENED — the envelope is bound to
// this account and could not be opened at the other end — and its login and URL come back, because
// `parseFields` of an envelope is `{}`.
// ---------------------------------------------------------------------------------------------

async function protectedVault(): Promise<import('../storageManager').StorageManager> {
  const storage = world.memoryStorage(world.clickVscode([], world.sinks()));
  const details = { id: 'c1', name: 'godaddy', kind: 'credential', isSshEnabled: false, pinProtected: true } as TreeNode['details'] & object;
  await world.seedEntry(storage, details, {
    password: await world.locked('hunter2'),
    'login and URL': await world.locked('{"login":"me","url":"https://godaddy.com"}'),
    'payment details': await world.locked('{"number":"4111111111111111","cvv":"123"}'),
  });
  return storage;
}

test('a protected entry exports its OPENED values and its login and URL once the door has let it in', async () => {
  const storage = await protectedVault();
  (require('../pinSession') as typeof import('../pinSession')).grantPin(world.ACCOUNT, 'c1', world.PIN);

  const out = await storage.exportSecretsFor(world.ACCOUNT, ['c1']);

  assert.equal(out.c1.password, 'hunter2', 'the export carried the envelope');
  assert.equal(out.c1.login, 'me');
  assert.equal(out.c1.url, 'https://godaddy.com');
  assert.ok(!JSON.stringify(out).includes('"lock"'), 'no envelope in the file');
});

test('a protected value no grant opens is REFUSED — the walk throws rather than export an envelope', async () => {
  const storage = await protectedVault();

  await assert.rejects(storage.exportSecretsFor(world.ACCOUNT, ['c1']), /"c1" is protected with its own PIN/);
});
