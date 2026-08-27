import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeMcpSource, mcpAsOfVersion, mcpFor } from '../viewerOptions';
import type { TreeNode } from '../types';

/**
 * What the entity card says about agent access — and where it gets the answer.
 *
 * <p>The card used to build that answer itself, and it got one of the three inputs wrong: it
 * passed `inTrash: false` unconditionally, because at the call site there was nothing to hand
 * it. So a deleted entry — an ordinary node under the Trash, which the tree still shows and a
 * person can still click — opened a card reading <i>visible · usable · can delete to Trash</i>,
 * while the resolver every agent request actually goes through would have answered <i>not
 * available to agents</i>.</p>
 *
 * <p>Nobody would have been harmed by it; they would have been MISINFORMED by it, which for a
 * permissions display is the whole failure. The fix is not a corrected boolean at the call site
 * but a function that cannot be called without the question: the card and the broker now reach
 * the same resolver by the same road.</p>
 */

const trash: TreeNode = { id: 't', name: 'Trash', type: 'folder', parentId: null, isTrash: true };
const folder: TreeNode = { id: 'f', name: 'Databases', type: 'folder', parentId: null, mcp: { use: true } };

function entry(parentId: string, mcp?: TreeNode['mcp']): TreeNode {
  return {
    id: 'e',
    name: 'prod',
    type: 'entity',
    parentId,
    details: { id: 'e', name: 'prod', kind: 'credential', isSshEnabled: false, mcp },
  };
}

function lookup(...nodes: readonly TreeNode[]): (id: string) => TreeNode | undefined {
  return (id) => nodes.find((n) => n.id === id);
}

test('an entry in the Trash shows no access, whatever it was granted before it was deleted', () => {
  const node = entry('t', { delete: 'any' });
  const shown = mcpFor(node, lookup(trash, node), false);
  assert.equal(shown.summary, 'not available to agents');
  assert.equal(shown.source, 'none');
  assert.deepEqual(shown.mask, [false, false, false, false, false]);
});

test('a folder deleted whole takes its contents with it, one level down', () => {
  // The case a parentId-only check misses: deleting a folder moves it whole, so its entries sit
  // under the trash rather than in it.
  const deletedFolder: TreeNode = { id: 'f', name: 'Databases', type: 'folder', parentId: 't', mcp: { use: true } };
  const node = entry('f');
  const shown = mcpFor(node, lookup(trash, deletedFolder, node), false);
  assert.equal(shown.summary, 'not available to agents');
});

test('a live entry inherits from its folder, and the card names the folder', () => {
  const node = entry('f');
  const shown = mcpFor(node, lookup(folder, node), false);
  assert.equal(shown.source, 'folder');
  assert.equal(shown.folderName, 'Databases');
  assert.match(describeMcpSource(shown), /inherited from the folder Databases/);
  // The ladder filled `view` in underneath `use`.
  assert.deepEqual(shown.mask, [true, true, false, false, false]);
});

test('an entry that decided for itself says so, and the folder is not consulted', () => {
  const node = entry('f', {});
  const shown = mcpFor(node, lookup(folder, node), false);
  assert.equal(shown.source, 'entity');
  assert.equal(shown.summary, 'not available to agents');
  assert.match(describeMcpSource(shown), /set on this entry/);
});

test('a version out of history is labelled as a snapshot, not as a current permission', () => {
  const node = entry('f', { edit: true });
  const shown = mcpFor(node, lookup(folder, node), true);
  assert.match(describeMcpSource(shown), /as of this version, not necessarily now/);
});

test('a version that inherited its access says nothing rather than borrowing today s folder', () => {
  // A revision keeps the entry's own setting and nothing about the folder as it was. Filling
  // that gap from the current folder would answer a question about the past with a fact about
  // the present, which is the one wrong answer available here.
  assert.equal(mcpAsOfVersion(undefined), undefined);
});

test('a version that decided for itself is shown, labelled as a snapshot', () => {
  const shown = mcpAsOfVersion({ use: true });
  assert.equal(shown?.source, 'entity');
  assert.deepEqual(shown?.mask, [true, true, false, false, false]);
  assert.match(describeMcpSource(shown as never), /as of this version, not necessarily now/);
});

test('an orphaned entry resolves to nothing rather than throwing', () => {
  // Ids arrive by sync and by import; a missing parent is data, not an impossibility.
  const node = entry('gone');
  const shown = mcpFor(node, lookup(node), false);
  assert.equal(shown.source, 'none');
  assert.equal(shown.folderName, undefined);
});
