import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TreeNode } from '../types';
import {
  TreeSource,
  accountMatches,
  countMatches,
  filterChildren,
  matchesTerms,
  nodeHaystack,
  searchTerms,
} from '../treeSearch';

/** A tree given as parent -> children, which is the shape the storage answers in. */
function source(tree: Record<string, TreeNode[]>): TreeSource {
  return {
    getChildren: (_accountId, parentId) => tree[parentId ?? 'root'] ?? [],
  };
}

function folder(id: string, name: string): TreeNode {
  return { id, name, type: 'folder' };
}

function entity(id: string, name: string, details: Partial<TreeNode['details']> = {}): TreeNode {
  return {
    id,
    name,
    type: 'entity',
    details: { id, name, isSshEnabled: false, ...details },
  };
}

const TREE = {
  root: [folder('f1', 'Passwords'), folder('f2', 'Servers'), entity('e0', 'loose note')],
  f1: [entity('e1', 'GitHub'), entity('e2', 'Jira')],
  f2: [entity('e3', 'prod api', { host: 'api.example.com', user: 'deploy' }), folder('f3', 'Staging')],
  f3: [entity('e4', 'stage api', { host: 'stage.example.com' })],
};

test('a query is split into AND terms', () => {
  assert.deepEqual(searchTerms('  Prod   API '), ['prod', 'api']);
  assert.deepEqual(searchTerms('   '), []);
});

test('a row is matched on its name and on the target it shows', () => {
  const node = entity('e', 'prod api', { host: 'api.example.com', user: 'deploy', port: 2222 });
  const hay = nodeHaystack(node);

  assert.ok(matchesTerms(hay, searchTerms('prod')));
  assert.ok(matchesTerms(hay, searchTerms('deploy@')) === false, 'the @ is not in the stored text');
  assert.ok(matchesTerms(hay, searchTerms('example.com')), 'the host is searchable');
  assert.ok(matchesTerms(hay, searchTerms('2222')), 'so is a non-default port');
  assert.ok(matchesTerms(hay, searchTerms('api prod')), 'terms match in any order');
  assert.ok(matchesTerms(hay, searchTerms('prod jira')) === false, 'all terms must match');
});

test('secrets are never part of what a term is matched against', () => {
  // The point of the whole module: a filter that matched secrets would confirm a password's
  // contents one keystroke at a time, to anyone at an unlocked window.
  const node = entity('e', 'bank', {
    notes: 'memorable-secret-note',
    script: 'echo hunter2',
    scriptVars: [{ value: 'hunter2', name: 'PW' } as never],
  });
  const hay = nodeHaystack(node);

  for (const secret of ['memorable', 'hunter2', 'echo']) {
    assert.equal(matchesTerms(hay, [secret]), false, `${secret} must not be searchable`);
  }
  assert.ok(matchesTerms(hay, ['bank']), 'the name still is');
});

test('a folder survives because something inside it matches', () => {
  const kept = filterChildren(source(TREE), 'a1', null, searchTerms('github'));

  assert.deepEqual(
    kept.map((n) => n.name),
    ['Passwords'],
    'only the path to the hit is kept',
  );
});

test('a hit nested two folders deep keeps both of them', () => {
  const kept = filterChildren(source(TREE), 'a1', null, searchTerms('stage'));
  assert.deepEqual(
    kept.map((n) => n.name),
    ['Servers'],
  );
  assert.deepEqual(
    filterChildren(source(TREE), 'a1', 'f2', searchTerms('stage')).map((n) => n.name),
    ['Staging'],
  );
});

test('a folder matched by its own name shows everything inside it', () => {
  // Asking for "Passwords" and being handed an empty Passwords folder answers the wrong
  // question.
  const inside = filterChildren(source(TREE), 'a1', 'f1', searchTerms('passwords'), true);
  assert.deepEqual(
    inside.map((n) => n.name),
    ['GitHub', 'Jira'],
  );
});

test('an empty query filters nothing', () => {
  assert.equal(filterChildren(source(TREE), 'a1', null, []).length, 3);
  assert.equal(accountMatches(source(TREE), 'a1', []), true);
});

test('an account with no match is not shown at all', () => {
  assert.equal(accountMatches(source(TREE), 'a1', searchTerms('github')), true);
  assert.equal(accountMatches(source(TREE), 'a1', searchTerms('nothinghere')), false);
});

test('the count says how many entities the filter kept', () => {
  const s = source(TREE);
  assert.equal(countMatches(s, ['a1'], searchTerms('api')), 2, 'prod api and stage api');
  assert.equal(countMatches(s, ['a1'], searchTerms('passwords')), 2, 'a matched folder counts its contents');
  assert.equal(countMatches(s, ['a1'], searchTerms('nothinghere')), 0);
});

test('a parent cycle in a corrupt vault does not hang the window', () => {
  // Nodes arrive by sync and by external import, so the tree is data, not an invariant.
  const looping: Record<string, TreeNode[]> = {
    root: [folder('f1', 'one')],
    f1: [folder('f2', 'two')],
    f2: [folder('f1', 'one')],
  };
  assert.deepEqual(
    filterChildren(source(looping), 'a1', null, searchTerms('nothinghere')).map((n) => n.name),
    [],
  );
  assert.equal(countMatches(source(looping), ['a1'], searchTerms('nothinghere')), 0);
});
