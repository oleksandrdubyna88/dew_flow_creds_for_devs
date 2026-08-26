import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TreeNode, isEntityMetadata } from '../types';
import {
  BurnPolicy,
  LIFETIME_CHOICES,
  burnsOnAgentUse,
  burnsOnClose,
  describeRemaining,
  expiredNodes,
  expiresAtFor,
  expiresSoon,
  isBurnPolicy,
  isExpired,
  nodesBurnedOnClose,
} from '../entityExpiry';

/**
 * The rule half of short-lived entries. The deleting half is deliberately elsewhere: expiry
 * must go through `deleteNodeRecursive`, which tombstones causally and wipes the revision
 * history, and nothing here should make a second way to do it look possible.
 */

const NOW = 1_800_000_000_000;
const HOUR = 60 * 60_000;

function entry(details: Record<string, unknown> = {}): TreeNode {
  return {
    id: 'e1',
    name: 'staging token',
    type: 'entity',
    details: { id: 'e1', name: 'staging token', isSshEnabled: false, ...details },
  } as TreeNode;
}

test('an entry with no lifetime never expires', () => {
  const plain = entry();
  assert.equal(isExpired(plain, NOW), false);
  assert.equal(isExpired(plain, NOW + 1000 * HOUR), false);
  assert.equal(describeRemaining(plain, NOW), '');
});

test('a ttl entry expires at its stamp, and not a moment before', () => {
  const node = entry({ burnPolicy: 'ttl', expiresAt: NOW + HOUR });

  assert.equal(isExpired(node, NOW), false);
  assert.equal(isExpired(node, NOW + HOUR - 1), false);
  assert.equal(isExpired(node, NOW + HOUR), true, 'the stamp itself counts as expired');
  assert.equal(isExpired(node, NOW + 2 * HOUR), true);
});

test('the presets produce the stamps they promise', () => {
  const hour = LIFETIME_CHOICES.find((c) => c.label === '1 hour')!;
  const day = LIFETIME_CHOICES.find((c) => c.label === '1 day')!;

  assert.equal(expiresAtFor(hour, NOW), NOW + HOUR);
  assert.equal(expiresAtFor(day, NOW), NOW + 24 * HOUR);
  // The two clockless policies must not invent a stamp.
  assert.equal(expiresAtFor(LIFETIME_CHOICES.find((c) => c.label === 'Forever')!, NOW), undefined);
  assert.equal(
    expiresAtFor(LIFETIME_CHOICES.find((c) => c.policy === 'onClose')!, NOW),
    undefined,
  );
});

test('only an agent use burns a one-use entry — a person copying it does not', () => {
  // The owner's decision, and the reason the UI must say "after an agent uses it" rather
  // than "one-time": the burn fires in the broker, nowhere else.
  const oneUse = entry({ burnPolicy: 'oneUse' });

  assert.equal(burnsOnAgentUse(oneUse), true);
  assert.equal(burnsOnClose(oneUse), false);
  assert.equal(isExpired(oneUse, NOW + 1000 * HOUR), false, 'no clock, so no clock can end it');
});

test('an on-close entry is not on a clock either', () => {
  const node = entry({ burnPolicy: 'onClose' });

  assert.equal(burnsOnClose(node), true);
  assert.equal(burnsOnAgentUse(node), false);
  assert.equal(isExpired(node, NOW + 1000 * HOUR), false);
  assert.equal(describeRemaining(node, NOW), 'until VS Code closes');
});

test('a sweep picks exactly the expired entries, and never a folder', () => {
  const folder: TreeNode = { id: 'f1', name: 'staging', type: 'folder' };
  const nodes = [
    entry({ burnPolicy: 'ttl', expiresAt: NOW - 1 }),
    entry({ burnPolicy: 'ttl', expiresAt: NOW + HOUR }),
    entry(),
    entry({ burnPolicy: 'oneUse' }),
    folder,
    { ...folder, details: { expiresAt: NOW - 1 } } as TreeNode,
  ];

  const doomed = expiredNodes(nodes, NOW);
  assert.equal(doomed.length, 1);
  assert.equal(doomed[0].details?.expiresAt, NOW - 1);
});

test('closing the window takes the on-close entries and nothing else', () => {
  const nodes = [
    entry({ burnPolicy: 'onClose' }),
    entry({ burnPolicy: 'ttl', expiresAt: NOW - 1 }),
    entry(),
  ];

  assert.equal(nodesBurnedOnClose(nodes).length, 1);
  assert.equal(nodesBurnedOnClose(nodes)[0].details?.burnPolicy, 'onClose');
});

test('the remaining time reads coarsely, because the sweep is coarse', () => {
  const node = entry({ burnPolicy: 'ttl', expiresAt: NOW + 40 * 60_000 });

  assert.equal(describeRemaining(node, NOW), 'expires in 40 min');
  assert.equal(describeRemaining(entry({ expiresAt: NOW + 5 * HOUR }), NOW), 'expires in 5 h');
  assert.equal(describeRemaining(entry({ expiresAt: NOW + 72 * HOUR }), NOW), 'expires in 3 days');
  assert.equal(describeRemaining(entry({ expiresAt: NOW - 1 }), NOW), 'expired');
});

test('expiring soon is a window, not a moment', () => {
  const node = entry({ expiresAt: NOW + 30 * 60_000 });

  assert.equal(expiresSoon(node, NOW, HOUR), true);
  assert.equal(expiresSoon(node, NOW, 10 * 60_000), false);
  assert.equal(expiresSoon(entry({ expiresAt: NOW - 1 }), NOW, HOUR), false, 'already gone is not soon');
  assert.equal(expiresSoon(entry(), NOW, HOUR), false);
});

test('a burn policy read back from storage is validated, not trusted', () => {
  assert.equal(isBurnPolicy('ttl'), true);
  assert.equal(isBurnPolicy('oneUse'), true);
  assert.equal(isBurnPolicy('onClose'), true);
  assert.equal(isBurnPolicy('forever'), false);
  assert.equal(isBurnPolicy(undefined), false);
  assert.equal(isBurnPolicy(7), false);
});

test('the fields survive the metadata validator — otherwise they are silently stripped', () => {
  // Every sync, import and sealed-slot read runs metadata through isEntityMetadata. A field
  // it does not know about is dropped, which would make a lifetime quietly evaporate.
  const details = {
    id: 'e1',
    name: 'staging token',
    isSshEnabled: false,
    expiresAt: NOW + HOUR,
    burnPolicy: 'ttl' as BurnPolicy,
  };

  assert.equal(isEntityMetadata(details), true);
  assert.equal(isEntityMetadata({ ...details, burnPolicy: 'whenever' }), false);
  assert.equal(isEntityMetadata({ ...details, expiresAt: 'soon' }), false);
});
