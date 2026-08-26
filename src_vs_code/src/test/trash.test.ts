import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  TRASH_RETENTION_CHOICES,
  describeRetention,
  expiredInTrash,
  findTrash,
  isInTrash,
  isTrashFolder,
} from '../trash';
import { TreeNode } from '../types';

/**
 * The trash, which makes deletion reversible — and the line it must not cross.
 *
 * <p>The case that matters most is not in this file at all: `deleteNodeRecursive` must stay a
 * real deletion, because burning, expiry and the sweeper depend on it. That is asserted in
 * `trashSeparation.test.ts`. What is here is the arithmetic: what counts as inside the trash,
 * what the retention sweep should take, and what a folder full of deleted things says about
 * itself.</p>
 */

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_700_000_000_000;

function folder(id: string, extra: Partial<TreeNode> = {}): TreeNode {
  return { id, name: id, type: 'folder', parentId: null, ...extra };
}

function entity(id: string, parentId: string | null, updatedAt?: number): TreeNode {
  return { id, name: id, type: 'entity', parentId, updatedAt };
}

const TRASH = folder('trash', { name: 'Trash', isTrash: true });

test('a trash folder is told apart by its flag, not by its name', () => {
  assert.equal(isTrashFolder(TRASH), true);
  // Somebody's own folder called Trash is still their folder.
  assert.equal(isTrashFolder(folder('mine', { name: 'Trash' })), false);
  assert.equal(isTrashFolder(entity('e1', null)), false);
  assert.equal(isTrashFolder(undefined), false);
});

test('an entry directly in the trash is in the trash', () => {
  const nodes = [TRASH, entity('e1', 'trash')];
  const byId = (id: string): TreeNode | undefined => nodes.find((n) => n.id === id);
  assert.equal(isInTrash(nodes[1], byId), true);
});

test('an entry nested UNDER a trashed folder is also in the trash', () => {
  // Deleting a folder moves it whole, so its entries sit a level below the trash rather than in
  // it. A check that only looked at parentId would call them live — and a deleted entry that
  // still answers to the broker is the defect the trash exists to prevent.
  const nodes = [TRASH, folder('f1', { parentId: 'trash' }), entity('e1', 'f1')];
  const byId = (id: string): TreeNode | undefined => nodes.find((n) => n.id === id);
  assert.equal(isInTrash(nodes[2], byId), true);
});

test('a live entry is not in the trash, whatever else the vault holds', () => {
  const nodes = [TRASH, folder('vpn'), entity('e1', 'vpn')];
  const byId = (id: string): TreeNode | undefined => nodes.find((n) => n.id === id);
  assert.equal(isInTrash(nodes[2], byId), false);
});

test('a parent cycle ends the walk instead of hanging the extension host', () => {
  // parentId is data: it arrives by sync and by import, so a cycle is possible rather than
  // absurd. The same reasoning the filter's walk is bounded for.
  const a = folder('a', { parentId: 'b' });
  const b = folder('b', { parentId: 'a' });
  const byId = (id: string): TreeNode | undefined => [a, b].find((n) => n.id === id);
  assert.equal(isInTrash(a, byId), false);
});

test('a dangling parent ends the walk too', () => {
  const orphan = entity('e1', 'folder-that-vanished');
  assert.equal(isInTrash(orphan, () => undefined), false);
});

test('the trash is found by flag, and absent until something is deleted', () => {
  assert.equal(findTrash([folder('vpn'), entity('e1', 'vpn')]), undefined);
  assert.equal(findTrash([folder('vpn'), TRASH])?.id, 'trash');
});

test('with no retention set, nothing is swept — a trash does not empty itself by surprise', () => {
  const nodes = [TRASH, entity('old', 'trash', NOW - 400 * DAY)];
  assert.deepEqual(expiredInTrash(nodes, NOW), []);
});

test('retention takes what is older and leaves what is not', () => {
  const nodes = [
    folder('trash', { name: 'Trash', isTrash: true, trashRetentionDays: 30 }),
    entity('old', 'trash', NOW - 31 * DAY),
    entity('fresh', 'trash', NOW - 29 * DAY),
  ];
  assert.deepEqual(
    expiredInTrash(nodes, NOW).map((n) => n.id),
    ['old'],
  );
});

test('the sweep returns only what sits directly in the trash', () => {
  // Deleting one of these is recursive, so returning its children as well would hand the caller
  // an id that no longer exists by the time it reached it.
  const nodes = [
    folder('trash', { name: 'Trash', isTrash: true, trashRetentionDays: 1 }),
    folder('f1', { parentId: 'trash', updatedAt: NOW - 5 * DAY }),
    entity('inside', 'f1', NOW - 5 * DAY),
  ];
  assert.deepEqual(
    expiredInTrash(nodes, NOW).map((n) => n.id),
    ['f1'],
  );
});

test('an entry with no timestamp is kept rather than swept', () => {
  // Erring toward keeping: the alternative deletes something for real because a field was absent.
  const nodes = [
    folder('trash', { name: 'Trash', isTrash: true, trashRetentionDays: 1 }),
    entity('undated', 'trash'),
  ];
  assert.deepEqual(expiredInTrash(nodes, NOW), []);
});

test('every offered retention is a real number of days, and the row says which', () => {
  for (const days of TRASH_RETENTION_CHOICES) {
    assert.ok(days > 0);
    assert.match(describeRetention(folder('t', { isTrash: true, trashRetentionDays: days })), /empt/);
  }
  assert.equal(describeRetention(TRASH), 'kept until emptied');
  assert.equal(
    describeRetention(folder('t', { isTrash: true, trashRetentionDays: 1 })),
    'emptied after 1 day',
  );
});
