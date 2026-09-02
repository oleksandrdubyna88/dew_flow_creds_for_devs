import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadWithVscode } from './vscodeStub';
import type { StoredAccount, TreeNode } from '../types';

/**
 * A killed account removal, finished by the next window — through the real `StorageManager`.
 *
 * <p>`accountRemoval.test.ts` covers the arithmetic of finding the leftovers. This one simulates the
 * crash: the keychain refuses a delete part-way through the wipe, `removeAccount` rejects, and the
 * next window's sweep has to finish what it started. Both providers of the S1.4 review raised the
 * unfinished removal independently, so it gets a test that actually interrupts one.</p>
 */

interface Storage {
  upsertAccount(account: StoredAccount): Promise<void>;
  addNode(accountId: string, node: TreeNode): Promise<void>;
  removeAccount(accountId: string): Promise<void>;
  resumeAccountRemovals(): Promise<readonly string[]>;
  getAccounts(): readonly StoredAccount[];
  getNodes(accountId: string): readonly TreeNode[];
  setPassword(accountId: string, id: string, value: string | undefined): Promise<void>;
}

/** A memento that can enumerate — which is what makes the leftovers findable at all. */
function memento(): object {
  const map = new Map<string, unknown>();
  return {
    keys: () => [...map.keys()],
    get: <T>(key: string, fallback?: T): T | undefined => (map.has(key) ? (map.get(key) as T) : fallback),
    update: (key: string, value: unknown): Promise<void> => {
      if (value === undefined) {
        map.delete(key);
      } else {
        map.set(key, JSON.parse(JSON.stringify(value)));
      }
      return Promise.resolve();
    },
  };
}

/** A keychain that can be made to refuse, once, at the moment a crash would have hit. */
function secrets(): { map: Map<string, string>; failNextDelete: boolean; store: object } {
  const map = new Map<string, string>();
  const self = {
    map,
    failNextDelete: false,
    store: {
      keys: () => [...map.keys()],
      get: (k: string) => Promise.resolve(map.get(k)),
      store: (k: string, v: string) => {
        map.set(k, v);
        return Promise.resolve();
      },
      delete: (k: string) => {
        if (self.failNextDelete) {
          self.failNextDelete = false;
          return Promise.reject(new Error('the keychain was locked mid-wipe'));
        }
        map.delete(k);
        return Promise.resolve();
      },
      onDidChange: () => {},
    },
  };
  return self;
}

function machine(): { storage: Storage; chain: ReturnType<typeof secrets> } {
  const { StorageManager } = loadWithVscode<{ StorageManager: new (m: unknown, s: unknown) => Storage }>(
    '../storageManager',
    {
      EventEmitter: class {
        event = (): void => {};
        fire(): void {}
      },
      Uri: { file: (p: string): object => ({ fsPath: p }) },
      workspace: { getConfiguration: () => ({ get: (_k: string, d: unknown) => d }) },
    },
  );
  const chain = secrets();
  return { storage: new StorageManager(memento(), chain.store), chain };
}

const A = 'acct-1';

function entity(id: string): TreeNode {
  return { id, name: id, type: 'entity', parentId: null, details: { id, name: id, isSshEnabled: false } };
}

async function populated(): Promise<{ storage: Storage; chain: ReturnType<typeof secrets> }> {
  const m = machine();
  await m.storage.upsertAccount({ accountId: A, email: 'a@b.c', provider: 'google' as never });
  for (const id of ['e1', 'e2', 'e3']) {
    await m.storage.setPassword(A, id, `pw-${id}`);
    await m.storage.addNode(A, entity(id));
  }
  return m;
}

test('a removal interrupted mid-wipe still leaves the account gone from the list', async () => {
  const { storage, chain } = await populated();
  chain.failNextDelete = true;

  await assert.rejects(() => storage.removeAccount(A));

  assert.deepEqual(storage.getAccounts(), [], 'unlisted FIRST — so nothing syncs it and no UI shows it');
  assert.ok(chain.map.size > 0, 'and secrets are still there, which is the state to be finished');
});

test('the next window finishes it: every secret gone, nothing left to find', async () => {
  const { storage, chain } = await populated();
  chain.failNextDelete = true;
  await assert.rejects(() => storage.removeAccount(A));

  const finished = await storage.resumeAccountRemovals();

  assert.deepEqual(finished, [A], 'the leftover named itself, with no marker written anywhere');
  assert.deepEqual([...chain.map.keys()], [], 'every secret the tree named is gone');
  assert.deepEqual(storage.getNodes(A), [], 'and so is the tree that named them');
});

test('the resume is idempotent — running it twice is running it once', async () => {
  const { storage, chain } = await populated();
  chain.failNextDelete = true;
  await assert.rejects(() => storage.removeAccount(A));

  await storage.resumeAccountRemovals();
  const second = await storage.resumeAccountRemovals();

  assert.deepEqual(second, [], 'nothing is left over the second time');
  assert.deepEqual([...chain.map.keys()], []);
});

test('a healthy install has nothing to resume, and a live account is never touched', async () => {
  const { storage, chain } = await populated();

  assert.deepEqual(await storage.resumeAccountRemovals(), []);
  assert.equal(chain.map.size, 3, 'the live account keeps every secret it has');
  assert.equal(storage.getNodes(A).length, 3);
});

test('a clean removal leaves nothing for the resume to do', async () => {
  const { storage, chain } = await populated();

  await storage.removeAccount(A);

  assert.deepEqual([...chain.map.keys()], []);
  assert.deepEqual(await storage.resumeAccountRemovals(), [], 'the happy path needs no follow-up');
});
