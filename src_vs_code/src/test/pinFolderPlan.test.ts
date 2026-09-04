import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TreeNode } from '../types';
import { entriesUnder, protectionSummary, siblingReport } from '../pinFolderPlan';
import { hiddenFromAgents } from '../mcpEntries';

/**
 * What a folder run would DO, and what it SAYS before doing it.
 *
 * <p>The finding this file exists for: somebody running a folder with a new PIN expects the folder
 * to be uniformly theirs afterwards. It will not be — entries already wrapped under another PIN are
 * skipped and keep it — and somebody who does not know that PIN has just locked themselves out of
 * entries they could read yesterday, while believing the opposite.</p>
 */

const folder = (id: string, parentId: string | null = null): TreeNode =>
  ({ id, name: id, type: 'folder', parentId }) as TreeNode;

const entry = (id: string, parentId: string | null): TreeNode =>
  ({ id, name: id, type: 'entity', parentId, details: { id, name: id } }) as TreeNode;

test('the walk reaches entries at ANY depth, and stops at the folder it was given', () => {
  const nodes = [
    folder('top'),
    folder('inner', 'top'),
    folder('deeper', 'inner'),
    entry('a', 'top'),
    entry('b', 'inner'),
    entry('c', 'deeper'),
    folder('elsewhere'),
    entry('d', 'elsewhere'),
    entry('e', null),
  ];

  assert.deepEqual(
    entriesUnder(nodes, 'top').map((n) => n.id),
    ['a', 'b', 'c'],
  );
  assert.deepEqual(
    entriesUnder(nodes, 'elsewhere').map((n) => n.id),
    ['d'],
  );
});

test('a parent chain that points nowhere costs ONE entry, not the walk', () => {
  // Sync can deliver a node whose parent is not here yet. Recursing on children would have made
  // that a stack overflow; walking parents with a depth cap makes it one skipped row.
  const nodes = [folder('top'), entry('orphan', 'a-folder-that-is-not-here'), entry('a', 'top')];

  assert.deepEqual(
    entriesUnder(nodes, 'top').map((n) => n.id),
    ['a'],
  );
});

test('a cycle in the parent chain terminates rather than hanging', () => {
  const looped = [
    { id: 'x', name: 'x', type: 'folder', parentId: 'y' },
    { id: 'y', name: 'y', type: 'folder', parentId: 'x' },
    { id: 'a', name: 'a', type: 'entity', parentId: 'x', details: { id: 'a', name: 'a' } },
  ] as TreeNode[];

  assert.deepEqual(
    entriesUnder(looped, 'nowhere').map((n) => n.id),
    [],
  );
});

test('the report names the count that will be SKIPPED, and what that means', () => {
  const plan = {
    toProtect: [entry('a', 'f'), entry('b', 'f')],
    alreadyProtected: [entry('c', 'f'), entry('d', 'f'), entry('e', 'f')],
  };

  const said = siblingReport('Production', plan);

  assert.match(said, /3 of the 5 entries in "Production"/);
  assert.match(said, /left exactly as they are/, 'it says what happens to them');
  assert.match(said, /still need their own PIN/, 'and what that costs the person reading it');
  assert.match(said, /2 unprotected entries will be protected/, 'and what the run WILL do');
});

test('one entry reads as "entry", not "1 entries"', () => {
  const said = siblingReport('Production', {
    toProtect: [entry('a', 'f')],
    alreadyProtected: [entry('c', 'f')],
  });

  assert.match(said, /1 unprotected entry will be protected/);
});

test('the summary is a state, not a verdict — and an empty folder says so', () => {
  assert.match(
    protectionSummary('Production', { toProtect: [], alreadyProtected: [entry('c', 'f')] }),
    /All 1 entries in "Production" already have a PIN/,
  );
  assert.match(
    protectionSummary('Production', { toProtect: [entry('a', 'f')], alreadyProtected: [entry('c', 'f')] }),
    /1 of 2 entries in "Production" are protected/,
    'the count is what makes an interrupted run visible',
  );
  assert.match(
    protectionSummary('Empty', { toProtect: [], alreadyProtected: [] }),
    /holds no entries to protect/,
  );
});

/**
 * §2.4 — one predicate, at the listing AND at the lookup.
 */
test('a protected entry is hidden from agents; an ordinary one is not', () => {
  const protectedNode = {
    id: 'e1',
    name: 'prod',
    type: 'entity',
    details: { id: 'e1', name: 'prod', pinProtected: true },
  } as TreeNode;

  assert.equal(hiddenFromAgents(protectedNode), true);
  assert.equal(hiddenFromAgents(entry('e2', null)), false);
  assert.equal(hiddenFromAgents(undefined), false, 'a missing node is not a protected one');
});
