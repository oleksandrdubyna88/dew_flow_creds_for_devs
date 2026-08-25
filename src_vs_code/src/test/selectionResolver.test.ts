import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeSkips, resolveSelection } from '../selectionResolver';
import { TreeElement, TreeNode } from '../types';

/**
 * Turning a raw VS Code tree selection into the concrete nodes a bulk action runs on.
 *
 * The constraint this exists for: VS Code evaluates a menu's `when` clause against the
 * ANCHOR row only, never the whole selection. So a folder can appear in a selection whose
 * anchor was an entity, and a second profile's node can appear in a selection whose anchor
 * was the first — the menu will happily offer the command anyway. Every eligibility rule
 * therefore has to live here, not in package.json.
 */

const folder = (id: string, parentId: string | null = null): TreeNode => ({
  id, name: `folder-${id}`, type: 'folder', parentId, folderType: 'any',
});
const entity = (id: string, parentId: string | null = null): TreeNode => ({
  id, name: `entity-${id}`, type: 'entity', parentId,
  details: { id, name: `entity-${id}`, isSshEnabled: false },
});
const at = (accountId: string, node: TreeNode): TreeElement => ({ kind: 'node', accountId, node });

test('a single click with no selection array acts on the clicked row', () => {
  const nodes = [entity('e1')];
  const r = resolveSelection(at('a', nodes[0]), undefined, nodes);

  assert.deepEqual(r.targets.map((t) => t.node.id), ['e1']);
});

test('rows that are not nodes are counted out, never acted on', () => {
  // Accounts, team members and inbox rows can all be in a selection; none of them is a
  // thing to delete, export or share.
  const nodes = [entity('e1')];
  const r = resolveSelection(
    at('a', nodes[0]),
    [at('a', nodes[0]), { kind: 'sharedRoot' }, { kind: 'account', account: { accountId: 'a', email: 'x', provider: 'microsoft' } }],
    nodes,
  );

  assert.deepEqual(r.targets.map((t) => t.node.id), ['e1']);
  assert.equal(r.skippedNonNode, 2);
});

test('the anchor decides the account; other profiles are counted out', () => {
  // Account roots are siblings in the tree — ctrl-click across them is an ordinary
  // gesture, not an error, so it is reported rather than refused.
  const mine = entity('e1');
  const theirs = entity('e2');
  const r = resolveSelection(at('a', mine), [at('a', mine), at('b', theirs)], [mine]);

  assert.deepEqual(r.targets.map((t) => t.node.id), ['e1']);
  assert.equal(r.skippedOtherAccount, 1);
});

test('a folder swallows its own selected children, at any depth', () => {
  // Deleting the folder already takes the child; exporting it already includes the child.
  const outer = folder('f1');
  const middle = folder('f2', 'f1');
  const leaf = entity('e1', 'f2');
  const nodes = [outer, middle, leaf];

  // The MIDDLE folder is not selected — the walk must use the tree, not the selection.
  const r = resolveSelection(at('a', outer), [at('a', outer), at('a', leaf)], nodes);

  assert.deepEqual(r.targets.map((t) => t.node.id), ['f1']);
  assert.equal(r.skippedCoveredByAncestor, 1);
});

test('a nested folder collapses into the outer one', () => {
  const outer = folder('f1');
  const inner = folder('f2', 'f1');
  const r = resolveSelection(at('a', outer), [at('a', outer), at('a', inner)], [outer, inner]);

  assert.deepEqual(r.targets.map((t) => t.node.id), ['f1']);
});

test('unrelated rows all survive, in the order they were selected', () => {
  const f = folder('f1');
  const e = entity('e1');
  const r = resolveSelection(at('a', f), [at('a', f), at('a', e)], [f, e]);

  assert.deepEqual(r.targets.map((t) => t.node.id), ['f1', 'e1']);
});

test('the same row selected twice is acted on once', () => {
  const e = entity('e1');
  const r = resolveSelection(at('a', e), [at('a', e), at('a', e)], [e]);

  assert.equal(r.targets.length, 1);
});

test('an anchor that is not a node yields nothing at all', () => {
  assert.deepEqual(resolveSelection({ kind: 'sharedRoot' }, undefined, []).targets, []);
  assert.deepEqual(resolveSelection(undefined, undefined, []).targets, []);
});

test('skips are reported only when they are worth reporting', () => {
  const base = { targets: [], skippedNonNode: 0, skippedOtherAccount: 0, skippedCoveredByAncestor: 0 };

  assert.equal(describeSkips(base), '');
  // A folder selected together with its own child is an ordinary shift-click, not a
  // mistake — saying anything about it would be noise on every second use.
  assert.equal(describeSkips({ ...base, skippedCoveredByAncestor: 3 }), '');

  assert.match(describeSkips({ ...base, skippedNonNode: 2 }), /2/);
  assert.match(describeSkips({ ...base, skippedOtherAccount: 1 }), /profile/i);
  const both = describeSkips({ ...base, skippedNonNode: 1, skippedOtherAccount: 2 });
  assert.match(both, /1/);
  assert.match(both, /2/);
});
