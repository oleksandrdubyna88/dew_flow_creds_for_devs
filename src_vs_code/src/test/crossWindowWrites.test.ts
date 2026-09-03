import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as nodePath from 'node:path';
import { TreeNode } from '../types';
import { loadWithVscode } from './vscodeStub';

/**
 * Two windows, one profile — the boundary `SerialQueue` states in its own header and cannot cross.
 *
 * <p>VS Code runs an extension host per WINDOW, and every window of one profile shares a single
 * `globalState` and a single `SecretStorage`. `SerialQueue` serializes the three operations that
 * touch those — applying a bundle, removing an account, and the sweep — within ONE instance. Window A
 * removing an account while window B applies a bundle is serialized by nothing.</p>
 *
 * <p>Both review providers raised this independently during S1.4 and it was deferred on purpose, with
 * one condition written into the plan it was deferred to:
 * <b>"the gap is currently a claim, and a claim about concurrency deserves a reproduction"</b>. This
 * file is that reproduction — step 1 of
 * `research/PLAN_cross_window_write_coordination.md`. The tests below it are the acceptance half:
 * the same interleaving, with the lock, keeping the import.</p>
 *
 * <h3>How it is made deterministic</h3>
 *
 * <p>Not by racing two promises and hoping. The shared memento can be told to PAUSE on one key, which
 * parks window A at a known point inside its removal — between unlisting the account and wiping its
 * secrets — while window B runs a whole import to completion. Every `await` in the removal was always
 * such a point; this one is simply the one a test can name.</p>
 */

interface Storage {
  addNode(accountId: string, node: TreeNode): Promise<void>;
  setPassword(accountId: string, id: string, value: string): Promise<void>;
  getPassword(accountId: string, id: string): Promise<string | undefined>;
  upsertAccount(account: { accountId: string; email: string; provider: string }): Promise<void>;
  getAccounts(): readonly { accountId: string }[];
  removeAccount(accountId: string): Promise<void>;
  importBundle(accountId: string, bundle: unknown): Promise<void>;
  exportBundle(accountId: string): Promise<unknown>;
}

/** One store, two windows — and a gate on one key, which is what makes the interleaving repeatable. */
function sharedMemento(): {
  api: { get<T>(key: string, fallback?: T): T | undefined; update(key: string, value: unknown): Promise<void> };
  pauseOn(key: string): { reached: Promise<void>; release: () => void };
} {
  const map = new Map<string, unknown>();
  const gates = new Map<string, { open: Promise<void>; release: () => void; arrive: () => void }>();
  return {
    api: {
      get: <T>(key: string, fallback?: T): T | undefined => (map.has(key) ? (map.get(key) as T) : fallback),
      update: async (key: string, value: unknown): Promise<void> => {
        const gate = gates.get(key);
        if (gate !== undefined) {
          gates.delete(key);
          gate.arrive();
          await gate.open;
        }
        map.set(key, value !== null && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value);
      },
    },
    pauseOn: (key: string) => {
      let release = (): void => {};
      let arrive = (): void => {};
      const open = new Promise<void>((resolve) => {
        release = resolve;
      });
      const reached = new Promise<void>((resolve) => {
        arrive = resolve;
      });
      gates.set(key, { open, release, arrive });
      return { reached, release };
    },
  };
}

function sharedSecrets(): { api: object; keys: () => string[] } {
  const map = new Map<string, string>();
  return {
    keys: () => [...map.keys()],
    api: {
      get: (k: string) => Promise.resolve(map.get(k)),
      store: (k: string, v: string) => {
        map.set(k, v);
        return Promise.resolve();
      },
      delete: (k: string) => {
        map.delete(k);
        return Promise.resolve();
      },
      onDidChange: () => ({ dispose: () => undefined }),
    },
  };
}

/**
 * Two StorageManagers over ONE memento and ONE keychain: two windows of the same profile.
 *
 * <p>`lockDir` is what makes the difference the whole plan is about. Without it each window has a
 * `SerialQueue` and nothing else, which is what the reproduction below shows costing an import. With
 * it they share a lock directory on the real filesystem — the real `mkdir`, not a fake, because the
 * atomicity of that one call is the entire design.</p>
 */
function twoWindows(lockDir?: string): {
  a: Storage; b: Storage; memento: ReturnType<typeof sharedMemento>; keys: () => string[];
} {
  const { StorageManager } = loadWithVscode<{ StorageManager: new (m: unknown, s: unknown, d?: string) => Storage }>(
    '../storageManager',
    {
      EventEmitter: class {
        event = (): void => {};
        fire(): void {}
      },
      Uri: { file: (p: string): object => ({ fsPath: p }) },
      workspace: { getConfiguration: () => ({ get: (_k: string, d: unknown) => d }) },
      window: { setStatusBarMessage: () => ({ dispose: (): void => undefined }) },
    },
  );
  const memento = sharedMemento();
  const secrets = sharedSecrets();
  return {
    a: new StorageManager(memento.api, secrets.api, lockDir),
    b: new StorageManager(memento.api, secrets.api, lockDir),
    memento,
    keys: secrets.keys,
  };
}

/** A real directory, because the lock's whole claim is about a real `mkdir`. */
function lockDirectory(): string {
  return fs.mkdtempSync(nodePath.join(os.tmpdir(), 'creds-window-lock-'));
}

const ACCOUNT = { accountId: 'acc-1', email: 'a@example.com', provider: 'microsoft' };
const NODE: TreeNode = {
  id: 'e1',
  name: 'a login',
  type: 'entity',
  parentId: null,
  details: { id: 'e1', name: 'a login', isSshEnabled: false, kind: 'credential' },
};

test('two windows of one profile are serialized by NOTHING — the claim, reproduced', async () => {
  const { a, b, memento, keys } = twoWindows();
  await a.upsertAccount(ACCOUNT);
  await a.addNode(ACCOUNT.accountId, NODE);
  await a.setPassword(ACCOUNT.accountId, 'e1', 'the-original');
  const bundle = await b.exportBundle(ACCOUNT.accountId);

  // Window A starts removing the account and is parked between unlisting it and wiping its secrets.
  const gate = memento.pauseOn('credSshManager.defaultsSeeded');
  const removal = a.removeAccount(ACCOUNT.accountId);
  await gate.reached;

  // Window B, which knows nothing about any of that, imports into the same profile and SUCCEEDS.
  await b.importBundle(ACCOUNT.accountId, bundle);
  const importedBeforeTheWipe = await b.getPassword(ACCOUNT.accountId, 'e1');
  assert.equal(importedBeforeTheWipe, 'the-original', 'the import landed — window B was told it worked');

  gate.release();
  await removal;

  // The invariant, stated as the two states that are allowed to exist. Anything else is torn.
  const listed = a.getAccounts().some((account) => account.accountId === ACCOUNT.accountId);
  const survivors = keys().filter((key) => key.includes(ACCOUNT.accountId));
  const torn = listed ? survivors.length === 0 : survivors.length > 0;

  // THIS IS THE REPRODUCTION, and it is deliberately not an assertion that the code is correct: what
  // it pins is WHICH way the interleaving breaks, so that a lease can be judged by whether it closes
  // this and a later change cannot quietly move the damage somewhere else.
  //
  // Observed: the account is gone from the list and window B's import is gone with it — destroyed
  // AFTER B was told it had succeeded. The person's data, silently, with no error on either side.
  assert.equal(listed, false, 'window A finished its removal');
  assert.equal(survivors.length, 0, 'and it wiped what window B had just written');
  assert.equal(
    await b.getPassword(ACCOUNT.accountId, 'e1'),
    undefined,
    'the import window B reported as successful is gone',
  );
  assert.equal(torn, false, 'the end state is at least self-consistent — the loss is silent, not torn');
});

test('the same two operations in ONE window cannot interleave — which is the whole difference', async () => {
  // The control. `SerialQueue` closes this exactly when both operations go through one instance, and
  // the reproduction above is the same pair through two. Without this test the one above would only
  // show that the operations conflict, not that the WINDOW boundary is where the guarantee stops.
  const { a, memento, keys } = twoWindows();
  await a.upsertAccount(ACCOUNT);
  await a.addNode(ACCOUNT.accountId, NODE);
  await a.setPassword(ACCOUNT.accountId, 'e1', 'the-original');
  const bundle = await a.exportBundle(ACCOUNT.accountId);

  const gate = memento.pauseOn('credSshManager.defaultsSeeded');
  const removal = a.removeAccount(ACCOUNT.accountId);
  await gate.reached;
  const anImport = a.importBundle(ACCOUNT.accountId, bundle);
  gate.release();
  await Promise.all([removal, anImport]);

  // Queued behind the removal rather than into the middle of it: the import runs on a wiped account
  // and its data is the state that stands, because it genuinely happened second.
  assert.equal(
    keys().filter((key) => key.includes(ACCOUNT.accountId)).length > 0,
    true,
    'the import ran AFTER the removal instead of inside it',
  );
});

test('WITH the lock, the import is not destroyed — the same interleaving, closed', async () => {
  // The acceptance criterion of the whole plan, and it is the test above with one argument added.
  // Everything else is identical: same seeding, same gate, same key, same two operations.
  const { a, b, memento, keys } = twoWindows(lockDirectory());
  await a.upsertAccount(ACCOUNT);
  await a.addNode(ACCOUNT.accountId, NODE);
  await a.setPassword(ACCOUNT.accountId, 'e1', 'the-original');
  const bundle = await b.exportBundle(ACCOUNT.accountId);

  const gate = memento.pauseOn('credSshManager.defaultsSeeded');
  const removal = a.removeAccount(ACCOUNT.accountId);
  await gate.reached;

  // Window B asks to import while A is parked mid-removal. It does NOT run now: A holds the lock,
  // so B waits — with a notice on the status bar rather than a silent stall — and the promise is
  // still pending when we let A go.
  const theImport = b.importBundle(ACCOUNT.accountId, bundle);
  let finishedEarly = false;
  void theImport.then(() => {
    finishedEarly = true;
  });
  await new Promise((go) => setTimeout(go, 50));
  assert.equal(finishedEarly, false, 'B is waiting for A rather than running inside it');

  gate.release();
  await removal;
  await theImport;

  // B ran AFTER the removal, so what it wrote is what stands — the import the person asked for is
  // there, and it was never reported as successful while doomed.
  assert.equal(
    await b.getPassword(ACCOUNT.accountId, 'e1'),
    'the-original',
    'the import survived, which is the whole point of the lock',
  );
  assert.ok(keys().some((key) => key.includes(ACCOUNT.accountId)), 'and its secret is in the keychain');
});

test('the lock is released even when the operation fails, so one bad save is not a wedged profile', async () => {
  const dir = lockDirectory();
  const { a, b } = twoWindows(dir);
  await a.upsertAccount(ACCOUNT);

  // An import of something that is not a bundle — whatever it does, it must not keep the lock.
  await a.importBundle(ACCOUNT.accountId, { nodes: 'not a list' }).catch(() => undefined);

  await b.upsertAccount({ ...ACCOUNT, accountId: 'acc-2' });
  assert.ok(b.getAccounts().some((account) => account.accountId === 'acc-2'), 'the next window got through');
});
