import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { EntityFlagsRefresher, EntityFlagSource, EntityFlagTarget, entityKey } from '../entityFlags';
import { RevisionHead } from '../revisionHistory';

/**
 * The two rules that make the tree's per-entity flag caches trustworthy (review of the
 * 2026-08-25 audit work).
 *
 * <p><b>Runs are serialized.</b> A walk over a large vault is hundreds of sequential keychain
 * reads, and every mutation starts one. Two in flight race to swap their results, and the
 * winner is whichever finishes LAST — so a slow walk started before an edit could overwrite a
 * fast one started after it, and the entry the user just gave a password to would lose its
 * "Copy Password" until something else refreshed.</p>
 *
 * <p><b>Both caches are keyed by account AND entity.</b> The keychain key is, so the caches
 * must be: a restore puts the same entity ids into two profiles, and an id-only key lets one
 * profile's revisions render under the other's row — with its dates, its names, and a twisty
 * that resolves to nothing.</p>
 */

interface Fake {
  source: EntityFlagSource;
  target: EntityFlagTarget & { refreshes: number };
  /** Set an entity's stored password; `undefined` removes it. */
  setPassword(accountId: string, id: string, value: string | undefined): void;
  setHistory(accountId: string, id: string, names: string[]): void;
  /** Make the next read of this entity wait until the returned function is called. */
  stall(accountId: string, id: string): () => void;
  reads: number;
}

function fake(tree: Record<string, string[]>): Fake {
  const passwords = new Map<string, string>();
  const histories = new Map<string, string[]>();
  const gates = new Map<string, () => void>();
  const key = (a: string, i: string): string => `${a}:${i}`;
  const target = {
    historyById: new Map<string, RevisionHead[]>(),
    passwordIds: new Set<string>(),
    invalidConfigIds: new Set<string>(),
    refreshes: 0,
    refresh(): void {
      target.refreshes += 1;
    },
  };
  const self: Fake = {
    reads: 0,
    target,
    source: {
      getAccounts: () => Object.keys(tree).map((accountId) => ({ accountId })),
      // Nothing in this fixture is a config, so the walk never reaches the keychain for one —
      // which is itself the behaviour `readConfigVerdict` promises and `configFlag.test.ts` pins.
      getConfigBody: () => Promise.resolve(undefined),
      getNodes: (accountId) =>
        (tree[accountId] ?? []).map((id) => ({ id, type: 'entity' as const })),
      getHistory: async (accountId, id) => {
        self.reads += 1;
        const gate = gates.get(key(accountId, id));
        if (gate !== undefined) {
          gates.delete(key(accountId, id));
          await new Promise<void>((resolve) => gates.set(`waiting:${key(accountId, id)}`, resolve));
        }
        return (histories.get(key(accountId, id)) ?? []).map((name) => ({
          at: 1,
          name,
          details: { id, name, isSshEnabled: false },
          secrets: { password: 'must-not-be-cached' },
        }));
      },
      getPassword: (accountId, id) => Promise.resolve(passwords.get(key(accountId, id))),
    },
    setPassword: (a, i, v) => {
      if (v === undefined) {
        passwords.delete(key(a, i));
      } else {
        passwords.set(key(a, i), v);
      }
    },
    setHistory: (a, i, names) => histories.set(key(a, i), names),
    stall: (a, i) => {
      gates.set(key(a, i), () => undefined);
      return () => {
        const release = gates.get(`waiting:${key(a, i)}`);
        gates.delete(`waiting:${key(a, i)}`);
        release?.();
      };
    },
  };
  return self;
}

test('a walk fills both caches, keyed by account AND entity', async () => {
  const f = fake({ acc: ['e1', 'e2'] });
  f.setPassword('acc', 'e1', 'pw');
  f.setHistory('acc', 'e2', ['older name']);

  await new EntityFlagsRefresher(f.source, f.target).refresh();

  assert.deepEqual([...f.target.passwordIds], [entityKey('acc', 'e1')]);
  assert.deepEqual([...f.target.historyById.keys()], [entityKey('acc', 'e2')]);
  assert.equal(f.target.refreshes, 1, 'one repaint per walk');
});

test('two profiles holding the same entity id keep their own history — a restore does that', async () => {
  // The exact scenario the passwordIds cache was already keyed by account to survive.
  const f = fake({ 'acc-a': ['shared'], 'acc-b': ['shared'] });
  f.setHistory('acc-a', 'shared', ['A older', 'A oldest']);
  f.setHistory('acc-b', 'shared', ['B older']);

  await new EntityFlagsRefresher(f.source, f.target).refresh();

  assert.equal(f.target.historyById.get(entityKey('acc-a', 'shared'))?.length, 2);
  assert.equal(f.target.historyById.get(entityKey('acc-b', 'shared'))?.length, 1);
  assert.equal(
    f.target.historyById.get(entityKey('acc-b', 'shared'))?.[0].name,
    'B older',
    "one profile's versions must never render under the other's row",
  );
});

test('the cache holds heads: no revision secret is reachable through the tree', async () => {
  const f = fake({ acc: ['e1'] });
  f.setHistory('acc', 'e1', ['older']);

  await new EntityFlagsRefresher(f.source, f.target).refresh();

  const stored = f.target.historyById.get(entityKey('acc', 'e1'))?.[0] as unknown as Record<string, unknown>;
  assert.equal('secrets' in stored, false);
});

test('a slow walk cannot overwrite a newer one with pre-edit data', async () => {
  const f = fake({ acc: ['e1', 'e2'] });
  const release = f.stall('acc', 'e1'); // walk A parks on the first entity
  const refresher = new EntityFlagsRefresher(f.source, f.target);

  const slow = refresher.refresh();
  await Promise.resolve();
  // The user gives e2 its first password while walk A is still parked before reading it.
  f.setPassword('acc', 'e2', 'brand-new');
  const fast = refresher.refresh(); // the mutation asks for a refresh
  release();
  await Promise.all([slow, fast]);

  assert.ok(
    f.target.passwordIds.has(entityKey('acc', 'e2')),
    'the flag for the just-saved password must survive both runs',
  );
});

test('a burst of requests during one walk collapses into a single rerun', async () => {
  const f = fake({ acc: ['e1'] });
  const release = f.stall('acc', 'e1');
  const refresher = new EntityFlagsRefresher(f.source, f.target);

  const first = refresher.refresh();
  await Promise.resolve();
  const burst = [refresher.refresh(), refresher.refresh(), refresher.refresh()];
  release();
  await Promise.all([first, ...burst]);

  assert.equal(f.target.refreshes, 2, 'the in-flight walk plus exactly one rerun — not four walks');
});

test('a removed password disappears from the cache on the next walk', async () => {
  const f = fake({ acc: ['e1'] });
  f.setPassword('acc', 'e1', 'pw');
  const refresher = new EntityFlagsRefresher(f.source, f.target);
  await refresher.refresh();

  f.setPassword('acc', 'e1', undefined);
  await refresher.refresh();

  assert.equal(f.target.passwordIds.size, 0);
});
