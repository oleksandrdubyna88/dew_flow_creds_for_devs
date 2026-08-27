import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { accountCounts, formatAccountCounts } from '../accountCounts';
import { OwnedShare, TreeNode } from '../types';
import { TRASH_FOLDER_NAME } from '../trash';

/**
 * T32 — the three numbers on an account row. What must hold: histories are structurally
 * uncounted, folders are structure, the Trash counts in its own slot only, "shared" is this
 * account's pending inbox, and zeros are written out.
 */

function tree(): TreeNode[] {
  // The Trash is marked by `isTrash`, never found by name — trash.ts's own rule.
  const trash: TreeNode = {
    id: 'trash', name: TRASH_FOLDER_NAME, type: 'folder', parentId: null, folderType: 'any', isTrash: true,
  } as never;
  return [
    { id: 'f1', name: 'db', type: 'folder', parentId: null, folderType: 'db' } as never,
    { id: 'e1', name: 'prod', type: 'entity', parentId: 'f1', details: { id: 'e1', name: 'prod' } } as never,
    { id: 'e2', name: 'stage', type: 'entity', parentId: 'f1', details: { id: 'e2', name: 'stage' } } as never,
    trash,
    { id: 'e3', name: 'old', type: 'entity', parentId: 'trash', details: { id: 'e3', name: 'old' } } as never,
  ];
}

const byIdOf = (nodes: TreeNode[]) => (id: string) => nodes.find((n) => n.id === id);

function share(accountId: string): OwnedShare {
  return { accountId, shareKeyId: 'k', item: { id: 's1' } } as never;
}

test('entries, trash and shared are counted apart, and folders count as nothing', () => {
  const nodes = tree();
  const counts = accountCounts(nodes, byIdOf(nodes), [share('a1'), share('a2')], 'a1');
  assert.deepEqual(counts, { entries: 2, trash: 1, shared: 1 });
  assert.equal(formatAccountCounts(counts), '2 / 1 / 1');
});

test('zeros are written out — a blank where a number belongs reads as "not loaded"', () => {
  const counts = accountCounts([], () => undefined, [], 'a1');
  assert.equal(formatAccountCounts(counts), '0 / 0 / 0');
});

test('histories cannot be counted, structurally: only entity NODES are candidates', () => {
  // A revision is not a TreeNode — the walk sees entities and folders and nothing else.
  // This pins the construction the doc claims: nothing here reads history at all.
  const nodes = tree();
  const counts = accountCounts(nodes, byIdOf(nodes), [], 'a1');
  assert.equal(counts.entries + counts.trash, nodes.filter((n) => n.type === 'entity').length);
});

test('a nested folder inside the Trash still counts its entities as trash', () => {
  const nodes = tree();
  nodes.push({ id: 'tf', name: 'sub', type: 'folder', parentId: 'trash', folderType: 'any' } as never);
  nodes.push({ id: 'e4', name: 'deep', type: 'entity', parentId: 'tf', details: { id: 'e4', name: 'deep' } } as never);
  const counts = accountCounts(nodes, byIdOf(nodes), [], 'a1');
  assert.equal(counts.trash, 2);
  assert.equal(counts.entries, 2);
});
