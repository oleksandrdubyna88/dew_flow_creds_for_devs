import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EntityFlagSource, EntityFlagTarget, EntityFlagsRefresher, entityKey } from '../entityFlags';
import { RevisionHead } from '../revisionHistory';
import { markInvalid } from '../treeRowText';
import { EntityMetadata } from '../types';

/**
 * The `!!!` a config wears while its body does not parse.
 *
 * <p>Two promises are pinned here, and neither is visible by clicking around.</p>
 *
 * <p><b>The verdict is recomputed, never stored.</b> A body changes without this window editing
 * it — a colleague's sync, an accepted share, a restore — and a verdict written down at save time
 * would then describe a document that is no longer there. So the walk that already runs at those
 * moments computes it, and a body that becomes valid stops being marked without anyone opening
 * the entry.</p>
 *
 * <p><b>It costs a keychain read only for configs.</b> This cache exists because reading the
 * keychain per row made opening a folder of 300 entries do 300 cross-process reads. Adding one
 * for every entity would have reintroduced exactly that, in a vault where almost nothing is a
 * config.</p>
 */

interface Fake {
  source: EntityFlagSource;
  target: EntityFlagTarget;
  /** Every entity whose config body the walk actually asked for. */
  bodyReads: string[];
}

function fake(nodes: readonly { id: string; details?: EntityMetadata }[], bodies: Record<string, string>): Fake {
  const target: EntityFlagTarget = {
    historyById: new Map<string, RevisionHead[]>(),
    passwordIds: new Set<string>(),
    invalidConfigIds: new Set<string>(),
    refresh: () => undefined,
  };
  const self: Fake = {
    target,
    bodyReads: [],
    source: {
      getAccounts: () => [{ accountId: 'acc' }],
      getNodes: () => nodes.map((n) => ({ ...n, type: 'entity' as const })),
      getHistory: () => Promise.resolve([]),
      getPassword: () => Promise.resolve(undefined),
      getConfigBody: (_accountId, entityId) => {
        self.bodyReads.push(entityId);
        return Promise.resolve(bodies[entityId]);
      },
    },
  };
  return self;
}

function config(id: string, over: Partial<EntityMetadata> = {}): { id: string; details: EntityMetadata } {
  return {
    id,
    details: { id, name: id, isSshEnabled: false, kind: 'config', configFormat: 'json', ...over },
  };
}

test('a config whose body does not parse is marked, and one that parses is not', async () => {
  const world = fake([config('broken'), config('fine')], {
    broken: '{"a": 1',
    fine: '{"a": 1}',
  });

  await new EntityFlagsRefresher(world.source, world.target).refresh();

  assert.equal(world.target.invalidConfigIds.has(entityKey('acc', 'broken')), true);
  assert.equal(world.target.invalidConfigIds.has(entityKey('acc', 'fine')), false);
});

test('the verdict follows the FORMAT the entry declares, not the text', async () => {
  // The same bytes are a broken JSON document and a perfectly ordinary `.env` comment line.
  const body = '# just a note';
  const world = fake([config('asJson'), config('asEnv', { configFormat: 'env' })], {
    asJson: body,
    asEnv: body,
  });

  await new EntityFlagsRefresher(world.source, world.target).refresh();

  assert.equal(world.target.invalidConfigIds.has(entityKey('acc', 'asJson')), true);
  assert.equal(world.target.invalidConfigIds.has(entityKey('acc', 'asEnv')), false);
});

test('an empty config is not marked — a new entry is not a broken one', async () => {
  const world = fake([config('fresh')], {});

  await new EntityFlagsRefresher(world.source, world.target).refresh();

  assert.equal(world.target.invalidConfigIds.size, 0);
});

test('the keychain is not touched for anything that is not a config', async () => {
  // The cost promise. A vault of three hundred SSH entries must cost zero config reads.
  const plain = { id: 'anSshHost', details: { id: 'anSshHost', name: 'prod', isSshEnabled: true } };
  const world = fake([plain, config('theOnlyConfig')], { theOnlyConfig: '{}' });

  await new EntityFlagsRefresher(world.source, world.target).refresh();

  assert.deepEqual(world.bodyReads, ['theOnlyConfig']);
});

test('the verdict is recomputed on every walk, so a body fixed elsewhere stops being marked', async () => {
  // The promise that makes a sync from a colleague behave. Nothing here opens the entry.
  const bodies: Record<string, string> = { drifting: '{"a": 1' };
  const world = fake([config('drifting')], bodies);
  const refresher = new EntityFlagsRefresher(world.source, world.target);

  await refresher.refresh();
  assert.equal(world.target.invalidConfigIds.has(entityKey('acc', 'drifting')), true);

  bodies.drifting = '{"a": 1}';
  await refresher.refresh();

  assert.equal(
    world.target.invalidConfigIds.has(entityKey('acc', 'drifting')),
    false,
    'a stored verdict would still be claiming this is broken',
  );
});

test('and a body that BECOMES broken elsewhere starts being marked, without an edit here', async () => {
  const bodies: Record<string, string> = { drifting: '{"a": 1}' };
  const world = fake([config('drifting')], bodies);
  const refresher = new EntityFlagsRefresher(world.source, world.target);

  await refresher.refresh();
  assert.equal(world.target.invalidConfigIds.size, 0);

  bodies.drifting = '{"a": 1';
  await refresher.refresh();

  assert.equal(world.target.invalidConfigIds.has(entityKey('acc', 'drifting')), true);
});

test('the mark is three exclamation marks in front of the name, and nothing otherwise', () => {
  // The label is the only channel left: the icon carries the agent-access ladder and the row
  // decoration carries dependency colour, and one channel with two meanings tells you neither.
  assert.equal(markInvalid('appsettings.Development.json', true), '!!!-appsettings.Development.json');
  assert.equal(markInvalid('appsettings.Development.json', false), 'appsettings.Development.json');
});
