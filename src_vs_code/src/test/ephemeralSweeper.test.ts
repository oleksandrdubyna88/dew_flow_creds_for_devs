import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EphemeralSweeper, SweepStorage } from '../ephemeralSweeper';
import { LEASE_MS, leaseKey } from '../ephemeralLease';
import { BurnPolicy } from '../entityExpiry';
import { StoredAccount, TreeNode } from '../types';

/**
 * The sweep, driven by an injected clock so "an hour later" is a number rather than a wait.
 *
 * <p>What these mostly pin is what must NOT be deleted: the sweep's whole job is destroying
 * vault entries, so every case where it declines is a case where somebody keeps a credential
 * they still need.</p>
 */

const NOW = 1_700_000_000_000;
const LEASE_STATE_KEY = 'credSshManager.ephemeralLeases';
const ACCOUNT = { accountId: 'a1', email: 'one@example.com', provider: 'microsoft' } as StoredAccount;

function entity(id: string, extra: { expiresAt?: number; burnPolicy?: BurnPolicy } = {}): TreeNode {
  return {
    id,
    name: id,
    type: 'entity',
    details: { id, name: id, isSshEnabled: false, ...extra },
  } as TreeNode;
}

class FakeMemento {
  private store = new Map<string, unknown>();
  get<T>(key: string, fallback: T): T {
    return (this.store.get(key) as T) ?? fallback;
  }
  update(key: string, value: unknown): Promise<void> {
    this.store.set(key, value);
    return Promise.resolve();
  }
  keys(): readonly string[] {
    return [...this.store.keys()];
  }
}

interface Harness {
  sweeper: EphemeralSweeper;
  deleted: string[];
  memento: FakeMemento;
  readonly refreshes: number;
}

function harness(
  nodes: TreeNode[],
  options: { fault?: string; memento?: FakeMemento; failOn?: string } = {},
): Harness {
  const deleted: string[] = [];
  const memento = options.memento ?? new FakeMemento();
  let refreshes = 0;
  const storage: SweepStorage = {
    metadataFault: options.fault,
    getAccounts: () => [ACCOUNT],
    getNodes: () => nodes,
    sweepOrphanSecrets: () => Promise.resolve({ deleted: 0, checked: 0 }),
    resumeAccountRemovals: () => Promise.resolve([]),
    deleteNodeRecursive: (_a, id) => {
      if (id === options.failOn) {
        return Promise.reject(new Error('keychain busy'));
      }
      deleted.push(id);
      return Promise.resolve([id]);
    },
  };
  return {
    sweeper: new EphemeralSweeper(
      storage,
      memento as never,
      () => {},
      () => {
        refreshes += 1;
      },
    ),
    deleted,
    memento,
    get refreshes() {
      return refreshes;
    },
  };
}

test('an entry whose clock has run out is deleted', async () => {
  const h = harness([entity('gone', { expiresAt: NOW - 1, burnPolicy: 'ttl' })]);

  const outcome = await h.sweeper.runOnce(NOW);

  assert.deepEqual(outcome.expired, ['gone']);
  assert.deepEqual(h.deleted, ['gone']);
});

test('an entry with time left is left alone', async () => {
  const h = harness([entity('later', { expiresAt: NOW + 60_000, burnPolicy: 'ttl' })]);

  await h.sweeper.runOnce(NOW);

  assert.deepEqual(h.deleted, []);
});

test('an ordinary entry is never touched, however long it has existed', async () => {
  const h = harness([entity('permanent')]);

  await h.sweeper.runOnce(NOW + 10 * 365 * 24 * 3600_000);

  assert.deepEqual(h.deleted, []);
});

test('a window-scoped entry survives while a window keeps renewing it', async () => {
  const h = harness([entity('scoped', { burnPolicy: 'onClose' })]);

  await h.sweeper.runOnce(NOW); // adopted
  await h.sweeper.runOnce(NOW + 60_000);
  await h.sweeper.runOnce(NOW + 120_000);

  assert.deepEqual(h.deleted, [], 'renewal keeps it alive');
});

test('a window-scoped entry left by a dead window is swept at the next start', async () => {
  // The crash case, and the reason this is a lease rather than a close handler: nobody ran
  // any code at all when that window died.
  const memento = new FakeMemento();
  const first = harness([entity('scoped', { burnPolicy: 'onClose' })], { memento });
  await first.sweeper.runOnce(NOW); // the window that created it vouched once, then died

  const next = harness([entity('scoped', { burnPolicy: 'onClose' })], { memento });
  const outcome = await next.sweeper.runOnce(NOW + LEASE_MS + 1);

  assert.deepEqual(outcome.orphaned, ['scoped']);
  assert.deepEqual(next.deleted, ['scoped']);
});

test('an entry arriving from another machine is adopted, not destroyed on sight', async () => {
  // It has no lease here and never will have had one; deleting the unleased would wipe the
  // other laptop's live entry the moment it synced in.
  const h = harness([entity('fromElsewhere', { burnPolicy: 'onClose' })]);

  await h.sweeper.runOnce(NOW);

  assert.deepEqual(h.deleted, []);
});

test('a metadata fault stops the sweep entirely rather than deleting on a bad reading', async () => {
  // Fail closed, exactly as SyncManager does: when the node list cannot be trusted, "expired"
  // and "unreadable" look the same, and one of those two answers destroys data.
  const h = harness([entity('gone', { expiresAt: NOW - 1, burnPolicy: 'ttl' })], {
    fault: 'sealed slot did not open',
  });

  const outcome = await h.sweeper.runOnce(NOW);

  assert.deepEqual(h.deleted, []);
  assert.deepEqual(outcome.expired, []);
});

test('one entry that will not delete does not stop the others', async () => {
  const h = harness(
    [
      entity('stuck', { expiresAt: NOW - 1, burnPolicy: 'ttl' }),
      entity('fine', { expiresAt: NOW - 1, burnPolicy: 'ttl' }),
    ],
    { failOn: 'stuck' },
  );

  const outcome = await h.sweeper.runOnce(NOW);

  assert.deepEqual(h.deleted, ['fine']);
  assert.deepEqual(outcome.expired, ['fine'], 'and the failure is not reported as a deletion');
});

test('an expired window-scoped entry is deleted once, not twice', async () => {
  const h = harness([entity('both', { expiresAt: NOW - 1, burnPolicy: 'onClose' })]);

  const outcome = await h.sweeper.runOnce(NOW);

  assert.deepEqual(h.deleted, ['both']);
  assert.deepEqual(outcome.orphaned, [], 'it was already counted as expired');
});

test('the lease map forgets an entry once it is gone', async () => {
  const memento = new FakeMemento();
  await harness([entity('scoped', { burnPolicy: 'onClose' })], { memento }).sweeper.runOnce(NOW);
  assert.equal(leaseKey('a1', 'scoped') in memento.get(LEASE_STATE_KEY, {}), true);

  await harness([], { memento }).sweeper.runOnce(NOW + 1000);

  assert.deepEqual(memento.get(LEASE_STATE_KEY, {}), {});
});

test('the tree is told to refresh only when something actually went', async () => {
  const quiet = harness([entity('permanent')]);
  await quiet.sweeper.runOnce(NOW);
  assert.equal(quiet.refreshes, 0);

  const busy = harness([entity('gone', { expiresAt: NOW - 1, burnPolicy: 'ttl' })]);
  await busy.sweeper.runOnce(NOW);
  assert.equal(busy.refreshes, 1);
});

test('a second pass cannot start while one is still running', async () => {
  let resolveDelete: (() => void) | undefined;
  const deleted: string[] = [];
  const storage: SweepStorage = {
    metadataFault: undefined,
    getAccounts: () => [ACCOUNT],
    getNodes: () => [entity('gone', { expiresAt: NOW - 1, burnPolicy: 'ttl' })],
    sweepOrphanSecrets: () => Promise.resolve({ deleted: 0, checked: 0 }),
    resumeAccountRemovals: () => Promise.resolve([]),
    deleteNodeRecursive: (_a, id) =>
      new Promise((resolve) => {
        deleted.push(id);
        resolveDelete = () => resolve([id]);
      }),
  };
  const sweeper = new EphemeralSweeper(storage, new FakeMemento() as never);

  const first = sweeper.runOnce(NOW);
  const second = await sweeper.runOnce(NOW);

  assert.deepEqual(second.expired, [], 'the overlapping pass did nothing');
  resolveDelete?.();
  await first;
  assert.deepEqual(deleted, ['gone'], 'and the entry was deleted exactly once');
});
