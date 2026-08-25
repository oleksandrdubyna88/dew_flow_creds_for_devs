import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TreeNode } from '../types';
import {
  FilterMemo,
  TreeSource,
  accountMatches,
  countMatches,
  filterChildren,
  searchTerms,
} from '../treeSearch';

/**
 * The filter memo (audit 2026-08-25, C2): a repeated question is answered from the first
 * answer, a different term or a cleared memo walks again, and — the part that would be a bug —
 * the answers are the same ones the plain walk gives.
 */

function folder(id: string, name: string): TreeNode {
  return { id, name, type: 'folder' };
}

function entity(id: string, name: string, details: Partial<TreeNode['details']> = {}): TreeNode {
  return { id, name, type: 'entity', details: { id, name, isSshEnabled: false, ...details } };
}

const TREE: Record<string, TreeNode[]> = {
  root: [folder('f1', 'Passwords'), folder('f2', 'Servers'), entity('e0', 'loose note')],
  f1: [entity('e1', 'GitHub'), entity('e2', 'Jira')],
  f2: [entity('e3', 'prod api', { host: 'api.example.com' }), folder('f3', 'Staging')],
  f3: [entity('e4', 'stage api', { host: 'stage.example.com' })],
};

/** A source that counts how often it is asked. */
function counting(tree: Record<string, TreeNode[]>): TreeSource & { walks: number } {
  const source = {
    walks: 0,
    getChildren: (_accountId: string, parentId: string | null): readonly TreeNode[] => {
      source.walks += 1;
      return tree[parentId ?? 'root'] ?? [];
    },
  };
  return source;
}

const ids = (nodes: readonly TreeNode[]): string[] => nodes.map((n) => n.id);

test('the second ask for the same position does not walk the source again', () => {
  const source = counting(TREE);
  const memo = new FilterMemo();
  const terms = searchTerms('api');

  const first = filterChildren(source, 'a', null, terms, false, memo);
  const walksAfterFirst = source.walks;
  const second = filterChildren(source, 'a', null, terms, false, memo);

  assert.ok(walksAfterFirst > 0);
  assert.equal(source.walks, walksAfterFirst, 'answered from the memo');
  assert.equal(second, first, 'the very same array');
  assert.deepEqual(ids(first), ['f2']);
});

test('a kept folder, opened after the root walk, is answered from the verdicts that walk left', () => {
  // f3 comes BEFORE e3 here so the root walk actually descends into f3 (with e3 first,
  // `some` would stop at e3 and f3 would be a fresh question — also correct, just not this test).
  const source = counting({
    ...TREE,
    f2: [folder('f3', 'Staging'), entity('e3', 'prod api', { host: 'api.example.com' })],
  });
  const memo = new FilterMemo();
  const terms = searchTerms('api');
  filterChildren(source, 'a', null, terms, false, memo); // the root walk visits f2 and f3
  const walksAfterRoot = source.walks;

  const opened = filterChildren(source, 'a', 'f2', terms, false, memo);

  assert.deepEqual(ids(opened), ['f3', 'e3']);
  assert.equal(source.walks, walksAfterRoot + 1, 'one call for f2\'s own children; no subtree re-walk');

  filterChildren(source, 'a', 'f2', terms, false, memo);
  assert.equal(source.walks, walksAfterRoot + 1, 'opening it again costs nothing');
});

test('the memoized answers equal the plain walk\'s, position by position', () => {
  const plain = counting(TREE);
  const memoized = counting(TREE);
  const memo = new FilterMemo();
  for (const query of ['api', 'passwords', 'stage', 'nothing', 'a']) {
    const terms = searchTerms(query);
    for (const parent of [null, 'f1', 'f2', 'f3']) {
      assert.deepEqual(
        ids(filterChildren(memoized, 'a', parent, terms, false, memo)),
        ids(filterChildren(plain, 'a', parent, terms)),
        `${query} @ ${parent ?? 'root'}`,
      );
    }
    assert.equal(accountMatches(memoized, 'a', terms, memo), accountMatches(plain, 'a', terms));
    assert.equal(countMatches(memoized, ['a'], terms, memo), countMatches(plain, ['a'], terms));
  }
});

test('a different term drops the memo — the old answers are not the new question\'s', () => {
  const source = counting(TREE);
  const memo = new FilterMemo();
  filterChildren(source, 'a', null, searchTerms('api'), false, memo);
  const walks = source.walks;

  const other = filterChildren(source, 'a', null, searchTerms('jira'), false, memo);

  assert.ok(source.walks > walks, 'walked again');
  assert.deepEqual(ids(other), ['f1']);
});

test('clear() — the tree changed — walks again for the same term', () => {
  const source = counting(TREE);
  const memo = new FilterMemo();
  const terms = searchTerms('api');
  filterChildren(source, 'a', null, terms, false, memo);
  const walks = source.walks;

  memo.clear();
  filterChildren(source, 'a', null, terms, false, memo);

  assert.ok(source.walks > walks);
});

test('the count is memoized too, and per set of accounts', () => {
  const source = counting(TREE);
  const memo = new FilterMemo();
  const terms = searchTerms('api');

  assert.equal(countMatches(source, ['a'], terms, memo), 2);
  const walks = source.walks;
  assert.equal(countMatches(source, ['a'], terms, memo), 2);
  assert.equal(source.walks, walks, 'the second count did not walk');
  assert.equal(countMatches(source, ['a', 'b'], terms, memo), 4, 'another account set is another question');
});

test('no term means no memo work: the plain children come straight from the source', () => {
  const source = counting(TREE);
  const memo = new FilterMemo();

  const children = filterChildren(source, 'a', 'f1', [], false, memo);

  assert.deepEqual(ids(children), ['e1', 'e2']);
  assert.equal(source.walks, 1);
});

test('a parent cycle still terminates with a memo in play', () => {
  const cyclic: Record<string, TreeNode[]> = {
    root: [folder('a', 'A')],
    a: [folder('b', 'B')],
    b: [folder('a', 'A')],
  };
  const source = counting(cyclic);
  const memo = new FilterMemo();

  assert.deepEqual(ids(filterChildren(source, 'x', null, searchTerms('zzz'), false, memo)), []);
  assert.deepEqual(ids(filterChildren(source, 'x', 'a', searchTerms('zzz'), false, memo)), []);
});
