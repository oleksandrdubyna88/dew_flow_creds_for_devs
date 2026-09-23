import assert from 'node:assert/strict';
import { test } from 'node:test';
import { exportScope, isNotForExport, nothingLeaves, nothingLeavesNote, subtreeNodes, withheldNote } from '../exportScope';
import { TreeNode } from '../types';

/** Issue #122 — what may leave the vault once an entry is marked *Not for export*. */

function entity(id: string, parentId: string | null, marked = false): TreeNode {
  return {
    id,
    name: id,
    type: 'entity',
    parentId,
    details: { id, name: id, isSshEnabled: false, ...(marked ? { notForExport: true } : {}) },
  };
}

function folder(id: string, parentId: string | null): TreeNode {
  return { id, name: id, type: 'folder', parentId };
}

// root ─ ops ─ prod (marked), stage
//          └ inner ─ vault-key (marked), grafana
// loose (unmarked, outside the folder)
const tree: TreeNode[] = [
  folder('ops', null),
  entity('prod', 'ops', true),
  entity('stage', 'ops'),
  folder('inner', 'ops'),
  entity('vault-key', 'inner', true),
  entity('grafana', 'inner'),
  entity('loose', null),
];
const byId = (id: string): TreeNode => tree.find((n) => n.id === id)!;
const ids = (nodes: readonly TreeNode[]): string[] => nodes.map((n) => n.id);

test('only an ENTITY carries the mark, and only when it is true', () => {
  assert.equal(isNotForExport(byId('prod')), true);
  assert.equal(isNotForExport(byId('stage')), false);
  assert.equal(isNotForExport(byId('ops')), false);
  // A folder's details are never read as a mark, whatever they hold.
  assert.equal(isNotForExport({ ...folder('f', null), details: { id: 'f', name: 'f', isSshEnabled: false, notForExport: true } }), false);
});

test('a folder brings its whole subtree, nested folders included, in walk order', () => {
  assert.deepEqual(ids(subtreeNodes(tree, [byId('ops')])), ['ops', 'prod', 'stage', 'inner', 'vault-key', 'grafana']);
  assert.deepEqual(ids(subtreeNodes(tree, [byId('loose')])), ['loose']);
});

test('marked entries at ANY depth stay behind and are named; the rest leaves', () => {
  const scope = exportScope(tree, [byId('ops')]);
  assert.deepEqual(ids(scope.kept), ['ops', 'stage', 'inner', 'grafana']);
  assert.deepEqual(ids(scope.withheld), ['prod', 'vault-key']);
  assert.equal(nothingLeaves(scope), false);
});

test('a marked entry selected alone leaves nothing — the action is refused, not run empty', () => {
  const scope = exportScope(tree, [byId('prod')]);
  assert.deepEqual(ids(scope.kept), []);
  assert.equal(nothingLeaves(scope), true);
});

test('a folder whose every entry is marked leaves nothing either — an empty folder is not a result', () => {
  const only = [folder('secrets', null), entity('a', 'secrets', true), folder('deep', 'secrets'), entity('b', 'deep', true)];
  const scope = exportScope(only, [only[0]]);
  assert.deepEqual(ids(scope.kept), ['secrets', 'deep']);
  assert.equal(nothingLeaves(scope), true);
});

test('an unmarked selection is untouched, and an empty folder is NOT this module\'s refusal', () => {
  assert.equal(nothingLeaves(exportScope(tree, [byId('loose'), byId('stage')])), false);
  const empty = [folder('empty', null)];
  // Nothing was withheld, so the existing "holds no entities" message stays the one that is said.
  assert.equal(nothingLeaves(exportScope(empty, empty)), false);
});

test('the sentences name what stays and say what happens to the rest', () => {
  const withheld = exportScope(tree, [byId('ops')]).withheld;
  assert.equal(
    withheldNote('share', withheld),
    '"prod" and "vault-key" are marked Not for export and will not be shared; the rest will be.',
  );
  assert.equal(
    withheldNote('export', [byId('prod')]),
    '"prod" is marked Not for export and will not be exported; the rest will be.',
  );
  assert.equal(withheldNote('share', []), '');
});

test('the refusal says where the mark is changed', () => {
  assert.equal(
    nothingLeavesNote('export', [byId('prod')]),
    'Nothing to export: "prod" is marked Not for export. Untick "Not for export" in the entry\'s Edit form, General section, to let it leave.',
  );
  assert.match(nothingLeavesNote('share', [byId('prod'), byId('vault-key')]), /^Nothing to share: Everything selected \("prod" and "vault-key"\) is marked/);
});

test('a long list is cut at five names and counted', () => {
  const many = Array.from({ length: 7 }, (_, i) => entity(`e${i}`, null, true));
  assert.match(withheldNote('share', many), /^"e0", "e1", "e2", "e3", "e4" and 2 more are marked/);
});
